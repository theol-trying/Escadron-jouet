import { resolveSphereVsCollider } from './flightPhysics';
import type { MapDefinition } from './maps/types';
import type { GameModeId } from './types';

/**
 * Objective modes (no "last plane standing"):
 * - ring_race   « Course d'anneaux » — fly through the rings in order, RACE_LAPS laps; no shooting,
 *               crashes only cost time (respawn at the last ring).
 * - king_of_sky « Roi du ciel » — score while alone inside the moving zone; combat on, unlimited
 *               respawns; first to KING_TARGET seconds wins the round.
 * Both are computed identically on the server (authority) and the client (visuals, HUD).
 */
export const RACE_LAPS = 2;
export const RING_RADIUS = 15;
export const KING_TARGET = 40; // seconds of sole control to win a round
export const KING_ZONE_RADIUS = 42;
export const KING_ZONE_PERIOD = 30; // the zone moves to the next spot every N seconds
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

const courseCache = new Map<string, RaceRing[]>();

/**
 * Ring circuit for a map, built from points known to be in open air (spawn points and power-up
 * spots): ordered around the room, keeping only hops that are not blocked by furniture.
 */
export function getRaceCourse(map: MapDefinition): RaceRing[] {
  const key = `${map.id}:${map.arenaScale ?? 1}`;
  const cached = courseCache.get(key);
  if (cached) return cached;

  const candidates = [...map.spawns, ...map.powerUpSpots]
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

/** The zone cycles through the power-up spots (open, central air) every KING_ZONE_PERIOD. */
export function getKingZone(map: MapDefinition, roundElapsed: number): KingZone {
  const spots = map.powerUpSpots.length > 0 ? map.powerUpSpots : map.spawns;
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
