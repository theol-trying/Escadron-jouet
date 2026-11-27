import type { MapCollider, MapDefinition } from './maps/types';

/**
 * Room events, scheduled from the room clock (server `elapsedTime` = snapshot `mapEventTime`), so
 * the server and every client agree without extra messages:
 * - « Le chat traverse la pièce » — a giant cat walks along the map's catPath: a moving obstacle
 *   (capsule collider) that bumps and hurts planes, and swats at them with a paw now and then (left,
 *   then right: the paw is an obstacle too while it strikes);
 * - « Panne de courant » — the lights go out for a few seconds (visual only).
 * Nothing happens during the first period (the match is still settling).
 */
export const ROOM_EVENT_PERIOD = 70;
export const CAT_DURATION = 10;
export const BLACKOUT_DURATION = 7;
// Cat size in design units (scaled with the room)
export const CAT_RADIUS = 17;
export const CAT_HALF_LENGTH = 30;
export const CAT_DAMAGE = 14;
/** Paw swats: one every CAT_SWIPE_PERIOD seconds, each lasting CAT_SWIPE_DURATION */
export const CAT_SWIPE_PERIOD = 1.6;
export const CAT_SWIPE_DURATION = 0.6;
export const CAT_PAW_RADIUS = 8;

export type RoomEventKind = 'cat' | 'blackout';

export interface ActiveRoomEvent {
  kind: RoomEventKind;
  /** 0 → 1 over the event */
  progress: number;
  duration: number;
}

/** Deterministic pseudo-random number in [0, 1) from an integer seed. */
export function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function mapSeed(map: MapDefinition): number {
  let h = 0;
  for (let i = 0; i < map.id.length; i++) h = (h * 31 + map.id.charCodeAt(i)) % 997;
  return h;
}

export function getRoomEvent(map: MapDefinition, time: number): ActiveRoomEvent | null {
  const w = Math.floor(time / ROOM_EVENT_PERIOD);
  if (w < 1) return null;
  const seed = w + mapSeed(map);
  const kind: RoomEventKind = map.catPath && hash01(seed) < 0.55 ? 'cat' : 'blackout';
  const duration = kind === 'cat' ? CAT_DURATION : BLACKOUT_DURATION;
  const start = w * ROOM_EVENT_PERIOD + 15 + hash01(seed * 7.3) * (ROOM_EVENT_PERIOD - duration - 20);
  if (time < start || time > start + duration) return null;
  return { kind, progress: (time - start) / duration, duration };
}

export interface CatPose {
  x: number;
  y: number;
  z: number;
  /** Heading (radians around Y, 0 = facing -Z) */
  yaw: number;
  /** 0..1 grow at the start / shrink at the end (it sneaks in and out) */
  presence: number;
  progress: number;
}

export function getCatPose(map: MapDefinition, time: number): CatPose | null {
  const ev = getRoomEvent(map, time);
  const path = map.catPath;
  if (!ev || ev.kind !== 'cat' || !path) return null;
  const t = ev.progress;
  const x = path.ax + (path.bx - path.ax) * t;
  const z = path.az + (path.bz - path.az) * t;
  const yaw = Math.atan2(-(path.bx - path.ax), -(path.bz - path.az));
  const presence = Math.min(1, t / 0.08, (1 - t) / 0.08);
  return { x, y: path.y, z, yaw, presence, progress: t };
}

export interface CatPaw {
  /** Paw position in the room (gameplay units) */
  x: number;
  y: number;
  z: number;
  /** Same, in the cat's own frame (design units: +X its right, +Y up, -Z ahead) */
  local: { x: number; y: number; z: number };
  side: 1 | -1;
  /** 0 → 1 over the swat */
  phase: number;
  /** True while the paw strikes (it is an obstacle) */
  striking: boolean;
}

/**
 * The cat swats at the planes (« tente d'attraper les avions avec la patte »): every 1.6 s a front
 * paw rises up and forward in front of its head, sweeps across and comes back down, alternately the
 * left and the right one. Same clock everywhere, like the cat itself.
 */
export function getCatPaw(map: MapDefinition, time: number): CatPaw | null {
  const ev = getRoomEvent(map, time);
  const pose = getCatPose(map, time);
  if (!ev || !pose || pose.presence < 0.9) return null;
  const elapsed = ev.progress * ev.duration;
  const n = Math.floor(elapsed / CAT_SWIPE_PERIOD);
  const inSwipe = elapsed - n * CAT_SWIPE_PERIOD;
  if (n < 1 || inSwipe > CAT_SWIPE_DURATION) return null;
  const phase = inSwipe / CAT_SWIPE_DURATION;
  const side: 1 | -1 = n % 2 === 1 ? 1 : -1;
  const lift = Math.sin(phase * Math.PI);
  const local = {
    x: side * (14 + 22 * lift - 34 * phase * phase),
    y: 10 + 64 * lift,
    z: -30 - 24 * lift,
  };
  const s = map.arenaScale ?? 1;
  const c = Math.cos(pose.yaw);
  const sn = Math.sin(pose.yaw);
  return {
    x: pose.x + (local.x * c + local.z * sn) * s,
    y: pose.y + local.y * s,
    z: pose.z + (-local.x * sn + local.z * c) * s,
    local,
    side,
    phase,
    striking: phase > 0.1 && phase < 0.9,
  };
}

/** Moving obstacles of the current room event (empty most of the time). */
export function getEventColliders(map: MapDefinition, time: number): MapCollider[] {
  const pose = getCatPose(map, time);
  if (!pose || pose.presence < 0.5) return [];
  const s = map.arenaScale ?? 1;
  const dx = -Math.sin(pose.yaw);
  const dz = -Math.cos(pose.yaw);
  const half = CAT_HALF_LENGTH * s;
  const cy = pose.y + CAT_RADIUS * s * 1.15;
  const paw = getCatPaw(map, time);
  return [
    {
      id: 'event_cat',
      kind: 'capsule',
      tier: 'static',
      ax: pose.x - dx * half,
      ay: cy,
      az: pose.z - dz * half,
      bx: pose.x + dx * half,
      by: cy + 8 * s,
      bz: pose.z + dz * half,
      radius: CAT_RADIUS * s,
      damageOnHit: CAT_DAMAGE,
    },
    ...(paw?.striking
      ? [
          {
            id: 'event_cat_paw',
            kind: 'sphere' as const,
            tier: 'static' as const,
            x: paw.x,
            y: paw.y,
            z: paw.z,
            radius: CAT_PAW_RADIUS * s,
            damageOnHit: CAT_DAMAGE,
          },
        ]
      : []),
  ];
}
