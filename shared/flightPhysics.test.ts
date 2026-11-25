import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_SCALE as S } from './constants';
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
    useSecondary: false,
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
  // Desk tabletop (design units) is Y: 70..76, X: -195..145, Z: -120..35 — scaled by ARENA_SCALE
  const sim = makeSim({ x: 0, y: 74 * S, z: 0, invulnTimer: 0 });
  const res = stepPlanePhysics(
    sim,
    makeInput(),
    PLANE_ARCHETYPES.plastic_jet,
    DESK_MAP,
    0
  );
  assert.equal(res.collided, true);
  assert.ok(res.collisionDamage > 0 && res.collisionDamage <= 20);
  assert.ok(sim.y >= 76 * S || sim.z > 35 * S);
});

test('soft bounds detection triggers out-of-bounds timer outside margin', () => {
  assert.equal(isOutsideSoftBounds(0, 120 * S, 0, DESK_MAP), false);
  assert.equal(isOutsideSoftBounds(240 * S, 120 * S, 0, DESK_MAP), true);

  const sim = makeSim({ x: 242 * S, y: 120 * S, z: 0 });
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

test('turbo_battery timer forces high speed and full boost; glueTimer slows plane', () => {
  const turboSim = makeSim({ boost: 10, turboTimer: 3.0 });
  for (let i = 0; i < 20; i++) {
    stepPlanePhysics(turboSim, makeInput(), PLANE_ARCHETYPES.plastic_jet, DESK_MAP, i * (1 / 30));
  }
  assert.equal(turboSim.boost, 100);
  assert.ok(turboSim.speed > PLANE_ARCHETYPES.plastic_jet.boostSpeed);

  const glueSim = makeSim({ glueTimer: 3.0 });
  for (let i = 0; i < 20; i++) {
    stepPlanePhysics(glueSim, makeInput(), PLANE_ARCHETYPES.plastic_jet, DESK_MAP, i * (1 / 30));
  }
  assert.ok(glueSim.speed < PLANE_ARCHETYPES.plastic_jet.cruiseSpeed * 0.72);
});

test('destroyedColliderIds allows plane to fly cleanly through shattered prop', () => {
  // snack_box collider (design units): 108..134, 76..108, 4..24 — scaled by ARENA_SCALE
  const simSolid = makeSim({ x: 121 * S, y: 92 * S, z: 14 * S });
  const hitSolid = stepPlanePhysics(simSolid, makeInput(), PLANE_ARCHETYPES.plastic_jet, DESK_MAP, 0);
  assert.equal(hitSolid.collided, true);
  assert.equal(hitSolid.collidedColliderId, 'snack_box');

  const simBroken = makeSim({ x: 121 * S, y: 92 * S, z: 14 * S });
  const hitBroken = stepPlanePhysics(
    simBroken,
    makeInput(),
    PLANE_ARCHETYPES.plastic_jet,
    DESK_MAP,
    0,
    new Set(['snack_box'])
  );
  assert.equal(hitBroken.collided, false);
});

test('helicopter: stops in mid-air and climbs or descends with the pitch input', () => {
  const heli = PLANE_ARCHETYPES.toy_helicopter;
  const sim = makeSim({ x: 0, y: 150 * S, z: 0, speed: heli.cruiseSpeed });
  const step = (o: Partial<PlayerInputState>) =>
    stepPlanePhysics(
      sim,
      { seq: 0, dt: 1 / 30, aimX: 0, aimY: 0, throttle: 0, roll: 0, boost: false, fire: false, useSecondary: false, barrelRollDir: 0, ...o },
      heli,
      DESK_MAP,
      0
    );
  // Full brake: hover
  for (let i = 0; i < 90; i++) step({ throttle: -1 });
  assert.ok(sim.speed < 1, `stopped (${sim.speed})`);
  const x0 = sim.x;
  const z0 = sim.z;
  const y0 = sim.y;
  for (let i = 0; i < 30; i++) step({ throttle: -1 });
  assert.ok(Math.hypot(sim.x - x0, sim.z - z0) < 1.5, 'stays in place');
  assert.ok(Math.abs(sim.y - y0) < 1, 'no drift up or down');
  // Pitch input: straight up at about climbRate, body nearly level
  for (let i = 0; i < 30; i++) step({ throttle: -1, aimY: 1 });
  assert.ok(sim.y - y0 > heli.hover!.climbRate * 0.8, `climbed ${sim.y - y0}`);
  assert.ok(getPlaneForward(sim).y < 0.5, 'nose stays fairly level');
  // A plane cannot do that: it keeps its minimum speed
  const jet = makeSim({ y: 150 * S, speed: 60 });
  for (let i = 0; i < 90; i++) {
    stepPlanePhysics(jet, { seq: 0, dt: 1 / 30, aimX: 0, aimY: 0, throttle: -1, roll: 0, boost: false, fire: false, useSecondary: false, barrelRollDir: 0 }, PLANE_ARCHETYPES.plastic_jet, DESK_MAP, 0);
  }
  assert.ok(jet.speed > PLANE_ARCHETYPES.plastic_jet.minSpeed * 0.95);
});

test('paper plane: fastest of all, most fragile', () => {
  const paper = PLANE_ARCHETYPES.paper_plane;
  for (const a of Object.values(PLANE_ARCHETYPES)) {
    if (a.id === 'paper_plane') continue;
    assert.ok(paper.cruiseSpeed > a.cruiseSpeed && paper.boostSpeed >= a.boostSpeed, `faster than ${a.id}`);
    assert.ok(paper.maxHp < a.maxHp, `more fragile than ${a.id}`);
  }
});
