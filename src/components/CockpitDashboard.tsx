import { forwardRef, useImperativeHandle, useRef } from 'react';
import { PLANE_ARCHETYPES } from '../../shared/planes';
import { POWERUPS } from '../../shared/powerups';
import type { PlaneId } from '../../shared/types';
import type { HudFrameData } from '../engine/ThreeGameEngine';
import { FR } from '../i18n/fr';

export interface CockpitHandle {
  update: (data: HudFrameData) => void;
}

interface Theme {
  panel: string; // panel background (CSS)
  border: string;
  text: string;
  dim: string;
  face: string; // gauge face
  rim: string; // gauge rim
  needle: string;
  accent: string;
  font: string;
  rivets: boolean;
  digital: boolean; // digital readouts inside the dials
}

// One personality per plane: sleek digital jet, brass & wood wind-up toy, light foam glider,
// riveted steel bomber.
const THEMES: Record<PlaneId, Theme> = {
  plastic_jet: {
    panel: 'linear-gradient(180deg, #0b1324 0%, #111c33 100%)',
    border: '#22d3ee',
    text: '#a5f3fc',
    dim: '#38bdf8',
    face: '#020617',
    rim: '#22d3ee',
    needle: '#22d3ee',
    accent: '#f472b6',
    font: 'ui-monospace, Consolas, monospace',
    rivets: false,
    digital: true,
  },
  windup_biplane: {
    panel: 'repeating-linear-gradient(90deg, #8a5a2b 0px, #9a6633 14px, #83532a 28px)',
    border: '#fbbf24',
    text: '#fef3c7',
    dim: '#fde68a',
    face: '#fef3c7',
    rim: '#d4a017',
    needle: '#7c2d12',
    accent: '#dc2626',
    font: "Georgia, 'Times New Roman', serif",
    rivets: false,
    digital: false,
  },
  foam_glider: {
    panel: 'linear-gradient(180deg, rgba(248,250,252,0.92) 0%, rgba(226,232,240,0.92) 100%)',
    border: '#94a3b8',
    text: '#0f172a',
    dim: '#475569',
    face: '#ffffff',
    rim: '#60a5fa',
    needle: '#2563eb',
    accent: '#22c55e',
    font: "'Trebuchet MS', 'Segoe UI', sans-serif",
    rivets: false,
    digital: false,
  },
  diecast_bomber: {
    panel: 'linear-gradient(180deg, #475569 0%, #334155 100%)',
    border: '#0f172a',
    text: '#e2e8f0',
    dim: '#cbd5e1',
    face: '#111827',
    rim: '#9ca3af',
    needle: '#f59e0b',
    accent: '#ef4444',
    font: "Impact, 'Arial Narrow', sans-serif",
    rivets: true,
    digital: false,
  },
};

const DIAL_SWEEP = 270; // degrees covered by a dial, centred on the top

function Dial({
  label,
  theme,
  needleRef,
  textRef,
  size = 80,
}: {
  label: string;
  theme: Theme;
  needleRef: React.RefObject<SVGGElement | null>;
  textRef: React.RefObject<SVGTextElement | null>;
  size?: number;
}) {
  const ticks = Array.from({ length: 11 }, (_, i) => -DIAL_SWEEP / 2 + (DIAL_SWEEP * i) / 10);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill={theme.face} stroke={theme.rim} strokeWidth="5" />
      {ticks.map((a) => (
        <line
          key={a}
          x1="50"
          y1="10"
          x2="50"
          y2={a === ticks[0] || a === ticks[10] ? 20 : 16}
          stroke={theme.digital ? theme.dim : theme.needle}
          strokeWidth="2"
          transform={`rotate(${a} 50 50)`}
        />
      ))}
      <text x="50" y="74" textAnchor="middle" fontSize="10" fill={theme.digital ? theme.dim : theme.needle} fontFamily={theme.font}>
        {label}
      </text>
      <text
        ref={textRef}
        x="50"
        y={theme.digital ? 56 : 90}
        textAnchor="middle"
        fontSize={theme.digital ? 18 : 9}
        fontWeight="bold"
        fill={theme.digital ? theme.text : theme.needle}
        fontFamily={theme.font}
      >
        0
      </text>
      <g ref={needleRef} transform={`rotate(${-DIAL_SWEEP / 2} 50 50)`}>
        <line x1="50" y1="50" x2="50" y2="16" stroke={theme.digital ? theme.accent : theme.needle} strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="50" cy="50" r="4" fill={theme.rim} />
    </svg>
  );
}

function Bar({
  label,
  theme,
  fillRef,
  color,
}: {
  label: string;
  theme: Theme;
  fillRef: React.RefObject<HTMLDivElement | null>;
  color: string;
}) {
  return (
    <div className="w-full">
      <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: theme.dim, fontFamily: theme.font }}>
        {label}
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-sm border" style={{ borderColor: theme.border, background: theme.face }}>
        <div ref={fillRef} className="h-full w-full" style={{ background: color }} />
      </div>
    </div>
  );
}

const setNeedle = (g: SVGGElement | null, ratio: number) => {
  if (!g) return;
  const r = Math.max(0, Math.min(1, ratio));
  g.setAttribute('transform', `rotate(${-DIAL_SWEEP / 2 + DIAL_SWEEP * r} 50 50)`);
};

export const CockpitDashboard = forwardRef<CockpitHandle, { planeId: PlaneId }>(function CockpitDashboard(
  { planeId },
  ref
) {
  const theme = THEMES[planeId] ?? THEMES.plastic_jet;
  const labels = FR.cockpit[planeId] ?? FR.cockpit.plastic_jet;
  const arch = PLANE_ARCHETYPES[planeId] ?? PLANE_ARCHETYPES.plastic_jet;

  const speedNeedle = useRef<SVGGElement>(null);
  const speedText = useRef<SVGTextElement>(null);
  const climbNeedle = useRef<SVGGElement>(null);
  const climbText = useRef<SVGTextElement>(null);
  const horizonInner = useRef<HTMLDivElement>(null);
  const altText = useRef<HTMLSpanElement>(null);
  const hullFill = useRef<HTMLDivElement>(null);
  const boostFill = useRef<HTMLDivElement>(null);
  const heatFill = useRef<HTMLDivElement>(null);
  const overheatLight = useRef<HTMLDivElement>(null);
  const itemText = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    update(d: HudFrameData) {
      const maxSpeed = arch.boostSpeed * 1.15;
      setNeedle(speedNeedle.current, d.speed / maxSpeed);
      if (speedText.current) speedText.current.textContent = `${Math.round(d.speed)}`;
      // Variometer: ±60 cm/s full scale, centred
      setNeedle(climbNeedle.current, 0.5 + Math.max(-1, Math.min(1, d.climbRate / 60)) * 0.5);
      if (climbText.current) {
        const c = Math.round(d.climbRate);
        climbText.current.textContent = `${c > 0 ? '+' : ''}${c}`;
      }
      if (horizonInner.current) {
        // Pitch moves the horizon (1.6 px per degree, clamped), bank rotates it the other way
        const shift = Math.max(-60, Math.min(60, d.pitchDeg * 1.6));
        horizonInner.current.style.transform = `rotate(${-d.bankDeg}deg) translateY(${shift}px)`;
      }
      if (altText.current) altText.current.textContent = `${Math.round(d.altitude)} cm`;
      const hullPct = Math.max(0, Math.min(100, (d.hp / Math.max(1, d.maxHp)) * 100));
      if (hullFill.current) {
        hullFill.current.style.width = `${hullPct}%`;
        hullFill.current.style.background = hullPct > 50 ? '#22c55e' : hullPct > 25 ? '#f59e0b' : '#ef4444';
      }
      if (boostFill.current) boostFill.current.style.width = `${Math.max(0, Math.min(100, d.boost))}%`;
      if (heatFill.current) {
        heatFill.current.style.width = `${Math.max(0, Math.min(100, d.heat))}%`;
        heatFill.current.style.background = d.overheated ? '#ef4444' : '#f97316';
      }
      if (overheatLight.current) overheatLight.current.style.opacity = d.overheated ? '1' : '0.15';
      if (itemText.current) {
        itemText.current.textContent =
          d.secondaryPowerUp && d.secondaryUses > 0
            ? `${POWERUPS[d.secondaryPowerUp].nameFr} ×${d.secondaryUses}`
            : FR.cockpit.noItem;
      }
    },
  }));

  return (
    <div
      data-testid="cockpit-dashboard"
      className="pointer-events-none fixed bottom-3 left-1/2 w-[min(660px,94vw)] -translate-x-1/2 rounded-t-3xl rounded-b-xl border-4 px-4 pb-2 pt-2 shadow-[0_6px_0_#09090b]"
      style={{ background: theme.panel, borderColor: theme.border, color: theme.text, fontFamily: theme.font }}
    >
      {theme.rivets && (
        <>
          {[
            'left-2 top-2',
            'right-2 top-2',
            'left-2 bottom-2',
            'right-2 bottom-2',
            'left-1/2 top-1.5',
          ].map((pos) => (
            <span key={pos} className={`absolute h-2 w-2 rounded-full border border-slate-900 bg-slate-300 ${pos}`} />
          ))}
        </>
      )}
      <div className="mb-1 text-center text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: theme.dim }}>
        {labels.title}
      </div>
      <div className="flex items-center justify-between gap-3">
        <Dial label={labels.speed} theme={theme} needleRef={speedNeedle} textRef={speedText} />

        {/* Artificial horizon */}
        <div className="flex flex-col items-center">
          <div
            className="relative h-20 w-20 overflow-hidden rounded-full border-4"
            style={{ borderColor: theme.rim, background: theme.face }}
          >
            <div ref={horizonInner} className="absolute left-1/2 top-1/2 h-[300%] w-[300%] -translate-x-1/2 -translate-y-1/2">
              <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: '#38bdf8' }} />
              <div className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: '#a16207' }} />
              <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-white" />
            </div>
            <div className="absolute left-1/2 top-1/2 h-1 w-12 -translate-x-1/2 -translate-y-1/2 rounded bg-orange-500 ring-2 ring-slate-950" />
            <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500 ring-2 ring-slate-950" />
          </div>
          <span ref={altText} className="mt-0.5 text-xs font-bold" style={{ color: theme.text }}>
            0 cm
          </span>
          <span className="text-[9px] uppercase tracking-wide" style={{ color: theme.dim }}>
            {labels.altitude}
          </span>
        </div>

        <Dial label={labels.climb} theme={theme} needleRef={climbNeedle} textRef={climbText} />

        <div className="flex min-w-[150px] flex-1 flex-col gap-1.5">
          <Bar label={labels.hull} theme={theme} fillRef={hullFill} color="#22c55e" />
          <Bar label={labels.boost} theme={theme} fillRef={boostFill} color={theme.digital ? '#22d3ee' : '#38bdf8'} />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Bar label={labels.heat} theme={theme} fillRef={heatFill} color="#f97316" />
            </div>
            <div
              ref={overheatLight}
              title={FR.cockpit.overheated}
              className="mb-0.5 h-3 w-3 rounded-full border border-slate-950"
              style={{ background: '#ef4444', opacity: 0.15 }}
            />
          </div>
          <div className="flex items-baseline justify-between gap-2 text-[10px] font-bold uppercase" style={{ color: theme.dim }}>
            <span>{labels.item}</span>
            <div ref={itemText} className="truncate text-right normal-case" style={{ color: theme.text }}>
              {FR.cockpit.noItem}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
