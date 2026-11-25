import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BINDINGS } from '../input/keyBindings';
import { DEFAULT_GAMEPLAY, parseGameplaySettings } from './gameplaySettings';

test('gameplay settings: saved values are kept', () => {
  const saved = {
    controlScheme: 'keyboard',
    mouseSensitivity: 1.6,
    keyboardSensitivity: 0.8,
    invertY: true,
    aimAssist: false,
    cameraView: 'cockpit',
    keyBindings: { ...DEFAULT_BINDINGS, fire: ['KeyF'] },
  };
  assert.deepEqual(parseGameplaySettings(saved), saved);
});

test('gameplay settings: missing, broken or out-of-range values fall back safely', () => {
  assert.deepEqual(parseGameplaySettings(null), DEFAULT_GAMEPLAY);
  assert.deepEqual(parseGameplaySettings('nonsense'), DEFAULT_GAMEPLAY);
  assert.deepEqual(parseGameplaySettings({}), DEFAULT_GAMEPLAY);
  const odd = parseGameplaySettings({
    controlScheme: 'joystick',
    mouseSensitivity: 99,
    keyboardSensitivity: -3,
    invertY: 'yes',
    aimAssist: 0,
    cameraView: 'drone',
  });
  assert.equal(odd.controlScheme, 'mouse');
  assert.equal(odd.mouseSensitivity, 2, 'clamped to the slider max');
  assert.equal(odd.keyboardSensitivity, 0.5, 'clamped to the slider min');
  assert.equal(odd.invertY, false);
  assert.equal(odd.aimAssist, true, 'only an explicit false turns the assist off');
  assert.equal(odd.cameraView, 'chase');
  assert.equal(parseGameplaySettings({ mouseSensitivity: Number.NaN }).mouseSensitivity, 1);
});
