import test from 'node:test';
import assert from 'node:assert/strict';
import { DESK_MAP } from './maps/desk';
import { PLANE_ARCHETYPES } from './planes';
import {
  getPlaneForward,
  isOutsideSoftBounds,
  quatFromYaw,
  stepPlanePhysics,
} from './flightPhysics';
import type { PlaneSimState, PlayerInputState } from './types';

function makeSim(overrides: Partial<PlaneSimState> = {}): PlaneSimState {
  const [qx, qy, qz, qw] = quatFromYaw(0);
  return {
    x: 0,
    y: 120,
    z: 60,
    qx,
    qy,
    qz,
    qw,
    speed: 95,
    hp: 100,
    maxHp: 100,
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
    hitFlashTimer: 0,
    collideCooldown: 0,
    ...overrides,
  };
}

function makeInput(overrides: Partial<PlayerInputState> = {}): PlayerInputState {
  return {
    seq: 1,
    dt: 1 / 30,
    aimX: 0,
    aimY: 0,
    throttle: 0,
    roll: 0,
    boost: false,
    fire: false,
    barrelRollDir: 0,
    ...overrides,
  };
}

test('plane always moves forward along -Z at yaw 0', () => {
  const sim = makeSim();
  const fwd = getPlaneForward(sim);
  assert.ok(fwd.z < -0.99);
  const startZ = sim.z;
  stepPlanePhysics(sim, makeInput(), PLANE_ARCHETYPES.plastic_jet, DESK_MAP, 0);
  assert.ok(sim.z < startZ, 'plane should advance forward in -Z');
});

test('boost increases speed and drains boost gauge', () => {
  const sim = makeSim({ boost: 100 });
  const startBoost = sim.boost;
  for (let i = 0; i < 15; i++) {
    stepPlanePhysics(
      sim,
      makeInput({ boost: true }),
      PLANE_ARCHETYPES.plastic_jet,
      DESK_MAP,
      i * (1 / 30)
    );
  }
  assert.ok(sim.speed > PLANE_ARCHETYPES.plastic_jet.maxSpeed);
  assert.ok(sim.boost < startBoost);
});

test('collision with desk pushes plane out and applies bounded damage', () => {
  // Desk tabletop is Y: 70..76, X: -195..145, Z: -120..35
  const sim = makeSim({ x: 0, y: 74, z: 0, invulnTimer: 0 });
  const res = stepPlanePhysics(
    sim,
    makeInput(),
    PLANE_ARCHETYPES.plastic_jet,
    DESK_MAP,
    0
  );
  assert.equal(res.collided, true);
  assert.ok(res.collisionDamage > 0 && res.collisionDamage <= 20);
  assert.ok(sim.y >= 76 || sim.z > 35);
});

test('soft bounds detection triggers out-of-bounds timer outside margin', () => {
  assert.equal(isOutsideSoftBounds(0, 120, 0, DESK_MAP), false);
  assert.equal(isOutsideSoftBounds(240, 120, 0, DESK_MAP), true);

  const sim = makeSim({ x: 242, y: 120, z: 0 });
  stepPlanePhysics(sim, makeInput(), PLANE_ARCHETYPES.plastic_jet, DESK_MAP, 0);
  assert.ok(sim.outOfBoundsTimer > 0);
});

test('primary spawns on Le bureau have >4.5s of clear unobstructed airspace', () => {
  for (const spawnIdx of [0, 1]) {
    const sp = DESK_MAP.spawns[spawnIdx];
    const [qx, qy, qz, qw] = quatFromYaw(sp.yaw);
    const sim = makeSim({
      x: sp.x,
      y: sp.y,
      z: sp.z,
      qx,
      qy,
      qz,
      qw,
      speed: PLANE_ARCHETYPES.plastic_jet.cruiseSpeed,
    });
    for (let step = 0; step < 135; step++) {
      const res = stepPlanePhysics(
        sim,
        makeInput({ dt: 1 / 30 }),
        PLANE_ARCHETYPES.plastic_jet,
        DESK_MAP,
        step * (1 / 30)
      );
      assert.equal(res.collided, false, `spawn ${spawnIdx} collided at step ${step}`);
      assert.equal(sim.outOfBoundsTimer, 0, `spawn ${spawnIdx} went out of bounds at step ${step}`);
    }
  }
});
