/**
 * Names of physical keys as printed on the keyboard. The browser's layout map gives the real
 * character (Chrome, Edge); without it, the French AZERTY layout is assumed.
 */
const NAMED: Record<string, string> = {
  Space: 'Espace',
  Enter: 'Entrée',
  NumpadEnter: 'Entrée (pavé)',
  ShiftLeft: 'Maj gauche',
  ShiftRight: 'Maj droite',
  ControlLeft: 'Ctrl gauche',
  ControlRight: 'Ctrl droit',
  AltLeft: 'Alt',
  AltRight: 'Alt Gr',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Tab: 'Tab',
  Escape: 'Échap',
  Backspace: 'Retour arrière',
  CapsLock: 'Verr. maj',
  Insert: 'Inser',
  Delete: 'Suppr',
  Home: 'Début',
  End: 'Fin',
  PageUp: 'Page préc.',
  PageDown: 'Page suiv.',
  NumpadAdd: '+ (pavé)',
  NumpadSubtract: '− (pavé)',
  NumpadMultiply: '× (pavé)',
  NumpadDivide: '÷ (pavé)',
  NumpadDecimal: ', (pavé)',
};

// AZERTY characters of the keys that differ from QWERTY (codes are QWERTY positions)
const AZERTY: Record<string, string> = {
  KeyQ: 'A',
  KeyW: 'Z',
  KeyA: 'Q',
  KeyZ: 'W',
  KeyM: ',',
  Semicolon: 'M',
  Comma: ';',
  Period: ':',
  Slash: '!',
  Quote: 'ù',
  BracketLeft: '^',
  BracketRight: '$',
  Backslash: '*',
  Backquote: '²',
  Minus: ')',
  Equal: '=',
  IntlBackslash: '<',
};

/** Layout map from the browser (code → character), when available. */
export type LayoutMap = { get(code: string): string | undefined };

export function keyLabel(code: string, layout?: LayoutMap | null): string {
  if (NAMED[code]) return NAMED[code];
  const numpad = /^Numpad(\d)$/.exec(code);
  if (numpad) return `${numpad[1]} (pavé)`;
  const fn = /^F(\d{1,2})$/.exec(code);
  if (fn) return code;
  const fromLayout = layout?.get(code);
  if (fromLayout && fromLayout.trim()) return fromLayout.toUpperCase();
  if (AZERTY[code]) return AZERTY[code];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  return code;
}

/** Labels of an action's keys, e.g. "Q / ←". */
export function keysLabel(codes: readonly string[], layout?: LayoutMap | null): string {
  return codes.length > 0 ? codes.map((c) => keyLabel(c, layout)).join(' / ') : '—';
}

/** Asks the browser for the keyboard layout (Chrome, Edge); null elsewhere. */
export async function loadLayoutMap(): Promise<LayoutMap | null> {
  try {
    const kb = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<LayoutMap> } }).keyboard;
    return kb?.getLayoutMap ? await kb.getLayoutMap() : null;
  } catch {
    return null;
  }
}
