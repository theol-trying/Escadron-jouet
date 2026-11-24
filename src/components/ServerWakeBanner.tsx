import { useEffect, useState } from 'react';
import { Plane } from 'lucide-react';
import { FR } from '../i18n/fr';

// Shown after this long without a server connection (short blips stay silent)
const SHOW_AFTER_MS = 3000;

/**
 * "Le serveur se réveille…" banner. On Render's free plan the server sleeps after ~15 minutes
 * without players and needs up to a minute to restart; Socket.io keeps retrying meanwhile.
 */
export function ServerWakeBanner({ connected }: { connected: boolean }) {
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (connected) {
      setWaitingSince(null);
      return;
    }
    setWaitingSince((prev) => prev ?? Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [connected]);

  if (connected || waitingSince === null || now - waitingSince < SHOW_AFTER_MS) return null;
  const seconds = Math.floor((now - waitingSince) / 1000);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-4 z-[60] w-[min(520px,92vw)] -translate-x-1/2 rounded-2xl border-3 border-slate-900 bg-amber-200 px-4 py-3 text-slate-900 shadow-[0_5px_0_#09090b]"
    >
      <div className="flex items-center gap-3">
        <Plane className="h-6 w-6 shrink-0 animate-bounce text-slate-800" />
        <div>
          <div className="font-display text-base font-extrabold">
            {FR.wake.title} <span className="font-mono-num text-sm text-slate-600">{seconds} s</span>
          </div>
          <div className="text-xs font-semibold text-slate-700">{FR.wake.detail}</div>
        </div>
      </div>
    </div>
  );
}
