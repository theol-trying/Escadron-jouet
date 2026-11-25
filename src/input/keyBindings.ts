/**
 * Customisable keys. Bindings are physical keys (KeyboardEvent.code), so they keep their place
 * whatever the layout (AZERTY Z = code KeyW). Saved with the gameplay settings.
 */
export type BindableAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'throttleUp'
  | 'throttleDown'
  | 'fire'
  | 'boost'
  | 'special'
  | 'rollLeft'
  | 'rollRight'
  | 'camera'
  | 'scoreboard'
  | 'pause'
  | 'mute'
  | 'quick1'
  | 'quick2'
  | 'quick3'
  | 'quick4';

export type KeyBindings = Record<BindableAction, string[]>;

export const BINDING_ORDER: BindableAction[] = [
  'up',
  'down',
  'left',
  'right',
  'throttleUp',
  'throttleDown',
  'fire',
  'boost',
  'special',
  'rollLeft',
  'rollRight',
  'camera',
  'scoreboard',
  'pause',
  'mute',
  'quick1',
  'quick2',
  'quick3',
  'quick4',
];

export const DEFAULT_BINDINGS: KeyBindings = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  throttleUp: ['ArrowUp'],
  throttleDown: ['ArrowDown'],
  fire: ['Space', 'Enter', 'NumpadEnter'],
  boost: ['ShiftLeft', 'ShiftRight'],
  special: ['ControlLeft', 'ControlRight'],
  rollLeft: ['KeyQ'],
  rollRight: ['KeyE'],
  camera: ['KeyV'],
  scoreboard: ['Tab'],
  pause: ['KeyP'],
  // The M key is code Semicolon on AZERTY and KeyM on QWERTY: both
  mute: ['Semicolon', 'KeyM'],
  quick1: ['Digit1', 'Numpad1'],
  quick2: ['Digit2', 'Numpad2'],
  quick3: ['Digit3', 'Numpad3'],
  quick4: ['Digit4', 'Numpad4'],
};

/** Actions whose keys must not trigger the browser (scrolling, focused button, Ctrl shortcuts) in flight. */
const FLIGHT_ACTIONS: BindableAction[] = [
  'up',
  'down',
  'left',
  'right',
  'throttleUp',
  'throttleDown',
  'fire',
  'boost',
  'special',
  'rollLeft',
  'rollRight',
];

/** Keys that cannot be bound: Échap is always pause / cancel, the system keys stay the system's. */
export const RESERVED_CODES: ReadonlySet<string> = new Set([
  'Escape',
  'MetaLeft',
  'MetaRight',
  'ContextMenu',
  'F5',
  'F11',
  'F12',
]);

const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,24}$/;

/** Saved bindings, each action checked (unknown or broken entries fall back to the default keys). */
export function parseBindings(value: unknown): KeyBindings {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const out = {} as KeyBindings;
  for (const action of BINDING_ORDER) {
    const v = raw[action];
    const codes = Array.isArray(v)
      ? v.filter((c): c is string => typeof c === 'string' && CODE_PATTERN.test(c) && !RESERVED_CODES.has(c)).slice(0, 3)
      : null;
    out[action] = codes && codes.length > 0 ? codes : [...DEFAULT_BINDINGS[action]];
  }
  return out;
}

/**
 * Binds `code` to `action` (alone). If another action used that key, it takes over the keys the
 * action had (a swap), so no action is left without a key.
 */
export function rebind(bindings: KeyBindings, action: BindableAction, code: string): KeyBindings {
  if (RESERVED_CODES.has(code) || !CODE_PATTERN.test(code)) return bindings;
  const previous = bindings[action];
  const next = {} as KeyBindings;
  for (const a of BINDING_ORDER) {
    if (a === action) {
      next[a] = [code];
      continue;
    }
    const kept = bindings[a].filter((c) => c !== code);
    next[a] = kept.length > 0 ? kept : previous.filter((c) => c !== code).length > 0 ? previous.filter((c) => c !== code) : [];
  }
  return next;
}

export function isBound(bindings: KeyBindings, action: BindableAction, code: string): boolean {
  return bindings[action].includes(code);
}

/** Every key of the flight actions (their browser default is prevented during a match). */
export function flightKeyCodes(bindings: KeyBindings): Set<string> {
  const s = new Set<string>();
  for (const a of FLIGHT_ACTIONS) for (const c of bindings[a]) s.add(c);
  return s;
}

/** Index 0..3 of the quick message bound to this key, or -1. */
export function quickMessageIndex(bindings: KeyBindings, code: string): number {
  const actions: BindableAction[] = ['quick1', 'quick2', 'quick3', 'quick4'];
  return actions.findIndex((a) => bindings[a].includes(code));
}
