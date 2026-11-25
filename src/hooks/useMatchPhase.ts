import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { PlayerCosmetics, RoomState } from '../../shared/types';
import { music } from '../audio/music';
import { soundEngine } from '../audio/soundEngine';
import type { ThreeGameEngine } from '../engine/ThreeGameEngine';
import { recordMatch, saveProgress, type PlayerProgress, type UnlockedItem } from '../progression';

export interface MatchPhaseDeps {
  engineRef: MutableRefObject<ThreeGameEngine | null>;
  room: RoomState | null;
  showHangar: boolean;
  paused: boolean;
  engineReady: boolean;
  cosmeticsRef: MutableRefObject<PlayerCosmetics>;
  localPlayerIdRef: MutableRefObject<string>;
  progressRef: MutableRefObject<PlayerProgress>;
  setProgress: Dispatch<SetStateAction<PlayerProgress>>;
  setNewUnlocks: Dispatch<SetStateAction<UnlockedItem[]>>;
}

/**
 * Follows the room phase: page state (body data-state), room and mode of the 3D view, music
 * (menus / flight), flight sounds, and at the end of a match the fanfare, the podium and the
 * unlocks earned.
 */
export function useMatchPhase(deps: MatchPhaseDeps): void {
  const {
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
  } = deps;
  const lastPhaseRef = useRef<string>('title');

  useEffect(() => {
    const engine = engineRef.current;
    // Music: menus vs flight; the victory fanfare plays once when the match ends
    const phase = room?.phase ?? 'title';
    const inFlight = phase === 'countdown' || phase === 'playing' || phase === 'round_end';
    music.setMoment(inFlight ? 'match' : 'menu');
    const phaseChanged = lastPhaseRef.current !== phase;
    lastPhaseRef.current = phase;
    if (phaseChanged && phase !== 'match_end') setNewUnlocks([]);

    if (!room) {
      document.body.dataset.state = 'title';
      engine?.setMap('desk');
      engine?.setMode(showHangar ? 'hangar_preview' : 'title_tour', cosmeticsRef.current);
      soundEngine.stopFlightAudio();
      return;
    }

    engine?.setMap(room.settings.mapId);
    engine?.setGameMode(room.settings.mode);

    if (room.phase === 'lobby') {
      document.body.dataset.state = 'lobby';
      engine?.setMode(showHangar ? 'hangar_preview' : 'title_tour', cosmeticsRef.current);
      soundEngine.stopFlightAudio();
    } else if (room.phase === 'match_end') {
      document.body.dataset.state = 'gameover';
      soundEngine.stopFlightAudio();
      if (phaseChanged) {
        soundEngine.playVictoryFanfare();
        // Count the match for unlocks: kills, and a win when first (FFA) or on the winning team
        const me = room.scoreboard.find((e) => e.playerId === localPlayerIdRef.current);
        if (me) {
          const wins = room.teamRoundWins;
          const won =
            room.settings.mode === 'survival'
              ? wins.blue > 0
              : room.settings.mode === 'last_plane_teams'
              ? (me.team === 'red' && wins.red > wins.blue) || (me.team === 'blue' && wins.blue > wins.red)
              : room.scoreboard[0]?.playerId === me.playerId;
          const result = recordMatch(progressRef.current, { kills: me.kills, won });
          saveProgress(result.progress);
          setProgress(result.progress);
          setNewUnlocks(result.unlocked);
        }
        // 3D podium with the top-3 planes in their own colours
        const teams = room.settings.mode === 'last_plane_teams';
        engine?.showPodium(
          room.scoreboard.slice(0, 3).map((e) => ({
            planeId: e.planeId,
            paintId: e.paintId,
            stickerId: room.players.find((p) => p.id === e.playerId)?.cosmetics.stickerId ?? 'star',
            team: teams ? e.team : 'none',
          }))
        );
      }
    } else {
      document.body.dataset.state = paused ? 'paused' : 'playing';
      engine?.setMode('playing');
      if (room.phase === 'playing' && !paused) {
        const me = room.players.find((p) => p.id === localPlayerIdRef.current);
        soundEngine.startFlightAudio(me?.cosmetics.planeId ?? cosmeticsRef.current.planeId);
      } else {
        soundEngine.stopFlightAudio();
      }
    }
  }, [room, showHangar, paused, engineReady]);
}
