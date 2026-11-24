import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFanYawAtTime,
  getHingeDoorAngleAtTime,
  quatFromYaw,
  resolveSphereVsCollider,
  stepPlanePhysics,
} from '../flightPhysics';
import { MAP_ORDER, MAPS } from './index';
import { PLANE_ARCHETYPES } from '../planes';
import type { PlaneSimState, PlayerInputState } from '../types';

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
    speed: 68,
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

test('all 3 maps are available with 16 spawns, 5 power-up spots, and valid destructible colliders', () => {
  assert.deepEqual(MAP_ORDER, ['desk', 'kitchen', 'garden']);
  for (const mapId of MAP_ORDER) {
    const map = MAPS[mapId];
    assert.equal(map.available, true, `${mapId} should be available`);
    assert.equal(map.spawns.length, 16, `${mapId} should have 16 spawns`);
    assert.equal(map.powerUpSpots.length, 5, `${mapId} should have 5 powerUpSpots`);
    for (const d of map.destructibles) {
      assert.ok(
        map.colliders.some((c) => c.id === d.colliderId),
        `${mapId} destructible ${d.id} must match collider ${d.colliderId}`
      );
    }
  }
});

test('all 16 spawns on kitchen and garden fly 4.5s unobstructed and in-bounds', () => {
  for (const mapId of ['kitchen', 'garden'] as const) {
    const map = MAPS[mapId];
    for (let idx = 0; idx < map.spawns.length; idx++) {
      const sp = map.spawns[idx];
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
          map,
          step * (1 / 30)
        );
        assert.equal(res.collided, false, `${mapId} spawn ${idx} collided at step ${step}`);
        assert.equal(
          res.triggeredHazard,
          null,
          `${mapId} spawn ${idx} hit hazard at step ${step}`
        );
        assert.equal(
          sim.outOfBoundsTimer,
          0,
          `${mapId} spawn ${idx} went out of bounds at step ${step}`
        );
      }
    }
  }
});

test('kitchen hinged fridge door rotates and shifts collision volume dynamically', () => {
  const fridgeDoor = MAPS.kitchen.colliders.find((c) => c.id === 'fridge_door');
  assert.ok(fridgeDoor && fridgeDoor.kind === 'box' && fridgeDoor.hinge);

  // At t=0, door is closed along Z = -90, X = 158..240
  assert.equal(getHingeDoorAngleAtTime(-1.18, 10, 0), 0);
  const closedHit = resolveSphereVsCollider(200, 100, -88, 6, fridgeDoor, 0);
  assert.ok(closedHit !== null, 'closed fridge door should block X=200, Z=-88');

  // At t=5 (half cycle), door is wide open toward +Z; X=230, Z=-88 is clear while X=188, Z=-24 is blocked
  const openAngle = getHingeDoorAngleAtTime(-1.18, 10, 5);
  assert.ok(openAngle < -1.1);
  const clearedOldSpot = resolveSphereVsCollider(230, 100, -88, 6, fridgeDoor, 5);
  assert.equal(clearedOldSpot, null, 'open fridge door should clear X=230, Z=-88');
  const openDoorHit = resolveSphereVsCollider(188, 100, -24, 8, fridgeDoor, 5);
  assert.ok(openDoorHit !== null, 'open fridge door should block swung door wing');
});

test('kitchen stove updraft lifts plane upward and blender hazard triggers lethal hit', () => {
  // Stove updraft at (8, 92..212, -142)
  const stoveSim = makeSim({ x: 8, y: 120, z: -142, invulnTimer: 0 });
  const beforeY = stoveSim.y;
  stepPlanePhysics(stoveSim, makeInput(), PLANE_ARCHETYPES.plastic_jet, MAPS.kitchen, 0);
  assert.ok(stoveSim.y > beforeY, 'stove updraft should push plane upward');

  // Blender hazard at (44, 112..148, 44)
  const blenderSim = makeSim({ x: 44, y: 124, z: 44, invulnTimer: 0 });
  const res = stepPlanePhysics(
    blenderSim,
    makeInput(),
    PLANE_ARCHETYPES.plastic_jet,
    MAPS.kitchen,
    0
  );
  assert.ok(res.triggeredHazard !== null);
  assert.equal(res.triggeredHazard?.id, 'blender_hazard');
});

test('garden spinning lawn sprinkler rotates 360 degrees continuously and pushes planes in spray cone', () => {
  const wz = MAPS.garden.windZones[0];
  assert.ok(wz.continuousSpin);
  const yaw0 = getFanYawAtTime(wz.baseYaw, wz.sweepAmplitude, wz.sweepSpeed, 0, true);
  const yaw3 = getFanYawAtTime(wz.baseYaw, wz.sweepAmplitude, wz.sweepSpeed, 3, true);
  assert.ok(yaw3 - yaw0 > 3.0, 'continuousSpin should rotate monotonically beyond pi');

  // Place plane directly in front of Arm 1 at t=0 (yaw=0 -> blows toward -Z from (18,22,18))
  const gardenSim = makeSim({ x: 18, y: 26, z: -40 });
  const calmMap = { ...MAPS.garden, windZones: [] };
  const calmSim = makeSim({ x: 18, y: 26, z: -40 });
  stepPlanePhysics(gardenSim, makeInput(), PLANE_ARCHETYPES.plastic_jet, MAPS.garden, 0);
  stepPlanePhysics(calmSim, makeInput(), PLANE_ARCHETYPES.plastic_jet, calmMap, 0);
  assert.ok(gardenSim.z < calmSim.z, 'sprinkler jet should push plane further along -Z');
});
