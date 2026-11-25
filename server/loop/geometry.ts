import { resolveSphereVsCollider } from '../../shared/flightPhysics';
import type { MapCollider } from '../../shared/maps/types';

/** Small geometry helpers of the server simulation (hit tests, rounding for the network). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function segmentIntersectsSphere(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  r: number
): boolean {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (lenSq > 1e-6) {
    t = Math.max(0, Math.min(1, ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / lenSq));
  }
  const px = ax + abx * t;
  const py = ay + aby * t;
  const pz = az + abz * t;
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

export function pointInsideCollider(
  x: number,
  y: number,
  z: number,
  col: MapCollider,
  elapsedTime = 0
): boolean {
  if (col.kind === 'box') {
    if (col.hinge) {
      return resolveSphereVsCollider(x, y, z, 0.5, col, elapsedTime) !== null;
    }
    return (
      x >= col.minX &&
      x <= col.maxX &&
      y >= col.minY &&
      y <= col.maxY &&
      z >= col.minZ &&
      z <= col.maxZ
    );
  }
  if (col.kind === 'sphere') {
    const dx = x - col.x;
    const dy = y - col.y;
    const dz = z - col.z;
    return dx * dx + dy * dy + dz * dz <= col.radius * col.radius;
  }
  const abx = col.bx - col.ax;
  const aby = col.by - col.ay;
  const abz = col.bz - col.az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  const t =
    lenSq > 1e-6
      ? Math.max(0, Math.min(1, ((x - col.ax) * abx + (y - col.ay) * aby + (z - col.az) * abz) / lenSq))
      : 0;
  const dx = x - (col.ax + abx * t);
  const dy = y - (col.ay + aby * t);
  const dz = z - (col.az + abz * t);
  return dx * dx + dy * dy + dz * dz <= col.radius * col.radius;
}
