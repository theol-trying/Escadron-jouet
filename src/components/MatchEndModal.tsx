import { Bomb, Crosshair, Hammer, Package, RotateCcw, Shield, Trophy } from 'lucide-react';
import { computeMatchTitles, type MatchTitleId } from '../../shared/rules';
import type { RoomState } from '../../shared/types';
import { FR } from '../i18n/fr';
import type { UnlockedItem } from '../progression';

interface MatchEndModalProps {
  room: RoomState;
  localPlayerId: string;
  /** Paints / stickers this match just unlocked */
  newUnlocks?: UnlockedItem[];
  onPlayAgain: () => void;
  onLeaveToMenu: () => void;
}

const TITLE_ICONS: Record<MatchTitleId, typeof Trophy> = {
  ace: Crosshair,
  kamikaze: Bomb,
  collector: Package,
  wrecker: Hammer,
  survivor: Shield,
};

export function MatchEndModal({
  room,
  localPlayerId,
  newUnlocks = [],
  onPlayAgain,
  onLeaveToMenu,
}: MatchEndModalProps) {
  const isHost = Boolean(room.players.find((p) => p.id === localPlayerId)?.isHost);
  const top3 = room.scoreboard.slice(0, 3);
  const titles = computeMatchTitles(room.scoreboard);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-4 lg:justify-end lg:pr-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="podium-title"
    >
      <div className="toy-panel max-h-full w-full max-w-xl overflow-y-auto rounded-2xl p-6 text-slate-900">
        <div className="flex items-center justify-center gap-3">
          <Trophy className="h-8 w-8 text-amber-500" />
          <h2 id="podium-title" className="font-display text-3xl font-extrabold">
            {FR.hud.podiumTitle}
          </h2>
        </div>

        {room.settings.mode === 'survival' && (
          <div
            className={`mt-3 text-center font-display text-xl font-extrabold ${room.teamRoundWins.blue > 0 ? 'text-emerald-600' : 'text-rose-600'}`}
          >
            {room.teamRoundWins.blue > 0 ? FR.objectives.survivalWon : FR.objectives.survivalLost}
          </div>
        )}

        {room.settings.mode === 'last_plane_teams' && (
          <div className="mt-3 text-center font-display text-xl font-extrabold">
            <span className="text-red-600">
              {FR.lobby.teamRed} {room.teamRoundWins.red}
            </span>
            <span className="mx-3 text-slate-400">—</span>
            <span className="text-blue-600">
              {room.teamRoundWins.blue} {FR.lobby.teamBlue}
            </span>
          </div>
        )}

        {/* Podium Cards */}
        <div className="mt-6 grid grid-cols-3 items-end gap-3">
          {[1, 0, 2].map((rankIdx) => {
            const entry = top3[rankIdx];
            if (!entry) return <div key={rankIdx} />;
            const place = rankIdx + 1;
            const heightClass =
              place === 1 ? 'bg-amber-300 pt-6' : place === 2 ? 'bg-slate-200 pt-4' : 'bg-orange-200 pt-3';
            return (
              <div
                key={entry.playerId}
                className={`flex flex-col items-center rounded-2xl border-3 border-slate-900 px-3 pb-4 text-center ${heightClass}`}
              >
                <span className="font-mono-num text-2xl font-extrabold">#{place}</span>
                <span className="mt-1 truncate max-w-full text-sm font-extrabold">
                  {entry.nickname}
                </span>
                <span className="font-mono-num mt-1 text-xs font-bold text-slate-700">
                  {entry.roundWins} M · {entry.kills} K · {entry.score} pts
                </span>
              </div>
            );
          })}
        </div>

        {newUnlocks.length > 0 && (
          <div className="mt-4 rounded-xl border-2 border-emerald-700 bg-emerald-100 px-4 py-2.5 text-center text-sm font-bold text-emerald-900">
            {FR.hangar.newUnlocks} {newUnlocks.map((u) => u.nameFr).join(', ')} !
          </div>
        )}

        {/* Fun titles */}
        {titles.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-center text-xs font-extrabold uppercase tracking-wider text-slate-500">
              {FR.titles.heading}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {titles.map((t) => {
                const Icon = TITLE_ICONS[t.id];
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2 rounded-xl border-2 border-slate-900 px-3 py-1.5 ${
                      t.playerId === localPlayerId ? 'bg-amber-200' : 'bg-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-slate-800" />
                    <div className="text-left leading-tight">
                      <div className="text-[11px] font-extrabold uppercase text-slate-500">{FR.titles[t.id].name}</div>
                      <div className="text-sm font-extrabold">{t.nickname}</div>
                      <div className="text-[11px] font-semibold text-slate-600">{FR.titles[t.id].detail(t.value)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full Standings */}
        <div className="mt-5 max-h-48 overflow-y-auto rounded-xl border-2 border-slate-200 p-2">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-slate-500">
                <th className="py-1.5">{FR.hud.colPilot}</th>
                <th className="py-1.5 text-right">{FR.hud.colKills}</th>
                <th className="py-1.5 text-right">{FR.hud.colDeaths}</th>
                <th className="py-1.5 text-right">{FR.hud.colRounds}</th>
                <th className="py-1.5 text-right">{FR.hud.colScore}</th>
              </tr>
            </thead>
            <tbody>
              {room.scoreboard.map((row) => (
                <tr
                  key={row.playerId}
                  className={`border-b border-slate-100 font-semibold ${
                    row.playerId === localPlayerId ? 'bg-amber-100' : ''
                  }`}
                >
                  <td className="py-1.5 font-bold">{row.nickname}</td>
                  <td className="font-mono-num py-1.5 text-right">{row.kills}</td>
                  <td className="font-mono-num py-1.5 text-right">{row.deaths}</td>
                  <td className="font-mono-num py-1.5 text-right">{row.roundWins}</td>
                  <td className="font-mono-num py-1.5 text-right font-extrabold">{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onLeaveToMenu}
            className="toy-btn rounded-xl bg-slate-200 px-5 py-3 text-sm font-extrabold text-slate-900"
          >
            {FR.hud.quitToMenu}
          </button>
          {isHost && (
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="toy-btn flex items-center gap-2 rounded-xl bg-emerald-400 px-6 py-3 text-sm font-extrabold text-slate-950"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{FR.hud.playAgain}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
