import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSphereVsCollider } from '../flightPhysics';
import { getMoverColliders, moverPieces, moverSweepColliders, scaleMover, type MapMover } from './movers';
import type { MapDefinition } from './types';
import { DESK_MAP } from './desk';

const mobile: MapMover = { id: 'mobile', kind: 'orbit', cx: 0, cy: 170, cz: 0, radius: 50, arms: 4, speed: 0.5, bodyRadius: 10, hangLength: 20, damage: 10 };
const train: MapMover = {
  id: 'train',
  kind: 'loop',
  points: [
    { x: -100, z: 0 },
    { x: 100, z: 0 },
    { x: 100, z: 100 },
    { x: -100, z: 100 },
  ],
  y: 0,
  speed: 50,
  cars: 3,
  carLength: 20,
  carRadius: 8,
  gap: 4,
  damage: 14,
};
const room = (movers: MapMover[]): MapDefinition => ({ ...DESK_MAP, colliders: [], movers });

test('movers: the mobile turns its toys on a circle, evenly spaced', () => {
  const p0 = moverPieces(mobile, 0);
  assert.equal(p0.length, 4);
  for (const p of p0) assert.ok(Math.abs(Math.hypot(p.x, p.z) - 50) < 1e-9 && p.y === 170);
  const quarter = moverPieces(mobile, Math.PI / 2 / 0.5);
  assert.ok(Math.abs(quarter[0].x - p0[1].x) < 1e-9 && Math.abs(quarter[0].z - p0[1].z) < 1e-9, 'after a quarter turn, toy 1 is where toy 2 was');
});

test('movers: the train follows its track, cars one behind the other, and loops', () => {
  const lap = 600 / 50; // track length / speed
  const a = moverPieces(train, 1);
  assert.ok(Math.abs(a[0].x - -50) < 1e-9 && Math.abs(a[0].z) < 1e-9, 'engine 50 units along the first side');
  assert.ok(a[0].x - a[1].x > 20, 'the next car follows behind');
  const b = moverPieces(train, 1 + lap);
  assert.ok(Math.abs(a[0].x - b[0].x) < 1e-9 && Math.abs(a[0].z - b[0].z) < 1e-9, 'same place one lap later');
  // Heading along the first side (toward +X): yaw -π/2
  assert.ok(Math.abs(a[0].yaw - -Math.PI / 2) < 1e-9);
});

test('movers: obstacles where the pieces are now, the swept path covers every moment', () => {
  const map = room([mobile, train]);
  for (const t of [0, 1.3, 4.7, 9.9]) {
    const cols = getMoverColliders(map, t);
    assert.equal(cols.length, 4 + 3);
    const sweep = moverSweepColliders(map);
    for (const p of [...moverPieces(mobile, t), ...moverPieces(train, t)]) {
      const y = p.y + (p.y === 0 ? 8 : 0);
      assert.ok(sweep.some((c) => resolveSphereVsCollider(p.x, y, p.z, 1, c, 0)), `piece at ${t} s inside the swept path`);
      assert.ok(cols.some((c) => resolveSphereVsCollider(p.x, y, p.z, 1, c, 0)), 'piece is an obstacle now');
    }
  }
  assert.equal(getMoverColliders(room([]), 3).length, 0);
});

test('movers: enlarged with the room, the train keeps its lap time', () => {
  const s = 1.4;
  const big = scaleMover(train, s);
  const t = 2.5;
  const p = moverPieces(train, t)[0];
  const q = moverPieces(big, t)[0];
  assert.ok(Math.abs(q.x - p.x * s) < 1e-9 && Math.abs(q.z - p.z * s) < 1e-9);
  const m = scaleMover(mobile, s);
  assert.equal(m.kind === 'orbit' && m.speed, mobile.speed, 'the mobile turns at the same pace');
});
