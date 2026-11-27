import { DEFAULT_BINDINGS, parseBindings, type KeyBindings } from '../input/keyBindings';
import { parseGraphicsQualitySetting, type GraphicsQualitySetting } from './graphicsQuality';

/** Player gameplay settings (saved in the browser under « ej_gameplay »). */
export type ControlScheme = 'mouse' | 'keyboard';
export type CameraViewSetting = 'chase' | 'cockpit';

export interface GameplaySettings {
  controlScheme: ControlScheme; // 'keyboard' = 100 % clavier (ZQSD), 'mouse' = viser à la souris
  mouseSensitivity: number; // 0.5..2.0
  keyboardSensitivity: number; // 0.5..1.5 (max turn input reached with ZQSD)
  invertY: boolean;
  aimAssist: boolean;
  cameraView: CameraViewSetting; // vue au lancement (touche V pour changer en vol)
  /** Customised keys (physical codes), see src/input/keyBindings.ts */
  keyBindings: KeyBindings;
  /** « Qualité graphique » (auto = chosen from the graphics card), see src/settings/graphicsQuality.ts */
  graphicsQuality: GraphicsQualitySetting;
}

export const DEFAULT_GAMEPLAY: GameplaySettings = {
  controlScheme: 'mouse',
  mouseSensitivity: 1.0,
  keyboardSensitivity: 1.0,
  invertY: false,
  aimAssist: true,
  cameraView: 'chase',
  keyBindings: DEFAULT_BINDINGS,
  graphicsQuality: 'auto',
};

const STORAGE_KEY = 'ej_gameplay';

/** Settings from saved data, ignoring unknown or invalid values (out-of-range numbers are clamped). */
export function parseGameplaySettings(value: unknown): GameplaySettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof GameplaySettings, unknown>>;
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    controlScheme: raw.controlScheme === 'keyboard' ? 'keyboard' : 'mouse',
    mouseSensitivity: num(raw.mouseSensitivity, 0.5, 2, DEFAULT_GAMEPLAY.mouseSensitivity),
    keyboardSensitivity: num(raw.keyboardSensitivity, 0.5, 1.5, DEFAULT_GAMEPLAY.keyboardSensitivity),
    invertY: raw.invertY === true,
    aimAssist: raw.aimAssist !== false,
    cameraView: raw.cameraView === 'cockpit' ? 'cockpit' : 'chase',
    keyBindings: parseBindings(raw.keyBindings),
    graphicsQuality: parseGraphicsQualitySetting(raw.graphicsQuality),
  };
}

/** Reads saved gameplay settings (defaults when nothing valid is stored). */
export function loadGameplaySettings(): GameplaySettings {
  try {
    return parseGameplaySettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return { ...DEFAULT_GAMEPLAY };
  }
}

export function saveGameplaySettings(settings: GameplaySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode): settings simply won't persist
  }
}
