import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'socket.io';
import { canDamageTarget } from '../shared/rules';
import type { ClientToServerEvents, PlayerCosmetics, RoomState, ServerToClientEvents } from '../shared/types';
import { stepRoomTick, type LoopCallbacks } from './gameLoop';
import { RoomManager } from './roomManager';
import { SURVIVAL_WAVES, WAVE_TIME_LIMIT, isEnemy, waveComposition } from './survival';
import type { ServerRoom } from './types';

interface Internals {
  createRoom(isPrivate: boolean): ServerRoom;
  syncBots(room: ServerRoom): void;
  startMatch(room: ServerRoom): void;
  applySettings(room: ServerRoom, partial: Partial<ServerRoom['settings']>): void;
  serializeRoomState(room: ServerRoom): RoomState;
  sanitizeCosmetics(raw?: Partial<PlayerCosmetics>): PlayerCosmetics;
}

const noop: LoopCallbacks = { emitRoomState() {}, emitSnapshot() {}, emitHit() {}, emitKillFeed() {} };

function manager() {
  const io = { to: () => ({ emit() {} }), emit() {}, sockets: { sockets: new Map() } };
  const rm = new RoomManager(io as unknown as Server<ClientToServerEvents, ServerToClientEvents>);
  rm.dispose();
  return rm as unknown as Internals;
}

test('survival: waves grow with the wave number and the number of pilots, never beyond 14 enemies', () => {
  let prev = 0;
  for (let w = 1; w <= SURVIVAL_WAVES; w++) {
    const { flies, drones } = waveComposition(w, 2);
    assert.ok(flies + drones >= prev, `wave ${w} not smaller than the previous one`);
    prev = flies + drones;
    assert.ok(flies + drones <= 14);
  }
  assert.equal(waveComposition(1, 1).drones, 0, 'no drone in the first wave');
  const solo = waveComposition(6, 1);
  const crowd = waveComposition(6, 6);
  assert.ok(crowd.flies + crowd.drones > solo.flies + solo.drones, 'more pilots, more enemies');
});

test('survival: pilots never hurt each other, enemies neither; pilots and enemies do', () => {
  assert.equal(canDamageTarget('survival', true, 'a', 'blue', 'b', 'blue'), false, 'even with friendly fire on');
  assert.equal(canDamageTarget('survival', false, 'f1', 'red', 'f2', 'red'), false);
  assert.equal(canDamageTarget('survival', false, 'a', 'blue', 'f1', 'red'), true);
  assert.equal(canDamageTarget('survival', false, 'f1', 'red', 'a', 'blue'), true);
});

test('survival: everyone in team blue, waves come, the match ends one way or the other', () => {
  const rm = manager();
  const room = rm.createRoom(true);
  rm.applySettings(room, { mode: 'survival', maxPlayers: 4 });
  rm.syncBots(room);
  rm.startMatch(room);
  assert.equal(room.maxRounds, 1, 'a single long round');
  assert.ok(Array.from(room.players.values()).every((p) => p.team === 'blue'), 'pilots together');

  const dt = 1 / 30;
  let t = 0;
  let sawWave = 0;
  let sawEnemiesInState = false;
  while (room.phase !== 'match_end' && t < SURVIVAL_WAVES * (WAVE_TIME_LIMIT + 8) + 30) {
    stepRoomTick(room, dt, noop);
    t += dt;
    sawWave = Math.max(sawWave, room.survival?.wave ?? 0);
    if (!sawEnemiesInState && Array.from(room.players.values()).some(isEnemy)) {
      const state = rm.serializeRoomState(room);
      sawEnemiesInState = true;
      assert.ok(state.players.some((p) => p.isEnemy && p.cosmetics.planeId === 'fly'), 'clients get the flies to draw them');
      assert.ok(state.scoreboard.every((e) => !e.playerId.startsWith('enemy_')), 'but not in the scoreboard');
      assert.equal(state.survival?.totalWaves, SURVIVAL_WAVES);
    }
  }
  assert.ok(sawWave >= 1, 'at least one wave came');
  assert.equal(room.phase, 'match_end', `ended (after ${t.toFixed(0)} s)`);
  assert.ok(room.lastRoundWinner && ['red', 'blue'].includes(room.lastRoundWinner.winnerTeam));

  // A new match starts clean: no leftover fly
  room.phase = 'lobby';
  rm.startMatch(room);
  assert.equal(Array.from(room.players.values()).filter(isEnemy).length, 0);
});

test('survival: a player cannot pick a fly or a drone in the hangar', () => {
  const rm = manager();
  assert.equal(rm.sanitizeCosmetics({ planeId: 'fly' }).planeId, 'plastic_jet');
  assert.equal(rm.sanitizeCosmetics({ planeId: 'drone' }).planeId, 'plastic_jet');
  assert.equal(rm.sanitizeCosmetics({ planeId: 'toy_helicopter' }).planeId, 'toy_helicopter');
});
