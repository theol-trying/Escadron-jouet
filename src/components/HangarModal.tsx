import { Check, Lock, X } from 'lucide-react';
import {
  PAINT_ORDER,
  PAINT_PALETTES,
  PLANE_ARCHETYPES,
  PLANE_ORDER,
  STICKERS,
  STICKER_ORDER,
} from '../../shared/planes';
import type { PlayerCosmetics } from '../../shared/types';
import { FR } from '../i18n/fr';
import {
  PAINT_UNLOCKS,
  STICKER_UNLOCKS,
  isPaintUnlocked,
  isStickerUnlocked,
  requirementLabel,
  type PlayerProgress,
} from '../progression';

interface HangarModalProps {
  cosmetics: PlayerCosmetics;
  progress: PlayerProgress;
  onChange: (next: PlayerCosmetics) => void;
  onClose: () => void;
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="w-20 font-semibold text-slate-700">{label}</span>
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4, 5].map((step) => (
          <div
            key={step}
            className={`h-2.5 flex-1 rounded-sm border border-slate-900 ${
              step <= value ? 'bg-amber-400' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function HangarModal({ cosmetics, progress, onChange, onClose }: HangarModalProps) {
  const activeArch = PLANE_ARCHETYPES[cosmetics.planeId];

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-start p-5 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hangar-title"
    >
      <div className="toy-panel pointer-events-auto flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl p-5 text-slate-900">
        <div className="flex items-start justify-between gap-3 border-b-2 border-slate-200 pb-3">
          <div>
            <h2 id="hangar-title" className="font-display text-2xl font-extrabold">
              {FR.hangar.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">{FR.hangar.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={FR.menu.close}
            className="toy-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-300 text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 4 Toy Planes */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {PLANE_ORDER.map((id) => {
            const arch = PLANE_ARCHETYPES[id];
            const selected = cosmetics.planeId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange({ ...cosmetics, planeId: id })}
                className={`toy-btn flex flex-col items-start rounded-xl px-3 py-2.5 text-left ${
                  selected ? 'bg-sky-300 text-slate-950' : 'bg-white text-slate-900'
                }`}
              >
                <span className="font-display text-sm font-extrabold leading-tight">
                  {arch.nameFr}
                </span>
                <span className="mt-1 text-[11px] font-medium text-slate-700">
                  {arch.materialFeelFr}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Plane Details & Stat Bars */}
        <div className="mt-4 rounded-xl border-2 border-slate-900 bg-amber-50/70 p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-base font-extrabold">{activeArch.nameFr}</h3>
            <span className="font-mono-num text-xs font-bold text-slate-600">
              {activeArch.maxHp} PV · {activeArch.wingspan} cm
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-700">{activeArch.taglineFr}</p>
          <div className="mt-3 space-y-1.5">
            <StatBar label={FR.hangar.stats.speed} value={activeArch.statsDisplay.speed} />
            <StatBar label={FR.hangar.stats.agility} value={activeArch.statsDisplay.agility} />
            <StatBar label={FR.hangar.stats.armor} value={activeArch.statsDisplay.armor} />
            <StatBar label={FR.hangar.stats.firepower} value={activeArch.statsDisplay.firepower} />
          </div>
        </div>

        {/* Paint Swatches */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            {FR.hangar.paintLabel}
          </div>
          <div className="flex flex-wrap gap-2">
            {PAINT_ORDER.map((pid) => {
              const p = PAINT_PALETTES[pid];
              const active = cosmetics.paintId === pid;
              const req = PAINT_UNLOCKS[pid];
              const unlocked = isPaintUnlocked(progress, pid);
              const label = unlocked || !req ? p.nameFr : `${p.nameFr} — ${FR.hangar.locked} : ${requirementLabel(progress, req)}`;
              return (
                <button
                  key={pid}
                  type="button"
                  aria-label={label}
                  title={label}
                  disabled={!unlocked}
                  onClick={() => onChange({ ...cosmetics, paintId: pid })}
                  className="toy-btn relative flex h-10 w-10 items-center justify-center rounded-xl disabled:cursor-not-allowed"
                  style={{ backgroundColor: p.primary, opacity: unlocked ? 1 : 0.45 }}
                >
                  {!unlocked && <Lock className="h-4 w-4 text-white drop-shadow-[0_1px_0_#000]" />}
                  {active && (
                    <Check
                      className={`h-5 w-5 ${
                        pid === 'white' || pid === 'yellow' ? 'text-slate-900' : 'text-white'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Stickers */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            {FR.hangar.stickerLabel}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {STICKER_ORDER.map((sid) => {
              const st = STICKERS[sid];
              const active = cosmetics.stickerId === sid;
              const req = STICKER_UNLOCKS[sid];
              const unlocked = isStickerUnlocked(progress, sid);
              return (
                <button
                  key={sid}
                  type="button"
                  disabled={!unlocked}
                  title={unlocked || !req ? st.nameFr : `${FR.hangar.locked} : ${requirementLabel(progress, req)}`}
                  onClick={() => onChange({ ...cosmetics, stickerId: sid })}
                  className={`toy-btn flex flex-col items-center rounded-xl px-2 py-1.5 text-xs font-bold disabled:cursor-not-allowed ${
                    active ? 'bg-amber-300 text-slate-950' : unlocked ? 'bg-white text-slate-800' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {!unlocked && <Lock className="h-3 w-3" />}
                    {st.nameFr}
                  </span>
                  {!unlocked && req && (
                    <span className="text-[9px] font-semibold text-slate-500">{requirementLabel(progress, req)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="toy-btn mt-5 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-extrabold text-slate-950"
        >
          {FR.hangar.confirm}
        </button>
      </div>
    </div>
  );
}
