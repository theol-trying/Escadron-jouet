import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  KillFeedEntry,
  MapId,
  PlayerCosmetics,
  RoomSettings,
  RoomState,
  TeamId,
} from '../shared/types';
import { soundEngine, type AudioSettings } from './audio/soundEngine';
import { ControlsModal } from './components/ControlsModal';
import { HangarModal } from './components/HangarModal';
import { HudOverlay, type HudHandle } from './components/HudOverlay';
import { LobbyView } from './components/LobbyView';
import { MatchEndModal } from './components/MatchEndModal';
import { SettingsModal, type GameplaySettings } from './components/SettingsModal';
import { TitleScreen } from './components/TitleScreen';
import type { TouchInputState } from './components/TouchControls';
import { ThreeGameEngine, type HudFrameData } from './engine/ThreeGameEngine';
import { FR } from './i18n/fr';
import { getSessionToken, getSocket } from './net/socketClient';

const DEFAULT_COSMETICS: PlayerCosmetics = {
  planeId: 'plastic_jet',
  paintId: 'red',
  stickerId: 'star',
};

const DEFAULT_GAMEPLAY: GameplaySettings = {
  mouseSensitivity: 1.0,
  invertY: false,
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
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    soundEngine.getSettings()
  );
  const [gameplaySettings, setGameplaySettings] = useState<GameplaySettings>(DEFAULT_GAMEPLAY);

  const [room, setRoom] = useState<RoomState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);

  const [showHangar, setShowHangar] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [touchEnabled, setTouchEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      Boolean(window.matchMedia?.('(pointer: coarse)')?.matches)
    );
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

  const keysHeldRef = useRef<Set<string>>(new Set());
  const mouseDownRef = useRef(false);
  const gamepadSecondaryHeldRef = useRef(false);
  const lastTapRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const autostartDoneRef = useRef(false);
  const touchInputRef = useRef<TouchInputState>({
    aimActive: false,
    aimX: 0,
    aimY: 0,
    throttle: 0,
    boost: false,
    fire: false,
  });
  const wasTouchAimActiveRef = useRef(false);

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

  // Sync document.body.dataset.state, active map, & ThreeGameEngine mode
  useEffect(() => {
    const engine = engineRef.current;
    if (!room) {
      document.body.dataset.state = 'title';
      engine?.setMap('desk');
      engine?.setMode(showHangar ? 'hangar_preview' : 'title_tour', cosmeticsRef.current);
      soundEngine.stopFlightAudio();
      return;
    }

    engine?.setMap(room.settings.mapId);

    if (room.phase === 'lobby') {
      document.body.dataset.state = 'lobby';
      engine?.setMode(showHangar ? 'hangar_preview' : 'title_tour', cosmeticsRef.current);
      soundEngine.stopFlightAudio();
    } else if (room.phase === 'match_end') {
      document.body.dataset.state = 'gameover';
      engine?.setMode('playing');
      soundEngine.stopFlightAudio();
      soundEngine.playVictoryFanfare();
    } else {
      document.body.dataset.state = paused ? 'paused' : 'playing';
      engine?.setMode('playing');
      if (room.phase === 'playing' && !paused) {
        soundEngine.startFlightAudio();
      } else {
        soundEngine.stopFlightAudio();
      }
    }
  }, [room, showHangar, paused]);

  // Mount imperative Three.js engine ONCE
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new ThreeGameEngine(mount, (hudData: HudFrameData) => {
      hudRef.current?.updateFrame(
        hudData,
        engine.inputState.aimX,
        engine.inputState.aimY,
        engine.inputState.boost
      );
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Join helper
  const joinRoom = useCallback(
    (
      mode: 'quick' | 'create' | 'join',
      roomCode?: string,
      autoStartIfHost = false,
      preferredMap?: MapId
    ) => {
      soundEngine.playUiClick();
      setErrorMessage(null);
      const socket = getSocket();
      socket.emit(
        'room:join',
        {
          mode,
          roomCode,
          nickname: nicknameRef.current,
          cosmetics: cosmeticsRef.current,
          sessionToken: getSessionToken(),
        },
        (res) => {
          if (!res.ok || !res.room || !res.playerId) {
            setErrorMessage(res.error || FR.errors.roomNotFound);
            return;
          }
          setLocalPlayerId(res.playerId);
          setRoom(res.room);
          setKillFeed([]);
          setPaused(false);
          const targetMap = preferredMap ?? res.room.settings.mapId;
          engineRef.current?.setMap(targetMap);
          engineRef.current?.resetMatchVisuals();
          engineRef.current?.syncRoomPlayers(res.room.players);
          const authoritativeMe = res.room.players.find((p) => p.id === res.playerId);
          engineRef.current?.setLocalPlayer(
            res.playerId,
            authoritativeMe?.cosmetics ?? cosmeticsRef.current
          );

          if (autoStartIfHost) {
            if (authoritativeMe?.isHost) {
              if (preferredMap && preferredMap !== res.room.settings.mapId) {
                socket.emit('room:updateSettings', { mapId: preferredMap });
              }
              socket.emit('room:startMatch');
            }
          }
        }
      );
    },
    []
  );

  // Socket.io connection & event wiring
  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      setErrorMessage(null);

      // Automatically rejoin active room after transient network/Wi-Fi drop
      if (roomRef.current) {
        socket.emit(
          'room:join',
          {
            mode: 'join',
            roomCode: roomRef.current.code,
            nickname: nicknameRef.current,
            cosmetics: cosmeticsRef.current,
            sessionToken: getSessionToken(),
          },
          (res) => {
            if (res.ok && res.room && res.playerId) {
              setLocalPlayerId(res.playerId);
              setRoom(res.room);
              engineRef.current?.syncRoomPlayers(res.room.players);
              const me = res.room.players.find((p) => p.id === res.playerId);
              engineRef.current?.setLocalPlayer(
                res.playerId,
                me?.cosmetics ?? cosmeticsRef.current,
                {
                  preserveSim:
                    res.room.phase === 'playing' || res.room.phase === 'countdown',
                }
              );
            } else {
              setRoom(null);
              setLocalPlayerId('');
              setPaused(false);
              setErrorMessage(res.error || FR.errors.disconnected);
            }
          }
        );
        return;
      }

      // ?autostart=1 (&map=kitchen|garden) immediately launches solo/bot flight
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1' && !autostartDoneRef.current && !roomRef.current) {
        autostartDoneRef.current = true;
        const rawMap = params.get('map');
        const mapParam: MapId | undefined =
          rawMap === 'desk' || rawMap === 'kitchen' || rawMap === 'garden' ? rawMap : undefined;
        joinRoom('create', undefined, true, mapParam);
      }
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onRoomState = (nextRoom: RoomState) => {
      setRoom(nextRoom);
      engineRef.current?.syncRoomPlayers(nextRoom.players);
      if (nextRoom.phase === 'countdown') {
        setPaused(false);
        setShowHangar(false);
        setKillFeed([]);
        engineRef.current?.resetMatchVisuals();
      }
    };

    const onSnapshot = (snap: Parameters<ThreeGameEngine['ingestSnapshot']>[0]) => {
      engineRef.current?.ingestSnapshot(snap);
    };

    const onHit = (ev: Parameters<ThreeGameEngine['ingestHitEvent']>[0]) => {
      engineRef.current?.ingestHitEvent(ev);
    };

    const onKillFeed = (entry: KillFeedEntry) => {
      setKillFeed((prev) => [entry, ...prev].slice(0, 6));
    };

    const onRoomError = (msg: string) => {
      setErrorMessage(msg);
    };

    const onNetProbe = (ack: () => void) => {
      if (typeof ack === 'function') ack();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onRoomState);
    socket.on('game:snapshot', onSnapshot);
    socket.on('game:hit', onHit);
    socket.on('game:killfeed', onKillFeed);
    socket.on('room:error', onRoomError);
    socket.on('net:probe', onNetProbe);

    if (socket.connected) {
      onConnect();
    }

    const pingInterval = window.setInterval(() => {
      if (socket.connected) {
        socket.emit('net:ping', performance.now(), (sentAt) => {
          setPing(Math.max(1, Math.round(performance.now() - sentAt)));
        });
      }
    }, 2000);

    return () => {
      clearInterval(pingInterval);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onRoomState);
      socket.off('game:snapshot', onSnapshot);
      socket.off('game:hit', onHit);
      socket.off('game:killfeed', onKillFeed);
      socket.off('room:error', onRoomError);
      socket.off('net:probe', onNetProbe);
    };
  }, [joinRoom]);

  // Unified Keyboard, Mouse & Gamepad Input + 30Hz Client Prediction/Send Loop
  useEffect(() => {
    const clearInputs = () => {
      keysHeldRef.current.clear();
      mouseDownRef.current = false;
      touchInputRef.current = {
        aimActive: false,
        aimX: 0,
        aimY: 0,
        throttle: 0,
        boost: false,
        fire: false,
      };
      wasTouchAimActiveRef.current = false;
      setShowScoreboard(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Allow normal typing in text inputs
      const target = e.target as HTMLElement | null;
      const inTextInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      if (inTextInput) {
        if (e.code === 'Enter' && !roomRef.current && target.id === 'nickname-input') {
          joinRoom('quick');
        }
        return;
      }

      if (!roomRef.current && !showHangar && !showControls && !showSettings) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          joinRoom('quick');
          return;
        }
      }

      if (e.code === 'KeyM') {
        setAudioSettings((prev) => {
          const next = { ...prev, muted: !prev.muted };
          soundEngine.updateSettings(next);
          return next;
        });
        return;
      }

      const activePhase = roomRef.current?.phase;
      const inMatch = activePhase === 'playing' || activePhase === 'countdown';
      if (!inMatch) return;

      if (e.code === 'Tab') {
        e.preventDefault();
        setShowScoreboard(true);
        return;
      }

      if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        setPaused((p) => !p);
        return;
      }

      if (!e.repeat && e.code === 'KeyE') {
        if (engineRef.current) {
          engineRef.current.inputState.useSecondaryQueued = true;
        }
      }

      // Double-tap Q/D (KeyA/KeyD on physical layout) or ArrowLeft/ArrowRight for barrel roll
      if (!e.repeat && (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight')) {
        const now = performance.now();
        if (lastTapRef.current.code === e.code && now - lastTapRef.current.time < 260) {
          if (engineRef.current) {
            engineRef.current.inputState.barrelRollQueued =
              e.code === 'KeyA' || e.code === 'ArrowLeft' ? -1 : 1;
            engineRef.current.cycleSpectator(
              e.code === 'KeyA' || e.code === 'ArrowLeft' ? -1 : 1
            );
          }
          lastTapRef.current = { code: '', time: 0 };
        } else {
          lastTapRef.current = { code: e.code, time: now };
        }
      }

      keysHeldRef.current.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        setShowScoreboard(false);
      }
      keysHeldRef.current.delete(e.code);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (touchEnabledRef.current && touchInputRef.current.aimActive) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-touch-control="true"]')) return;
      const engine = engineRef.current;
      const mount = canvasMountRef.current;
      if (!engine || !mount) return;
      const rect = mount.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const sens = gameplayRef.current.mouseSensitivity;
      const rawX = ((e.clientX - cx) / (rect.width * 0.32)) * sens;
      const rawY = -((e.clientY - cy) / (rect.height * 0.32)) * sens;
      const deadzone = 0.04;

      engine.inputState.aimX =
        Math.abs(rawX) < deadzone ? 0 : Math.max(-1, Math.min(1, rawX));
      const pitchVal = Math.abs(rawY) < deadzone ? 0 : Math.max(-1, Math.min(1, rawY));
      engine.inputState.aimY = gameplayRef.current.invertY ? -pitchVal : pitchVal;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (roomRef.current?.phase === 'playing' && !pausedRef.current) {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, input, select, [data-touch-control="true"]')) return;
        if (touchEnabledRef.current) return;
        soundEngine.unlock();
        if (e.button === 0) {
          mouseDownRef.current = true;
        } else if (e.button === 2 && engineRef.current) {
          engineRef.current.inputState.useSecondaryQueued = true;
        }
      }
    };

    const onPointerDownGlobal = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        soundEngine.unlock();
        if (!touchEnabledRef.current) {
          setTouchEnabled(true);
        }
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (roomRef.current?.phase === 'playing' && !pausedRef.current) {
        e.preventDefault();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) mouseDownRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('pointerdown', onPointerDownGlobal, { passive: true });
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', clearInputs);

    // 30 Hz input step & send loop
    let lastInputTime = performance.now();
    const inputTimer = window.setInterval(() => {
      const engine = engineRef.current;
      const currentRoom = roomRef.current;
      if (!engine || !currentRoom) return;
      if (currentRoom.phase !== 'playing' && currentRoom.phase !== 'countdown') return;

      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.005, (now - lastInputTime) / 1000));
      lastInputTime = now;

      const keys = keysHeldRef.current;
      let throttle = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) throttle += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) throttle -= 1;

      let roll = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) roll -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) roll += 1;

      let boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
      let fire = mouseDownRef.current || keys.has('Space');

      // Optional Gamepad support
      const pads = navigator.getGamepads?.();
      const gp = pads?.[0];
      if (gp) {
        if (Math.abs(gp.axes[0]) > 0.14) engine.inputState.aimX = gp.axes[0];
        if (Math.abs(gp.axes[1]) > 0.14) {
          engine.inputState.aimY = gameplayRef.current.invertY ? gp.axes[1] : -gp.axes[1];
        }
        if (gp.buttons[0]?.pressed) boost = true;
        if (gp.buttons[7]?.pressed) fire = true;
        const bPressed = Boolean(gp.buttons[1]?.pressed);
        if (bPressed && !gamepadSecondaryHeldRef.current) {
          engine.inputState.useSecondaryQueued = true;
        }
        gamepadSecondaryHeldRef.current = bPressed;
      } else {
        gamepadSecondaryHeldRef.current = false;
      }

      const touch = touchInputRef.current;
      if (touch.aimActive) {
        engine.inputState.aimX = touch.aimX;
        engine.inputState.aimY = gameplayRef.current.invertY ? -touch.aimY : touch.aimY;
        wasTouchAimActiveRef.current = true;
      } else if (wasTouchAimActiveRef.current) {
        engine.inputState.aimX = 0;
        engine.inputState.aimY = 0;
        wasTouchAimActiveRef.current = false;
      }

      engine.inputState.throttle = Math.max(-1, Math.min(1, throttle + touch.throttle));
      engine.inputState.roll = roll;
      engine.inputState.boost = boost || touch.boost;
      engine.inputState.fire = fire || touch.fire;

      const canControl = currentRoom.phase === 'playing' && !pausedRef.current;
      const socket = getSocket();
      engine.stepAndSendInput(
        dt,
        (inp) => {
          if (socket.connected) {
            socket.emit('game:input', inp);
          }
        },
        canControl
      );
    }, 1000 / 30);

    return () => {
      clearInterval(inputTimer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('pointerdown', onPointerDownGlobal);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', clearInputs);
    };
  }, [joinRoom, showHangar, showControls, showSettings]);

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

      {/* Match End Podium */}
      {room && room.phase === 'match_end' && (
        <MatchEndModal
          room={room}
          localPlayerId={localPlayerId}
          onPlayAgain={handlePlayAgain}
          onLeaveToMenu={handleLeaveRoom}
        />
      )}

      {/* Hangar Overlay (live 3D rotating plane preview behind it) */}
      {showHangar && (
        <HangarModal
          cosmetics={cosmetics}
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

      {showControls && <ControlsModal onClose={() => setShowControls(false)} />}

      {showSettings && (
        <SettingsModal
          audio={audioSettings}
          gameplay={gameplaySettings}
          onChangeAudio={handleChangeAudio}
          onChangeGameplay={(partial) =>
            setGameplaySettings((prev) => ({ ...prev, ...partial }))
          }
          onReset={() => {
            const defAudio = {
              masterVolume: 0.7,
              sfxVolume: 0.85,
              ambienceVolume: 0.45,
              muted: false,
            };
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
