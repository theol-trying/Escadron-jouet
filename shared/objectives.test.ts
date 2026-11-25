import test from 'node:test';
import assert from 'node:assert/strict';
import { isOutsideSoftBounds, resolveSphereVsCollider } from './flightPhysics';
import { MAP_ORDER, MAPS } from './maps/index';
import {
  KING_CONTESTED_RATE,
  KING_TARGET,
  KING_ZONE_CLEARANCE,
  KING_ZONE_PERIOD,
  RACE_FINISH_GRACE,
  RING_CLEARANCE,
  checkObjectiveRound,
  getKingZone,
  getKingZoneSpots,
  getRaceCourse,
  getZoneControl,
  type ObjectivePlayer,
} from './objectives';
import type { MapDefinition } from './maps/types';

function inUpdraftColumn(map: MapDefinition, p: { x: number; y: number; z: number }): boolean {
  return map.updraftZones.some(
    (u) => Math.hypot(p.x - u.x, p.z - u.z) < u.radius && p.y > u.y && p.y < u.y + u.height
  );
}

test('ring courses: every map gets a loop of rings in open air inside the room', () => {
  for (const id of MAP_ORDER) {
    const map = MAPS[id];
    const course = getRaceCourse(map);
    assert.ok(course.length >= 6, `${id}: ${course.length} rings`);
    for (const r of course) {
      assert.equal(isOutsideSoftBounds(r.x, r.y, r.z, map), false, `${id}: ring inside the room`);
      // Room to fly through: no ring inside an arch or against a tap
      for (const col of map.colliders) {
        assert.equal(resolveSphereVsCollider(r.x, r.y, r.z, RING_CLEARANCE, col, 0), null, `${id}: ring clear of ${col.id}`);
      }
      // Never above the stove / radiator: the lift there is stronger than a dive
      assert.equal(inUpdraftColumn(map, r), false, `${id}: ring out of updraft columns`);
      assert.ok(Math.abs(Math.hypot(r.nx, r.ny, r.nz) - 1) < 1e-6, 'ring facing is a unit vector');
    }
    assert.equal(getRaceCourse(map), course, 'course is cached and stable');
  }
});

test('king zones: open sky only (no tunnel, no updraft), inside the room, well spread', () => {
  for (const id of MAP_ORDER) {
    const map = MAPS[id];
    const spots = getKingZoneSpots(map);
    assert.ok(spots.length >= 4, `${id}: ${spots.length} zones`);
    for (const s of spots) {
      assert.equal(isOutsideSoftBounds(s.x, s.y, s.z, map), false, `${id}: zone inside the room`);
      for (const col of map.colliders) {
        assert.equal(resolveSphereVsCollider(s.x, s.y, s.z, KING_ZONE_CLEARANCE, col, 0), null, `${id}: zone clear of ${col.id}`);
      }
      assert.equal(inUpdraftColumn(map, s), false, `${id}: zone out of updraft columns`);
    }
    assert.equal(getKingZoneSpots(map), spots, 'zone list is cached and stable');
  }
});

test('king zone scoring: alone = full rate, shared = closest to the centre at half rate', () => {
  const zone = { x: 0, y: 100, z: 0, radius: 42 };
  const at = (id: string, d: number, alive = true) => ({ id, x: d, y: 100, z: 0, alive });
  assert.deepEqual(getZoneControl(zone, []), { scorerId: null, rate: 0, inside: 0 });
  assert.deepEqual(getZoneControl(zone, [at('a', 30), at('b', 60)]), { scorerId: 'a', rate: 1, inside: 1 });
  assert.deepEqual(getZoneControl(zone, [at('a', 30), at('b', 10), at('c', 35)]), {
    scorerId: 'b',
    rate: KING_CONTESTED_RATE,
    inside: 3,
  });
  // A wreck inside the zone does not count
  assert.deepEqual(getZoneControl(zone, [at('a', 30), at('b', 5, false)]), { scorerId: 'a', rate: 1, inside: 1 });
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
