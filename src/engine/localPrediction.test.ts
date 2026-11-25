import test from 'node:test';
import assert from 'node:assert/strict';
import { quatFromYaw } from '../../shared/flightPhysics';
import { MAPS } from '../../shared/maps/index';
import { PLANE_ARCHETYPES } from '../../shared/planes';
import type { PlayerInputState, SnapshotPlane } from '../../shared/types';
import { SMOOTH_SHARE, SNAP_DISTANCE, reconcileLocalSim, simFromSnapshot } from './localPrediction';

const arch = PLANE_ARCHETYPES.plastic_jet;
const map = MAPS.desk;
const [qx, qy, qz, qw] = quatFromYaw(0);

function auth(o: Partial<SnapshotPlane> = {}): SnapshotPlane {
  return {
    id: 'me',
    team: 'none',
    x: 0,
    y: 200,
    z: 0,
    qx,
    qy,
    qz,
    qw,
    speed: arch.cruiseSpeed,
    hp: arch.maxHp,
    boost: 80,
    heat: 0,
    overheated: false,
    alive: true,
    lives: 3,
    invuln: false,
    outOfBounds: 0,
    barrelRoll: 0,
    secondaryPowerUp: null,
    secondaryUses: 0,
    shielded: false,
    turboActive: false,
    glued: false,
    magnetActive: false,
    lastAckSeq: 0,
    objective: 0,
    ...o,
  };
}

const input = (seq: number): PlayerInputState => ({
  seq,
  dt: 1 / 30,
  aimX: 0,
  aimY: 0,
  throttle: 0,
  roll: 0,
  boost: false,
  fire: false,
  useSecondary: false,
  barrelRollDir: 0,
});

test('prediction: a server update rebuilds the local plane as is', () => {
  const sim = simFromSnapshot(auth({ x: 12, hp: 40, shielded: true, secondaryPowerUp: 'magnet', secondaryUses: 1 }), arch);
  assert.equal(sim.x, 12);
  assert.equal(sim.hp, 40);
  assert.equal(sim.maxHp, arch.maxHp);
  assert.ok(sim.shieldTimer > 0 && sim.shieldHp > 0);
  assert.equal(sim.secondaryPowerUp, 'magnet');
});

test('prediction: acknowledged inputs are dropped, the others replayed on top of the server position', () => {
  const sim = simFromSnapshot(auth(), arch);
  const pending = [input(1), input(2), input(3), input(4)];
  reconcileLocalSim(sim, auth({ lastAckSeq: 2 }), pending, arch, map, 0, new Set());
  assert.deepEqual(
    pending.map((p) => p.seq),
    [3, 4]
  );
  // Two inputs replayed from the server position: the plane flew ahead (toward -Z) of it
  // and the local plane, still at the start, moved part of the way there (small gap = glide)
  assert.ok(sim.z < 0, `glides toward the replayed position (${sim.z})`);
});

test('prediction: a small gap is closed smoothly, a large one at once', () => {
  const sim = simFromSnapshot(auth(), arch);
  reconcileLocalSim(sim, auth({ x: 4 }), [], arch, map, 0, new Set());
  assert.ok(Math.abs(sim.x - 4 * SMOOTH_SHARE) < 1e-9, `glides (${sim.x})`);

  const far = simFromSnapshot(auth(), arch);
  reconcileLocalSim(far, auth({ x: SNAP_DISTANCE + 5 }), [], arch, map, 0, new Set());
  assert.equal(far.x, SNAP_DISTANCE + 5, 'jumps');
});

test('prediction: status comes from the server, with the sounds to play', () => {
  const sim = simFromSnapshot(auth({ shielded: true }), arch);
  let heard = reconcileLocalSim(sim, auth({ shielded: false, hp: 30, secondaryPowerUp: 'turbo_battery', secondaryUses: 1 }), [], arch, map, 0, new Set());
  assert.equal(sim.hp, 30);
  assert.deepEqual(heard, { pickedUp: true, shieldPopped: true });
  heard = reconcileLocalSim(sim, auth({ hp: 30, secondaryPowerUp: 'turbo_battery', secondaryUses: 1 }), [], arch, map, 0, new Set());
  assert.deepEqual(heard, { pickedUp: false, shieldPopped: false }, 'nothing new: nothing to hear');
});
