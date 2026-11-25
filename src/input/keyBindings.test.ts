import test from 'node:test';
import assert from 'node:assert/strict';
import { keyboardFlightStep, flightKeyAction } from './flightControls';
import {
  BINDING_ORDER,
  DEFAULT_BINDINGS,
  flightKeyCodes,
  parseBindings,
  quickMessageIndex,
  rebind,
} from './keyBindings';
import { keyLabel, keysLabel } from './keyLabels';

test('key bindings: saved keys kept, broken or reserved entries back to default', () => {
  assert.deepEqual(parseBindings(undefined), DEFAULT_BINDINGS);
  const parsed = parseBindings({ fire: ['KeyF'], boost: 'Shift', special: ['Escape'], up: [42, '<script>'] });
  assert.deepEqual(parsed.fire, ['KeyF']);
  assert.deepEqual(parsed.boost, DEFAULT_BINDINGS.boost, 'not a list');
  assert.deepEqual(parsed.special, DEFAULT_BINDINGS.special, 'Échap is reserved');
  assert.deepEqual(parsed.up, DEFAULT_BINDINGS.up, 'garbage');
  for (const a of BINDING_ORDER) assert.ok(parsed[a].length > 0, `${a} has a key`);
});

test('key bindings: a key already used is swapped, never leaving an action without key', () => {
  // Fire on F: only fire changes
  let b = rebind(DEFAULT_BINDINGS, 'fire', 'KeyF');
  assert.deepEqual(b.fire, ['KeyF']);
  assert.deepEqual(b.boost, DEFAULT_BINDINGS.boost);
  // Boost on V (the camera key): the camera takes boost's old keys
  b = rebind(b, 'boost', 'KeyV');
  assert.deepEqual(b.boost, ['KeyV']);
  assert.deepEqual(b.camera, ['ShiftLeft', 'ShiftRight']);
  // Left on ←, which "left" shares with Q: stays a single key for left, nothing lost elsewhere
  b = rebind(b, 'left', 'ArrowLeft');
  assert.deepEqual(b.left, ['ArrowLeft']);
  for (const a of BINDING_ORDER) assert.ok(b[a].length > 0, `${a} still has a key`);
  assert.equal(rebind(b, 'fire', 'Escape'), b, 'Échap cannot be bound');
});

test('key bindings: custom keys drive flight, rolls, spectating and quick messages', () => {
  const b = rebind(rebind(rebind(DEFAULT_BINDINGS, 'up', 'KeyI'), 'rollLeft', 'KeyU'), 'quick2', 'KeyH');
  const opts = { scheme: 'keyboard' as const, keyboardSensitivity: 1, invertY: false, dt: 1 / 30 };
  let aim = { aimX: 0, aimY: 0 };
  for (let i = 0; i < 60; i++) aim = keyboardFlightStep(new Set(['KeyI']), opts, aim, b);
  assert.ok(aim.aimY > 0.99, 'I climbs');
  assert.equal(keyboardFlightStep(new Set(['KeyW']), opts, { aimX: 0, aimY: 0 }, b).aimY, 0, 'Z no longer does');
  assert.deepEqual(flightKeyAction('KeyU', b), { barrelRoll: -1 });
  assert.deepEqual(flightKeyAction('KeyQ', b), {}, 'A no longer rolls');
  assert.equal(quickMessageIndex(b, 'KeyH'), 1);
  assert.equal(quickMessageIndex(DEFAULT_BINDINGS, 'Numpad4'), 3);
  assert.equal(quickMessageIndex(DEFAULT_BINDINGS, 'KeyH'), -1);
  assert.ok(flightKeyCodes(b).has('KeyI') && !flightKeyCodes(b).has('KeyW'));
});

test('key labels: AZERTY names without a layout map, the real character with one', () => {
  assert.equal(keyLabel('KeyW'), 'Z');
  assert.equal(keyLabel('KeyQ'), 'A');
  assert.equal(keyLabel('Semicolon'), 'M', 'the M key of an AZERTY keyboard');
  assert.equal(keyLabel('Space'), 'Espace');
  assert.equal(keyLabel('Numpad2'), '2 (pavé)');
  assert.equal(keysLabel(['KeyA', 'ArrowLeft']), 'Q / ←');
  const qwerty = new Map([['KeyW', 'w'], ['Semicolon', ';']]);
  assert.equal(keyLabel('KeyW', qwerty), 'W');
  assert.equal(keyLabel('Semicolon', qwerty), ';');
  assert.equal(keysLabel([]), '—');
});
