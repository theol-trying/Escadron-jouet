import type { MapDefinition } from '../shared/maps/types';
import { PLANE_ARCHETYPES } from '../shared/planes';
import type { RoundOutcome } from '../shared/rules';
import type { SurvivalState } from '../shared/types';
import type { LoopCallbacks } from './loop/callbacks';
import { applyCombatDamage } from './loop/damage';
import { spawnPlayerAtIndex } from './loop/round';
import type { ServerPlayer, ServerRoom } from './types';

/**
 * « Survie »: every pilot (bots included) in team blue against waves of flies (fast, they sting by
 * flying into you) and toy drones (slow, they shoot). Eight waves; a short break between two waves;
 * the round is lost when every pilot is out of lives.
 */
export const SURVIVAL_WAVES = 8;
export const SURVIVAL_FIRST_WAVE_DELAY = 3;
export const SURVIVAL_WAVE_PAUSE = 6;
export const STING_DAMAGE = 9;
export const STING_COOLDOWN = 0.9;
/** Bonus to every pilot still flying when a wave is cleared */
export const WAVE_CLEAR_BONUS = 50;
const MAX_ENEMIES = 14;
/** A wave that drags on (enemies stuck out of reach…) ends anyway: the survivors fly away */
export const WAVE_TIME_LIMIT = 75;

/** Flies and drones of a wave, for this many defending pilots. */
export function waveComposition(wave: number, defenders: number): { flies: number; drones: number } {
  const d = Math.max(1, defenders);
  const flies = Math.min(10, 1 + wave + Math.ceil(d * 0.5));
  const drones = Math.min(MAX_ENEMIES - flies, Math.floor(wave / 2) + (wave >= 4 ? Math.floor(d / 3) : 0));
  return { flies, drones };
}

export const isEnemy = (p: ServerPlayer): boolean => p.enemyKind !== undefined;
export const isDefender = (p: ServerPlayer): boolean => p.enemyKind === undefined;

const ENEMY_NAMES = { fly: 'Mouche', drone: 'Drone' } as const;

function makeEnemy(kind: 'fly' | 'drone', id: string, nickname: string): ServerPlayer {
  const arch = PLANE_ARCHETYPES[kind];
  return {
    id,
    sessionToken: id,
    socketId: null,
    nickname,
    isHost: false,
    isBot: true,
    botPersonality: 'hunter',
    enemyKind: kind,
    stingCooldown: 0,
    ready: true,
    connected: true,
    disconnectedAt: null,
    team: 'red',
    cosmetics: { planeId: kind, paintId: 'red', stickerId: 'star' },
    ping: 0,
    sim: {
      x: 0,
      y: 120,
      z: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      speed: arch.cruiseSpeed,
      hp: arch.maxHp,
      maxHp: arch.maxHp,
      boost: 100,
      heat: 0,
      overheated: false,
      barrelRollTimer: 0,
      barrelRollCooldown: 0,
      barrelRollDir: 0,
      invulnTimer: 0,
      outOfBoundsTimer: 0,
      alive: true,
      lives: 1,
      respawnTimer: 0,
      fireCooldown: 0,
      secondaryCooldown: 0,
      hitFlashTimer: 0,
      collideCooldown: 0,
      secondaryPowerUp: null,
      secondaryUses: 0,
      shieldTimer: 0,
      shieldHp: 0,
      turboTimer: 0,
      glueTimer: 0,
      magnetTimer: 0,
    },
    inputQueue: [],
    lastInput: null,
    idleRepeatTime: 0,
    dtBudget: 0.05,
    lastProcessedSeq: 0,
    kills: 0,
    crashes: 0,
    pickups: 0,
    propsBroken: 0,
    objective: 0,
    finishTime: null,
    deaths: 0,
    roundWins: 0,
    score: 0,
    lastHitBy: null,
    lastHitAt: 0,
  };
}

/** Removes every fly and drone (new match, back to the lobby). */
export function removeEnemies(room: ServerRoom): void {
  for (const [id, p] of room.players) if (isEnemy(p)) room.players.delete(id);
}

/** Start of a survival round: no enemy yet, the first wave in a few seconds. */
export function resetSurvival(room: ServerRoom): void {
  removeEnemies(room);
  room.survival =
    room.settings.mode === 'survival'
      ? { wave: 0, nextWaveAt: room.elapsedTime + SURVIVAL_FIRST_WAVE_DELAY, waveStartedAt: room.elapsedTime }
      : null;
}

/** Spawn points ordered from the farthest to the nearest to the pilots (enemies come from afar). */
function farSpawnOrder(map: MapDefinition, defenders: ServerPlayer[]): number[] {
  const alive = defenders.filter((p) => p.sim.alive);
  const cx = alive.length ? alive.reduce((s, p) => s + p.sim.x, 0) / alive.length : 0;
  const cz = alive.length ? alive.reduce((s, p) => s + p.sim.z, 0) / alive.length : 0;
  return map.spawns
    .map((sp, i) => ({ i, d: Math.hypot(sp.x - cx, sp.z - cz) }))
    .sort((a, b) => b.d - a.d)
    .map((e) => e.i);
}

function spawnWave(room: ServerRoom, map: MapDefinition, wave: number): void {
  const all = Array.from(room.players.values());
  const defenders = all.filter(isDefender);
  removeEnemies(room);
  const { flies, drones } = waveComposition(wave, defenders.length);
  const order = farSpawnOrder(map, defenders);
  const kinds: Array<'fly' | 'drone'> = [...Array(flies).fill('fly'), ...Array(drones).fill('drone')];
  kinds.forEach((kind, n) => {
    const enemy = makeEnemy(kind, `enemy_${wave}_${n}`, `${ENEMY_NAMES[kind]} ${n + 1}`);
    spawnPlayerAtIndex(enemy, order[n % Math.max(1, order.length)] ?? n, room.settings.mapId, 1);
    // A little spread when several come from the same spot
    const ring = Math.floor(n / Math.max(1, order.length));
    enemy.sim.y += ring * 14;
    enemy.sim.invulnTimer = 1;
    room.players.set(enemy.id, enemy);
  });
}

/**
 * One tick of survival: waves (spawn, cleared → bonus and break), and fly stings. Called after the
 * planes have flown.
 */
export function stepSurvival(room: ServerRoom, map: MapDefinition, dt: number, callbacks: LoopCallbacks): void {
  const s = room.survival;
  if (!s) return;
  const all = Array.from(room.players.values());

  // Next wave due
  if (s.nextWaveAt !== null) {
    if (room.elapsedTime >= s.nextWaveAt && s.wave < SURVIVAL_WAVES) {
      s.wave++;
      s.nextWaveAt = null;
      s.waveStartedAt = room.elapsedTime;
      spawnWave(room, map, s.wave);
      callbacks.emitRoomState(room);
    }
    return;
  }

  // Wave cleared: bonus, then a break before the next one (or victory after the last). A wave that
  // lasts too long ends too: the remaining enemies fly away (no bonus)
  const enemies = all.filter(isEnemy);
  const cleared = !enemies.some((e) => e.sim.alive);
  if (cleared || room.elapsedTime - s.waveStartedAt > WAVE_TIME_LIMIT) {
    if (cleared) for (const p of all) if (isDefender(p) && p.sim.alive) p.score += WAVE_CLEAR_BONUS;
    if (s.wave < SURVIVAL_WAVES) s.nextWaveAt = room.elapsedTime + SURVIVAL_WAVE_PAUSE;
    removeEnemies(room);
    callbacks.emitRoomState(room);
    return;
  }

  // Flies sting the pilots they fly into
  const defenders = all.filter((p) => isDefender(p) && p.sim.alive);
  for (const fly of enemies) {
    if (fly.enemyKind !== 'fly' || !fly.sim.alive) continue;
    fly.stingCooldown = Math.max(0, (fly.stingCooldown ?? 0) - dt);
    if (fly.stingCooldown > 0) continue;
    const reach = PLANE_ARCHETYPES.fly.hitboxRadius + 2;
    for (const target of defenders) {
      const r = reach + PLANE_ARCHETYPES[target.cosmetics.planeId].hitboxRadius;
      if (Math.hypot(target.sim.x - fly.sim.x, target.sim.y - fly.sim.y, target.sim.z - fly.sim.z) < r) {
        applyCombatDamage(room, target, fly, STING_DAMAGE, fly.sim.x, fly.sim.y, fly.sim.z, 'gun', undefined, callbacks);
        fly.stingCooldown = STING_COOLDOWN;
        break;
      }
    }
  }
}

/** Survival round result: won after the last wave, lost when no pilot has a plane or a life left. */
export function survivalOutcome(room: ServerRoom): RoundOutcome | null {
  const s = room.survival;
  if (!s) return null;
  const all = Array.from(room.players.values());
  const defenders = all.filter(isDefender);
  const stillIn = defenders.some((p) => p.sim.alive || p.sim.lives > 0);
  if (defenders.length > 0 && !stillIn) {
    return { finished: true, winnerId: null, winnerTeam: 'red', winnerName: 'Les mouches et les drones' };
  }
  const enemiesLeft = all.some((p) => isEnemy(p) && p.sim.alive);
  if (s.wave >= SURVIVAL_WAVES && !enemiesLeft && s.nextWaveAt === null) {
    return { finished: true, winnerId: null, winnerTeam: 'blue', winnerName: 'Les pilotes' };
  }
  if (room.roundTimer <= 0) {
    return { finished: true, winnerId: null, winnerTeam: 'blue', winnerName: 'Les pilotes (temps écoulé)' };
  }
  return null;
}

/** What the clients show: wave, enemies left, countdown to the next wave. */
export function survivalState(room: ServerRoom): SurvivalState | null {
  const s = room.survival;
  if (!s) return null;
  const enemiesLeft = Array.from(room.players.values()).filter((p) => isEnemy(p) && p.sim.alive).length;
  return {
    wave: s.wave,
    totalWaves: SURVIVAL_WAVES,
    enemiesLeft,
    nextWaveAtTimer: s.nextWaveAt === null ? null : room.roundTimer - (s.nextWaveAt - room.elapsedTime),
  };
}
