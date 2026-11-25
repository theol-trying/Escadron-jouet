import type { SnapshotPayload, SnapshotPlane } from '../../shared/types';

/**
 * The last seconds of the match as received from the server (every update kept ~6.5 s), so that
 * once shot down a pilot can watch the 5 seconds before it again (« revoir l'action »). Pure data
 * helpers, tested; ThreeGameEngine plays it back.
 */

export const REPLAY_BEFORE_MS = 5000;
export const REPLAY_AFTER_MS = 900;
const KEEP_MS = REPLAY_BEFORE_MS + REPLAY_AFTER_MS + 1000;

export interface ReplayFrame {
  /** Arrival time (performance.now) */
  t: number;
  snapshot: SnapshotPayload;
}

export interface ReplayPose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  alive: boolean;
  data: SnapshotPlane;
}

export class ReplayBuffer {
  private frames: ReplayFrame[] = [];

  public push(t: number, snapshot: SnapshotPayload): void {
    this.frames.push({ t, snapshot });
    while (this.frames.length > 0 && this.frames[0].t < t - KEEP_MS) this.frames.shift();
  }

  /** A copy of the updates between from and to (the moment of a crash, kept while the live buffer moves on). */
  public copyWindow(from: number, to: number): ReplayBuffer {
    const clip = new ReplayBuffer();
    clip.frames = this.frames.filter((f) => f.t >= from - 100 && f.t <= to + 100);
    return clip;
  }

  public clear(): void {
    this.frames.length = 0;
  }

  public get length(): number {
    return this.frames.length;
  }

  /** True when the buffer holds the whole window [from, to] (with a little slack at the start). */
  public covers(from: number, to: number): boolean {
    const f = this.frames;
    return f.length >= 2 && f[0].t <= from + 400 && f[f.length - 1].t >= Math.min(to, f[f.length - 1].t);
  }

  /** Index of the last frame at or before t (0 when t is before the first one). */
  public indexAt(t: number): number {
    const f = this.frames;
    let lo = 0;
    let hi = f.length - 1;
    if (hi < 0) return -1;
    if (t >= f[hi].t) return hi;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (f[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  public frameAt(index: number): ReplayFrame | undefined {
    return this.frames[index];
  }

  /** Pose of a plane at time t, between the two updates around it (null if it is not in them). */
  public planePose(id: string, t: number): ReplayPose | null {
    const i = this.indexAt(t);
    if (i < 0) return null;
    const a = this.frames[i];
    const b = this.frames[Math.min(i + 1, this.frames.length - 1)];
    const pa = a.snapshot.planes.find((p) => p.id === id);
    const pb = b.snapshot.planes.find((p) => p.id === id) ?? pa;
    if (!pa || !pb) return null;
    const span = b.t - a.t;
    const k = span > 0 ? Math.max(0, Math.min(1, (t - a.t) / span)) : 0;
    const dot = pa.qx * pb.qx + pa.qy * pb.qy + pa.qz * pb.qz + pa.qw * pb.qw;
    const s = dot < 0 ? -1 : 1;
    const qx = pa.qx + (s * pb.qx - pa.qx) * k;
    const qy = pa.qy + (s * pb.qy - pa.qy) * k;
    const qz = pa.qz + (s * pb.qz - pa.qz) * k;
    const qw = pa.qw + (s * pb.qw - pa.qw) * k;
    const len = Math.hypot(qx, qy, qz, qw) || 1;
    return {
      x: pa.x + (pb.x - pa.x) * k,
      y: pa.y + (pb.y - pa.y) * k,
      z: pa.z + (pb.z - pa.z) * k,
      qx: qx / len,
      qy: qy / len,
      qz: qz / len,
      qw: qw / len,
      // Shown alive until the update where it is not anymore
      alive: k < 1 ? pa.alive : pb.alive,
      data: k < 0.5 ? pa : pb,
    };
  }
}
