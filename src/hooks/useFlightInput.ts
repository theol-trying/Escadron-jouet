import { useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import type { RoomState } from '../../shared/types';
import { soundEngine, type AudioSettings } from '../audio/soundEngine';
import type { TouchInputState } from '../components/TouchControls';
import type { ThreeGameEngine } from '../engine/ThreeGameEngine';
import {
  FLIGHT_KEYS,
  PAD_RELEASED,
  aimAssistStrength,
  flightKeyAction,
  gamepadStep,
  keyboardFlightStep,
  mouseAim,
} from '../input/flightControls';
import { getSocket } from '../net/socketClient';
import type { GameplaySettings } from '../settings/gameplaySettings';

export interface FlightInputDeps {
  engineRef: MutableRefObject<ThreeGameEngine | null>;
  canvasMountRef: RefObject<HTMLDivElement | null>;
  roomRef: MutableRefObject<RoomState | null>;
  pausedRef: MutableRefObject<boolean>;
  gameplayRef: MutableRefObject<GameplaySettings>;
  touchEnabledRef: MutableRefObject<boolean>;
  touchInputRef: MutableRefObject<TouchInputState>;
  showHangar: boolean;
  showControls: boolean;
  showSettings: boolean;
  joinRoom: (mode: 'quick') => void;
  setShowScoreboard: Dispatch<SetStateAction<boolean>>;
  setPaused: Dispatch<SetStateAction<boolean>>;
  setGameplaySettings: Dispatch<SetStateAction<GameplaySettings>>;
  setAudioSettings: Dispatch<SetStateAction<AudioSettings>>;
  setTouchEnabled: Dispatch<SetStateAction<boolean>>;
}

/**
 * Keyboard, mouse, gamepad and touch input, and the 30 Hz loop that steps our predicted plane and
 * sends the input to the server. Global shortcuts too: Enter/Space quick play on the title screen,
 * M mute, Tab scoreboard, P/Échap pause, V camera view. The key mapping itself is in
 * src/input/flightControls.ts (tested).
 */
export function useFlightInput(deps: FlightInputDeps): void {
  const {
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
  } = deps;
  const keysHeldRef = useRef<Set<string>>(new Set());
  const mouseDownRef = useRef(false);
  const gamepadLatchRef = useRef(PAD_RELEASED);
  const wasTouchAimActiveRef = useRef(false);
  // Browsers emit compatibility mouse events right after a tap: ignore them so a tap on the
  // 3D view neither jerks the aim nor fires, while a real mouse keeps working everywhere.
  const lastTouchAtRef = useRef(-Infinity);

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

      if (e.code === 'KeyV' && !e.repeat) {
        e.preventDefault();
        setGameplaySettings((prev) => ({
          ...prev,
          cameraView: prev.cameraView === 'cockpit' ? 'chase' : 'cockpit',
        }));
        return;
      }

      // Flight keys must not scroll the page, press a focused button (Space/Enter) or trigger a
      // Ctrl shortcut of the browser (Ctrl+S, Ctrl+D…). Ctrl+W cannot be blocked: see the leave guard.
      if (FLIGHT_KEYS.has(e.code) || e.ctrlKey) {
        e.preventDefault();
      }

      const engine = engineRef.current;
      if (!e.repeat && engine) {
        const action = flightKeyAction(e.code);
        if (action.useSecondary) engine.inputState.useSecondaryQueued = true;
        if (action.barrelRoll) engine.inputState.barrelRollQueued = action.barrelRoll;
        if (action.spectate) engine.cycleSpectator(action.spectate);
      }

      keysHeldRef.current.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        setShowScoreboard(false);
      }
      keysHeldRef.current.delete(e.code);
    };

    const isCompatMouseEvent = () => performance.now() - lastTouchAtRef.current < 800;

    const onMouseMove = (e: MouseEvent) => {
      if (isCompatMouseEvent()) return;
      // "Clavier seul": the mouse never steers (ZQSD does)
      if (gameplayRef.current.controlScheme === 'keyboard') return;
      if (touchEnabledRef.current && touchInputRef.current.aimActive) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-touch-control="true"]')) return;
      const engine = engineRef.current;
      const mount = canvasMountRef.current;
      if (!engine || !mount) return;
      const rect = mount.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const aim = mouseAim(e.clientX, e.clientY, rect, gameplayRef.current.mouseSensitivity, gameplayRef.current.invertY);
      engine.inputState.aimX = aim.aimX;
      engine.inputState.aimY = aim.aimY;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (roomRef.current?.phase === 'playing' && !pausedRef.current) {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, input, select, [data-touch-control="true"]')) return;
        if (isCompatMouseEvent()) return;
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
        lastTouchAtRef.current = performance.now();
        soundEngine.unlock();
        if (!touchEnabledRef.current) {
          setTouchEnabled(true);
        }
      } else if (e.pointerType === 'mouse' && touchEnabledRef.current) {
        // Touchscreen laptop: the player went back to the mouse, hide the on-screen controls
        setTouchEnabled(false);
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

      const settings = gameplayRef.current;
      const kb = keyboardFlightStep(
        keysHeldRef.current,
        { scheme: settings.controlScheme, keyboardSensitivity: settings.keyboardSensitivity, invertY: settings.invertY, dt },
        engine.inputState
      );
      engine.inputState.aimX = kb.aimX;
      engine.inputState.aimY = kb.aimY;
      const { throttle, roll } = kb;
      let boost = kb.boost;
      let fire = mouseDownRef.current || kb.fire;

      // Optional gamepad
      const gp = navigator.getGamepads?.()?.[0];
      if (gp) {
        const pad = gamepadStep(gp, settings.invertY, gamepadLatchRef.current);
        if (pad.aimX !== null) engine.inputState.aimX = pad.aimX;
        if (pad.aimY !== null) engine.inputState.aimY = pad.aimY;
        boost ||= pad.boost;
        fire ||= pad.fire;
        if (pad.useSecondary) engine.inputState.useSecondaryQueued = true;
        if (pad.barrelRoll) engine.inputState.barrelRollQueued = pad.barrelRoll;
        gamepadLatchRef.current = pad.latch;
      } else {
        gamepadLatchRef.current = PAD_RELEASED;
      }

      engine.aimAssistStrength = aimAssistStrength(settings.aimAssist, settings.controlScheme);

      const touch = touchInputRef.current;
      if (touch.aimActive) {
        engine.inputState.aimX = touch.aimX;
        engine.inputState.aimY = settings.invertY ? -touch.aimY : touch.aimY;
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
}
