import type { MapDefinition } from '../../shared/maps/types';
import { getRaceCourse } from '../../shared/objectives';
import type { MapId, PaintId, PlaneId } from '../../shared/types';

/**
 * Ghost of the best race, kept on this device per room: the flight of the record, sampled 10 times a
 * second, replayed as a see-through plane in the next races. Pure data helpers (tested).
 */

export const GHOST_SAMPLE_INTERVAL = 0.1; // seconds
const FRAME_SIZE = 8; // t, x, y, z, qx, qy, qz, qw
const MAX_FRAMES = 3000; // 5 minutes

export interface RaceGhost {
  v: 1;
  /** Course fingerprint: a ghost recorded on another circuit is not replayed */
  course: string;
  planeId: PlaneId;
  paintId: PaintId;
  time: number;
  frames: number[];
}

/** Fingerprint of a room's ring circuit (changes if the rings move). */
export function courseKey(map: MapDefinition): string {
  return getRaceCourse(map)
    .map((r) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.z)}`)
    .join(';');
}

export const ghostStorageKey = (mapId: MapId) => `ej_race_ghost_${mapId}`;

const r1 = (n: number) => Math.round(n * 10) / 10 || 0; // (|| 0: no -0, it would not survive JSON)
const r3 = (n: number) => Math.round(n * 1000) / 1000 || 0;

/** Records a flight as it happens. */
export class GhostRecorder {
  private frames: number[] = [];
  private nextAt = 0;

  public reset(): void {
    this.frames = [];
    this.nextAt = 0;
  }

  public get frameCount(): number {
    return this.frames.length / FRAME_SIZE;
  }

  /** Adds a sample when due (every GHOST_SAMPLE_INTERVAL of race time). */
  public sample(t: number, pose: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number }): void {
    if (t < this.nextAt || this.frameCount >= MAX_FRAMES) return;
    this.frames.push(r1(t), r1(pose.x), r1(pose.y), r1(pose.z), r3(pose.qx), r3(pose.qy), r3(pose.qz), r3(pose.qw));
    // Next sample on the 0.1 s grid (stays at 10 per second whatever the frame rate)
    this.nextAt = (Math.floor(t / GHOST_SAMPLE_INTERVAL + 1e-6) + 1) * GHOST_SAMPLE_INTERVAL;
  }

  public finish(course: string, planeId: PlaneId, paintId: PaintId, time: number): RaceGhost {
    return { v: 1, course, planeId, paintId, time, frames: this.frames.slice() };
  }
}

/** Reads a stored ghost; null when missing, broken or recorded on another circuit. */
export function parseGhost(raw: string | null, course: string): RaceGhost | null {
  if (!raw) return null;
  try {
    const g = JSON.parse(raw) as Partial<RaceGhost>;
    if (
      g.v !== 1 ||
      g.course !== course ||
      typeof g.time !== 'number' ||
      !Array.isArray(g.frames) ||
      g.frames.length < FRAME_SIZE * 2 ||
      g.frames.length % FRAME_SIZE !== 0 ||
      !g.frames.every((n) => typeof n === 'number' && Number.isFinite(n))
    ) {
      return null;
    }
    return g as RaceGhost;
  } catch {
    return null;
  }
}

/** True when this finish time deserves to replace the stored ghost. */
export function beatsGhost(time: number, ghost: RaceGhost | null): boolean {
  return ghost === null || time < ghost.time;
}

/**
 * Pose of the ghost at race time t (linear between samples, quaternion normalised), or null
 * before its start / after its finish.
 */
export function ghostPoseAt(
  ghost: RaceGhost,
  t: number
): { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number } | null {
  const f = ghost.frames;
  const n = f.length / FRAME_SIZE;
  if (n < 2 || t < f[0] || t > f[(n - 1) * FRAME_SIZE]) return null;
  // Samples are ~evenly spaced: start from the estimate and walk to the right pair
  let i = Math.min(n - 2, Math.max(0, Math.floor((t - f[0]) / GHOST_SAMPLE_INTERVAL)));
  while (i > 0 && f[i * FRAME_SIZE] > t) i--;
  while (i < n - 2 && f[(i + 1) * FRAME_SIZE] < t) i++;
  const a = i * FRAME_SIZE;
  const b = a + FRAME_SIZE;
  const span = f[b] - f[a];
  const k = span > 0 ? Math.max(0, Math.min(1, (t - f[a]) / span)) : 0;
  const lerp = (o: number) => f[a + o] + (f[b + o] - f[a + o]) * k;
  // Quaternions: take the short way round, then normalise
  const dot = f[a + 4] * f[b + 4] + f[a + 5] * f[b + 5] + f[a + 6] * f[b + 6] + f[a + 7] * f[b + 7];
  const s = dot < 0 ? -1 : 1;
  const q = [4, 5, 6, 7].map((o) => f[a + o] + (s * f[b + o] - f[a + o]) * k);
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return { x: lerp(1), y: lerp(2), z: lerp(3), qx: q[0] / len, qy: q[1] / len, qz: q[2] / len, qw: q[3] / len };
}
