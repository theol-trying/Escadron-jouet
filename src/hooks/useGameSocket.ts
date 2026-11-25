import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { PROTOCOL_VERSION } from '../../shared/constants';
import { decodeSnapshot, type WireSnapshot } from '../../shared/snapshotCodec';
import type { KillFeedEntry, MapId, PlayerCosmetics, QuickMessage, RoomState } from '../../shared/types';
import { soundEngine } from '../audio/soundEngine';
import type { ThreeGameEngine } from '../engine/ThreeGameEngine';
import { FR } from '../i18n/fr';
import { getSessionToken, getSocket } from '../net/socketClient';

export type JoinMode = 'quick' | 'create' | 'join';

/** A quick message on screen (it fades after QUICK_CHAT_SHOW_MS). */
export interface QuickChatLine extends QuickMessage {
  id: number;
}
const QUICK_CHAT_SHOW_MS = 5000;
let quickChatSeq = 0;

export interface GameSocketDeps {
  engineRef: MutableRefObject<ThreeGameEngine | null>;
  roomRef: MutableRefObject<RoomState | null>;
  nicknameRef: MutableRefObject<string>;
  cosmeticsRef: MutableRefObject<PlayerCosmetics>;
  setConnected: Dispatch<SetStateAction<boolean>>;
  setPing: Dispatch<SetStateAction<number>>;
  setRoom: Dispatch<SetStateAction<RoomState | null>>;
  setLocalPlayerId: Dispatch<SetStateAction<string>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setKillFeed: Dispatch<SetStateAction<KillFeedEntry[]>>;
  setQuickChat: Dispatch<SetStateAction<QuickChatLine[]>>;
  setPaused: Dispatch<SetStateAction<boolean>>;
  setShowHangar: Dispatch<SetStateAction<boolean>>;
}

/**
 * Connection to the game server: joining a room (quick play, create, join by code), automatic
 * rejoin after a network drop, invitation links (?salon=CODE) and ?autostart=1, room state,
 * snapshots, hits, kill feed, ping, and a reload when the server runs a newer build.
 * Returns joinRoom.
 */
export function useGameSocket(deps: GameSocketDeps) {
  const {
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
  } = deps;
  const autostartDoneRef = useRef(false);
  const inviteDoneRef = useRef(false);

  // Join helper
  const joinRoom = useCallback(
    (
      mode: JoinMode,
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

      // Invitation link ?salon=ABCDE: join that room right away, then clean the address bar
      const invitedCode = (params.get('salon') ?? '').trim().toUpperCase();
      if (/^[A-Z]{5}$/.test(invitedCode) && !inviteDoneRef.current && !roomRef.current) {
        inviteDoneRef.current = true;
        params.delete('salon');
        const query = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
        joinRoom('join', invitedCode);
        return;
      }
      if (params.get('autostart') === '1' && !autostartDoneRef.current && !roomRef.current) {
        autostartDoneRef.current = true;
        const rawMap = params.get('map');
        const mapParam: MapId | undefined =
          rawMap === 'desk' || rawMap === 'kitchen' || rawMap === 'garden' || rawMap === 'attic' ? rawMap : undefined;
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

    const onSnapshot = (wire: WireSnapshot) => {
      // Compact binary updates (shared/snapshotCodec.ts) back to the full snapshot
      engineRef.current?.ingestSnapshot(decodeSnapshot(wire));
    };

    const onHit = (ev: Parameters<ThreeGameEngine['ingestHitEvent']>[0]) => {
      engineRef.current?.ingestHitEvent(ev);
    };

    const onKillFeed = (entry: KillFeedEntry) => {
      setKillFeed((prev) => [entry, ...prev].slice(0, 6));
    };

    const onQuickMessage = (msg: QuickMessage) => {
      const line: QuickChatLine = { ...msg, id: ++quickChatSeq };
      setQuickChat((prev) => [...prev, line].slice(-4));
      soundEngine.playUiClick();
      window.setTimeout(() => setQuickChat((prev) => prev.filter((l) => l.id !== line.id)), QUICK_CHAT_SHOW_MS);
    };

    const onRoomError = (msg: string) => {
      setErrorMessage(msg);
    };

    // A server running a newer build: reload once to get the matching client (after a deploy)
    const onServerHello = (info: { protocol: number }) => {
      if (info?.protocol === PROTOCOL_VERSION) return;
      try {
        if (sessionStorage.getItem('ej_reloaded_for') === String(info?.protocol)) return;
        sessionStorage.setItem('ej_reloaded_for', String(info?.protocol));
      } catch {
        // storage unavailable: reload anyway
      }
      window.location.reload();
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
    socket.on('chat:quick', onQuickMessage);
    socket.on('net:probe', onNetProbe);
    socket.on('server:hello', onServerHello);

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
      socket.off('chat:quick', onQuickMessage);
      socket.off('net:probe', onNetProbe);
      socket.off('server:hello', onServerHello);
    };
  }, [joinRoom]);

  return joinRoom;
}
