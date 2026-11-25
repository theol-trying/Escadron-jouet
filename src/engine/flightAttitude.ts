import { getPlaneForward, getPlaneRight } from '../../shared/flightPhysics';
import type { PlaneSimState } from '../../shared/types';

/**
 * Attitude shown by the cockpit instruments: bank (degrees, > 0 = banked right), pitch (degrees,
 * > 0 = nose up) and vertical speed (cm/s, > 0 = climbing).
 */
export function flightAttitude(sim: Pick<PlaneSimState, 'qx' | 'qy' | 'qz' | 'qw' | 'speed'>): {
  bankDeg: number;
  pitchDeg: number;
  climbRate: number;
} {
  const fwd = getPlaneForward(sim);
  const right = getPlaneRight(sim);
  const upY = 1 - 2 * (sim.qx * sim.qx + sim.qz * sim.qz); // local up · world up
  return {
    bankDeg: (-Math.atan2(right.y, upY) * 180) / Math.PI,
    pitchDeg: (Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180) / Math.PI,
    climbRate: fwd.y * sim.speed,
  };
}
