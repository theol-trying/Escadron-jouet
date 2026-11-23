import { X } from 'lucide-react';
import { FR } from '../i18n/fr';

interface ControlsModalProps {
  onClose: () => void;
}

export function ControlsModal({ onClose }: ControlsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="controls-title"
    >
      <div className="toy-panel w-full max-w-2xl rounded-2xl p-6 text-slate-900">
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

        <div className="mt-4 grid gap-2.5">
          {FR.controls.items.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-4 rounded-xl border-2 border-slate-200 bg-amber-50/60 px-4 py-2.5"
            >
              <span className="font-mono-num whitespace-nowrap rounded-lg border-2 border-slate-900 bg-white px-2.5 py-1 text-xs font-bold text-slate-900">
                {item.key}
              </span>
              <span className="text-right text-sm font-medium text-slate-700">
                {item.desc}
              </span>
            </div>
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
