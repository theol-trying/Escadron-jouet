import test from 'node:test';
import assert from 'node:assert/strict';
import { quatFromAxisAngle, quatFromYaw } from '../../shared/flightPhysics';
import { PLANE_ARCHETYPES } from '../../shared/planes';
import type { TeamId } from '../../shared/types';
import { AIM_ASSIST_CONE, AIM_ASSIST_RANGE, computeAimAssist, type AimAssistTarget } from './aimAssist';

const arch = PLANE_ARCHETYPES.plastic_jet;
// Shooter at the origin, nose toward -Z (yaw 0), level
const [qx, qy, qz, qw] = quatFromYaw(0);
const me = { x: 0, y: 100, z: 0, qx, qy, qz, qw, speed: arch.cruiseSpeed };

/** A target `dist` ahead, offset sideways (x) and up (y); flying the same way as us unless told otherwise. */
function target(dist: number, x = 0, y = 0, o: Partial<AimAssistTarget> = {}): AimAssistTarget {
  const [tqx, tqy, tqz, tqw] = quatFromYaw(0);
  return { x, y: 100 + y, z: -dist, qx: tqx, qy: tqy, qz: tqz, qw: tqw, speed: 0, alive: true, invuln: false, team: 'none', ...o };
}

test('aim assist: a target slightly right and above pulls the aim right and up, at most the chosen strength', () => {
  const out = computeAimAssist(me, [target(150, 6, 4)], arch, 0.4, 'none');
  assert.ok(out, 'engages inside the cone');
  assert.ok(out.x > 0, `steers right (${out.x})`);
  assert.ok(out.y > 0, `steers up (${out.y})`);
  assert.ok(out.weight > 0 && out.weight <= 0.4, `blend weight ${out.weight}`);
  assert.ok(Math.abs(out.x) <= 1 && Math.abs(out.y) <= 1, 'stick values stay in range');
});

test('aim assist: dead ahead = full strength, fading to nothing at the edge of the cone', () => {
  const centre = computeAimAssist(me, [target(150)], arch, 0.6, 'none');
  assert.ok(centre);
  assert.ok(Math.abs(centre.weight - 0.6) < 1e-9);
  assert.ok(Math.abs(centre.x) < 1e-9 && Math.abs(centre.y) < 1e-9, 'nothing to correct');
  // Just outside the cone: off
  const side = Math.tan(AIM_ASSIST_CONE * 1.05) * 150;
  assert.equal(computeAimAssist(me, [target(150, side)], arch, 0.6, 'none'), null);
});

test('aim assist: off, out of range, too close, behind, teammates, wrecks and protected planes are ignored', () => {
  assert.equal(computeAimAssist(me, [target(150)], arch, 0, 'none'), null, 'setting off');
  assert.equal(computeAimAssist(me, [target(AIM_ASSIST_RANGE + 10)], arch, 0.4, 'none'), null, 'too far');
  assert.equal(computeAimAssist(me, [target(5)], arch, 0.4, 'none'), null, 'too close');
  assert.equal(computeAimAssist(me, [target(-150)], arch, 0.4, 'none'), null, 'behind');
  const team: TeamId = 'red';
  assert.equal(computeAimAssist(me, [target(150, 0, 0, { team })], arch, 0.4, team), null, 'teammate');
  assert.ok(computeAimAssist(me, [target(150, 0, 0, { team: 'blue' })], arch, 0.4, team), 'opponent team');
  assert.equal(computeAimAssist(me, [target(150, 0, 0, { alive: false })], arch, 0.4, 'none'), null, 'wreck');
  assert.equal(computeAimAssist(me, [target(150, 0, 0, { invuln: true })], arch, 0.4, 'none'), null, 'spawn bubble');
});

test('aim assist: picks the target closest to the nose and leads a crossing target', () => {
  // Two targets: the one nearly centred wins
  const out = computeAimAssist(me, [target(150, 12), target(150, -2)], arch, 0.4, 'none');
  assert.ok(out && out.x < 0, 'goes for the nearly centred one, on the left');

  // A target dead ahead crossing toward the right (+X): aim ahead of it, to the right
  const [cqx, cqy, cqz, cqw] = quatFromYaw(-Math.PI / 2); // nose toward +X
  const crossing = target(200, 0, 0, { qx: cqx, qy: cqy, qz: cqz, qw: cqw, speed: 60 });
  const lead = computeAimAssist(me, [crossing], arch, 0.4, 'none');
  assert.ok(lead && lead.x > 0, `leads toward its motion (${lead?.x})`);
});

test('aim assist: works the same when the shooter is climbing', () => {
  const [pqx, pqy, pqz, pqw] = quatFromAxisAngle(1, 0, 0, 0.5); // nose 0.5 rad up
  const climbing = { ...me, qx: pqx, qy: pqy, qz: pqz, qw: pqw };
  const d = 150;
  const ahead = target(0, 0, Math.sin(0.5) * d, { z: -Math.cos(0.5) * d });
  const out = computeAimAssist(climbing, [ahead], arch, 0.4, 'none');
  assert.ok(out);
  assert.ok(Math.abs(out.x) < 1e-6 && Math.abs(out.y) < 1e-6, 'already on target');
});
