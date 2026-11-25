import type { ControlScheme } from '../settings/gameplaySettings';
import { DEFAULT_BINDINGS, flightKeyCodes, type BindableAction, type KeyBindings } from './keyBindings';

/**
 * Flight controls as pure functions (no DOM): physical keys (KeyboardEvent.code, so AZERTY and
 * QWERTY share the same places: Z/Q/S/D on AZERTY = KeyW/KeyA/KeyS/KeyD), mouse and gamepad.
 * useFlightInput (src/hooks) feeds them from the browser events at 30 Hz.
 */

/** Default keys used in flight whose browser action is prevented during a match */
export const FLIGHT_KEYS: ReadonlySet<string> = flightKeyCodes(DEFAULT_BINDINGS);

export interface KeyboardFlight {
  aimX: number;
  aimY: number;
  throttle: number;
  roll: number;
  boost: boolean;
  /** Trigger held on the keyboard (the mouse button is added by the caller) */
  fire: boolean;
}

/** Time constant of the keyboard steering ramp: short taps give fine corrections, holds full turns */
export const KEY_STEER_RAMP = 0.12;

/**
 * Keyboard part of one input step (default keys shown, all customisable: src/input/keyBindings.ts).
 * - « Clavier seul » (keyboard): ZQSD steer (ramped toward ±sensitivity), ↑/↓ throttle.
 * - « Clavier + souris » (mouse): the aim is left to the mouse, Z/S (or ↑/↓) throttle, Q/D roll.
 * In both: Shift boost, Space / Enter fire.
 */
export function keyboardFlightStep(
  keys: ReadonlySet<string>,
  opts: { scheme: ControlScheme; keyboardSensitivity: number; invertY: boolean; dt: number },
  prevAim: { aimX: number; aimY: number },
  bindings: KeyBindings = DEFAULT_BINDINGS
): KeyboardFlight {
  const held = (...actions: BindableAction[]) => actions.some((a) => bindings[a].some((c) => keys.has(c)));
  let throttle = 0;
  let roll = 0;
  let aimX = prevAim.aimX;
  let aimY = prevAim.aimY;
  if (opts.scheme === 'keyboard') {
    if (held('throttleUp')) throttle += 1;
    if (held('throttleDown')) throttle -= 1;
    let steerX = 0;
    let steerY = 0;
    if (held('left')) steerX -= 1;
    if (held('right')) steerX += 1;
    if (held('up')) steerY += 1;
    if (held('down')) steerY -= 1;
    if (opts.invertY) steerY = -steerY;
    const k = 1 - Math.exp(-opts.dt / KEY_STEER_RAMP);
    aimX += (steerX * opts.keyboardSensitivity - aimX) * k;
    aimY += (steerY * opts.keyboardSensitivity - aimY) * k;
    aimX = Math.max(-1, Math.min(1, aimX));
    aimY = Math.max(-1, Math.min(1, aimY));
  } else {
    if (held('up', 'throttleUp')) throttle += 1;
    if (held('down', 'throttleDown')) throttle -= 1;
    if (held('left')) roll -= 1;
    if (held('right')) roll += 1;
  }
  return {
    aimX,
    aimY,
    throttle,
    roll,
    boost: held('boost'),
    fire: held('fire'),
  };
}

/** One-shot actions of a key press in flight (the caller ignores auto-repeat). */
export function flightKeyAction(
  code: string,
  bindings: KeyBindings = DEFAULT_BINDINGS
): { useSecondary?: true; barrelRoll?: -1 | 1; spectate?: -1 | 1 } {
  // Ctrl: missile / special item
  if (bindings.special.includes(code)) return { useSecondary: true };
  // A / E (physical keys Q / E on AZERTY): barrel roll to the left / right
  if (bindings.rollLeft.includes(code)) return { barrelRoll: -1 };
  if (bindings.rollRight.includes(code)) return { barrelRoll: 1 };
  // Q / D or ← / →: previous / next pilot when spectating (ignored by the engine while flying)
  if (bindings.left.includes(code)) return { spectate: -1 };
  if (bindings.right.includes(code)) return { spectate: 1 };
  return {};
}

export const MOUSE_DEADZONE = 0.04;

/**
 * Mouse aim: the plane steers toward the cursor. Offset from the centre of the 3D view, 32 % of
 * the view size = full input (× sensitivity), small dead zone in the middle.
 */
export function mouseAim(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  sensitivity: number,
  invertY: boolean
): { aimX: number; aimY: number } {
  const cx = rect.left + rect.width * 0.5;
  const cy = rect.top + rect.height * 0.5;
  const rawX = ((clientX - cx) / (rect.width * 0.32)) * sensitivity;
  const rawY = -((clientY - cy) / (rect.height * 0.32)) * sensitivity;
  const aimX = Math.abs(rawX) < MOUSE_DEADZONE ? 0 : Math.max(-1, Math.min(1, rawX));
  const pitch = Math.abs(rawY) < MOUSE_DEADZONE ? 0 : Math.max(-1, Math.min(1, rawY));
  return { aimX, aimY: invertY ? -pitch : pitch };
}

export const PAD_DEADZONE = 0.14;

/** Buttons held at the previous step (presses act once, on the way down). */
export interface PadLatch {
  secondary: boolean;
  lb: boolean;
  rb: boolean;
}

export const PAD_RELEASED: PadLatch = { secondary: false, lb: false, rb: false };

export interface PadState {
  axes: readonly number[];
  buttons: ReadonlyArray<{ pressed: boolean } | undefined>;
}

/**
 * Standard gamepad: left stick steers (null = inside the dead zone, keep the other input), A boost,
 * right trigger fire, B special item, LB / RB barrel rolls.
 */
export function gamepadStep(
  gp: PadState,
  invertY: boolean,
  prev: PadLatch
): {
  aimX: number | null;
  aimY: number | null;
  boost: boolean;
  fire: boolean;
  useSecondary: boolean;
  barrelRoll: -1 | 0 | 1;
  latch: PadLatch;
} {
  const ax = gp.axes[0] ?? 0;
  const ay = gp.axes[1] ?? 0;
  const pressed = (i: number) => Boolean(gp.buttons[i]?.pressed);
  const secondary = pressed(1);
  const lb = pressed(4);
  const rb = pressed(5);
  return {
    aimX: Math.abs(ax) > PAD_DEADZONE ? ax : null,
    aimY: Math.abs(ay) > PAD_DEADZONE ? (invertY ? ay : -ay) : null,
    boost: pressed(0),
    fire: pressed(7),
    useSecondary: secondary && !prev.secondary,
    barrelRoll: rb && !prev.rb ? 1 : lb && !prev.lb ? -1 : 0,
    latch: { secondary, lb, rb },
  };
}

/** Aim assist share: stronger for keyboard-only steering, which is less precise than a mouse. */
export function aimAssistStrength(enabled: boolean, scheme: ControlScheme): number {
  return enabled ? (scheme === 'keyboard' ? 0.6 : 0.4) : 0;
}
