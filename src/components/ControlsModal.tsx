import { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { FR } from '../i18n/fr';
import {
  BINDING_ORDER,
  DEFAULT_BINDINGS,
  RESERVED_CODES,
  rebind,
  type BindableAction,
  type KeyBindings,
} from '../input/keyBindings';
import { keysLabel, loadLayoutMap, type LayoutMap } from '../input/keyLabels';
import type { ControlScheme } from '../settings/gameplaySettings';

interface ControlsModalProps {
  scheme: ControlScheme;
  bindings: KeyBindings;
  onChangeScheme: (scheme: ControlScheme) => void;
  onChangeBindings: (bindings: KeyBindings) => void;
  onClose: () => void;
}

function actionText(action: BindableAction, scheme: ControlScheme): string {
  const movement = scheme === 'keyboard' ? FR.controls.actionsKeyboard : FR.controls.actionsMouse;
  return (movement as Record<string, string>)[action] ?? (FR.controls.actionsCommon as Record<string, string>)[action] ?? action;
}

/** Controls window: control scheme, every key (click one, then press the new key), fixed controls. */
export function ControlsModal({ scheme, bindings, onChangeScheme, onChangeBindings, onClose }: ControlsModalProps) {
  const [capturing, setCapturing] = useState<BindableAction | null>(null);
  const [layout, setLayout] = useState<LayoutMap | null>(null);

  useEffect(() => {
    let alive = true;
    void loadLayoutMap().then((m) => {
      if (alive) setLayout(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Waiting for a key: catch it before the game sees it (Échap cancels)
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape' || RESERVED_CODES.has(e.code)) {
        setCapturing(null);
        return;
      }
      onChangeBindings(rebind(bindings, capturing, e.code));
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, bindings, onChangeBindings]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="controls-title"
    >
      <div className="toy-panel max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl p-6 text-slate-900">
        <div className="flex items-start justify-between gap-4 border-b-2 border-slate-200 pb-4">
          <div>
            <h2 id="controls-title" className="font-display text-2xl font-extrabold">
              {FR.controls.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{FR.controls.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={FR.menu.close}
            className="toy-btn flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300 text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 text-sm font-semibold">{FR.controls.schemeLabel}</div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={FR.controls.schemeLabel}>
            {(['mouse', 'keyboard'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={scheme === s}
                onClick={() => onChangeScheme(s)}
                className={`toy-btn rounded-xl px-3 py-2 text-sm font-bold ${
                  scheme === s ? 'bg-sky-400 text-slate-950' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {s === 'mouse' ? FR.settings.schemeMouse : FR.settings.schemeKeyboard}
              </button>
            ))}
          </div>
        </div>

        {scheme === 'mouse' && (
          <div className="mt-4 grid gap-2">
            {FR.controls.mouseItems.map((item) => (
              <FixedRow key={item.key} keyText={item.key} desc={item.desc} />
            ))}
          </div>
        )}

        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold">{FR.controls.bindingsTitle}</h3>
            <p className="text-xs text-slate-600">{FR.controls.bindingsHint}</p>
          </div>
          <button
            type="button"
            onClick={() => onChangeBindings(DEFAULT_BINDINGS)}
            className="toy-btn flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {FR.controls.bindingsReset}
          </button>
        </div>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {BINDING_ORDER.map((action) => {
            const waiting = capturing === action;
            return (
              <button
                key={action}
                type="button"
                data-action={action}
                onClick={() => setCapturing(waiting ? null : action)}
                className={`flex items-center justify-between gap-3 rounded-xl border-2 px-3 py-2 text-left ${
                  waiting ? 'border-sky-500 bg-sky-100' : 'border-slate-200 bg-amber-50/60 hover:border-slate-400'
                }`}
              >
                <span className="text-xs font-medium text-slate-700">{actionText(action, scheme)}</span>
                <span className="font-mono-num whitespace-nowrap rounded-lg border-2 border-slate-900 bg-white px-2 py-0.5 text-xs font-bold text-slate-900">
                  {waiting ? FR.controls.bindingsWaiting : keysLabel(bindings[action], layout)}
                </span>
              </button>
            );
          })}
        </div>

        <h3 className="mt-5 text-sm font-extrabold">{FR.controls.fixedTitle}</h3>
        <div className="mt-2 grid gap-2">
          {FR.controls.fixedItems.map((item) => (
            <FixedRow key={item.key} keyText={item.key} desc={item.desc} />
          ))}
        </div>

        <div className="mt-5 flex justify-end">
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

function FixedRow({ keyText, desc }: { keyText: string; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-2">
      <span className="font-mono-num whitespace-nowrap rounded-lg border-2 border-slate-900 bg-white px-2.5 py-1 text-xs font-bold text-slate-900">
        {keyText}
      </span>
      <span className="text-right text-sm font-medium text-slate-700">{desc}</span>
    </div>
  );
}
