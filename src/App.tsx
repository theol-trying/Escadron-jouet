import { useEffect, useRef, useState } from 'react';
import type { KillFeedEntry, PlayerCosmetics, RoomSettings, RoomState, TeamId } from '../shared/types';
import { DEFAULT_AUDIO_SETTINGS, soundEngine, type AudioSettings } from './audio/soundEngine';
import { ControlsModal } from './components/ControlsModal';
import { HangarModal } from './components/HangarModal';
import { HudOverlay, type HudHandle } from './components/HudOverlay';
import { LobbyView } from './components/LobbyView';
import { MatchEndModal } from './components/MatchEndModal';
import { ServerWakeBanner } from './components/ServerWakeBanner';
import { SettingsModal } from './components/SettingsModal';
import { TitleScreen } from './components/TitleScreen';
import type { TouchInputState } from './components/TouchControls';
import type { ThreeGameEngine } from './engine/ThreeGameEngine';
import { useFlightInput } from './hooks/useFlightInput';
import { useGameEngine } from './hooks/useGameEngine';
import { useGameSocket, type QuickChatLine } from './hooks/useGameSocket';
import { useMatchPhase } from './hooks/useMatchPhase';
import { useTutorial } from './hooks/useTutorial';
import { TutorialPanel } from './components/TutorialPanel';
import { FR } from './i18n/fr';
import { getSocket } from './net/socketClient';
import { loadProgress, type PlayerProgress, type UnlockedItem } from './progression';
import {
  DEFAULT_GAMEPLAY,
  loadGameplaySettings,
  saveGameplaySettings,
  type GameplaySettings,
} from './settings/gameplaySettings';

const DEFAULT_COSMETICS: PlayerCosmetics = {
  planeId: 'plastic_jet',
  paintId: 'red',
  stickerId: 'star',
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ThreeGameEngine | null>(null);
  const hudRef = useRef<HudHandle>(null);

  const [connected, setConnected] = useState(false);
  const [ping, setPing] = useState(24);
  const [nickname, setNickname] = useState(() => {
    try {
      return localStorage.getItem('ej_nickname') || 'As du Ciel';
    } catch {
      return 'As du Ciel';
    }
  });
  const [cosmetics, setCosmetics] = useState<PlayerCosmetics>(() => {
    try {
      const saved = localStorage.getItem('ej_cosmetics');
      return saved ? { ...DEFAULT_COSMETICS, ...JSON.parse(saved) } : DEFAULT_COSMETICS;
    } catch {
      return DEFAULT_COSMETICS;
    }
  });
  // Paints & stickers unlocked by playing (saved on this device)
  const [progress, setProgress] = useState<PlayerProgress>(() => loadProgress(cosmetics));
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [newUnlocks, setNewUnlocks] = useState<UnlockedItem[]>([]);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    soundEngine.getSettings()
  );
  const [gameplaySettings, setGameplaySettings] = useState<GameplaySettings>(loadGameplaySettings);

  const [room, setRoom] = useState<RoomState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string>('');
  const [engineReady, setEngineReady] = useState(false);
  const localPlayerIdRef = useRef('');
  localPlayerIdRef.current = localPlayerId;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [quickChat, setQuickChat] = useState<QuickChatLine[]>([]);

  const [showHangar, setShowHangar] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  // Touch UI only when the PRIMARY pointer is a finger (phone/tablet). Touchscreen laptops report
  // maxTouchPoints > 0 but keep a fine primary pointer: they start in mouse mode, and the last
  // input type used (touch vs mouse) switches the UI afterwards.
  const [touchEnabled, setTouchEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  });

  // Refs for stable event handlers without re-mounting WebGL
  const roomRef = useRef<RoomState | null>(null);
  roomRef.current = room;
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const touchEnabledRef = useRef(touchEnabled);
  touchEnabledRef.current = touchEnabled;
  const gameplayRef = useRef(gameplaySettings);
  gameplayRef.current = gameplaySettings;
  const cosmeticsRef = useRef(cosmetics);
  cosmeticsRef.current = cosmetics;
  const nicknameRef = useRef(nickname);
  nicknameRef.current = nickname;

  const touchInputRef = useRef<TouchInputState>({
    aimActive: false,
    aimX: 0,
    aimY: 0,
    throttle: 0,
    boost: false,
    fire: false,
  });

  // Persist gameplay settings (control scheme, sensitivities, aim assist…)
  useEffect(() => {
    saveGameplaySettings(gameplaySettings);
  }, [gameplaySettings]);

  // Camera view (chase / cockpit) follows the setting; V toggles it in flight
  useEffect(() => {
    engineRef.current?.setCameraView(gameplaySettings.cameraView);
  }, [gameplaySettings.cameraView]);

  // In a match, ask before leaving the page: on a QWERTY keyboard, pressing Ctrl (special item) while
  // climbing with W triggers Ctrl+W (close tab), which browsers never let a page block.
  const inMatchPhase = room?.phase === 'playing' || room?.phase === 'countdown' || room?.phase === 'round_end';
  useEffect(() => {
    if (!inMatchPhase) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = FR.leaveGuard;
      return FR.leaveGuard;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [inMatchPhase]);

  // Persist nickname & cosmetics
  useEffect(() => {
    try {
      localStorage.setItem('ej_nickname', nickname);
    } catch {
      // ignore storage errors
    }
  }, [nickname]);

  useEffect(() => {
    try {
      localStorage.setItem('ej_cosmetics', JSON.stringify(cosmetics));
    } catch {
      // ignore storage errors
    }
    engineRef.current?.updateHangarPlane(cosmetics);
    if (roomRef.current?.phase === 'lobby') {
      engineRef.current?.updateLocalCosmetics(cosmetics);
      getSocket().emit('room:updateCosmetics', cosmetics);
    }
  }, [cosmetics]);

  // Page state, 3D view mode, music, podium and unlocks follow the room phase
  useMatchPhase({
    engineRef,
    room,
    showHangar,
    paused,
    engineReady,
    cosmeticsRef,
    localPlayerIdRef,
    progressRef,
    setProgress,
    setNewUnlocks,
  });

  // The 3D engine, created once
  useGameEngine({ canvasMountRef, engineRef, hudRef, gameplayRef, roomRef, localPlayerIdRef, setEngineReady });

  // Server connection (join, rejoin, invitations, updates)
  const joinRoom = useGameSocket({
    engineRef,
    roomRef,
    nicknameRef,
    cosmeticsRef,
    setConnected,
    setPing,
    setRoom,
    setLocalPlayerId,
    setErrorMessage,
    setKillFeed,
    setQuickChat,
    setPaused,
    setShowHangar,
  });

  // Keyboard, mouse, gamepad and touch flight controls + 30 Hz send loop
  useFlightInput({
    engineRef,
    canvasMountRef,
    roomRef,
    pausedRef,
    gameplayRef,
    touchEnabledRef,
    touchInputRef,
    showHangar,
    showControls,
    showSettings,
    joinRoom,
    setShowScoreboard,
    setPaused,
    setGameplaySettings,
    setAudioSettings,
    setTouchEnabled,
  });

  // « Premier vol »: guided steps while the room is in tutorial mode
  const tutorial = useTutorial(engineRef, room);
  const startTutorial = () => joinRoom('create', undefined, true, 'desk', { mode: 'tutorial', botsEnabled: false });

  const handleLeaveRoom = () => {
    soundEngine.playUiClick();
    getSocket().emit('room:leave');
    setRoom(null);
    setLocalPlayerId('');
    setPaused(false);
    setKillFeed([]);
    engineRef.current?.resetMatchVisuals();
  };

  const handleUpdateSettings = (partial: Partial<RoomSettings>) => {
    soundEngine.playUiClick();
    setErrorMessage(null);
    getSocket().emit('room:updateSettings', partial);
  };

  const handleToggleReady = (ready: boolean) => {
    soundEngine.playUiClick();
    setErrorMessage(null);
    getSocket().emit('room:setReady', ready);
  };

  const handleSwitchTeam = (team: TeamId) => {
    soundEngine.playUiClick();
    setErrorMessage(null);
    getSocket().emit('room:switchTeam', team);
  };

  const handleStartMatch = () => {
    soundEngine.playUiClick();
    soundEngine.unlock();
    setErrorMessage(null);
    getSocket().emit('room:startMatch');
  };

  const handlePlayAgain = () => {
    soundEngine.playUiClick();
    soundEngine.unlock();
    setErrorMessage(null);
    getSocket().emit('room:playAgain');
  };

  const handleChangeAudio = (partial: Partial<AudioSettings>) => {
    setAudioSettings((prev) => {
      const next = { ...prev, ...partial };
      soundEngine.updateSettings(next);
      return next;
    });
  };

  const inMatch =
    room &&
    (room.phase === 'countdown' ||
      room.phase === 'playing' ||
      room.phase === 'round_end' ||
      room.phase === 'match_end');

  return (
    <div className="relative h-full w-full overflow-hidden bg-sky-200">
      {/* Dedicated isolated WebGL mount */}
      <div
        ref={canvasMountRef}
        data-testid="game-canvas-mount"
        className="fixed inset-0 h-full w-full"
      />

      {/* Title Screen */}
      {!room && !showHangar && (
        <TitleScreen
          controlScheme={gameplaySettings.controlScheme}
          nickname={nickname}
          cosmetics={cosmetics}
          connected={connected}
          errorMessage={errorMessage}
          onChangeNickname={setNickname}
          onQuickPlay={() => joinRoom('quick')}
          onCreatePrivateRoom={() => joinRoom('create')}
          onJoinPrivateRoom={(code) => joinRoom('join', code)}
          onOpenHangar={() => {
            soundEngine.playUiClick();
            setShowHangar(true);
          }}
          onOpenControls={() => {
            soundEngine.playUiClick();
            setShowControls(true);
          }}
          onOpenSettings={() => {
            soundEngine.playUiClick();
            setShowSettings(true);
          }}
          tutorialDone={tutorial.completed}
          onStartTutorial={startTutorial}
        />
      )}

      {/* Lobby View */}
      {room && room.phase === 'lobby' && !showHangar && (
        <LobbyView
          room={room}
          localPlayerId={localPlayerId}
          ping={ping}
          errorMessage={errorMessage}
          onUpdateSettings={handleUpdateSettings}
          onToggleReady={handleToggleReady}
          onSwitchTeam={handleSwitchTeam}
          onOpenHangar={() => {
            soundEngine.playUiClick();
            setShowHangar(true);
          }}
          onStartMatch={handleStartMatch}
          onLeaveRoom={handleLeaveRoom}
        />
      )}

      {/* In-Match HUD */}
      {inMatch && room && (
        <HudOverlay
          ref={hudRef}
          room={room}
          localPlayerId={localPlayerId}
          ping={ping}
          muted={audioSettings.muted}
          paused={paused}
          showScoreboard={showScoreboard}
          killFeed={killFeed}
          quickChat={quickChat}
          touchEnabled={touchEnabled}
          touchInputRef={touchInputRef}
          onUseSecondary={() => {
            soundEngine.unlock();
            if (engineRef.current) {
              engineRef.current.inputState.useSecondaryQueued = true;
            }
          }}
          onToggleMute={() => handleChangeAudio({ muted: !audioSettings.muted })}
          onTogglePause={() => setPaused((p) => !p)}
          onResume={() => setPaused(false)}
          onQuitToMenu={handleLeaveRoom}
          onSpectatorCycle={(dir) => engineRef.current?.cycleSpectator(dir)}
        />
      )}

      {/* « Premier vol » instructions */}
      {tutorial.active && room && !paused && (
        <TutorialPanel
          step={tutorial.step}
          stepIndex={tutorial.stepIndex}
          total={tutorial.total}
          justDone={tutorial.justDone}
          scheme={gameplaySettings.controlScheme}
          bindings={gameplaySettings.keyBindings}
          onSkip={tutorial.skip}
          onQuit={handleLeaveRoom}
          onQuickPlay={() => {
            handleLeaveRoom();
            joinRoom('quick');
          }}
        />
      )}

      {/* Match End Podium */}
      {room && room.phase === 'match_end' && (
        <MatchEndModal
          room={room}
          localPlayerId={localPlayerId}
          newUnlocks={newUnlocks}
          onPlayAgain={handlePlayAgain}
          onLeaveToMenu={handleLeaveRoom}
        />
      )}

      {/* Hangar Overlay (live 3D rotating plane preview behind it) */}
      {showHangar && (
        <HangarModal
          cosmetics={cosmetics}
          progress={progress}
          onChange={(next) => {
            soundEngine.playUiClick();
            setCosmetics(next);
          }}
          onClose={() => {
            soundEngine.playUiClick();
            setShowHangar(false);
          }}
        />
      )}

      <ServerWakeBanner connected={connected} />

      {showControls && (
        <ControlsModal
          scheme={gameplaySettings.controlScheme}
          bindings={gameplaySettings.keyBindings}
          onChangeScheme={(controlScheme) =>
            setGameplaySettings((prev) => ({ ...prev, controlScheme }))
          }
          onChangeBindings={(keyBindings) => setGameplaySettings((prev) => ({ ...prev, keyBindings }))}
          onClose={() => setShowControls(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          audio={audioSettings}
          gameplay={gameplaySettings}
          onChangeAudio={handleChangeAudio}
          onChangeGameplay={(partial) =>
            setGameplaySettings((prev) => ({ ...prev, ...partial }))
          }
          onReset={() => {
            const defAudio = { ...DEFAULT_AUDIO_SETTINGS };
            setAudioSettings(defAudio);
            soundEngine.updateSettings(defAudio);
            setGameplaySettings(DEFAULT_GAMEPLAY);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
