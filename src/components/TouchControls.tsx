import { useRef, type MutableRefObject } from 'react';
import { Flame, Crosshair, Zap } from 'lucide-react';
import { FR } from '../i18n/fr';

export interface TouchInputState {
  aimActive: boolean;
  aimX: number;
  aimY: number;
  throttle: number;
  boost: boolean;
  fire: boolean;
}

interface TouchControlsProps {
  visible: boolean;
  touchInputRef: MutableRefObject<TouchInputState>;
  onUseSecondary: () => void;
  secondaryBtnRef: React.RefObject<HTMLButtonElement | null>;
  secondaryLabelRef: React.RefObject<HTMLSpanElement | null>;
}

export function TouchControls({
  visible,
  touchInputRef,
  onUseSecondary,
  secondaryBtnRef,
  secondaryLabelRef,
}: TouchControlsProps) {
  const joyBaseRef = useRef<HTMLDivElement>(null);
  const joyKnobRef = useRef<HTMLDivElement>(null);
  const joyPointerIdRef = useRef<number | null>(null);
  const firePointerIdRef = useRef<number | null>(null);
  const boostPointerIdRef = useRef<number | null>(null);
  const throttleUpPointerIdRef = useRef<number | null>(null);
  const throttleDownPointerIdRef = useRef<number | null>(null);

  if (!visible) return null;

  const updateJoystick = (clientX: number, clientY: number) => {
    const base = joyBaseRef.current;
    const knob = joyKnobRef.current;
    if (!base || !knob) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = Math.max(24, rect.width * 0.36);

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }

    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    const nx = dx / maxR;
    const ny = -dy / maxR; // up on stick = positive aimY
    const dead = 0.08;
    touchInputRef.current.aimActive = true;
    touchInputRef.current.aimX = Math.abs(nx) < dead ? 0 : Math.max(-1, Math.min(1, nx));
    touchInputRef.current.aimY = Math.abs(ny) < dead ? 0 : Math.max(-1, Math.min(1, ny));
  };

  const resetJoystick = () => {
    joyPointerIdRef.current = null;
    touchInputRef.current.aimActive = false;
    touchInputRef.current.aimX = 0;
    touchInputRef.current.aimY = 0;
    if (joyKnobRef.current) {
      joyKnobRef.current.style.transform = 'translate(-50%, -50%)';
    }
  };

  return (
    <div
      data-touch-control="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-end justify-between px-3 pb-3 pt-2 select-none"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {/* Left Cluster: Throttle + Virtual Aim Joystick */}
      <div className="pointer-events-auto flex flex-col items-center gap-2 touch-none">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-touch-control="true"
            data-testid="touch-throttle-up"
            onPointerDown={(e) => {
              e.preventDefault();
              throttleUpPointerIdRef.current = e.pointerId;
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // ignore
              }
              touchInputRef.current.throttle = 1;
            }}
            onPointerUp={(e) => {
              if (throttleUpPointerIdRef.current === e.pointerId) {
                throttleUpPointerIdRef.current = null;
                touchInputRef.current.throttle =
                  throttleDownPointerIdRef.current !== null ? -1 : 0;
              }
            }}
            onPointerCancel={(e) => {
              if (throttleUpPointerIdRef.current === e.pointerId) {
                throttleUpPointerIdRef.current = null;
                touchInputRef.current.throttle = 0;
              }
            }}
            className="toy-btn touch-none rounded-xl bg-emerald-400 px-3 py-1.5 text-xs font-extrabold text-slate-950 active:scale-95"
          >
            {FR.touch.throttleUp}
          </button>
          <button
            type="button"
            data-touch-control="true"
            data-testid="touch-throttle-down"
            onPointerDown={(e) => {
              e.preventDefault();
              throttleDownPointerIdRef.current = e.pointerId;
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // ignore
              }
              touchInputRef.current.throttle = -1;
            }}
            onPointerUp={(e) => {
              if (throttleDownPointerIdRef.current === e.pointerId) {
                throttleDownPointerIdRef.current = null;
                touchInputRef.current.throttle =
                  throttleUpPointerIdRef.current !== null ? 1 : 0;
              }
            }}
            onPointerCancel={(e) => {
              if (throttleDownPointerIdRef.current === e.pointerId) {
                throttleDownPointerIdRef.current = null;
                touchInputRef.current.throttle = 0;
              }
            }}
            className="toy-btn touch-none rounded-xl bg-amber-200 px-3 py-1.5 text-xs font-extrabold text-slate-950 active:scale-95"
          >
            {FR.touch.throttleDown}
          </button>
        </div>

        {/* Virtual Aim Joystick */}
        <div
          ref={joyBaseRef}
          data-touch-control="true"
          data-testid="touch-joystick"
          aria-label={FR.touch.aim}
          onPointerDown={(e) => {
            e.preventDefault();
            if (joyPointerIdRef.current !== null) return;
            joyPointerIdRef.current = e.pointerId;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // ignore
            }
            updateJoystick(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (joyPointerIdRef.current !== e.pointerId) return;
            e.preventDefault();
            updateJoystick(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            if (joyPointerIdRef.current === e.pointerId) {
              resetJoystick();
            }
          }}
          onPointerCancel={(e) => {
            if (joyPointerIdRef.current === e.pointerId) {
              resetJoystick();
            }
          }}
          className="relative h-28 w-28 touch-none rounded-full border-3 border-slate-950 bg-slate-900/65 shadow-[0_4px_0_#09090b]"
        >
          <div className="pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-white/20" />
          <div className="pointer-events-none absolute inset-y-4 left-1/2 w-px -translate-x-1/2 bg-white/20" />
          <div
            ref={joyKnobRef}
            style={{ transform: 'translate(-50%, -50%)' }}
            className="pointer-events-none absolute left-1/2 top-1/2 h-11 w-11 rounded-full border-2 border-slate-950 bg-sky-400 shadow-[0_3px_0_#09090b]"
          />
        </div>
      </div>

      {/* Right Cluster: Secondary Power-up, Boost, Fire */}
      <div className="pointer-events-auto flex flex-col items-end gap-2 touch-none">
        <button
          ref={secondaryBtnRef}
          type="button"
          data-touch-control="true"
          data-testid="touch-secondary-btn"
          onPointerDown={(e) => {
            e.preventDefault();
            onUseSecondary();
          }}
          className="toy-btn flex min-w-28 touch-none items-center justify-center gap-1.5 rounded-xl bg-slate-800/90 px-3 py-2 text-xs font-extrabold text-slate-300 active:scale-95"
        >
          <Zap className="h-3.5 w-3.5 shrink-0" />
          <span ref={secondaryLabelRef} className="truncate">
            {FR.touch.secondaryEmpty}
          </span>
        </button>

        <div className="flex items-end gap-2.5">
          <button
            type="button"
            data-touch-control="true"
            data-testid="touch-boost-btn"
            onPointerDown={(e) => {
              e.preventDefault();
              boostPointerIdRef.current = e.pointerId;
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // ignore
              }
              touchInputRef.current.boost = true;
            }}
            onPointerUp={(e) => {
              if (boostPointerIdRef.current === e.pointerId) {
                boostPointerIdRef.current = null;
                touchInputRef.current.boost = false;
              }
            }}
            onPointerCancel={(e) => {
              if (boostPointerIdRef.current === e.pointerId) {
                boostPointerIdRef.current = null;
                touchInputRef.current.boost = false;
              }
            }}
            className="toy-btn flex h-14 w-16 touch-none flex-col items-center justify-center rounded-2xl bg-sky-400 text-xs font-extrabold text-slate-950 active:scale-95"
          >
            <Flame className="h-4 w-4" />
            <span>{FR.touch.boost}</span>
          </button>

          <button
            type="button"
            data-touch-control="true"
            data-testid="touch-fire-btn"
            onPointerDown={(e) => {
              e.preventDefault();
              firePointerIdRef.current = e.pointerId;
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // ignore
              }
              touchInputRef.current.fire = true;
            }}
            onPointerUp={(e) => {
              if (firePointerIdRef.current === e.pointerId) {
                firePointerIdRef.current = null;
                touchInputRef.current.fire = false;
              }
            }}
            onPointerCancel={(e) => {
              if (firePointerIdRef.current === e.pointerId) {
                firePointerIdRef.current = null;
                touchInputRef.current.fire = false;
              }
            }}
            className="toy-btn flex h-20 w-20 touch-none flex-col items-center justify-center rounded-full bg-rose-500 text-xs font-extrabold text-white active:scale-95"
          >
            <Crosshair className="h-6 w-6" />
            <span className="mt-0.5">{FR.touch.fire}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
