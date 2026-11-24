import { X } from 'lucide-react';
import type { AudioSettings } from '../audio/soundEngine';
import { FR } from '../i18n/fr';

export type ControlScheme = 'mouse' | 'keyboard';
export type CameraViewSetting = 'chase' | 'cockpit';

export interface GameplaySettings {
  controlScheme: ControlScheme; // 'keyboard' = 100 % clavier (ZQSD), 'mouse' = viser à la souris
  mouseSensitivity: number; // 0.5..2.0
  keyboardSensitivity: number; // 0.5..1.5 (max turn input reached with ZQSD)
  invertY: boolean;
  aimAssist: boolean;
  cameraView: CameraViewSetting; // vue au lancement (touche V pour changer en vol)
}

export const DEFAULT_GAMEPLAY: GameplaySettings = {
  controlScheme: 'mouse',
  mouseSensitivity: 1.0,
  keyboardSensitivity: 1.0,
  invertY: false,
  aimAssist: true,
  cameraView: 'chase',
};

/** Reads saved gameplay settings, ignoring unknown or invalid values. */
export function loadGameplaySettings(): GameplaySettings {
  try {
    const raw = JSON.parse(localStorage.getItem('ej_gameplay') || '{}') as Partial<GameplaySettings>;
    const num = (v: unknown, min: number, max: number, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
    return {
      controlScheme: raw.controlScheme === 'keyboard' ? 'keyboard' : 'mouse',
      mouseSensitivity: num(raw.mouseSensitivity, 0.5, 2, DEFAULT_GAMEPLAY.mouseSensitivity),
      keyboardSensitivity: num(raw.keyboardSensitivity, 0.5, 1.5, DEFAULT_GAMEPLAY.keyboardSensitivity),
      invertY: raw.invertY === true,
      aimAssist: raw.aimAssist !== false,
      cameraView: raw.cameraView === 'cockpit' ? 'cockpit' : 'chase',
    };
  } catch {
    return { ...DEFAULT_GAMEPLAY };
  }
}

export function saveGameplaySettings(settings: GameplaySettings): void {
  try {
    localStorage.setItem('ej_gameplay', JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode): settings simply won't persist
  }
}

interface SettingsModalProps {
  audio: AudioSettings;
  gameplay: GameplaySettings;
  onChangeAudio: (partial: Partial<AudioSettings>) => void;
  onChangeGameplay: (partial: Partial<GameplaySettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

export function SettingsModal({
  audio,
  gameplay,
  onChangeAudio,
  onChangeGameplay,
  onReset,
  onClose,
}: SettingsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="toy-panel max-h-full w-full max-w-lg overflow-y-auto rounded-2xl p-6 text-slate-900">
        <div className="flex items-center justify-between border-b-2 border-slate-200 pb-4">
          <h2 id="settings-title" className="font-display text-2xl font-extrabold">
            {FR.settings.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={FR.menu.close}
            className="toy-btn flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300 text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <div className="mb-1 flex justify-between text-sm font-semibold">
              <label htmlFor="vol-master">{FR.settings.masterVolume}</label>
              <span className="font-mono-num">{Math.round(audio.masterVolume * 100)}%</span>
            </div>
            <input
              id="vol-master"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.masterVolume}
              onChange={(e) => onChangeAudio({ masterVolume: Number(e.target.value) })}
              className="w-full accent-sky-500"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-sm font-semibold">
              <label htmlFor="vol-sfx">{FR.settings.sfxVolume}</label>
              <span className="font-mono-num">{Math.round(audio.sfxVolume * 100)}%</span>
            </div>
            <input
              id="vol-sfx"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.sfxVolume}
              onChange={(e) => onChangeAudio({ sfxVolume: Number(e.target.value) })}
              className="w-full accent-sky-500"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-sm font-semibold">
              <label htmlFor="vol-amb">{FR.settings.ambienceVolume}</label>
              <span className="font-mono-num">{Math.round(audio.ambienceVolume * 100)}%</span>
            </div>
            <input
              id="vol-amb"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.ambienceVolume}
              onChange={(e) => onChangeAudio({ ambienceVolume: Number(e.target.value) })}
              className="w-full accent-sky-500"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-sm font-semibold">
              <label htmlFor="vol-music">{FR.settings.musicVolume}</label>
              <span className="font-mono-num">{Math.round(audio.musicVolume * 100)}%</span>
            </div>
            <input
              id="vol-music"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.musicVolume}
              onChange={(e) => onChangeAudio({ musicVolume: Number(e.target.value) })}
              className="w-full accent-sky-500"
            />
          </div>

          <div className="border-t-2 border-slate-200 pt-4">
            <div className="mb-1.5 flex items-baseline justify-between text-sm font-semibold">
              <span>{FR.camera.label}</span>
              <span className="text-xs font-medium text-slate-500">{FR.camera.toggleHint}</span>
            </div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={FR.camera.label}>
              {(['chase', 'cockpit'] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  role="radio"
                  aria-checked={gameplay.cameraView === view}
                  onClick={() => onChangeGameplay({ cameraView: view })}
                  className={`toy-btn rounded-xl px-3 py-2 text-sm font-bold ${
                    gameplay.cameraView === view ? 'bg-sky-400 text-slate-950' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {view === 'chase' ? FR.camera.chase : FR.camera.cockpit}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-sm font-semibold">{FR.settings.controlScheme}</div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={FR.settings.controlScheme}>
              {(['mouse', 'keyboard'] as const).map((scheme) => (
                <button
                  key={scheme}
                  type="button"
                  role="radio"
                  aria-checked={gameplay.controlScheme === scheme}
                  onClick={() => onChangeGameplay({ controlScheme: scheme })}
                  className={`toy-btn rounded-xl px-3 py-2 text-sm font-bold ${
                    gameplay.controlScheme === scheme ? 'bg-sky-400 text-slate-950' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {scheme === 'mouse' ? FR.settings.schemeMouse : FR.settings.schemeKeyboard}
                </button>
              ))}
            </div>
          </div>

          {gameplay.controlScheme === 'keyboard' && (
            <div>
              <div className="mb-1 flex justify-between text-sm font-semibold">
                <label htmlFor="kb-sens">{FR.settings.keyboardSensitivity}</label>
                <span className="font-mono-num">{gameplay.keyboardSensitivity.toFixed(2)}x</span>
              </div>
              <input
                id="kb-sens"
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={gameplay.keyboardSensitivity}
                onChange={(e) => onChangeGameplay({ keyboardSensitivity: Number(e.target.value) })}
                className="w-full accent-amber-500"
              />
            </div>
          )}

          <div className={gameplay.controlScheme === 'keyboard' ? 'hidden' : ''}>
            <div className="mb-1 flex justify-between text-sm font-semibold">
              <label htmlFor="mouse-sens">{FR.settings.mouseSensitivity}</label>
              <span className="font-mono-num">{gameplay.mouseSensitivity.toFixed(2)}x</span>
            </div>
            <input
              id="mouse-sens"
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={gameplay.mouseSensitivity}
              onChange={(e) => onChangeGameplay({ mouseSensitivity: Number(e.target.value) })}
              className="w-full accent-amber-500"
            />
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
            <span>{FR.settings.invertY}</span>
            <input
              type="checkbox"
              checked={gameplay.invertY}
              onChange={(e) => onChangeGameplay({ invertY: e.target.checked })}
              className="h-5 w-5 accent-sky-500"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
            <span>
              {FR.settings.aimAssist}
              <span className="mt-0.5 block text-xs font-medium text-slate-500">{FR.settings.aimAssistHint}</span>
            </span>
            <input
              type="checkbox"
              checked={gameplay.aimAssist}
              onChange={(e) => onChangeGameplay({ aimAssist: e.target.checked })}
              className="h-5 w-5 shrink-0 accent-sky-500"
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onReset}
            className="toy-btn rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-800"
          >
            {FR.settings.resetDefaults}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="toy-btn rounded-xl bg-sky-400 px-5 py-2.5 text-sm font-bold text-slate-950"
          >
            {FR.menu.close}
          </button>
        </div>
      </div>
    </div>
  );
}
