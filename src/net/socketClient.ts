import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/types';

export type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: TypedClientSocket | null = null;

export function getSessionToken(): string {
  const key = 'escadrille_session_token';
  try {
    let token = sessionStorage.getItem(key);
    if (!token) {
      token = `s_${Math.random().toString(36).slice(2, 12)}_${Date.now().toString(36)}`;
      sessionStorage.setItem(key, token);
    }
    return token;
  } catch {
    return `s_${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function getSocket(): TypedClientSocket {
  if (!socketInstance) {
    // Same-origin connection with zero hardcoded URL (works on AI Studio preview & Render)
    socketInstance = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 600,
      reconnectionDelayMax: 3000,
    });
  }
  return socketInstance;
}
