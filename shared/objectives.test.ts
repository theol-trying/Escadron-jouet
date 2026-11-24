import test from 'node:test';
import assert from 'node:assert/strict';
import { isOutsideSoftBounds, resolveSphereVsCollider } from './flightPhysics';
import { MAP_ORDER, MAPS } from './maps/index';
import {
  KING_TARGET,
  KING_ZONE_PERIOD,
  RACE_FINISH_GRACE,
  checkObjectiveRound,
  getKingZone,
  getRaceCourse,
  type ObjectivePlayer,
} from './objectives';

test('ring courses: every map gets a loop of rings in open air inside the room', () => {
  for (const id of MAP_ORDER) {
    const map = MAPS[id];
    const course = getRaceCourse(map);
    assert.ok(course.length >= 6, `${id}: ${course.length} rings`);
    for (const r of course) {
      assert.equal(isOutsideSoftBounds(r.x, r.y, r.z, map), false, `${id}: ring inside the room`);
      for (const col of map.colliders) {
        assert.equal(resolveSphereVsCollider(r.x, r.y, r.z, 6, col, 0), null, `${id}: ring clear of ${col.id}`);
      }
      assert.ok(Math.abs(Math.hypot(r.nx, r.ny, r.nz) - 1) < 1e-6, 'ring facing is a unit vector');
    }
    assert.equal(getRaceCourse(map), course, 'course is cached and stable');
  }
});

test('king zone moves to the next spot every period', () => {
  const map = MAPS.desk;
  const z0 = getKingZone(map, 0);
  const z1 = getKingZone(map, KING_ZONE_PERIOD + 1);
  assert.equal(z0.index, 0);
  assert.equal(z1.index, 1);
  assert.notDeepEqual([z0.x, z0.z], [z1.x, z1.z]);
  assert.ok(Math.abs(getKingZone(map, 10).movesIn - (KING_ZONE_PERIOD - 10)) < 1e-9);
});

const p = (id: string, o: Partial<ObjectivePlayer> = {}): ObjectivePlayer => ({
  id,
  nickname: id,
  isBot: false,
  connected: true,
  objective: 0,
  finishTime: null,
  ...o,
});

test('race round: first finisher wins once all humans are in or after the grace period', () => {
  // One human finished, a bot still racing: humans are all done → round over, first finisher wins
  let out = checkObjectiveRound('ring_race', [p('me', { objective: 20, finishTime: 61 }), p('bot', { isBot: true, objective: 9 })], 100, 62, 20, 61);
  assert.equal(out.finished, true);
  assert.equal(out.winnerId, 'me');

  // Two humans, one still racing: wait for the grace period
  const racing = [p('a', { objective: 20, finishTime: 50 }), p('b', { objective: 15 })];
  out = checkObjectiveRound('ring_race', racing, 100, 55, 20, 50);
  assert.equal(out.finished, false);
  out = checkObjectiveRound('ring_race', racing, 100, 50 + RACE_FINISH_GRACE, 20, 50);
  assert.equal(out.finished, true);
  assert.equal(out.winnerId, 'a');

  // Time up with no finisher: most rings wins
  out = checkObjectiveRound('ring_race', [p('a', { objective: 7 }), p('b', { objective: 11 })], 0, 180, 20, null);
  assert.equal(out.winnerId, 'b');
});

test('king round: reaching the target wins, a tie at time up is a draw', () => {
  let out = checkObjectiveRound('king_of_sky', [p('a', { objective: KING_TARGET }), p('b', { objective: 12 })], 90, 90, 0, null);
  assert.equal(out.finished, true);
  assert.equal(out.winnerId, 'a');
  out = checkObjectiveRound('king_of_sky', [p('a', { objective: 12 }), p('b', { objective: 9 })], 90, 90, 0, null);
  assert.equal(out.finished, false);
  out = checkObjectiveRound('king_of_sky', [p('a', { objective: 12 }), p('b', { objective: 12 })], 0, 180, 0, null);
  assert.equal(out.finished, true);
  assert.equal(out.winnerId, null);
});
