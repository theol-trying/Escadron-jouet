import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import type { RoomState } from '../../shared/types';
import type { HudHandle } from '../components/HudOverlay';
import type { HudFrameData, ThreeGameEngine } from '../engine/ThreeGameEngine';
import type { GameplaySettings } from '../settings/gameplaySettings';

export interface GameEngineDeps {
  canvasMountRef: RefObject<HTMLDivElement | null>;
  engineRef: MutableRefObject<ThreeGameEngine | null>;
  hudRef: RefObject<HudHandle | null>;
  gameplayRef: MutableRefObject<GameplaySettings>;
  roomRef: MutableRefObject<RoomState | null>;
  localPlayerIdRef: MutableRefObject<string>;
  setEngineReady: Dispatch<SetStateAction<boolean>>;
}

/** Creates the 3D engine once (its code, Three.js included, is loaded after the interface). */
export function useGameEngine(deps: GameEngineDeps): void {
  const { canvasMountRef, engineRef, hudRef, gameplayRef, roomRef, localPlayerIdRef, setEngineReady } = deps;
  // Mount the imperative Three.js engine ONCE. Its code (Three.js included) is a separate file
  // loaded after the interface, so the menus show up right away and the 3D a moment later.
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;
    let cancelled = false;

    void import('../engine/ThreeGameEngine').then(({ ThreeGameEngine }) => {
      if (cancelled) return;
      const engine = new ThreeGameEngine(mount, (hudData: HudFrameData) => {
        hudRef.current?.updateFrame(
          hudData,
          engine.inputState.aimX,
          engine.inputState.aimY,
          engine.inputState.boost
        );
      });
      engineRef.current = engine;
      engine.setCameraView(gameplayRef.current.cameraView);
      // Catch up with anything that happened while loading (invite link, quick auto-start…)
      const currentRoom = roomRef.current;
      if (currentRoom) {
        engine.syncRoomPlayers(currentRoom.players);
        const me = currentRoom.players.find((p) => p.id === localPlayerIdRef.current);
        if (me) engine.setLocalPlayer(me.id, me.cosmetics);
      }
      setEngineReady(true);
    });

    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);
}
