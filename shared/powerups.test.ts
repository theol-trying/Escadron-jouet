import test from 'node:test';
import assert from 'node:assert/strict';
import { DESK_MAP } from './maps/desk';
import {
  POWERUP_ORDER,
  POWERUPS,
  computeVacuumState,
  pickRandomPowerUp,
} from './powerups';

test('all 8 power-ups are defined with French labels and valid uses', () => {
  assert.equal(POWERUP_ORDER.length, 8);
  for (const id of POWERUP_ORDER) {
    const def = POWERUPS[id];
    assert.ok(def, `missing definition for ${id}`);
    assert.ok(def.nameFr.length >= 4);
    assert.ok(def.uses >= 1 && def.uses <= 2);
  }
});

test('pickRandomPowerUp respects custom rewardPool', () => {
  const pool = ['bubble_shield', 'repair_tape'] as const;
  for (const r of [0, 0.25, 0.75, 0.99]) {
    const picked = pickRandomPowerUp(() => r, [...pool]);
    assert.ok(pool.includes(picked as (typeof pool)[number]));
  }
});

test('computeVacuumState stays inactive at 0s and shrinks safeRadius over sudden death', () => {
  const idle = computeVacuumState(0, DESK_MAP);
  assert.equal(idle.active, false);

  const early = computeVacuumState(2, DESK_MAP);
  const late = computeVacuumState(36, DESK_MAP);
  assert.equal(early.active, true);
  assert.equal(late.active, true);
  assert.ok(late.safeRadius < early.safeRadius);
  assert.ok(late.safeRadius >= 26);
});

test('Le bureau defines destructibles and 5 glowing powerUpSpots', () => {
  assert.ok(DESK_MAP.destructibles.length >= 6);
  assert.equal(DESK_MAP.powerUpSpots.length, 5);
  for (const d of DESK_MAP.destructibles) {
    assert.ok(
      DESK_MAP.colliders.some((c) => c.id === d.colliderId),
      `destructible ${d.id} must reference a map collider`
    );
  }
});
