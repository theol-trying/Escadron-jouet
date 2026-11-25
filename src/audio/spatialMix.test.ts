import test from 'node:test';
import assert from 'node:assert/strict';
import { EARSHOT, HRTF_RANGE, MAX_HRTF_VOICES, spatialModel } from './spatialMix';

test('3D sound: nearby sounds get HRTF, a few at a time', () => {
  assert.equal(spatialModel(0, 0), 'HRTF');
  assert.equal(spatialModel(HRTF_RANGE, MAX_HRTF_VOICES - 1), 'HRTF');
  assert.equal(spatialModel(50, MAX_HRTF_VOICES), 'equalpower', 'budget used up: cheap panner');
});

test('3D sound: distant sounds use the cheap panner, sounds out of earshot are skipped', () => {
  assert.equal(spatialModel(HRTF_RANGE + 1, 0), 'equalpower');
  assert.equal(spatialModel(EARSHOT, 0), 'equalpower');
  assert.equal(spatialModel(EARSHOT + 1, 0), null);
  assert.equal(spatialModel(Number.NaN, 0), null);
});
