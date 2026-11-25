import type { Ref } from 'react';
import type { RoomState } from '../../../shared/types';
import { FR } from '../../i18n/fr';

/** Full-screen moments of a match: countdown, round winner, Tab scoreboard, pause menu. */

export function CountdownOverlay({ roundNumber }: { roundNumber: number }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="toy-panel rounded-3xl bg-amber-300 px-10 py-6 text-center text-slate-950">
        <div className="font-display text-4xl font-extrabold">
          {FR.hud.round} {roundNumber}
        </div>
        <div className="mt-1 text-lg font-extrabold text-sky-800">{FR.hud.countdownGo}</div>
      </div>
    </div>
  );
}

export function RoundEndBanner({ winnerName }: { winnerName: string }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950/45">
      <div className="toy-panel rounded-3xl px-8 py-6 text-center text-slate-900">
        <div className="text-xs font-bold uppercase text-slate-500">{FR.hud.roundEndTitle}</div>
        <h2 className="font-display mt-1 text-3xl font-extrabold text-amber-600">
          {FR.hud.roundWinnerPrefix} {winnerName}
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">{FR.hud.nextRoundSoon}</p>
      </div>
    </div>
  );
}

export function ScoreboardModal({ room, localPlayerId }: { room: RoomState; localPlayerId: string }) {
  const teams = room.settings.mode === 'last_plane_teams';
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="toy-panel w-full max-w-2xl rounded-2xl p-5 text-slate-900">
        <h2 className="font-display text-xl font-extrabold">{FR.hud.scoreboardTitle}</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-slate-900 text-xs uppercase text-slate-500">
              <th className="py-2">{FR.hud.colPilot}</th>
              {teams && <th className="py-2">{FR.hud.colTeam}</th>}
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
                className={`border-b border-slate-200 font-semibold ${row.playerId === localPlayerId ? 'bg-amber-100' : ''}`}
              >
                <td className="py-2 font-extrabold">{row.nickname}</td>
                {teams && (
                  <td className="py-2">
                    <span className={`text-xs font-extrabold ${row.team === 'red' ? 'text-red-600' : 'text-blue-600'}`}>
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
  );
}

export function PauseModal({ onResume, onQuitToMenu }: { onResume: () => void; onQuitToMenu: () => void }) {
  return (
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
  );
}

/** Radial white streaks shown while boosting (opacity driven by the HUD frame). */
export function SpeedLinesSvg({ svgRef }: { svgRef: Ref<SVGSVGElement> }) {
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="pointer-events-none fixed inset-0 h-full w-full opacity-0 transition-opacity duration-150"
      aria-hidden="true"
    >
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={500 + Math.cos(a) * 340}
            y1={500 + Math.sin(a) * 340}
            x2={500 + Math.cos(a) * 560}
            y2={500 + Math.sin(a) * 560}
            stroke="#FFFFFF"
            strokeWidth={i % 2 === 0 ? '4' : '2'}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
