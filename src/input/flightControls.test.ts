import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLIGHT_KEYS,
  KEY_STEER_RAMP,
  PAD_RELEASED,
  aimAssistStrength,
  flightKeyAction,
  gamepadStep,
  keyboardFlightStep,
  mouseAim,
  type PadState,
} from './flightControls';

const DT = 1 / 30;
const kbOnly = { scheme: 'keyboard' as const, keyboardSensitivity: 1, invertY: false, dt: DT };
const kbMouse = { scheme: 'mouse' as const, keyboardSensitivity: 1, invertY: false, dt: DT };
const still = { aimX: 0, aimY: 0 };
// Physical keys: AZERTY Z/Q/S/D = KeyW/KeyA/KeyS/KeyD, A = KeyQ
const keys = (...codes: string[]) => new Set(codes);

test('keyboard only: Z (KeyW) climbs with a short ramp, holding reaches the full input', () => {
  const one = keyboardFlightStep(keys('KeyW'), kbOnly, still);
  const expected = 1 - Math.exp(-DT / KEY_STEER_RAMP);
  assert.ok(Math.abs(one.aimY - expected) < 1e-9, `first step ${one.aimY}`);
  assert.equal(one.aimX, 0);
  let aim = still;
  for (let i = 0; i < 60; i++) aim = keyboardFlightStep(keys('KeyW', 'KeyD'), kbOnly, aim);
  assert.ok(aim.aimY > 0.99 && aim.aimX > 0.99, 'full climb and right turn after 2 s');
  // Released: back to neutral
  for (let i = 0; i < 60; i++) aim = keyboardFlightStep(keys(), kbOnly, aim);
  assert.ok(Math.abs(aim.aimX) < 0.01 && Math.abs(aim.aimY) < 0.01);
});

test('keyboard only: Q (KeyA) / ← turn left, S dives, inverted Y flips, sensitivity is clamped to the stick range', () => {
  let aim = still;
  for (let i = 0; i < 60; i++) aim = keyboardFlightStep(keys('ArrowLeft', 'KeyS'), kbOnly, aim);
  assert.ok(aim.aimX < -0.99 && aim.aimY < -0.99);
  aim = still;
  for (let i = 0; i < 60; i++) aim = keyboardFlightStep(keys('KeyW'), { ...kbOnly, invertY: true }, aim);
  assert.ok(aim.aimY < -0.99, 'inverted: Z dives');
  aim = still;
  for (let i = 0; i < 90; i++) aim = keyboardFlightStep(keys('KeyD'), { ...kbOnly, keyboardSensitivity: 1.5 }, aim);
  assert.equal(aim.aimX, 1, 'never beyond full deflection');
  aim = still;
  for (let i = 0; i < 90; i++) aim = keyboardFlightStep(keys('KeyD'), { ...kbOnly, keyboardSensitivity: 0.5 }, aim);
  assert.ok(Math.abs(aim.aimX - 0.5) < 0.01, 'low sensitivity = gentler turn');
});

test('keyboard only: ↑/↓ are the throttle, ZQSD do not touch it', () => {
  assert.equal(keyboardFlightStep(keys('ArrowUp'), kbOnly, still).throttle, 1);
  assert.equal(keyboardFlightStep(keys('ArrowDown'), kbOnly, still).throttle, -1);
  assert.equal(keyboardFlightStep(keys('KeyW', 'KeyS'), kbOnly, still).throttle, 0);
  assert.equal(keyboardFlightStep(keys('KeyA'), kbOnly, still).roll, 0, 'no roll axis in keyboard-only');
});

test('keyboard + mouse: the mouse keeps the aim, Z/S throttle, Q/D roll', () => {
  const prev = { aimX: 0.3, aimY: -0.2 };
  const out = keyboardFlightStep(keys('KeyW', 'KeyA'), kbMouse, prev);
  assert.deepEqual([out.aimX, out.aimY], [0.3, -0.2], 'aim untouched');
  assert.equal(out.throttle, 1);
  assert.equal(out.roll, -1);
  assert.equal(keyboardFlightStep(keys('ArrowDown', 'KeyD'), kbMouse, prev).throttle, -1);
  assert.equal(keyboardFlightStep(keys('ArrowDown', 'KeyD'), kbMouse, prev).roll, 1);
});

test('both schemes: Shift boosts, Space / Enter / keypad Enter fire', () => {
  for (const opts of [kbOnly, kbMouse]) {
    assert.equal(keyboardFlightStep(keys('ShiftLeft'), opts, still).boost, true);
    assert.equal(keyboardFlightStep(keys('ShiftRight'), opts, still).boost, true);
    for (const k of ['Space', 'Enter', 'NumpadEnter']) {
      assert.equal(keyboardFlightStep(keys(k), opts, still).fire, true, k);
    }
    assert.equal(keyboardFlightStep(keys('KeyW'), opts, still).fire, false);
  }
});

test('key presses: Ctrl = special item, A / E (KeyQ / KeyE) = barrel rolls, Q / D = change watched pilot', () => {
  assert.deepEqual(flightKeyAction('ControlLeft'), { useSecondary: true });
  assert.deepEqual(flightKeyAction('ControlRight'), { useSecondary: true });
  assert.deepEqual(flightKeyAction('KeyQ'), { barrelRoll: -1 });
  assert.deepEqual(flightKeyAction('KeyE'), { barrelRoll: 1 });
  assert.deepEqual(flightKeyAction('KeyA'), { spectate: -1 });
  assert.deepEqual(flightKeyAction('ArrowRight'), { spectate: 1 });
  assert.deepEqual(flightKeyAction('KeyZ'), {});
  for (const k of ['Space', 'ControlLeft', 'KeyQ', 'KeyE', 'ArrowUp', 'ShiftLeft']) {
    assert.ok(FLIGHT_KEYS.has(k), `${k} does not scroll or click while flying`);
  }
  assert.equal(FLIGHT_KEYS.has('KeyM'), false, 'M (mute) keeps its own handling');
});

test('mouse: steer toward the cursor with a small dead zone, clamped, Y inverted on demand', () => {
  const rect = { left: 0, top: 0, width: 1000, height: 600 };
  assert.deepEqual(mouseAim(500, 300, rect, 1, false), { aimX: 0, aimY: 0 }, 'centre');
  assert.deepEqual(mouseAim(505, 297, rect, 1, false), { aimX: 0, aimY: 0 }, 'inside the dead zone');
  const right = mouseAim(500 + 160, 300, rect, 1, false);
  assert.ok(Math.abs(right.aimX - 0.5) < 1e-9, 'half way to full input');
  assert.deepEqual(mouseAim(1000, 0, rect, 1, false), { aimX: 1, aimY: 1 }, 'top right corner = full right and up');
  assert.ok(Math.abs(mouseAim(500 + 160, 300, rect, 2, false).aimX - 1) < 1e-9, 'sensitivity scales');
  assert.deepEqual(mouseAim(500, 0, rect, 1, true), { aimX: 0, aimY: -1 }, 'inverted Y');
});

const pad = (axes: number[], pressed: number[] = []): PadState => ({
  axes,
  buttons: Array.from({ length: 8 }, (_, i) => ({ pressed: pressed.includes(i) })),
});

test('gamepad: stick with dead zone, A boost, right trigger fire, B / LB / RB act once per press', () => {
  let out = gamepadStep(pad([0.1, -0.05]), false, PAD_RELEASED);
  assert.equal(out.aimX, null, 'dead zone: keep the keyboard / mouse aim');
  assert.equal(out.aimY, null);
  out = gamepadStep(pad([0.6, -0.8], [0, 7]), false, PAD_RELEASED);
  assert.equal(out.aimX, 0.6);
  assert.equal(out.aimY, 0.8, 'stick forward (negative axis) = climb');
  assert.equal(gamepadStep(pad([0, -0.8]), true, PAD_RELEASED).aimY, -0.8, 'inverted Y');
  assert.equal(out.boost, true);
  assert.equal(out.fire, true);

  // B: special item on the press only
  let latch = PAD_RELEASED;
  out = gamepadStep(pad([0, 0], [1]), false, latch);
  assert.equal(out.useSecondary, true);
  latch = out.latch;
  assert.equal(gamepadStep(pad([0, 0], [1]), false, latch).useSecondary, false, 'held: no repeat');

  // LB / RB: barrel rolls, once per press
  out = gamepadStep(pad([0, 0], [4]), false, PAD_RELEASED);
  assert.equal(out.barrelRoll, -1);
  assert.equal(gamepadStep(pad([0, 0], [4]), false, out.latch).barrelRoll, 0);
  assert.equal(gamepadStep(pad([0, 0], [5]), false, PAD_RELEASED).barrelRoll, 1);
});

test('aim assist share: off, mouse 0.4, keyboard-only 0.6', () => {
  assert.equal(aimAssistStrength(false, 'keyboard'), 0);
  assert.equal(aimAssistStrength(true, 'mouse'), 0.4);
  assert.equal(aimAssistStrength(true, 'keyboard'), 0.6);
});
