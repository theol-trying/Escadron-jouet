import test from 'node:test';
import assert from 'node:assert/strict';
import { quatFromYaw } from '../../shared/flightPhysics';
import { MAPS } from '../../shared/maps/index';
import { GhostRecorder, beatsGhost, courseKey, ghostPoseAt, parseGhost } from './raceGhostData';

/** A straight flight toward -Z at 50 cm/s, sampled by the recorder at 60 frames per second. */
function recordStraight(seconds: number) {
  const rec = new GhostRecorder();
  const [qx, qy, qz, qw] = quatFromYaw(0);
  for (let t = 0; t <= seconds + 1e-9; t += 1 / 60) rec.sample(t, { x: 0, y: 100, z: -50 * t, qx, qy, qz, qw });
  return rec;
}

test('race ghost: recorded about 10 times a second, replayed smoothly in between', () => {
  const rec = recordStraight(5);
  assert.ok(rec.frameCount >= 49 && rec.frameCount <= 52, `${rec.frameCount} samples for 5 s`);
  const ghost = rec.finish(courseKey(MAPS.desk), 'paper_plane', 'red', 5);
  const mid = ghostPoseAt(ghost, 2.55);
  assert.ok(mid);
  assert.ok(Math.abs(mid.z - -127.5) < 1, `position at 2.55 s (${mid.z})`);
  assert.ok(Math.abs(Math.hypot(mid.qx, mid.qy, mid.qz, mid.qw) - 1) < 1e-9, 'unit quaternion');
  assert.equal(ghostPoseAt(ghost, -0.5), null, 'not before the start');
  assert.equal(ghostPoseAt(ghost, 6), null, 'gone after the finish');
});

test('race ghost: stored as text, refused when broken or recorded on another circuit', () => {
  const desk = courseKey(MAPS.desk);
  const ghost = recordStraight(3).finish(desk, 'plastic_jet', 'blue', 3);
  const raw = JSON.stringify(ghost);
  assert.deepEqual(parseGhost(raw, desk), ghost);
  assert.equal(parseGhost(raw, courseKey(MAPS.kitchen)), null, 'other room / moved rings');
  assert.equal(parseGhost('{"v":1}', desk), null);
  assert.equal(parseGhost('not json', desk), null);
  assert.equal(parseGhost(null, desk), null);
  assert.ok(raw.length < 3000, `small enough for the browser storage (${raw.length} characters for 3 s)`);
});

test('race ghost: only a faster finish replaces it', () => {
  const ghost = recordStraight(2).finish('c', 'plastic_jet', 'red', 62.4);
  assert.equal(beatsGhost(70, ghost), false);
  assert.equal(beatsGhost(61.9, ghost), true);
  assert.equal(beatsGhost(99, null), true, 'first finish');
});
