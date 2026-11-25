import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { FR } from '../i18n/fr';
import type { KeyBindings } from '../input/keyBindings';
import { loadLayoutMap, type LayoutMap } from '../input/keyLabels';
import type { ControlScheme } from '../settings/gameplaySettings';
import { stepText, type TutorialStepId } from '../tutorial/tutorial';

interface TutorialPanelProps {
  step: TutorialStepId;
  stepIndex: number;
  total: number;
  justDone: boolean;
  scheme: ControlScheme;
  bindings: KeyBindings;
  onSkip: () => void;
  onQuit: () => void;
  onQuickPlay: () => void;
}

/** « Premier vol »: the current instruction, with the pilot's own keys, under the round bar. */
export function TutorialPanel({
  step,
  stepIndex,
  total,
  justDone,
  scheme,
  bindings,
  onSkip,
  onQuit,
  onQuickPlay,
}: TutorialPanelProps) {
  const [layout, setLayout] = useState<LayoutMap | null>(null);
  useEffect(() => {
    let alive = true;
    void loadLayoutMap().then((m) => alive && setLayout(m));
    return () => {
      alive = false;
    };
  }, []);

  const { title, text } = stepText(step, scheme, bindings, layout);
  const last = step === 'done';

  return (
    <div
      data-testid="tutorial-panel"
      className="toy-panel pointer-events-auto fixed left-1/2 top-[4.6rem] z-30 w-[min(460px,92vw)] -translate-x-1/2 rounded-2xl px-4 py-3 text-slate-900 sm:top-20"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">
          <GraduationCap className="h-4 w-4" />
          {FR.tutorial.title} · {FR.tutorial.stepOf} {stepIndex + 1} / {total}
        </div>
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-3 rounded-full ${i < stepIndex || (i === stepIndex && justDone) ? 'bg-emerald-500' : i === stepIndex ? 'bg-amber-400' : 'bg-slate-300'}`}
            />
          ))}
        </div>
      </div>
      <div className="mt-1 text-base font-extrabold">{justDone ? FR.tutorial.nice : title}</div>
      <p className="mt-0.5 text-sm font-medium text-slate-700">{text}</p>
      <div className="mt-2.5 flex justify-end gap-2">
        {last ? (
          <>
            <button
              type="button"
              onClick={onQuit}
              className="toy-btn rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800"
            >
              {FR.tutorial.backToMenu}
            </button>
            <button
              type="button"
              onClick={onQuickPlay}
              className="toy-btn rounded-xl bg-amber-400 px-3.5 py-1.5 text-xs font-extrabold text-slate-950"
            >
              {FR.tutorial.quickPlay}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onQuit();
              }}
              className="toy-btn rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800"
            >
              {FR.tutorial.quit}
            </button>
            <button
              type="button"
              tabIndex={-1}
              disabled={justDone}
              onClick={(e) => {
                e.currentTarget.blur();
                onSkip();
              }}
              className="toy-btn rounded-xl bg-sky-300 px-3 py-1.5 text-xs font-bold text-slate-950"
            >
              {FR.tutorial.skip}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
