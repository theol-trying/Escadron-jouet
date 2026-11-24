import { useState } from 'react';
import { Gamepad2, Plane, Play, Settings, Users } from 'lucide-react';
import { PLANE_ARCHETYPES } from '../../shared/planes';
import type { PlayerCosmetics } from '../../shared/types';
import { FR } from '../i18n/fr';

interface TitleScreenProps {
  nickname: string;
  cosmetics: PlayerCosmetics;
  connected: boolean;
  errorMessage: string | null;
  onChangeNickname: (val: string) => void;
  onQuickPlay: () => void;
  onCreatePrivateRoom: () => void;
  onJoinPrivateRoom: (code: string) => void;
  onOpenHangar: () => void;
  onOpenControls: () => void;
  onOpenSettings: () => void;
}

export function TitleScreen({
  nickname,
  cosmetics,
  connected,
  errorMessage,
  onChangeNickname,
  onQuickPlay,
  onCreatePrivateRoom,
  onJoinPrivateRoom,
  onOpenHangar,
  onOpenControls,
  onOpenSettings,
}: TitleScreenProps) {
  const [showPrivatePanel, setShowPrivatePanel] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const selectedPlane = PLANE_ARCHETYPES[cosmetics.planeId];

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between overflow-y-auto p-4 sm:p-5 md:p-10">
      {/* Soft left gradient scrim for crisp legibility over the live 3D desk flyover */}
      <div
        className="pointer-events-none fixed inset-y-0 left-0 w-full max-w-xl bg-gradient-to-r from-slate-950/75 via-slate-950/35 to-transparent"
        aria-hidden="true"
      />

      <div className="relative z-10 flex max-w-md flex-col gap-5">
        {/* Custom SVG Cartoon Title Lockup */}
        <div className="select-none">
          <svg
            viewBox="0 0 420 118"
            className="h-auto w-full max-w-[360px] drop-shadow-[0_4px_0_rgba(15,23,42,0.9)]"
            role="img"
            aria-label={FR.appTitle}
          >
            {/* Wing Crest Emblem */}
            <path
              d="M24 38 L88 26 L76 44 L110 42 L74 56 L30 52 Z"
              fill="#FACC15"
              stroke="#18181B"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <path
              d="M396 38 L332 26 L344 44 L310 42 L346 56 L390 52 Z"
              fill="#FACC15"
              stroke="#18181B"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <circle cx="210" cy="24" r="14" fill="#EF4444" stroke="#18181B" strokeWidth="4" />
            <polygon
              points="210,14 213,21 220,21 214,26 216,33 210,29 204,33 206,26 200,21 207,21"
              fill="#FEF08A"
            />
            {/* Title Text */}
            <text
              x="210"
              y="74"
              textAnchor="middle"
              fontFamily="Bricolage Grotesque, sans-serif"
              fontWeight="800"
              fontSize="44"
              fill="#FFFFFF"
              stroke="#18181B"
              strokeWidth="8"
              paintOrder="stroke fill"
              letterSpacing="-0.5"
            >
              ESCADRILLE
            </text>
            <text
              x="210"
              y="108"
              textAnchor="middle"
              fontFamily="Bricolage Grotesque, sans-serif"
              fontWeight="800"
              fontSize="32"
              fill="#38BDF8"
              stroke="#18181B"
              strokeWidth="7"
              paintOrder="stroke fill"
              letterSpacing="3"
            >
              JOUET
            </text>
          </svg>
          <p className="mt-1 text-sm font-semibold text-amber-100 drop-shadow-[0_2px_0_rgba(0,0,0,0.75)]">
            {FR.appSubtitle}
          </p>
        </div>

        {/* Main Card */}
        <div className="toy-panel pointer-events-auto rounded-2xl p-5 text-slate-900">
          <div>
            <label
              htmlFor="nickname-input"
              className="block text-xs font-bold uppercase tracking-wide text-slate-600"
            >
              {FR.menu.nicknameLabel}
            </label>
            <input
              id="nickname-input"
              type="text"
              maxLength={16}
              value={nickname}
              onChange={(e) => onChangeNickname(e.target.value)}
              placeholder={FR.menu.nicknamePlaceholder}
              className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-amber-50 px-3.5 py-2.5 text-base font-bold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-sky-400"
            />
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-3 rounded-xl border-2 border-red-900 bg-red-100 px-3 py-2 text-xs font-bold text-red-900"
            >
              {errorMessage}
            </div>
          )}

          {!connected && (
            <p className="mt-3 text-xs font-semibold text-amber-700">
              {FR.menu.connecting}
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2.5">
            <button
              type="button"
              data-start="true"
              disabled={!connected}
              onClick={onQuickPlay}
              className="toy-btn flex w-full items-center justify-center gap-2.5 rounded-xl bg-amber-400 px-5 py-3.5 text-base font-extrabold text-slate-950"
            >
              <Play className="h-5 w-5 fill-slate-950" />
              <span>{FR.menu.quickPlay}</span>
            </button>

            <button
              type="button"
              disabled={!connected}
              onClick={() => setShowPrivatePanel((prev) => !prev)}
              className="toy-btn flex w-full items-center justify-center gap-2 rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-bold text-slate-950"
            >
              <Users className="h-4 w-4" />
              <span>{FR.menu.privateRoom}</span>
            </button>
          </div>

          {showPrivatePanel && (
            <div className="mt-3 rounded-xl border-2 border-slate-900 bg-sky-50 p-3">
              <button
                type="button"
                disabled={!connected}
                onClick={onCreatePrivateRoom}
                className="toy-btn w-full rounded-lg bg-emerald-400 px-3 py-2 text-xs font-extrabold text-slate-950"
              >
                {FR.menu.createRoom}
              </button>
              <form
                className="mt-2.5 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onJoinPrivateRoom(joinCode);
                }}
              >
                <label htmlFor="room-code-input" className="sr-only">
                  {FR.lobby.roomCodeLabel}
                </label>
                <input
                  id="room-code-input"
                  type="text"
                  maxLength={5}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder={FR.menu.roomCodePlaceholder}
                  className="font-mono-num min-w-0 flex-1 rounded-lg border-2 border-slate-900 bg-white px-3 py-1.5 text-sm font-bold uppercase text-slate-900 outline-none"
                />
                <button
                  type="submit"
                  disabled={!connected}
                  className="toy-btn rounded-lg bg-amber-300 px-3.5 py-1.5 text-xs font-extrabold text-slate-950"
                >
                  {FR.menu.joinRoom}
                </button>
              </form>
            </div>
          )}

          {/* Secondary Utility Actions */}
          <div className="mt-4 grid grid-cols-3 gap-2 border-t-2 border-slate-200 pt-3.5">
            <button
              type="button"
              onClick={onOpenHangar}
              className="toy-btn flex flex-col items-center justify-center gap-1 rounded-xl bg-white px-2 py-2.5 text-xs font-bold text-slate-900"
            >
              <Plane className="h-4 w-4 text-sky-600" />
              <span className="whitespace-nowrap">{FR.menu.hangar}</span>
            </button>
            <button
              type="button"
              onClick={onOpenControls}
              className="toy-btn flex flex-col items-center justify-center gap-1 rounded-xl bg-white px-2 py-2.5 text-xs font-bold text-slate-900"
            >
              <Gamepad2 className="h-4 w-4 text-emerald-600" />
              <span className="whitespace-nowrap">{FR.menu.controls}</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="toy-btn flex flex-col items-center justify-center gap-1 rounded-xl bg-white px-2 py-2.5 text-xs font-bold text-slate-900"
            >
              <Settings className="h-4 w-4 text-amber-600" />
              <span className="whitespace-nowrap">{FR.menu.settings}</span>
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-600">
            <span>{selectedPlane.nameFr}</span>
            <span className="font-mono-num">{selectedPlane.wingspan} cm</span>
          </div>
        </div>
      </div>

      {/* Bottom clean single-line controls hint */}
      <div className="relative z-10 text-xs font-semibold text-white drop-shadow-[0_2px_0_rgba(15,23,42,0.9)]">
        {FR.menu.controlsHint}
      </div>
    </div>
  );
}
