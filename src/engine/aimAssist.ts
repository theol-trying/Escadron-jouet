import { getPlaneForward } from '../../shared/flightPhysics';
import type { PlaneArchetype } from '../../shared/planes';
import type { PlaneSimState, TeamId } from '../../shared/types';

// Aim assist only engages for targets this close to the nose (radians) and within this range
export const AIM_ASSIST_CONE = 0.2;
export const AIM_ASSIST_RANGE = 320;

/** What the assist needs to know about an opponent (a snapshot plane fits). */
export interface AimAssistTarget {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  speed: number;
  alive: boolean;
  invuln: boolean;
  team: TeamId;
}

export type AimAssistShooter = Pick<PlaneSimState, 'x' | 'y' | 'z' | 'qx' | 'qy' | 'qz' | 'qw' | 'speed'>;

/**
 * Light aim assist. When an opponent (with lead for pellet travel time) sits within a small cone
 * around the nose, returns the steering input that would centre it and a blend weight that fades
 * to 0 at the cone edge. The server stays authoritative: this only shapes the input sent.
 * - strength: share of the correction applied at the centre of the cone (0 = off)
 * - myTeam: teammates are skipped ('none' = everyone is an opponent)
 */
export function computeAimAssist(
  sim: AimAssistShooter,
  targets: Iterable<AimAssistTarget>,
  arch: Pick<PlaneArchetype, 'projectileSpeed' | 'turnRate'>,
  strength: number,
  myTeam: TeamId
): { x: number; y: number; weight: number } | null {
  if (strength <= 0) return null;
  const fwd = getPlaneForward(sim);
  const heading = Math.atan2(-fwd.x, -fwd.z);
  const elevation = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
  const pelletSpeed = arch.projectileSpeed + sim.speed * 0.35;

  let best: { yawErr: number; pitchErr: number; score: number } | null = null;
  for (const data of targets) {
    if (!data.alive || data.invuln) continue;
    if (myTeam !== 'none' && data.team === myTeam) continue;
    const dist = Math.hypot(data.x - sim.x, data.y - sim.y, data.z - sim.z);
    if (dist < 8 || dist > AIM_ASSIST_RANGE) continue;
    const tFwd = getPlaneForward(data);
    const lead = dist / pelletSpeed;
    const dx = data.x + tFwd.x * data.speed * lead - sim.x;
    const dy = data.y + tFwd.y * data.speed * lead - sim.y;
    const dz = data.z + tFwd.z * data.speed * lead - sim.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    let yawErr = Math.atan2(-dx, -dz) - heading;
    yawErr = Math.atan2(Math.sin(yawErr), Math.cos(yawErr));
    const pitchErr = Math.asin(Math.max(-1, Math.min(1, dy / d))) - elevation;
    const score = Math.hypot(yawErr, pitchErr);
    if (score > AIM_ASSIST_CONE) continue;
    if (!best || score < best.score) best = { yawErr, pitchErr, score };
  }
  if (!best) return null;

  // Steering that would centre the target in ~0.35 s (heading grows by -aimX·turnRate·dt)
  const tau = 0.35;
  const x = Math.max(-1, Math.min(1, -best.yawErr / (arch.turnRate * tau)));
  const y = Math.max(-1, Math.min(1, best.pitchErr / (arch.turnRate * 0.9 * tau)));
  const weight = strength * (1 - best.score / AIM_ASSIST_CONE);
  return { x, y, weight };
}
