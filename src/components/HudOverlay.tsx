import { useImperativeHandle, useRef, useState, forwardRef, type MutableRefObject } from 'react';
import type { PlaneId } from '../../shared/types';
import { CockpitDashboard, type CockpitHandle } from './CockpitDashboard';
import { ChevronLeft, ChevronRight, Pause, Volume2, VolumeX } from 'lucide-react';
import { MAPS } from '../../shared/maps/index';
import { POWERUPS } from '../../shared/powerups';
import type { HudFrameData } from '../engine/ThreeGameEngine';
import type { KillFeedEntry, RoomState } from '../../shared/types';
import { FR } from '../i18n/fr';
import { TouchControls, type TouchInputState } from './TouchControls';

export interface HudHandle {
  updateFrame: (data: HudFrameData, aimX: number, aimY: number, boosting: boolean) => void;
}

interface HudOverlayProps {
  room: RoomState;
  localPlayerId: string;
  ping: number;
  muted: boolean;
  paused: boolean;
  showScoreboard: boolean;
  killFeed: KillFeedEntry[];
  touchEnabled: boolean;
  touchInputRef: MutableRefObject<TouchInputState>;
  onUseSecondary: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onResume: () => void;
  onQuitToMenu: () => void;
  onSpectatorCycle: (dir: -1 | 1) => void;
}

function formatTimer(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

/** Race chrono, e.g. 1:07.4 */
function formatRaceTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

export const HudOverlay = forwardRef<HudHandle, HudOverlayProps>(function HudOverlay(
  {
    room,
    localPlayerId,
    ping,
    muted,
    paused,
    showScoreboard,
    killFeed,
    touchEnabled,
    touchInputRef,
    onUseSecondary,
    onToggleMute,
    onTogglePause,
    onResume,
    onQuitToMenu,
    onSpectatorCycle,
  },
  ref
) {
  const hpFillRef = useRef<HTMLDivElement>(null);
  const hpTextRef = useRef<HTMLSpanElement>(null);
  const boostFillRef = useRef<HTMLDivElement>(null);
  const heatFillRef = useRef<HTMLDivElement>(null);
  const overheatBadgeRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const mobileSpeedRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const livesWrapRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const speedLinesRef = useRef<SVGSVGElement>(null);
  const oobBannerRef = useRef<HTMLDivElement>(null);
  const oobCountdownRef = useRef<HTMLSpanElement>(null);
  const spectatorBarRef = useRef<HTMLDivElement>(null);
  const touchWrapRef = useRef<HTMLDivElement>(null);
  const spectatorNameRef = useRef<HTMLSpanElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const labelsContainerRef = useRef<HTMLDivElement>(null);
  const secondarySlotRef = useRef<HTMLDivElement>(null);
  const secondaryNameRef = useRef<HTMLDivElement>(null);
  const secondaryUsesRef = useRef<HTMLSpanElement>(null);
  const touchSecondaryBtnRef = useRef<HTMLButtonElement>(null);
  const touchSecondaryLabelRef = useRef<HTMLSpanElement>(null);
  const statusBadgesRef = useRef<HTMLDivElement>(null);
  const mobileStatusBadgesRef = useRef<HTMLDivElement>(null);
  const vacuumBannerRef = useRef<HTMLDivElement>(null);
  // Objective modes: panel under the round bar + marker toward the next ring / the zone
  const objectivePanelRef = useRef<HTMLDivElement>(null);
  const objTitleRef = useRef<HTMLDivElement>(null);
  const objMainRef = useRef<HTMLDivElement>(null);
  const objSubRef = useRef<HTMLDivElement>(null);
  const objBarRef = useRef<HTMLDivElement>(null);
  const objMarkerRef = useRef<HTMLDivElement>(null);
  const roomEventRef = useRef<HTMLDivElement>(null);
  const objArrowRef = useRef<HTMLDivElement>(null);
  const objDistRef = useRef<HTMLSpanElement>(null);
  const topLeftPanelRef = useRef<HTMLDivElement>(null);
  const bottomRightPanelRef = useRef<HTMLDivElement>(null);
  const cockpitRef = useRef<CockpitHandle>(null);
  // Plane whose instrument panel is shown (null = chase view); changes rarely, so React state is fine
  const [cockpitPlane, setCockpitPlane] = useState<PlaneId | null>(null);
  const cockpitPlaneRef = useRef<PlaneId | null>(null);

  useImperativeHandle(ref, () => ({
    updateFrame(data: HudFrameData, aimX: number, aimY: number, boosting: boolean) {
      // Cockpit view: the plane's own instrument panel replaces the status and speed panels
      const cockpitNow = data.cockpit && data.alive ? data.planeId : null;
      if (cockpitNow !== cockpitPlaneRef.current) {
        cockpitPlaneRef.current = cockpitNow;
        setCockpitPlane(cockpitNow);
      }
      if (cockpitNow) cockpitRef.current?.update(data);

      // Objective modes panel
      const obj = data.objective;
      if (objectivePanelRef.current) objectivePanelRef.current.style.display = obj ? 'block' : 'none';
      if (obj && objTitleRef.current && objMainRef.current && objSubRef.current && objBarRef.current) {
        if (obj.kind === 'race') {
          objTitleRef.current.textContent = FR.objectives.raceTitle;
          objMainRef.current.textContent = obj.finished
            ? `${FR.objectives.finished} ${formatRaceTime(obj.time)}`
            : `${FR.objectives.ring} ${obj.ringsPassed + 1} / ${obj.ringsTotal} · ${FR.objectives.lap} ${obj.lap} / ${obj.laps}`;
          objSubRef.current.textContent = obj.finished
            ? obj.newRecord
              ? FR.objectives.newRecord
              : obj.best !== null
                ? `${FR.objectives.best} : ${formatRaceTime(obj.best)}`
                : ''
            : formatRaceTime(obj.time);
          objBarRef.current.style.width = `${(obj.ringsPassed / Math.max(1, obj.ringsTotal)) * 100}%`;
          objBarRef.current.style.backgroundColor = '#facc15';
        } else {
          objTitleRef.current.textContent = FR.objectives.kingTitle;
          objMainRef.current.textContent = `${FR.objectives.crown} ${obj.mine.toFixed(1)} / ${obj.target} s · ${FR.objectives.zone[obj.zoneState]}`;
          objSubRef.current.textContent = `${obj.leaderName ? `${FR.objectives.leader} : ${obj.leaderName} (${obj.leaderValue.toFixed(0)} s) · ` : ''}${FR.objectives.movesIn} ${Math.ceil(obj.movesIn)} s`;
          objBarRef.current.style.width = `${(obj.mine / obj.target) * 100}%`;
          objBarRef.current.style.backgroundColor =
            obj.zoneState === 'mine' ? '#22c55e' : obj.zoneState === 'theirs' ? '#ef4444' : obj.zoneState === 'contested' ? '#f97316' : '#facc15';
        }
      }
      if (roomEventRef.current) {
        const label = data.roomEvent && data.alive ? FR.roomEvents[data.roomEvent] : '';
        if (roomEventRef.current.textContent !== label) roomEventRef.current.textContent = label;
        roomEventRef.current.style.display = label ? 'block' : 'none';
      }
      const mk = data.objectiveMarker;
      if (objMarkerRef.current) {
        objMarkerRef.current.style.display = mk && data.alive ? 'flex' : 'none';
        if (mk) {
          objMarkerRef.current.style.transform = `translate(${mk.x}px, ${mk.y}px) translate(-50%, -50%)`;
          if (objArrowRef.current) {
            objArrowRef.current.style.display = mk.onScreen ? 'none' : 'block';
            objArrowRef.current.style.transform = `rotate(${(-mk.angle * 180) / Math.PI}deg)`;
          }
          if (objDistRef.current) objDistRef.current.textContent = `${Math.round(mk.distance)} cm`;
        }
      }
      if (topLeftPanelRef.current) topLeftPanelRef.current.style.display = cockpitNow ? 'none' : '';
      if (bottomRightPanelRef.current) bottomRightPanelRef.current.style.display = cockpitNow ? 'none' : '';

      const hpPct = Math.max(0, Math.min(100, (data.hp / Math.max(1, data.maxHp)) * 100));
      if (hpFillRef.current) {
        hpFillRef.current.style.width = `${hpPct}%`;
        hpFillRef.current.style.backgroundColor =
          hpPct > 50 ? '#22C55E' : hpPct > 25 ? '#F59E0B' : '#EF4444';
      }
      if (hpTextRef.current) {
        hpTextRef.current.textContent = `${data.hp}/${data.maxHp}`;
      }
      if (boostFillRef.current) {
        boostFillRef.current.style.width = `${Math.max(0, Math.min(100, data.boost))}%`;
      }
      if (heatFillRef.current) {
        heatFillRef.current.style.width = `${Math.max(0, Math.min(100, data.heat))}%`;
        heatFillRef.current.style.backgroundColor = data.overheated ? '#EF4444' : '#F97316';
      }
      if (overheatBadgeRef.current) {
        overheatBadgeRef.current.style.display = data.overheated ? 'inline' : 'none';
      }
      if (speedRef.current) {
        speedRef.current.textContent = `${data.speed}`;
      }
      if (mobileSpeedRef.current) {
        mobileSpeedRef.current.textContent = `${data.speed}`;
      }
      if (timerRef.current) {
        timerRef.current.textContent = formatTimer(data.roundTimer);
      }

      if (livesWrapRef.current) {
        const children = livesWrapRef.current.children;
        for (let i = 0; i < children.length; i++) {
          const el = children[i] as HTMLElement;
          el.style.opacity = i < data.lives ? '1' : '0.22';
        }
      }

      if (reticleRef.current) {
        const rx = aimX * 160;
        const ry = -aimY * 110;
        reticleRef.current.style.transform = `translate(calc(-50% + ${rx}px), calc(-50% + ${ry}px))`;
      }

      if (speedLinesRef.current) {
        speedLinesRef.current.style.opacity = boosting && data.alive && data.boost > 2 ? '0.65' : '0';
      }

      if (oobBannerRef.current && oobCountdownRef.current) {
        if (data.alive && data.outOfBounds > 0.05) {
          oobBannerRef.current.style.display = 'flex';
          const rem = Math.max(0, 4.0 - data.outOfBounds);
          oobCountdownRef.current.textContent = `${rem.toFixed(1)}s`;
        } else {
          oobBannerRef.current.style.display = 'none';
        }
      }

      const spectating = !data.alive && data.lives <= 0 && room.phase === 'playing';
      if (spectatorBarRef.current && spectatorNameRef.current) {
        if (spectating) {
          spectatorBarRef.current.style.display = 'flex';
          spectatorNameRef.current.textContent = data.spectatingName || '—';
        } else {
          spectatorBarRef.current.style.display = 'none';
        }
      }

      // Eliminated for the round: hide the flight controls (they overlapped the spectator bar)
      // and release any held touch input so nothing stays "pressed" until the next round.
      if (touchWrapRef.current) {
        const wasHidden = touchWrapRef.current.style.display === 'none';
        touchWrapRef.current.style.display = spectating ? 'none' : '';
        if (spectating && !wasHidden) {
          touchInputRef.current = {
            aimActive: false,
            aimX: 0,
            aimY: 0,
            throttle: 0,
            boost: false,
            fire: false,
          };
        }
      }

      if (secondarySlotRef.current && secondaryNameRef.current && secondaryUsesRef.current) {
        if (data.secondaryPowerUp && data.secondaryUses > 0) {
          const def = POWERUPS[data.secondaryPowerUp];
          secondarySlotRef.current.style.borderStyle = 'solid';
          secondarySlotRef.current.style.borderColor = def.colorHex;
          secondarySlotRef.current.style.backgroundColor = 'rgba(15, 23, 42, 0.94)';
          secondaryNameRef.current.textContent = def.nameFr;
          secondaryNameRef.current.style.color = def.accentHex;
          secondaryUsesRef.current.style.display = 'inline-flex';
          secondaryUsesRef.current.textContent = `x${data.secondaryUses} · ${FR.hud.secondaryHint}`;
        } else {
          secondarySlotRef.current.style.borderStyle = 'dashed';
          secondarySlotRef.current.style.borderColor = '#475569';
          secondarySlotRef.current.style.backgroundColor = 'rgba(30, 41, 59, 0.8)';
          secondaryNameRef.current.textContent = FR.hud.secondaryEmpty;
          secondaryNameRef.current.style.color = '#94A3B8';
          secondaryUsesRef.current.style.display = 'none';
        }
      }

      if (touchSecondaryBtnRef.current && touchSecondaryLabelRef.current) {
        if (data.secondaryPowerUp && data.secondaryUses > 0) {
          const def = POWERUPS[data.secondaryPowerUp];
          touchSecondaryBtnRef.current.style.borderColor = def.colorHex;
          touchSecondaryBtnRef.current.style.backgroundColor = 'rgba(15, 23, 42, 0.94)';
          touchSecondaryBtnRef.current.style.color = def.accentHex;
          touchSecondaryLabelRef.current.textContent = `${def.nameFr} x${data.secondaryUses}`;
        } else {
          touchSecondaryBtnRef.current.style.borderColor = '#18181B';
          touchSecondaryBtnRef.current.style.backgroundColor = 'rgba(30, 41, 59, 0.85)';
          touchSecondaryBtnRef.current.style.color = '#94A3B8';
          touchSecondaryLabelRef.current.textContent = FR.touch.secondaryEmpty;
        }
      }

      const badgeParts: string[] = [];
      if (data.shielded) {
        badgeParts.push(
          `<span class="rounded-lg border border-black bg-purple-600 px-2 py-0.5 text-[11px] font-extrabold text-white">${FR.hud.shieldActive}</span>`
        );
      }
      if (data.turboActive) {
        badgeParts.push(
          `<span class="rounded-lg border border-black bg-emerald-500 px-2 py-0.5 text-[11px] font-extrabold text-slate-950">${FR.hud.turboActive}</span>`
        );
      }
      if (data.magnetActive) {
        badgeParts.push(
          `<span class="rounded-lg border border-black bg-pink-500 px-2 py-0.5 text-[11px] font-extrabold text-white">${FR.hud.magnetActive}</span>`
        );
      }
      if (data.glued) {
        badgeParts.push(
          `<span class="rounded-lg border border-black bg-yellow-400 px-2 py-0.5 text-[11px] font-extrabold text-slate-950">${FR.hud.gluedWarning}</span>`
        );
      }
      const badgesHtml = badgeParts.join('');
      if (statusBadgesRef.current) {
        statusBadgesRef.current.innerHTML = badgesHtml;
      }
      if (mobileStatusBadgesRef.current) {
        mobileStatusBadgesRef.current.innerHTML = badgesHtml;
      }

      if (vacuumBannerRef.current) {
        vacuumBannerRef.current.style.display = data.suddenDeath ? 'flex' : 'none';
      }

      // Draw Minimap
      const mc = minimapCanvasRef.current;
      if (mc) {
        const ctx = mc.getContext('2d');
        if (ctx) {
          const w = mc.width;
          const h = mc.height;
          const activeMap = MAPS[room.settings.mapId] ?? MAPS.desk;
          ctx.clearRect(0, 0, w, h);

          // Floor backdrop per map
          ctx.fillStyle = room.settings.mapId === 'garden' ? '#14532D' : '#0F172A';
          ctx.fillRect(0, 0, w, h);

          const toMx = (wx: number) =>
            ((wx - activeMap.hardBounds.minX) /
              (activeMap.hardBounds.maxX - activeMap.hardBounds.minX)) *
            w;
          const toMy = (wz: number) =>
            ((wz - activeMap.hardBounds.minZ) /
              (activeMap.hardBounds.maxZ - activeMap.hardBounds.minZ)) *
            h;

          if (room.settings.mapId === 'kitchen') {
            ctx.fillStyle = '#334155';
            ctx.fillRect(toMx(-225), toMy(-182), toMx(110) - toMx(-225), toMy(-102) - toMy(-182));
            ctx.fillRect(toMx(-94), toMy(10), toMx(94) - toMx(-94), toMy(78) - toMy(10));
            ctx.fillStyle = '#E0F2FE';
            ctx.fillRect(toMx(158), toMy(-178), toMx(244) - toMx(158), toMy(-92) - toMy(-178));
            // Stove heat & Blender hazard markers
            ctx.fillStyle = '#FB923C';
            ctx.beginPath();
            ctx.arc(toMx(8), toMy(-142), 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#EF4444';
            ctx.beginPath();
            ctx.arc(toMx(44), toMy(44), 4.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (room.settings.mapId === 'garden') {
            ctx.fillStyle = '#D97706';
            ctx.fillRect(toMx(-164), toMy(-138), toMx(-96) - toMx(-164), toMy(-68) - toMy(-138));
            ctx.fillStyle = '#FDE68A';
            ctx.fillRect(toMx(-185), toMy(55), toMx(-85) - toMx(-185), toMy(145) - toMy(55));
            ctx.fillStyle = '#38BDF8';
            ctx.beginPath();
            ctx.arc(toMx(18), toMy(18), 4.5, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = '#92400E';
            ctx.fillRect(toMx(-195), toMy(-120), toMx(145) - toMx(-195), toMy(35) - toMy(-120));
            ctx.strokeStyle = '#FDE68A';
            ctx.lineWidth = 1;
            ctx.strokeRect(toMx(-195), toMy(-120), toMx(145) - toMx(-195), toMy(35) - toMy(-120));
          }

          // Blips
          for (const b of data.minimapBlips) {
            const bx = toMx(b.x);
            const by = toMy(b.z);
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(-b.yaw);
            ctx.beginPath();
            if (b.isLocal) {
              ctx.fillStyle = '#FACC15';
              ctx.moveTo(0, -6);
              ctx.lineTo(4.5, 5);
              ctx.lineTo(-4.5, 5);
            } else {
              ctx.fillStyle =
                b.team === 'red' ? '#EF4444' : b.team === 'blue' ? '#38BDF8' : '#FB7185';
              ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // Render projected enemy name tags & off-screen directional arrows
      const container = labelsContainerRef.current;
      if (container) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let html = '';
        for (const lbl of data.labels) {
          const badgeColor =
            lbl.team === 'blue' ? '#2563EB' : lbl.team === 'red' ? '#DC2626' : '#E11D48';
          if (lbl.onScreen && lbl.distance < 360) {
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
        container.innerHTML = html;
      }
    },
  }));

  const aliveCount = room.scoreboard.filter((s) => s.alive || s.livesRemaining > 0).length;
  const maxLives = room.settings.livesPerRound;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
      {/* Boost Speed Lines SVG */}
      <svg
        ref={speedLinesRef}
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        className="pointer-events-none fixed inset-0 h-full w-full opacity-0 transition-opacity duration-150"
        aria-hidden="true"
      >
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2;
          const x1 = 500 + Math.cos(a) * 340;
          const y1 = 500 + Math.sin(a) * 340;
          const x2 = 500 + Math.cos(a) * 560;
          const y2 = 500 + Math.sin(a) * 560;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#FFFFFF"
              strokeWidth={i % 2 === 0 ? '4' : '2'}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {/* Enemy floating labels & off-screen arrows */}
      <div ref={labelsContainerRef} className="pointer-events-none fixed inset-0" />

      {/* Center Plane Nose Crosshair */}
      <div
        className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        aria-hidden="true"
      >
        <svg width="28" height="28" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="2.5" fill="#FACC15" stroke="#18181B" strokeWidth="1.5" />
          <line x1="14" y1="2" x2="14" y2="8" stroke="#FFFFFF" strokeWidth="2" />
          <line x1="14" y1="20" x2="14" y2="26" stroke="#FFFFFF" strokeWidth="2" />
          <line x1="2" y1="14" x2="8" y2="14" stroke="#FFFFFF" strokeWidth="2" />
          <line x1="20" y1="14" x2="26" y2="14" stroke="#FFFFFF" strokeWidth="2" />
        </svg>
      </div>

      {/* Dynamic Mouse-Aim Steering Reticle */}
      <div
        ref={reticleRef}
        className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        aria-hidden="true"
      >
        <svg width="36" height="36" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="13"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="2.5"
            strokeDasharray="6 4"
          />
          <circle cx="18" cy="18" r="2" fill="#38BDF8" />
        </svg>
      </div>

      {/* Objective marker (next ring / king zone), pinned to the screen edge when off-screen */}
      <div
        ref={objMarkerRef}
        className="pointer-events-none fixed left-0 top-0 hidden flex-col items-center"
        aria-hidden="true"
      >
        <div className="relative flex h-7 w-7 items-center justify-center">
          <div className="h-4 w-4 rotate-45 rounded-sm border-2 border-slate-950 bg-amber-300 shadow-[0_0_10px_#facc15]" />
          <div ref={objArrowRef} className="absolute inset-0 hidden">
            <div className="absolute right-[-10px] top-1/2 h-0 w-0 -translate-y-1/2 border-y-[7px] border-l-[11px] border-y-transparent border-l-amber-300" />
          </div>
        </div>
        <span ref={objDistRef} className="font-mono-num mt-0.5 rounded bg-slate-900/80 px-1 text-[10px] font-bold text-amber-200" />
      </div>

      {/* Room event banner (cat, blackout, fridge) */}
      <div
        ref={roomEventRef}
        className="pointer-events-none fixed left-1/2 top-36 -translate-x-1/2 rounded-xl border-2 border-slate-950 bg-violet-200 px-4 py-1.5 text-sm font-extrabold text-slate-900 shadow-[0_4px_0_#09090b] sm:top-40"
        style={{ display: 'none' }}
      />

      {/* Objective modes panel (race progress / king of the sky) */}
      <div
        ref={objectivePanelRef}
        className="toy-panel-dark pointer-events-none fixed left-1/2 top-[4.6rem] w-[min(420px,90vw)] -translate-x-1/2 rounded-2xl px-4 py-2 text-center text-white sm:top-20"
        style={{ display: 'none' }}
      >
        <div ref={objTitleRef} className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300" />
        <div ref={objMainRef} className="text-sm font-extrabold" />
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-700">
          <div ref={objBarRef} className="h-full w-0 rounded" />
        </div>
        <div ref={objSubRef} className="font-mono-num mt-0.5 text-[11px] font-semibold text-slate-300" />
      </div>

      {/* Top Row on Mobile (<640px): Match Status Pill + Utility Buttons cleanly separated */}
      <div className="fixed inset-x-2 top-2 flex items-start justify-between gap-2 sm:contents">
        {/* Top-Center: Round, Score/Alive, Timer, Ping */}
        <div
          data-testid="hud-top-center"
          className="toy-panel-dark flex items-center gap-2 rounded-2xl px-2.5 py-1.5 text-white sm:fixed sm:left-1/2 sm:top-4 sm:-translate-x-1/2 sm:gap-4 sm:px-4 sm:py-2"
        >
          <div className="text-center">
            <div className="text-[9px] font-bold uppercase text-slate-400 sm:text-[10px]">
              {FR.hud.round}
            </div>
            <div className="font-mono-num text-xs font-extrabold text-amber-300 sm:text-sm">
              {room.roundNumber}/{room.maxRounds}
            </div>
          </div>

          <div className="h-5 w-px bg-slate-700 sm:h-6" />

          {room.settings.mode === 'last_plane_teams' ? (
            <div className="flex items-center gap-1.5 font-mono-num text-xs font-extrabold sm:gap-2.5 sm:text-sm">
              <span className="text-red-400">{room.teamRoundWins.red}</span>
              <span className="text-slate-500">-</span>
              <span className="text-sky-400">{room.teamRoundWins.blue}</span>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-[9px] font-bold uppercase text-slate-400 sm:text-[10px]">
                {FR.hud.alive}
              </div>
              <div className="font-mono-num text-xs font-extrabold text-emerald-400 sm:text-sm">
                {aliveCount}
              </div>
            </div>
          )}

          <div className="h-5 w-px bg-slate-700 sm:h-6" />

          <span ref={timerRef} className="font-mono-num text-base font-extrabold text-white sm:text-xl">
            04:00
          </span>

          <div className="h-5 w-px bg-slate-700 sm:h-6" />

          <span className="font-mono-num whitespace-nowrap text-[11px] font-bold text-slate-300 sm:text-xs">
            {ping} {FR.hud.pingUnit}
          </span>
        </div>

        {/* Top-Right Utility Buttons */}
        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:fixed sm:right-4 sm:top-4 sm:gap-2">
          <button
            type="button"
            tabIndex={-1}
            aria-label={FR.hud.mute}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="toy-btn flex h-9 w-9 items-center justify-center rounded-xl bg-amber-300 text-slate-950 sm:h-10 sm:w-10"
          >
            {muted ? <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" /> : <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />}
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={FR.hud.pause}
            onClick={(e) => {
              e.currentTarget.blur();
              onTogglePause();
            }}
            className="toy-btn flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-950 sm:h-10 sm:w-10"
          >
            <Pause className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>

      {/* Top-Left (Row 2 Left on <640px): Vitality, Lives, Boost, Overheat */}
      <div
        ref={topLeftPanelRef}
        data-testid="hud-top-left"
        className="toy-panel-dark fixed left-2 top-14 flex w-36 flex-col gap-1.5 rounded-2xl p-2 text-white sm:left-4 sm:top-4 sm:w-56 sm:gap-2 sm:p-3"
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 sm:text-[11px]">
            {FR.hud.lives}
          </span>
          <div ref={livesWrapRef} className="flex items-center gap-0.5 sm:gap-1">
            {Array.from({ length: maxLives }).map((_, i) => (
              <svg key={i} className="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2L15 9L22 12L15 14L14 21L12 19L10 21L9 14L2 12L9 9Z"
                  fill="#FACC15"
                  stroke="#09090B"
                  strokeWidth="1.5"
                />
              </svg>
            ))}
          </div>
        </div>

        {/* HP */}
        <div>
          <div className="mb-0.5 flex justify-between text-[10px] font-bold sm:text-[11px]">
            <span className="text-slate-300">{FR.hud.hp}</span>
            <span ref={hpTextRef} className="font-mono-num">
              100/100
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-md border border-black bg-slate-800 sm:h-3">
            <div ref={hpFillRef} className="h-full w-full bg-emerald-500 transition-[width] duration-75" />
          </div>
        </div>

        {/* Boost */}
        <div>
          <div className="mb-0.5 flex justify-between text-[10px] font-bold sm:text-[11px]">
            <span className="text-sky-300">{FR.hud.boost}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-md border border-black bg-slate-800 sm:h-2.5">
            <div ref={boostFillRef} className="h-full w-full bg-sky-400 transition-[width] duration-75" />
          </div>
        </div>

        {/* Heat */}
        <div>
          <div className="mb-0.5 flex items-center justify-between text-[10px] font-bold sm:text-[11px]">
            <span className="text-orange-300">{FR.hud.heat}</span>
            <span ref={overheatBadgeRef} className="hidden text-[9px] font-extrabold text-red-400 sm:text-[10px]">
              {FR.hud.overheated}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-md border border-black bg-slate-800">
            <div ref={heatFillRef} className="h-full w-0 bg-orange-500 transition-[width] duration-75" />
          </div>
        </div>
      </div>

      {/* Right Column below utility buttons: Mobile Speed + Buffs + Kill Feed */}
      <div className="fixed right-2 top-14 flex max-w-[185px] flex-col items-end gap-1 sm:right-4 sm:top-16 sm:max-w-xs sm:gap-1.5">
        <div
          className={`${
            touchEnabled ? 'flex' : 'flex sm:hidden'
          } toy-panel-dark items-baseline gap-1 rounded-xl px-2.5 py-1 text-white`}
        >
          <span ref={mobileSpeedRef} className="font-mono-num text-sm font-extrabold text-amber-300">
            95
          </span>
          <span className="text-[9px] font-bold uppercase text-slate-400">{FR.hud.speedUnit}</span>
        </div>

        <div
          ref={mobileStatusBadgesRef}
          className={`${touchEnabled ? 'flex' : 'flex sm:hidden'} flex-wrap justify-end gap-1`}
        />

        <div className="flex flex-col items-end gap-1">
          {killFeed.slice(0, 4).map((kf) => (
            <div
              key={kf.id}
              className="rounded-lg border border-black bg-slate-900/90 px-2 py-0.5 text-[10px] font-bold text-white sm:px-2.5 sm:py-1 sm:text-xs"
            >
              {kf.reason === 'gun' ? (
                <>
                  <span className="text-amber-300">{kf.killerName}</span>{' '}
                  <span className="text-slate-300">{FR.hud.killGun}</span>{' '}
                  <span className="text-rose-300">{kf.victimName}</span>
                </>
              ) : kf.reason === 'secondary' ? (
                <>
                  <span className="text-amber-300">{kf.killerName}</span>{' '}
                  <span className="text-slate-300">{FR.hud.killSecondary}</span>{' '}
                  <span className="text-sky-300">
                    {kf.powerUpId ? POWERUPS[kf.powerUpId].nameFr : ''}
                  </span>{' '}
                  <span className="text-rose-300">{kf.victimName}</span>
                </>
              ) : kf.reason === 'hazard' ? (
                <>
                  <span className="text-rose-300">{kf.victimName}</span>{' '}
                  <span className="text-slate-300">{FR.hud.killHazard}</span>{' '}
                  <span className="text-orange-300">{kf.hazardNameFr ?? ''}</span>
                </>
              ) : (
                <>
                  <span className="text-rose-300">{kf.victimName}</span>{' '}
                  <span className="text-slate-300">
                    {kf.reason === 'oob'
                      ? FR.hud.killOob
                      : kf.reason === 'vacuum'
                        ? FR.hud.killVacuum
                        : FR.hud.killCrash}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom-Left: Minimap (hidden on touch/narrow mobile to keep joystick clear) */}
      <div
        className={`${
          touchEnabled ? 'hidden' : 'hidden sm:block'
        } toy-panel-dark fixed bottom-4 left-4 overflow-hidden rounded-2xl p-1.5`}
      >
        <canvas ref={minimapCanvasRef} width={144} height={108} className="block rounded-xl" />
      </div>

      {/* Cockpit instrument panel (cockpit view only) */}
      {cockpitPlane && <CockpitDashboard ref={cockpitRef} planeId={cockpitPlane} />}

      {/* Bottom-Right: Active Buffs + Secondary Power-Up Slot + Speed (desktop) */}
      <div
        ref={bottomRightPanelRef}
        className={`${
          touchEnabled ? 'hidden' : 'hidden sm:flex'
        } fixed bottom-4 right-4 flex-col items-end gap-2`}
      >
        <div ref={statusBadgesRef} className="flex flex-wrap justify-end gap-1.5" />
        <div className="toy-panel-dark flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-white">
          <div
            ref={secondarySlotRef}
            data-testid="hud-secondary-slot"
            className="flex min-w-36 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-600 bg-slate-800/80 px-3 py-1.5 text-center"
          >
            <div ref={secondaryNameRef} className="text-xs font-extrabold text-slate-400">
              {FR.hud.secondaryEmpty}
            </div>
            <span
              ref={secondaryUsesRef}
              className="mt-0.5 hidden text-[10px] font-bold uppercase tracking-wide text-slate-300"
            />
          </div>
          <div className="text-right">
            <span ref={speedRef} className="font-mono-num block text-xl font-extrabold text-amber-300">
              95
            </span>
            <div className="text-[10px] font-bold uppercase text-slate-400">{FR.hud.speedUnit}</div>
          </div>
        </div>
      </div>

      {/* Mobile / Touch Flight Controls (wrapper hidden imperatively while spectating) */}
      <div ref={touchWrapRef}>
        <TouchControls
          visible={touchEnabled && room.phase === 'playing' && !paused && !showScoreboard}
          touchInputRef={touchInputRef}
          onUseSecondary={onUseSecondary}
          secondaryBtnRef={touchSecondaryBtnRef}
          secondaryLabelRef={touchSecondaryLabelRef}
        />
      </div>

      {/* Sudden Death: Giant Vacuum Alert */}
      <div
        ref={vacuumBannerRef}
        className="fixed left-1/2 top-28 hidden -translate-x-1/2 flex-col items-center rounded-2xl border-3 border-slate-950 bg-rose-600 px-4 py-1.5 text-center text-white shadow-[0_5px_0_#09090b] sm:top-20 sm:px-6 sm:py-2"
      >
        <div className="font-display text-sm font-extrabold uppercase tracking-wide text-amber-200 sm:text-base">
          {FR.hud.vacuumWarning}
        </div>
        <div className="text-[10px] font-semibold text-rose-100 sm:text-[11px]">
          {FR.hud.vacuumDangerSub}
        </div>
      </div>

      {/* Out of bounds alert */}
      <div
        ref={oobBannerRef}
        className="fixed left-1/2 top-44 hidden -translate-x-1/2 flex-col items-center rounded-2xl border-3 border-slate-950 bg-red-600 px-4 py-2 text-center text-white shadow-[0_5px_0_#09090b] sm:top-36 sm:px-6 sm:py-2.5"
      >
        <div className="font-display text-base font-extrabold sm:text-lg">
          {FR.hud.outOfBounds} <span ref={oobCountdownRef} className="font-mono-num">4.0s</span>
        </div>
        <div className="text-[11px] font-semibold text-red-100 sm:text-xs">{FR.hud.outOfBoundsSub}</div>
      </div>

      {/* Spectator Mode Bar */}
      <div
        ref={spectatorBarRef}
        className="pointer-events-auto fixed bottom-6 left-1/2 hidden -translate-x-1/2 items-center gap-4 rounded-2xl border-3 border-slate-950 bg-slate-900/95 px-5 py-2.5 text-white shadow-[0_5px_0_#09090b]"
      >
        <button
          type="button"
          onClick={() => onSpectatorCycle(-1)}
          aria-label={FR.hud.spectatorPrev}
          className="toy-btn flex h-8 w-8 items-center justify-center rounded-lg bg-amber-300 text-slate-950"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <div className="text-[11px] font-bold uppercase text-amber-300">
            {FR.hud.spectatorMode}
          </div>
          <div className="text-sm font-extrabold">
            {FR.hud.spectating} <span ref={spectatorNameRef}>—</span>
          </div>
          <div className="text-[10px] font-semibold text-slate-300">{FR.hud.spectatorNextRound}</div>
        </div>
        <button
          type="button"
          onClick={() => onSpectatorCycle(1)}
          aria-label={FR.hud.spectatorNext}
          className="toy-btn flex h-8 w-8 items-center justify-center rounded-lg bg-amber-300 text-slate-950"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Countdown Overlay */}
      {room.phase === 'countdown' && (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="toy-panel rounded-3xl bg-amber-300 px-10 py-6 text-center text-slate-950">
            <div className="font-display text-4xl font-extrabold">
              {FR.hud.round} {room.roundNumber}
            </div>
            <div className="mt-1 text-lg font-extrabold text-sky-800">{FR.hud.countdownGo}</div>
          </div>
        </div>
      )}

      {/* Round End Banner */}
      {room.phase === 'round_end' && room.lastRoundWinner && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/45">
          <div className="toy-panel rounded-3xl px-8 py-6 text-center text-slate-900">
            <div className="text-xs font-bold uppercase text-slate-500">{FR.hud.roundEndTitle}</div>
            <h2 className="font-display mt-1 text-3xl font-extrabold text-amber-600">
              {FR.hud.roundWinnerPrefix} {room.lastRoundWinner.winnerName}
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-600">{FR.hud.nextRoundSoon}</p>
          </div>
        </div>
      )}

      {/* Tab Scoreboard */}
      {showScoreboard && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="toy-panel w-full max-w-2xl rounded-2xl p-5 text-slate-900">
            <h2 className="font-display text-xl font-extrabold">{FR.hud.scoreboardTitle}</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-slate-900 text-xs uppercase text-slate-500">
                  <th className="py-2">{FR.hud.colPilot}</th>
                  {room.settings.mode === 'last_plane_teams' && (
                    <th className="py-2">{FR.hud.colTeam}</th>
                  )}
                  <th className="py-2 text-right">{FR.hud.colKills}</th>
                  <th className="py-2 text-right">{FR.hud.colDeaths}</th>
                  <th className="py-2 text-right">{FR.hud.colLives}</th>
                  <th className="py-2 text-right">{FR.hud.colRounds}</th>
                  <th className="py-2 text-right">{FR.hud.colScore}</th>
                </tr>
              </thead>
              <tbody>
                {room.scoreboard.map((row) => (
                  <tr
                    key={row.playerId}
                    className={`border-b border-slate-200 font-semibold ${
                      row.playerId === localPlayerId ? 'bg-amber-100' : ''
                    }`}
                  >
                    <td className="py-2 font-extrabold">{row.nickname}</td>
                    {room.settings.mode === 'last_plane_teams' && (
                      <td className="py-2">
                        <span
                          className={`text-xs font-extrabold ${
                            row.team === 'red' ? 'text-red-600' : 'text-blue-600'
                          }`}
                        >
                          {row.team === 'red' ? FR.lobby.teamRed : FR.lobby.teamBlue}
                        </span>
                      </td>
                    )}
                    <td className="font-mono-num py-2 text-right">{row.kills}</td>
                    <td className="font-mono-num py-2 text-right">{row.deaths}</td>
                    <td className="font-mono-num py-2 text-right">{row.livesRemaining}</td>
                    <td className="font-mono-num py-2 text-right">{row.roundWins}</td>
                    <td className="font-mono-num py-2 text-right font-extrabold">{row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {paused && (
        <div
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="toy-panel w-full max-w-sm rounded-2xl p-6 text-center text-slate-900">
            <h2 className="font-display text-2xl font-extrabold">{FR.hud.pauseTitle}</h2>
            <p className="mt-1.5 text-xs font-semibold text-slate-600">{FR.hud.pauseSubtitle}</p>
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={onResume}
                className="toy-btn w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-extrabold text-slate-950"
              >
                {FR.hud.resume}
              </button>
              <button
                type="button"
                onClick={onQuitToMenu}
                className="toy-btn w-full rounded-xl bg-rose-400 px-4 py-3 text-sm font-extrabold text-slate-950"
              >
                {FR.hud.quitToMenu}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
