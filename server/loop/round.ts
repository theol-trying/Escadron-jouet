import { quatFromYaw } from '../../shared/flightPhysics';
import { MAPS } from '../../shared/maps/index';
import type { MapDefinition } from '../../shared/maps/types';
import {
  OBJECTIVE_LIVES,
  RACE_LAPS,
  RACE_RESPAWN_DELAY,
  checkObjectiveRound,
  getRaceCourse,
  isObjectiveMode,
  isTutorial,
  respawnsFreely,
  roundDuration,
} from '../../shared/objectives';
import { PLANE_ARCHETYPES } from '../../shared/planes';
import { checkRoundWinner, ensureBothTeams, isMatchOver } from '../../shared/rules';
import type { PlaneSimState } from '../../shared/types';
import type { ServerPlayer, ServerRoom } from '../types';
import type { LoopCallbacks } from './callbacks';

/* Rounds: setup, (re)spawns, end of round and of match. */

/** Lives at round start: objective modes respawn without limit. */
export function roundLives(settings: ServerRoom['settings']): number {
  return respawnsFreely(settings.mode) ? OBJECTIVE_LIVES : settings.livesPerRound;
}

export function initRoundEntities(room: ServerRoom): void {
  const map = MAPS[room.settings.mapId] ?? MAPS.desk;
  room.projectiles.length = 0;
  room.secondaryProjectiles.length = 0;
  room.powerUps.length = 0;
  room.destroyedColliderIds.clear();
  room.suddenDeath = false;
  room.suddenDeathElapsed = 0;

  room.destructibles = map.destructibles.map((d) => ({
    id: d.id,
    colliderId: d.colliderId,
    kind: d.kind,
    x: d.x,
    y: d.y,
    z: d.z,
    radius: d.radius,
    hp: d.maxHp,
    maxHp: d.maxHp,
    destroyed: false,
    dropsPowerUp: d.dropsPowerUp,
    rewardPool: d.rewardPool,
  }));

  room.powerUpSpots = map.powerUpSpots.map((sp, i) => ({
    id: sp.id,
    x: sp.x,
    y: sp.y,
    z: sp.z,
    // Spawn initial glowing pickups right after takeoff
    respawnTimer: 1.5 + i * 0.4,
  }));
}

export function spawnPlayerAtIndex(
  player: ServerPlayer,
  spawnIndex: number,
  mapId: ServerRoom['settings']['mapId'],
  resetLives: number | null
): void {
  const map = MAPS[mapId] ?? MAPS.desk;
  const sp = map.spawns[spawnIndex % map.spawns.length];
  const arch = PLANE_ARCHETYPES[player.cosmetics.planeId];
  const [qx, qy, qz, qw] = quatFromYaw(sp.yaw);

  const lives = resetLives !== null ? resetLives : player.sim.lives;
  const sim: PlaneSimState = {
    x: sp.x,
    y: sp.y,
    z: sp.z,
    qx,
    qy,
    qz,
    qw,
    speed: arch.cruiseSpeed,
    hp: arch.maxHp,
    maxHp: arch.maxHp,
    boost: 100,
    heat: 0,
    overheated: false,
    barrelRollTimer: 0,
    barrelRollCooldown: 0,
    barrelRollDir: 0,
    invulnTimer: 3.0,
    outOfBoundsTimer: 0,
    alive: lives > 0,
    lives,
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
  };
  player.sim = sim;
  player.inputQueue.length = 0;
  player.lastInput = null;
  player.idleRepeatTime = 0;
  player.dtBudget = 0.05;
}

/** Between rounds: next round (everyone back at a spawn point) or end of the match. */
export function stepRoundEnd(room: ServerRoom, dt: number, callbacks: LoopCallbacks): void {
  room.roundEndTimer -= dt;
  if (room.roundEndTimer <= 0) {
    const sb = Array.from(room.players.values()).map((p) => ({ roundWins: p.roundWins }));
    const matchOver = isMatchOver(
      room.settings.mode,
      room.roundNumber,
      room.maxRounds,
      room.teamRoundWins,
      sb
    );
    const isTeams = room.settings.mode === 'last_plane_teams';
    // A team emptied mid-match (player left, bots off): refill it from the other team, or end
    // the match when a single pilot remains — otherwise the next round could only end on the timer.
    const teamsPlayable =
      matchOver || !isTeams || ensureBothTeams(Array.from(room.players.values()));
    if (matchOver || !teamsPlayable) {
      room.phase = 'match_end';
    } else {
      room.roundNumber++;
      room.roundTimer = roundDuration(room.settings.mode);
      room.lastRoundWinner = null;
      room.roundHadBothTeams = isTeams;
      room.raceFirstFinishAt = null;
      initRoundEntities(room);
      let idx = 0;
      for (const player of room.players.values()) {
        player.objective = 0;
        player.finishTime = null;
        spawnPlayerAtIndex(player, idx++, room.settings.mapId, roundLives(room.settings));
      }
      room.phase = 'countdown';
      room.countdownTimer = 2.4;
    }
    callbacks.emitRoomState(room);
  }
}

/** A plane out of the round: count down to its respawn (race: short delay, back at its last ring). */
export function stepRespawn(
  room: ServerRoom,
  player: ServerPlayer,
  spawnIndex: number,
  map: MapDefinition,
  isRace: boolean,
  dt: number
): void {
  if (player.sim.lives > 0 && player.sim.respawnTimer > 0) {
    // Race: a crash only costs a short delay
    if (isRace) player.sim.respawnTimer = Math.min(player.sim.respawnTimer, RACE_RESPAWN_DELAY);
    player.sim.respawnTimer -= dt;
    if (player.sim.respawnTimer <= 0) {
      spawnPlayerAtIndex(
        player,
        spawnIndex,
        room.settings.mapId,
        null
      );
      if (isRace && player.objective > 0) placeAtLastRing(player, map);
    }
  }
}

/** Race respawn: back at the last ring passed, facing the next one. */
export function placeAtLastRing(player: ServerPlayer, map: (typeof MAPS)[keyof typeof MAPS]): void {
  const course = getRaceCourse(map);
  const ring = course[(player.objective - 1) % course.length];
  player.sim.x = ring.x;
  player.sim.y = ring.y;
  player.sim.z = ring.z;
  const [qx, qy, qz, qw] = quatFromYaw(Math.atan2(-ring.nx, -ring.nz));
  player.sim.qx = qx;
  player.sim.qy = qy;
  player.sim.qz = qz;
  player.sim.qw = qw;
}

/** End of the round when someone (or a team) won it: round wins, score bonuses. */
export function settleRound(
  room: ServerRoom,
  allPlayers: ServerPlayer[],
  map: MapDefinition,
  roundElapsed: number,
  callbacks: LoopCallbacks
): void {
  // The guided first flight never ends on its own (the pilot leaves when done)
  if (isTutorial(room.settings.mode)) return;
  const objectiveMode = isObjectiveMode(room.settings.mode);
  const outcome = objectiveMode
    ? {
        winnerTeam: 'none' as const,
        ...checkObjectiveRound(
          room.settings.mode,
          allPlayers.map((p) => ({
            id: p.id,
            nickname: p.nickname,
            isBot: p.isBot,
            connected: p.connected,
            objective: p.objective,
            finishTime: p.finishTime,
          })),
          room.roundTimer,
          roundElapsed,
          getRaceCourse(map).length * RACE_LAPS,
          room.raceFirstFinishAt
        ),
      }
    : checkRoundWinner(
    room.settings.mode,
    allPlayers.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      team: p.team,
      alive: p.sim.alive,
      lives: p.sim.lives,
    })),
    room.roundTimer,
    room.suddenDeathElapsed,
    room.roundHadBothTeams ? { hadBothTeams: true } : undefined
  );

  if (outcome.finished) {
    room.phase = 'round_end';
    room.roundEndTimer = 3.6;
    room.lastRoundWinner = {
      winnerId: outcome.winnerId,
      winnerTeam: outcome.winnerTeam,
      winnerName: outcome.winnerName,
    };

    if (room.settings.mode === 'last_plane_teams') {
      if (outcome.winnerTeam === 'red') room.teamRoundWins.red++;
      else if (outcome.winnerTeam === 'blue') room.teamRoundWins.blue++;
      for (const p of allPlayers) {
        if (p.team === outcome.winnerTeam) {
          p.roundWins++;
          p.score += 200;
        }
      }
    } else if (outcome.winnerId) {
      const winner = room.players.get(outcome.winnerId);
      if (winner) {
        winner.roundWins++;
        winner.score += 250;
      }
    }

    callbacks.emitRoomState(room);
  }
}
