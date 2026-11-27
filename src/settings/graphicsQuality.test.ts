import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectGraphicsQuality,
  graphicsProfile,
  parseGraphicsQualitySetting,
  resolveGraphicsQuality,
} from './graphicsQuality';

test('graphics quality: picked from the graphics card name', () => {
  // Software rendering
  assert.equal(detectGraphicsQuality('Google SwiftShader', false), 'low');
  assert.equal(detectGraphicsQuality('', true), 'low');
  // Integrated chips (like this PC's Intel)
  assert.equal(detectGraphicsQuality('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', false), 'medium');
  assert.equal(detectGraphicsQuality('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', false), 'medium');
  assert.equal(detectGraphicsQuality('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', false), 'medium');
  assert.equal(detectGraphicsQuality('ANGLE (NVIDIA, NVIDIA GeForce MX250 Direct3D11 vs_5_0 ps_5_0, D3D11)', false), 'medium');
  assert.equal(detectGraphicsQuality('Mali-G78', false), 'medium');
  // Dedicated cards and Apple chips
  assert.equal(detectGraphicsQuality('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', false), 'high');
  assert.equal(detectGraphicsQuality('ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', false), 'high');
  assert.equal(detectGraphicsQuality('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', false), 'high');
  assert.equal(detectGraphicsQuality('Apple M2', false), 'high');
  // Unknown name: the safe middle
  assert.equal(detectGraphicsQuality('', false), 'medium');
  assert.equal(detectGraphicsQuality('Some Future GPU', false), 'medium');
});

test('graphics quality: « auto » follows the card, a chosen level wins; saved values are checked', () => {
  assert.equal(resolveGraphicsQuality('auto', 'medium'), 'medium');
  assert.equal(resolveGraphicsQuality('high', 'low'), 'high');
  assert.equal(parseGraphicsQualitySetting('low'), 'low');
  assert.equal(parseGraphicsQualitySetting('ultra'), 'auto');
  assert.equal(parseGraphicsQualitySetting(undefined), 'auto');
});

test('graphics quality: each level costs less than the next', () => {
  const [low, medium, high] = (['low', 'medium', 'high'] as const).map(graphicsProfile);
  assert.equal(low.shadows, 'off', 'no shadows on low (soft shadows are costly on integrated chips)');
  assert.equal(medium.shadows, 'sharp');
  assert.equal(high.shadows, 'soft');
  for (const [a, b] of [[low, medium], [medium, high]]) {
    assert.ok(a.shadowMapSize <= b.shadowMapSize);
    assert.ok(a.maxPixelRatio <= b.maxPixelRatio);
    assert.ok(a.dustMotes <= b.dustMotes && a.grassBlades <= b.grassBlades);
    assert.ok(a.effects <= b.effects);
    assert.ok(a.mirrorResolution <= b.mirrorResolution);
  }
});
