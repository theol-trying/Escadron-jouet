import test from 'node:test';
import assert from 'node:assert/strict';
import { quatFromYaw, stepPlanePhysics } from './flightPhysics';
import { MAPS } from './maps/index';
import { PLANE_ARCHETYPES } from './planes';
import {
  CAT_SWIPE_DURATION,
  CAT_SWIPE_PERIOD,
  ROOM_EVENT_PERIOD,
  getCatPaw,
  getCatPose,
  getEventColliders,
  getRoomEvent,
} from './roomEvents';
import type { PlaneSimState } from './types';

/** First moment (scanning) where a given event kind is active on a map */
function findEvent(mapId: keyof typeof MAPS, kind: 'cat' | 'blackout'): number | null {
  for (let t = 0; t < ROOM_EVENT_PERIOD * 30; t += 0.5) {
    const ev = getRoomEvent(MAPS[mapId], t);
    if (ev?.kind === kind && ev.progress > 0.45 && ev.progress < 0.55) return t;
  }
  return null;
}

test('room events: quiet at first, then deterministic cats and blackouts', () => {
  for (let t = 0; t < ROOM_EVENT_PERIOD; t += 1) assert.equal(getRoomEvent(MAPS.desk, t), null);
  const catAt = findEvent('desk', 'cat');
  const blackoutAt = findEvent('desk', 'blackout');
  assert.ok(catAt !== null, 'a cat walks by sometimes');
  assert.ok(blackoutAt !== null, 'the lights go out sometimes');
  assert.deepEqual(getRoomEvent(MAPS.desk, catAt!), getRoomEvent(MAPS.desk, catAt!), 'same clock → same event');
  assert.equal(getEventColliders(MAPS.desk, blackoutAt!).length, 0, 'a blackout adds no obstacle');
});

test('the walking cat is a solid obstacle that bumps planes', () => {
  const t = findEvent('kitchen', 'cat');
  assert.ok(t !== null);
  const pose = getCatPose(MAPS.kitchen, t!);
  assert.ok(pose);
  const [col] = getEventColliders(MAPS.kitchen, t!);
  assert.equal(col.kind, 'capsule');
  const [qx, qy, qz, qw] = quatFromYaw(0);
  const arch = PLANE_ARCHETYPES.plastic_jet;
  const sim: PlaneSimState = {
    x: pose!.x, y: col.kind === 'capsule' ? col.ay : 0, z: pose!.z, qx, qy, qz, qw,
    speed: arch.cruiseSpeed, hp: 100, maxHp: 100, boost: 100, heat: 0, overheated: false,
    barrelRollTimer: 0, barrelRollCooldown: 0, barrelRollDir: 0, invulnTimer: 0, outOfBoundsTimer: 0,
    alive: true, lives: 3, respawnTimer: 0, fireCooldown: 0, secondaryCooldown: 0, hitFlashTimer: 0,
    collideCooldown: 0, secondaryPowerUp: null, secondaryUses: 0, shieldTimer: 0, shieldHp: 0,
    turboTimer: 0, glueTimer: 0, magnetTimer: 0,
  };
  const res = stepPlanePhysics(
    sim,
    { seq: 1, dt: 1 / 30, aimX: 0, aimY: 0, throttle: 0, roll: 0, boost: false, fire: false, useSecondary: false, barrelRollDir: 0 },
    arch,
    MAPS.kitchen,
    t!
  );
  assert.equal(res.collidedColliderId, 'event_cat');
  assert.ok(res.collisionDamage > 0);
});

test('the cat swats at planes: a paw strikes every 1.6 s, left then right, and is an obstacle meanwhile', () => {
  const map = MAPS.kitchen;
  const mid = findEvent('kitchen', 'cat');
  assert.ok(mid !== null);
  // Walk through the whole cat event and record the swats
  const ev = getRoomEvent(map, mid!)!;
  const start = mid! - ev.progress * ev.duration;
  const sides: number[] = [];
  let lastSwat = -1;
  let highest = 0;
  for (let t = start; t < start + ev.duration; t += 0.02) {
    const paw = getCatPaw(map, t);
    const cols = getEventColliders(map, t);
    const pawCol = cols.find((c) => c.id === 'event_cat_paw');
    assert.equal(!!pawCol, !!paw?.striking, 'the paw is solid exactly while it strikes');
    if (!paw) continue;
    const swat = Math.floor((t - start) / CAT_SWIPE_PERIOD);
    if (swat !== lastSwat) {
      sides.push(paw.side);
      lastSwat = swat;
    }
    highest = Math.max(highest, paw.y);
    assert.deepEqual(getCatPaw(map, t), paw, 'same clock → same paw');
  }
  assert.ok(sides.length >= 4, 'several swats during the walk');
  for (let i = 1; i < sides.length; i++) assert.equal(sides[i], -sides[i - 1], 'left, right, left…');
  const s = map.arenaScale ?? 1;
  assert.ok(highest > 65 * s, 'it reaches up to where planes fly low');
  assert.ok(CAT_SWIPE_DURATION < CAT_SWIPE_PERIOD);
});
