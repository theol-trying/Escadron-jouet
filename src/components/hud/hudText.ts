import type { SurvivalState } from '../../../shared/types';
import type { HudFrameData, ObjectiveHud, ProjectedLabel } from '../../engine/engineTypes';
import type { ZoneState } from '../../engine/objectives3d';
import { FR } from '../../i18n/fr';

/** Text and small HTML pieces of the in-flight HUD (pure functions, updated every frame). */

/** Round timer, e.g. 03:52 (rounded up: 0.2 s left still shows 00:01). */
export function formatTimer(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

/** Race chrono, e.g. 1:07.4 */
export function formatRaceTime(seconds: number): string {
  // Round to the tenth first, so 9.96 s reads 0:10.0 (not 0:010.0) and 59.96 s reads 1:00.0
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const m = Math.floor(tenths / 600);
  const rest = (tenths - m * 600) / 10;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Progress bar colour of the king-of-the-sky panel (same colours as the 3D zone) */
export const ZONE_BAR_COLORS: Record<ZoneState, string> = {
  free: '#facc15',
  mine: '#22c55e',
  mine_contested: '#84cc16',
  theirs: '#ef4444',
  contested: '#f97316',
};

/** Objective panel under the round bar: race progress or crown time. */
export function objectivePanelText(obj: ObjectiveHud): {
  title: string;
  main: string;
  sub: string;
  barPct: number;
  barColor: string;
} {
  if (obj.kind === 'race') {
    return {
      title: FR.objectives.raceTitle,
      main: obj.finished
        ? `${FR.objectives.finished} ${formatRaceTime(obj.time)}`
        : `${FR.objectives.ring} ${obj.ringsPassed + 1} / ${obj.ringsTotal} · ${FR.objectives.lap} ${obj.lap} / ${obj.laps}`,
      sub: obj.finished
        ? obj.newRecord
          ? FR.objectives.newRecord
          : obj.best !== null
            ? `${FR.objectives.best} : ${formatRaceTime(obj.best)}`
            : ''
        : `${formatRaceTime(obj.time)}${obj.best !== null ? ` · ${FR.objectives.best} ${formatRaceTime(obj.best)}` : ''}`,
      barPct: (obj.ringsPassed / Math.max(1, obj.ringsTotal)) * 100,
      barColor: '#facc15',
    };
  }
  return {
    title: FR.objectives.kingTitle,
    main: `${FR.objectives.crown} ${obj.mine.toFixed(1)} / ${obj.target} s · ${FR.objectives.zone[obj.zoneState]}`,
    sub: `${obj.leaderName ? `${FR.objectives.leader} : ${obj.leaderName} (${obj.leaderValue.toFixed(0)} s) · ` : ''}${FR.objectives.movesIn} ${Math.ceil(obj.movesIn)} s`,
    barPct: (obj.mine / obj.target) * 100,
    barColor: ZONE_BAR_COLORS[obj.zoneState],
  };
}

/** « Survie »: wave panel (in the objective panel place), from the room state and the round timer. */
export function survivalPanelText(
  s: SurvivalState,
  roundTimer: number
): { title: string; main: string; sub: string; barPct: number; barColor: string } {
  const o = FR.objectives;
  const waiting = s.nextWaveAtTimer !== null;
  const nextIn = waiting ? Math.max(0, Math.ceil(roundTimer - (s.nextWaveAtTimer ?? 0))) : 0;
  return {
    title: o.survivalTitle,
    main: waiting
      ? s.wave === 0
        ? o.survivalReady
        : `${o.survivalWave} ${s.wave} / ${s.totalWaves} ${o.survivalCleared}`
      : `${o.survivalWave} ${s.wave} / ${s.totalWaves} · ${s.enemiesLeft} ${s.enemiesLeft > 1 ? o.survivalEnemies : o.survivalEnemy}`,
    sub: waiting ? `${o.survivalWave} ${s.wave + 1} ${o.survivalNextIn} ${nextIn} s` : o.survivalHint,
    barPct: ((waiting ? s.wave : Math.max(0, s.wave - 1)) / s.totalWaves) * 100,
    barColor: '#a3e635',
  };
}

/** Status badges: bubble shield, turbo, magnet, glue. */
export function statusBadgesHtml(data: Pick<HudFrameData, 'shielded' | 'turboActive' | 'magnetActive' | 'glued'>): string {
  const parts: string[] = [];
  if (data.shielded) {
    parts.push(
      `<span class="rounded-lg border border-black bg-purple-600 px-2 py-0.5 text-[11px] font-extrabold text-white">${FR.hud.shieldActive}</span>`
    );
  }
  if (data.turboActive) {
    parts.push(
      `<span class="rounded-lg border border-black bg-emerald-500 px-2 py-0.5 text-[11px] font-extrabold text-slate-950">${FR.hud.turboActive}</span>`
    );
  }
  if (data.magnetActive) {
    parts.push(
      `<span class="rounded-lg border border-black bg-pink-500 px-2 py-0.5 text-[11px] font-extrabold text-white">${FR.hud.magnetActive}</span>`
    );
  }
  if (data.glued) {
    parts.push(
      `<span class="rounded-lg border border-black bg-yellow-400 px-2 py-0.5 text-[11px] font-extrabold text-slate-950">${FR.hud.gluedWarning}</span>`
    );
  }
  return parts.join('');
}

/** Labels closer than this (cm) show the pilot's name and health; farther ones only the edge arrow. */
export const LABEL_RANGE = 360;

/**
 * Name tags of the other pilots (name + health bar above the plane) and, for planes off-screen or
 * too far, an arrow on a ring near the screen edge pointing toward them.
 */
export function planeLabelsHtml(labels: readonly ProjectedLabel[], vw: number, vh: number): string {
  let html = '';
  for (const lbl of labels) {
    const badgeColor = lbl.team === 'blue' ? '#2563EB' : lbl.team === 'red' ? '#DC2626' : '#E11D48';
    if (lbl.onScreen && lbl.distance < LABEL_RANGE) {
      const lx = Math.round(lbl.screenX);
      const ly = Math.round(lbl.screenY - 14);
      html += `<div style="position:absolute;left:${lx}px;top:${ly}px;transform:translate(-50%,-100%);pointer-events:none;text-align:center;">
              <div style="font-size:11px;font-weight:800;color:#fff;text-shadow:0 1px 0 #09090b,1px 0 0 #09090b,-1px 0 0 #09090b,0 -1px 0 #09090b;white-space:nowrap;">${escapeHtml(lbl.nickname)}</div>
              <div style="width:42px;height:4px;margin:2px auto 0;background:#18181b;border:1px solid #09090b;border-radius:2px;overflow:hidden;">
                <div style="width:${Math.round(lbl.hpRatio * 100)}%;height:100%;background:${badgeColor};"></div>
              </div>
            </div>`;
    } else {
      // Off-screen edge indicator
      const cx = vw * 0.5;
      const cy = vh * 0.5;
      const rad = Math.min(cx - 38, cy - 38);
      const ex = Math.round(cx + Math.cos(lbl.angle) * rad);
      const ey = Math.round(cy + Math.sin(lbl.angle) * rad);
      const deg = Math.round((lbl.angle * 180) / Math.PI + 90);
      html += `<div style="position:absolute;left:${ex}px;top:${ey}px;transform:translate(-50%,-50%) rotate(${deg}deg);pointer-events:none;">
              <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:13px solid ${badgeColor};filter:drop-shadow(0 1px 0 #09090b);"></div>
            </div>`;
    }
  }
  return html;
}
