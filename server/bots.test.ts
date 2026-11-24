import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlaneForward, quatFromYaw } from '../shared/flightPhysics';
import { MAPS } from '../shared/maps/index';
import { PLANE_ARCHETYPES } from '../shared/planes';
import type { BotDifficulty } from '../shared/types';
import { BOT_SKILL, computeBotInput } from './bots';
import { DEFAULT_ROOM_SETTINGS, type ServerPlayer } from './types';

function makePlane(id: string, isBot: boolean, x: number, y: number, z: number, yaw: number): ServerPlayer {
  const [qx, qy, qz, qw] = quatFromYaw(yaw);
  const arch = PLANE_ARCHETYPES.plastic_jet;
  return {
    id,
    sessionToken: id,
    socketId: isBot ? null : id,
    nickname: id,
    isHost: false,
    isBot,
    botPersonality: 'hunter',
    ready: true,
    connected: true,
    disconnectedAt: null,
    team: 'none',
    cosmetics: { planeId: 'plastic_jet', paintId: 'red', stickerId: 'star' },
    ping: 24,
    sim: {
      x, y, z, qx, qy, qz, qw,
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
      lives: 3,
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
    dtBudget: 0,
    lastProcessedSeq: 0,
    kills: 0,
    crashes: 0,
    pickups: 0,
    propsBroken: 0,
    deaths: 0,
    roundWins: 0,
    score: 0,
    lastHitBy: null,
    lastHitAt: 0,
  };
}

/** Bot on a clear desk spawn lane, enemy straight ahead at `dist`; returns whether it shoots. */
function firesAt(difficulty: BotDifficulty, dist: number, elapsed = 10): boolean {
  const spawn = MAPS.desk.spawns[0];
  const bot = makePlane('bot_a', true, spawn.x, spawn.y, spawn.z, spawn.yaw);
  const fwd = getPlaneForward(bot.sim);
  const enemy = makePlane('human', false, spawn.x + fwd.x * dist, spawn.y, spawn.z + fwd.z * dist, spawn.yaw);
  const settings = { ...DEFAULT_ROOM_SETTINGS, botDifficulty: difficulty };
  return computeBotInput(bot, [bot, enemy], settings, MAPS.desk, 1 / 30, elapsed, []).fire;
}

test('bot difficulty: expert shoots from farther away, easy needs to be closer and fires in bursts', () => {
  assert.equal(firesAt('normal', 150), true, 'normal fires at 150');
  assert.equal(firesAt('normal', 240), false, 'normal holds fire at 240');
  assert.equal(firesAt('expert', 240), true, 'expert fires at 240');
  assert.equal(firesAt('easy', 200), false, 'easy holds fire at 200');

  // Easy bots fire in bursts: over a few seconds the trigger is held only part of the time
  let shots = 0;
  const samples = 60;
  for (let i = 0; i < samples; i++) {
    if (firesAt('easy', 120, 10 + i * 0.05)) shots++;
  }
  assert.ok(shots > 0 && shots < samples, `easy bursts (${shots}/${samples})`);

  // Opening grace: easy bots wait longer before shooting
  assert.equal(firesAt('easy', 120, BOT_SKILL.normal.grace + 0.5), false);
  assert.equal(firesAt('normal', 120, BOT_SKILL.normal.grace + 0.5), true);
});
