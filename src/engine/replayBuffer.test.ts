import test from 'node:test';
import assert from 'node:assert/strict';
import { quatFromYaw } from '../../shared/flightPhysics';
import type { SnapshotPayload, SnapshotPlane } from '../../shared/types';
import { REPLAY_BEFORE_MS, ReplayBuffer } from './replayBuffer';

function plane(id: string, x: number, alive = true, yaw = 0): SnapshotPlane {
  const [qx, qy, qz, qw] = quatFromYaw(yaw);
  return {
    id, team: 'none', x, y: 100, z: 0, qx, qy, qz, qw, speed: 50, hp: 100, boost: 100, heat: 0,
    overheated: false, alive, lives: 3, invuln: false, outOfBounds: 0, barrelRoll: 0, secondaryPowerUp: null,
    secondaryUses: 0, shielded: false, turboActive: false, glued: false, magnetActive: false, lastAckSeq: 0, objective: 0,
  };
}

function snap(planes: SnapshotPlane[]): SnapshotPayload {
  return {
    tick: 0, serverTime: 0, roundTimer: 100, suddenDeath: false, fanAngle: 0, mapEventTime: 0,
    planes, projectiles: [], secondaryProjectiles: [], powerUps: [], destructibles: [], vacuum: null,
  };
}

test('replay: keeps only the last seconds of updates', () => {
  const b = new ReplayBuffer();
  for (let t = 0; t <= 20000; t += 50) b.push(t, snap([plane('a', t / 100)]));
  assert.ok(b.length < 160, `${b.length} updates kept`);
  assert.ok(b.covers(20000 - REPLAY_BEFORE_MS, 20000), 'the 5 s before the end are there');
  assert.equal(b.covers(1000, 6000), false, 'older moments are gone');
});

test('replay: plane poses are smoothed between updates, death shown on time', () => {
  const b = new ReplayBuffer();
  b.push(0, snap([plane('a', 0), plane('b', 50)]));
  b.push(50, snap([plane('a', 10), plane('b', 50, false)]));
  const mid = b.planePose('a', 25);
  assert.ok(mid && Math.abs(mid.x - 5) < 1e-9, 'half way');
  assert.ok(mid && Math.abs(Math.hypot(mid.qx, mid.qy, mid.qz, mid.qw) - 1) < 1e-9);
  assert.equal(b.planePose('b', 25)?.alive, true, 'still flying between the updates');
  assert.equal(b.planePose('b', 50)?.alive, false, 'down at the update that says so');
  assert.equal(b.planePose('zzz', 25), null, 'unknown plane');
  assert.equal(b.indexAt(-10), 0);
  assert.equal(b.indexAt(999), 1);
});

test('replay: a plane that left keeps its last pose, a turning plane turns the short way', () => {
  const b = new ReplayBuffer();
  b.push(0, snap([plane('a', 0, true, 3.1)]));
  b.push(100, snap([plane('a', 0, true, -3.1)])); // nearly the same heading, across ±π
  const p = b.planePose('a', 50);
  assert.ok(p);
  const heading = Math.atan2(2 * (p.qw * p.qy), 1 - 2 * p.qy * p.qy);
  assert.ok(Math.abs(Math.abs(heading) - Math.PI) < 0.05, `stays facing back (${heading})`);
  b.push(200, snap([]));
  assert.ok(b.planePose('a', 150), 'pose from the previous update when missing from the next');
});
