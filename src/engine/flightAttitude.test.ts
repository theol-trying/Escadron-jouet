import test from 'node:test';
import assert from 'node:assert/strict';
import { mulQuat, quatFromAxisAngle, quatFromYaw } from '../../shared/flightPhysics';
import { flightAttitude } from './flightAttitude';

const deg = (r: number) => (r * 180) / Math.PI;
const att = (q: [number, number, number, number], speed = 60) =>
  flightAttitude({ qx: q[0], qy: q[1], qz: q[2], qw: q[3], speed });

test('cockpit instruments: level flight reads zero whatever the heading', () => {
  for (const yaw of [0, 1, -2.5]) {
    const a = att(quatFromYaw(yaw));
    assert.ok(Math.abs(a.bankDeg) < 1e-9 && Math.abs(a.pitchDeg) < 1e-9 && Math.abs(a.climbRate) < 1e-9);
  }
});

test('cockpit instruments: nose up reads a positive pitch and climb rate', () => {
  const a = att(quatFromAxisAngle(1, 0, 0, 0.5), 60);
  assert.ok(Math.abs(a.pitchDeg - deg(0.5)) < 1e-6);
  assert.ok(Math.abs(a.climbRate - Math.sin(0.5) * 60) < 1e-6);
  assert.ok(att(quatFromAxisAngle(1, 0, 0, -0.3)).pitchDeg < 0, 'nose down');
});

test('cockpit instruments: right wing down reads a positive bank, also on another heading', () => {
  const right = att(quatFromAxisAngle(0, 0, 1, -0.4));
  assert.ok(Math.abs(right.bankDeg - deg(0.4)) < 1e-6, `${right.bankDeg}`);
  assert.ok(att(quatFromAxisAngle(0, 0, 1, 0.4)).bankDeg < 0, 'left bank');
  const [yx, yy, yz, yw] = quatFromYaw(1.2);
  const [bx, by, bz, bw] = quatFromAxisAngle(0, 0, 1, -0.4);
  const banked = att(mulQuat(yx, yy, yz, yw, bx, by, bz, bw));
  assert.ok(Math.abs(banked.bankDeg - deg(0.4)) < 1e-6);
});
