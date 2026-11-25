import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'socket.io';
import { MAP_ORDER, MAPS } from '../shared/maps/index';
import { KING_TARGET, RACE_LAPS, getRaceCourse, roundDuration } from '../shared/objectives';
import type { BotDifficulty, ClientToServerEvents, GameModeId, MapId, ServerToClientEvents } from '../shared/types';
import { stepRoomTick, type LoopCallbacks } from './gameLoop';
import { RoomManager } from './roomManager';
import type { ServerRoom } from './types';

/**
 * Whole rounds played by bots only, tick by tick (no timers, no sockets): the objective modes must
 * be winnable in every room — a ring the bots cannot reach or a zone nobody can hold shows up here.
 */
interface RoomManagerInternals {
  createRoom(isPrivate: boolean): ServerRoom;
  syncBots(room: ServerRoom): void;
  startMatch(room: ServerRoom): void;
}

const noop: LoopCallbacks = { emitRoomState() {}, emitSnapshot() {}, emitHit() {}, emitKillFeed() {} };

function playRound(mode: GameModeId, mapId: MapId, planes: number, difficulty: BotDifficulty) {
  const io = { to: () => ({ emit() {} }), emit() {}, sockets: { sockets: new Map() } };
  const rm = new RoomManager(io as unknown as Server<ClientToServerEvents, ServerToClientEvents>);
  rm.dispose();
  const internals = rm as unknown as RoomManagerInternals;
  const room = internals.createRoom(true);
  room.settings.mode = mode;
  room.settings.mapId = mapId;
  room.settings.maxPlayers = planes;
  room.settings.botDifficulty = difficulty;
  internals.syncBots(room);
  internals.startMatch(room);
  const dt = 1 / 30;
  let seconds = 0;
  while (room.phase !== 'round_end' && room.phase !== 'match_end' && seconds < 220) {
    stepRoomTick(room, dt, noop);
    seconds += dt;
  }
  return { seconds, players: Array.from(room.players.values()) };
}

test('ring race: bots get round the course in every room', () => {
  for (const mapId of MAP_ORDER) {
    const ringsPerLap = getRaceCourse(MAPS[mapId]).length;
    const { players } = playRound('ring_race', mapId, 2, 'normal');
    const best = Math.max(...players.map((p) => p.objective));
    assert.equal(best, ringsPerLap * RACE_LAPS, `${mapId}: a bot finishes the ${RACE_LAPS} laps`);
    for (const p of players) {
      assert.ok(p.objective >= ringsPerLap, `${mapId}: ${p.nickname} completes at least one lap (${p.objective})`);
    }
  }
});

test('king of the sky: a duel is won on the target before the time runs out in every room', () => {
  for (const mapId of MAP_ORDER) {
    const { seconds, players } = playRound('king_of_sky', mapId, 2, 'normal');
    const best = Math.max(...players.map((p) => p.objective));
    assert.ok(best >= KING_TARGET - 1e-6, `${mapId}: someone reaches ${KING_TARGET} s (${best.toFixed(1)})`);
    assert.ok(seconds < roundDuration('king_of_sky'), `${mapId}: won after ${seconds.toFixed(0)} s`);
  }
});

test('first flight (tutorial): private rooms only, solo without bots, never ends on its own', () => {
  const io = { to: () => ({ emit() {} }), emit() {}, sockets: { sockets: new Map() } };
  const rm = new RoomManager(io as unknown as Server<ClientToServerEvents, ServerToClientEvents>);
  rm.dispose();
  const internals = rm as unknown as RoomManagerInternals & {
    applySettings(room: ServerRoom, partial: Partial<ServerRoom['settings']>): void;
  };
  // The shared quick-play room refuses it
  const publicRoom = internals.createRoom(false);
  internals.applySettings(publicRoom, { mode: 'tutorial' });
  assert.equal(publicRoom.settings.mode, 'last_plane_ffa');

  const room = internals.createRoom(true);
  internals.syncBots(room);
  assert.ok(Array.from(room.players.values()).some((p) => p.isBot), 'bots by default');
  internals.applySettings(room, { mode: 'tutorial' });
  internals.syncBots(room);
  assert.equal(Array.from(room.players.values()).filter((p) => p.isBot).length, 0, 'tutorial: no bots');
  internals.startMatch(room);
  const dt = 1 / 30;
  for (let t = 0; t < 400; t += dt) stepRoomTick(room, dt, noop);
  assert.equal(room.phase, 'playing', 'still flying after 400 s (no winner, no sudden death)');
  assert.equal(room.suddenDeath, false);
});
