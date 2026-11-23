import { X } from 'lucide-react';
import type { AudioSettings } from '../audio/soundEngine';
import { FR } from '../i18n/fr';

export interface GameplaySettings {
  mouseSensitivity: number; // 0.5..2.0
  invertY: boolean;
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
      <div className="toy-panel w-full max-w-lg rounded-2xl p-6 text-slate-900">
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

          <div className="border-t-2 border-slate-200 pt-4">
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
