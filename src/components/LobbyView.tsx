import { useState } from 'react';
import { Check, Copy, LogOut, Plane, Play, Share2, Shield, Users } from 'lucide-react';
import { MAP_ORDER, MAPS } from '../../shared/maps/index';
import { PAINT_PALETTES, PLANE_ARCHETYPES } from '../../shared/planes';
import type { RoomSettings, RoomState, TeamId } from '../../shared/types';
import { FR } from '../i18n/fr';

interface LobbyViewProps {
  room: RoomState;
  localPlayerId: string;
  ping: number;
  errorMessage?: string | null;
  onUpdateSettings: (partial: Partial<RoomSettings>) => void;
  onToggleReady: (ready: boolean) => void;
  onSwitchTeam: (team: TeamId) => void;
  onOpenHangar: () => void;
  onStartMatch: () => void;
  onLeaveRoom: () => void;
}

export function LobbyView({
  room,
  localPlayerId,
  ping,
  errorMessage,
  onUpdateSettings,
  onToggleReady,
  onSwitchTeam,
  onOpenHangar,
  onStartMatch,
  onLeaveRoom,
}: LobbyViewProps) {
  const [copied, setCopied] = useState(false);
  const localPlayer = room.players.find((p) => p.id === localPlayerId);
  const isHost = Boolean(localPlayer?.isHost);
  const isTeams = room.settings.mode === 'last_plane_teams';

  const [inviteState, setInviteState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Invite link: opens the share menu when the browser has one (Windows/Edge/Chrome do),
  // otherwise copies the link. Opening the link joins this room directly.
  const handleInvite = async () => {
    const url = `${window.location.origin}/?salon=${room.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: FR.lobby.inviteShareTitle, text: FR.lobby.inviteShareText, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setInviteState('copied');
    } catch (err) {
      // Share sheet dismissed by the user: nothing to report
      if (err instanceof DOMException && err.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(url);
        setInviteState('copied');
      } catch {
        setInviteState('failed');
      }
    }
    setTimeout(() => setInviteState('idle'), 2200);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-slate-950/55 p-4 md:p-8">
      <div className="toy-panel flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl text-slate-900">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-slate-900 bg-amber-300 px-6 py-4">
          <div className="flex items-center gap-4">
            <h1 className="font-display text-2xl font-extrabold">{FR.lobby.title}</h1>
            <div className="flex items-center gap-2 rounded-xl border-2 border-slate-900 bg-white px-3 py-1.5">
              <span className="text-xs font-bold uppercase text-slate-500">
                {FR.lobby.roomCodeLabel}
              </span>
              <span className="font-mono-num text-lg font-extrabold tracking-widest text-slate-900">
                {room.code}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                aria-label={FR.lobby.copyCode}
                className="ml-1 rounded-md border border-slate-300 bg-slate-100 p-1 text-slate-700 hover:bg-slate-200"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={handleInvite}
              className="toy-btn flex items-center gap-1.5 rounded-xl bg-sky-400 px-3 py-1.5 text-sm font-extrabold text-slate-950"
            >
              <Share2 className="h-4 w-4" />
              <span>{FR.lobby.invite}</span>
            </button>
            {copied && (
              <span className="text-xs font-bold text-emerald-900">{FR.lobby.codeCopied}</span>
            )}
            {inviteState === 'copied' && (
              <span className="text-xs font-bold text-emerald-900">{FR.lobby.inviteCopied}</span>
            )}
            {inviteState === 'failed' && (
              <span className="text-xs font-bold text-red-800">
                {FR.lobby.inviteFailed} {window.location.origin}/?salon={room.code}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono-num text-xs font-bold text-slate-800">
              {ping} {FR.hud.pingUnit}
            </span>
            <button
              type="button"
              onClick={onOpenHangar}
              className="toy-btn flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-extrabold text-slate-900"
            >
              <Plane className="h-4 w-4 text-sky-600" />
              <span>{FR.menu.hangar}</span>
            </button>
            <button
              type="button"
              onClick={onLeaveRoom}
              className="toy-btn flex items-center gap-1.5 rounded-xl bg-rose-400 px-3.5 py-2 text-xs font-extrabold text-slate-950"
            >
              <LogOut className="h-4 w-4" />
              <span>{FR.lobby.leaveRoom}</span>
            </button>
          </div>
        </div>

        {/* Content Columns */}
        <div className="grid flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-[1.3fr_1fr]">
          {/* Left: Players List */}
          <div className="flex flex-col">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display flex items-center gap-2 text-lg font-extrabold">
                <Users className="h-5 w-5 text-sky-600" />
                <span>
                  {FR.lobby.playersTitle} ({room.players.length}/{room.settings.maxPlayers})
                </span>
              </h2>
              {isTeams && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSwitchTeam('red')}
                    className={`toy-btn rounded-lg px-3 py-1 text-xs font-extrabold ${
                      localPlayer?.team === 'red'
                        ? 'bg-red-500 text-white'
                        : 'bg-red-100 text-red-950'
                    }`}
                  >
                    {FR.lobby.joinRed}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSwitchTeam('blue')}
                    className={`toy-btn rounded-lg px-3 py-1 text-xs font-extrabold ${
                      localPlayer?.team === 'blue'
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-100 text-blue-950'
                    }`}
                  >
                    {FR.lobby.joinBlue}
                  </button>
                </div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {room.players.map((p) => {
                const arch = PLANE_ARCHETYPES[p.cosmetics.planeId];
                const paint = PAINT_PALETTES[p.cosmetics.paintId];
                const teamColor =
                  p.team === 'red'
                    ? 'bg-red-50 border-red-600'
                    : p.team === 'blue'
                      ? 'bg-blue-50 border-blue-600'
                      : 'bg-white border-slate-900';

                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3.5 py-2.5 ${teamColor}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-slate-900"
                          style={{ backgroundColor: paint.primary }}
                        />
                        <span className="truncate text-sm font-extrabold text-slate-900">
                          {p.nickname}
                        </span>
                        {p.isHost && (
                          <span className="shrink-0 whitespace-nowrap rounded border border-amber-700/40 bg-amber-200 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-950">
                            {FR.lobby.hostBadge}
                          </span>
                        )}
                        {p.isBot && (
                          <span className="shrink-0 whitespace-nowrap rounded border border-slate-700/30 bg-slate-200 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-slate-700">
                            {FR.lobby.botBadge}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600">
                        <span className="truncate">{arch.nameFr}</span>
                        {isTeams && (
                          <span
                            className={`shrink-0 whitespace-nowrap font-bold ${
                              p.team === 'red' ? 'text-red-700' : 'text-blue-700'
                            }`}
                          >
                            · {p.team === 'red' ? FR.lobby.teamRed : FR.lobby.teamBlue}
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`shrink-0 whitespace-nowrap text-xs font-extrabold ${
                        p.ready ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {p.ready ? FR.lobby.ready : FR.lobby.notReady}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Host Settings */}
          <div className="flex flex-col justify-between rounded-2xl border-2 border-slate-900 bg-amber-50/70 p-4">
            <div className="space-y-4">
              <h2 className="font-display flex items-center gap-2 text-lg font-extrabold">
                <Shield className="h-5 w-5 text-amber-600" />
                <span>{FR.lobby.settingsTitle}</span>
              </h2>

              {/* Game Mode */}
              <div>
                <label
                  htmlFor="lobby-mode"
                  className="block text-xs font-bold uppercase text-slate-600"
                >
                  {FR.lobby.modeLabel}
                </label>
                <select
                  id="lobby-mode"
                  disabled={!isHost}
                  value={room.settings.mode}
                  onChange={(e) =>
                    onUpdateSettings({ mode: e.target.value as RoomSettings['mode'] })
                  }
                  className="mt-1 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-sm font-bold text-slate-900 disabled:opacity-65"
                >
                  <option value="last_plane_ffa">{FR.lobby.modeFfa}</option>
                  <option value="last_plane_teams">{FR.lobby.modeTeams}</option>
                </select>
              </div>

              {/* Map */}
              <div>
                <span className="block text-xs font-bold uppercase text-slate-600">
                  {FR.lobby.mapLabel}
                </span>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {MAP_ORDER.map((mId) => {
                    const m = MAPS[mId];
                    const selected = room.settings.mapId === mId;
                    return (
                      <button
                        key={mId}
                        type="button"
                        disabled={!isHost || !m.available}
                        onClick={() => onUpdateSettings({ mapId: mId })}
                        className={`toy-btn flex flex-col items-center rounded-xl px-2 py-2 text-xs font-bold ${
                          selected
                            ? 'bg-sky-300 text-slate-950'
                            : 'bg-white text-slate-700'
                        }`}
                      >
                        <span>{m.nameFr}</span>
                        {!m.available && (
                          <span className="mt-0.5 text-[10px] font-semibold text-slate-500">
                            {FR.lobby.mapSoon}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lives & Max Players */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="lobby-lives"
                    className="block text-xs font-bold uppercase text-slate-600"
                  >
                    {FR.lobby.livesLabel}
                  </label>
                  <select
                    id="lobby-lives"
                    disabled={!isHost}
                    value={room.settings.livesPerRound}
                    onChange={(e) =>
                      onUpdateSettings({ livesPerRound: Number(e.target.value) })
                    }
                    className="font-mono-num mt-1 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-sm font-bold disabled:opacity-65"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="lobby-maxplayers"
                    className="block text-xs font-bold uppercase text-slate-600"
                  >
                    {FR.lobby.maxPlayersLabel}
                  </label>
                  <select
                    id="lobby-maxplayers"
                    disabled={!isHost}
                    value={room.settings.maxPlayers}
                    onChange={(e) =>
                      onUpdateSettings({ maxPlayers: Number(e.target.value) })
                    }
                    className="font-mono-num mt-1 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-sm font-bold disabled:opacity-65"
                  >
                    {[4, 6, 8, 12, 16].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bots toggle & Friendly fire */}
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center justify-between rounded-xl border-2 border-slate-900 bg-white px-3.5 py-2.5 text-sm font-bold">
                  <span>{FR.lobby.botsLabel}</span>
                  <input
                    type="checkbox"
                    disabled={!isHost}
                    checked={room.settings.botsEnabled}
                    onChange={(e) => onUpdateSettings({ botsEnabled: e.target.checked })}
                    className="h-5 w-5 accent-sky-500"
                  />
                </label>

                {room.settings.botsEnabled && (
                  <div className="rounded-xl border-2 border-slate-900 bg-white px-3.5 py-2.5">
                    <div className="mb-1.5 text-xs font-bold uppercase text-slate-600">
                      {FR.lobby.botDifficultyLabel}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={FR.lobby.botDifficultyLabel}>
                      {(['easy', 'normal', 'expert'] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          role="radio"
                          disabled={!isHost}
                          aria-checked={room.settings.botDifficulty === level}
                          onClick={() => onUpdateSettings({ botDifficulty: level })}
                          className={`toy-btn rounded-lg px-2 py-1.5 text-xs font-bold disabled:opacity-65 ${
                            room.settings.botDifficulty === level
                              ? level === 'easy'
                                ? 'bg-emerald-300 text-slate-950'
                                : level === 'normal'
                                  ? 'bg-amber-300 text-slate-950'
                                  : 'bg-rose-400 text-slate-950'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {FR.lobby.botDifficulty[level]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isTeams && (
                  <label className="flex cursor-pointer items-center justify-between rounded-xl border-2 border-slate-900 bg-white px-3.5 py-2.5 text-sm font-bold">
                    <span>{FR.lobby.friendlyFireLabel}</span>
                    <input
                      type="checkbox"
                      disabled={!isHost}
                      checked={room.settings.friendlyFire}
                      onChange={(e) => onUpdateSettings({ friendlyFire: e.target.checked })}
                      className="h-5 w-5 accent-red-500"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-5 flex flex-col gap-2.5 border-t-2 border-slate-200 pt-4">
              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-xl border-2 border-red-900 bg-red-100 px-3 py-2 text-xs font-bold text-red-900"
                >
                  {errorMessage}
                </div>
              )}
              {!isHost && (
                <button
                  type="button"
                  onClick={() => onToggleReady(!localPlayer?.ready)}
                  className={`toy-btn w-full rounded-xl px-4 py-3 text-sm font-extrabold ${
                    localPlayer?.ready
                      ? 'bg-slate-200 text-slate-900'
                      : 'bg-emerald-400 text-slate-950'
                  }`}
                >
                  {localPlayer?.ready ? FR.lobby.cancelReady : FR.lobby.toggleReady}
                </button>
              )}

              {isHost ? (
                <button
                  type="button"
                  data-start="true"
                  onClick={onStartMatch}
                  className="toy-btn flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3.5 text-base font-extrabold text-slate-950"
                >
                  <Play className="h-5 w-5 fill-slate-950" />
                  <span>{FR.lobby.startMatch}</span>
                </button>
              ) : (
                <p className="text-center text-xs font-semibold text-slate-600">
                  {FR.lobby.waitingHost}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
