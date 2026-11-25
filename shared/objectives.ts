import { resolveSphereVsCollider } from './flightPhysics';
import type { MapDefinition } from './maps/types';
import type { GameModeId } from './types';

/**
 * Objective modes (no "last plane standing"):
 * - ring_race   « Course d'anneaux » — fly through the rings in order, RACE_LAPS laps; no shooting,
 *               crashes only cost time (respawn at the last ring).
 * - king_of_sky « Roi du ciel » — score inside the moving zone (full rate alone, half rate for the
 *               plane closest to the centre when it is shared); combat on, unlimited respawns;
 *               first to KING_TARGET seconds wins the round.
 * Both are computed identically on the server (authority) and the client (visuals, HUD).
 */
export const RACE_LAPS = 2;
export const RING_RADIUS = 15;
/** Free air required around a ring centre (ring radius + tube + room to fly through it) */
export const RING_CLEARANCE = 26;
export const KING_TARGET = 30; // seconds of zone control to win a round
export const KING_ZONE_RADIUS = 42;
export const KING_ZONE_PERIOD = 30; // the zone moves to the next spot every N seconds
/** Free air required around a zone centre, so the zone is open sky and not a tunnel */
export const KING_ZONE_CLEARANCE = 40;
/** Scoring rate when the zone is shared: only the plane closest to the centre scores, at this rate */
export const KING_CONTESTED_RATE = 0.5;
export const OBJECTIVE_LIVES = 99; // "unlimited" respawns
export const RACE_RESPAWN_DELAY = 1.5;
export const RACE_FINISH_GRACE = 20; // seconds left to the others after the first finisher

export function isObjectiveMode(mode: GameModeId): boolean {
  return mode === 'ring_race' || mode === 'king_of_sky';
}

/** Round length: elimination modes keep 4 minutes (+ sudden death), objective modes 3 minutes. */
export function roundDuration(mode: GameModeId): number {
  return isObjectiveMode(mode) ? 180 : 240;
}

export function canShoot(mode: GameModeId): boolean {
  return mode !== 'ring_race';
}

export interface RaceRing {
  x: number;
  y: number;
  z: number;
  /** Unit direction the ring faces (toward the next ring) */
  nx: number;
  ny: number;
  nz: number;
}

/** True when a straight flight between two points stays clear of the room's obstacles. */
function segmentClear(map: MapDefinition, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const steps = Math.max(2, Math.ceil(len / 6));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    for (const col of map.colliders) {
      // Moving colliders (fridge door…) are checked at two moments of their cycle
      if (resolveSphereVsCollider(x, y, z, 8, col, 0) || resolveSphereVsCollider(x, y, z, 8, col, 5)) return false;
    }
  }
  return true;
}

/** True when a sphere of this radius around the point touches no obstacle (moving ones at two moments). */
function hasClearance(map: MapDefinition, p: { x: number; y: number; z: number }, radius: number): boolean {
  for (const col of map.colliders) {
    if (resolveSphereVsCollider(p.x, p.y, p.z, radius, col, 0) || resolveSphereVsCollider(p.x, p.y, p.z, radius, col, 5)) {
      return false;
    }
  }
  return true;
}

/**
 * True when the point sits in an updraft column (stove, radiator): the lift there is stronger than
 * a dive, so a ring or a zone placed in it cannot be reached from above.
 */
function inUpdraft(map: MapDefinition, p: { x: number; y: number; z: number }, margin: number): boolean {
  return map.updraftZones.some(
    (u) => Math.hypot(p.x - u.x, p.z - u.z) < u.radius + margin && p.y > u.y - margin && p.y < u.y + u.height + margin
  );
}

const courseCache = new Map<string, RaceRing[]>();

/**
 * Ring circuit for a map, built from points known to be in open air (spawn points and power-up
 * spots with RING_CLEARANCE of free air and out of updraft columns, so no ring sits inside an arch,
 * against a tap or above the stove): ordered
 * around the room, keeping only hops that are not blocked by furniture.
 */
export function getRaceCourse(map: MapDefinition): RaceRing[] {
  const key = `${map.id}:${map.arenaScale ?? 1}`;
  const cached = courseCache.get(key);
  if (cached) return cached;

  const candidates = [...map.spawns, ...map.powerUpSpots]
    .filter((p) => hasClearance(map, p, RING_CLEARANCE) && !inUpdraft(map, p, 15))
    .map((p) => ({ x: p.x, y: p.y, z: p.z, a: Math.atan2(p.z, p.x) }))
    .sort((p, q) => p.a - q.a);

  const picked: Array<{ x: number; y: number; z: number }> = [];
  const minSpacing = 60 * (map.arenaScale ?? 1);
  for (const c of candidates) {
    const last = picked[picked.length - 1];
    if (last && Math.hypot(c.x - last.x, c.z - last.z) < minSpacing) continue;
    if (last && !segmentClear(map, last, c)) continue;
    picked.push(c);
  }
  // Close the loop: drop tail points whose hop back to the start is blocked
  while (picked.length > 4 && !segmentClear(map, picked[picked.length - 1], picked[0])) picked.pop();
  const points = picked.length >= 4 ? picked : candidates;

  const rings: RaceRing[] = points.map((p, i) => {
    const n = points[(i + 1) % points.length];
    const dx = n.x - p.x;
    const dy = n.y - p.y;
    const dz = n.z - p.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { x: p.x, y: p.y, z: p.z, nx: dx / len, ny: dy / len, nz: dz / len };
  });
  courseCache.set(key, rings);
  return rings;
}

export interface KingZone {
  x: number;
  y: number;
  z: number;
  radius: number;
  index: number;
  /** Seconds before the zone moves to its next spot */
  movesIn: number;
}

const zoneSpotCache = new Map<string, Array<{ x: number; y: number; z: number }>>();

/**
 * Spots the king zone cycles through: open sky only (KING_ZONE_CLEARANCE of free air, so never a
 * drawer tunnel or the gap under the monitor). Candidates are the power-up spots and the spawn
 * points pulled 40 % toward the middle of the room; kept well apart and ordered around the room.
 */
export function getKingZoneSpots(map: MapDefinition): Array<{ x: number; y: number; z: number }> {
  const key = `${map.id}:${map.arenaScale ?? 1}`;
  const cached = zoneSpotCache.get(key);
  if (cached) return cached;

  const sb = map.softBounds;
  const cx = (sb.minX + sb.maxX) / 2;
  const cz = (sb.minZ + sb.maxZ) / 2;
  const candidates = [
    ...map.powerUpSpots.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    ...map.spawns.map((p) => ({ x: cx + (p.x - cx) * 0.6, y: p.y, z: cz + (p.z - cz) * 0.6 })),
  ]
    .filter((p) => hasClearance(map, p, KING_ZONE_CLEARANCE) && !inUpdraft(map, p, KING_ZONE_RADIUS))
    .map((p) => ({ ...p, a: Math.atan2(p.z - cz, p.x - cx) }))
    .sort((p, q) => p.a - q.a);

  const minSpacing = 85 * (map.arenaScale ?? 1);
  const spots: Array<{ x: number; y: number; z: number }> = [];
  for (const c of candidates) {
    if (spots.some((s) => Math.hypot(c.x - s.x, c.y - s.y, c.z - s.z) < minSpacing)) continue;
    spots.push({ x: c.x, y: c.y, z: c.z });
  }
  const result = spots.length >= 3 ? spots : [{ x: cx, y: (sb.minY + sb.maxY) / 2, z: cz }, ...spots];
  zoneSpotCache.set(key, result);
  return result;
}

/** The zone cycles through the open-sky spots of the room every KING_ZONE_PERIOD. */
export function getKingZone(map: MapDefinition, roundElapsed: number): KingZone {
  const spots = getKingZoneSpots(map);
  const t = Math.max(0, roundElapsed);
  const index = Math.floor(t / KING_ZONE_PERIOD) % spots.length;
  const s = spots[index];
  return {
    x: s.x,
    y: s.y,
    z: s.z,
    radius: KING_ZONE_RADIUS,
    index,
    movesIn: KING_ZONE_PERIOD - (t % KING_ZONE_PERIOD),
  };
}

export interface ZoneControl {
  /** Plane scoring this instant (null when the zone is empty) */
  scorerId: string | null;
  /** Seconds earned per second: 1 alone in the zone, KING_CONTESTED_RATE when shared */
  rate: number;
  /** Number of planes inside the zone */
  inside: number;
}

/**
 * Who scores in the king zone: alone inside = full rate; shared = only the plane closest to the
 * centre scores, at half rate (a crowded zone still pays the boldest pilot). Same rule on the
 * server (authority) and the client (HUD, zone colour).
 */
export function getZoneControl(
  zone: { x: number; y: number; z: number; radius: number },
  planes: Iterable<{ id: string; x: number; y: number; z: number; alive: boolean }>
): ZoneControl {
  let inside = 0;
  let scorerId: string | null = null;
  let best = Infinity;
  for (const p of planes) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - zone.x, p.y - zone.y, p.z - zone.z);
    if (d >= zone.radius) continue;
    inside++;
    if (d < best) {
      best = d;
      scorerId = p.id;
    }
  }
  return { scorerId, rate: inside === 0 ? 0 : inside === 1 ? 1 : KING_CONTESTED_RATE, inside };
}

export interface ObjectivePlayer {
  id: string;
  nickname: string;
  isBot: boolean;
  connected: boolean;
  objective: number; // race: rings passed; king: seconds held
  finishTime: number | null; // race only
}

export interface ObjectiveOutcome {
  finished: boolean;
  winnerId: string | null;
  winnerName: string;
}

/** Round end for objective modes (the timer reaching 0 also ends it: highest objective wins). */
export function checkObjectiveRound(
  mode: GameModeId,
  players: ObjectivePlayer[],
  roundTimerRemaining: number,
  roundElapsed: number,
  raceRingsTotal: number,
  firstFinishAt: number | null
): ObjectiveOutcome {
  const none: ObjectiveOutcome = { finished: false, winnerId: null, winnerName: '' };
  if (players.length === 0) return none;
  const best = (list: ObjectivePlayer[]) =>
    [...list].sort((a, b) => b.objective - a.objective)[0];

  if (mode === 'ring_race') {
    const finishers = players
      .filter((p) => p.finishTime !== null)
      .sort((a, b) => (a.finishTime ?? 0) - (b.finishTime ?? 0));
    const humans = players.filter((p) => !p.isBot && p.connected);
    const allHumansDone = humans.length > 0 && humans.every((p) => p.finishTime !== null);
    const graceOver = firstFinishAt !== null && roundElapsed - firstFinishAt >= RACE_FINISH_GRACE;
    if (finishers.length > 0 && (allHumansDone || graceOver)) {
      return { finished: true, winnerId: finishers[0].id, winnerName: finishers[0].nickname };
    }
    if (roundTimerRemaining <= 0) {
      const top = finishers[0] ?? best(players);
      return top && top.objective > 0
        ? { finished: true, winnerId: top.id, winnerName: top.nickname }
        : { finished: true, winnerId: null, winnerName: 'Égalité' };
    }
    void raceRingsTotal;
    return none;
  }

  // king_of_sky
  const leader = best(players);
  if (leader && leader.objective >= KING_TARGET) {
    return { finished: true, winnerId: leader.id, winnerName: leader.nickname };
  }
  if (roundTimerRemaining <= 0) {
    const tied = players.filter((p) => p.objective === leader?.objective).length > 1;
    return leader && leader.objective > 0 && !tied
      ? { finished: true, winnerId: leader.id, winnerName: leader.nickname }
      : { finished: true, winnerId: null, winnerName: 'Égalité' };
  }
  return none;
}
