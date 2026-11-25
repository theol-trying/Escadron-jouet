import { POWERUPS } from '../../../shared/powerups';
import type { KillFeedEntry } from '../../../shared/types';
import { FR } from '../../i18n/fr';

/** Last eliminations, newest first (who, how, whom). */
export function KillFeedList({ entries }: { entries: KillFeedEntry[] }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {entries.slice(0, 4).map((kf) => (
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
              <span className="text-sky-300">{kf.powerUpId ? POWERUPS[kf.powerUpId].nameFr : ''}</span>{' '}
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
                {kf.reason === 'oob' ? FR.hud.killOob : kf.reason === 'vacuum' ? FR.hud.killVacuum : FR.hud.killCrash}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
