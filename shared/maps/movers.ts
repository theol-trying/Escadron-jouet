import type { MapCollider, MapDefinition } from './types';

/**
 * Moving furniture of a room, computed from the room clock (same time on the server and on every
 * client, like the fan and the fridge): no network message needed.
 * - orbit: toys hanging from a ceiling mobile, turning around a vertical axis;
 * - loop: a toy train running on a closed track (polyline on the floor or on a shelf).
 */
export interface OrbitMover {
  id: string;
  kind: 'orbit';
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  arms: number;
  /** rad/s (positive = anticlockwise seen from above) */
  speed: number;
  /** Size of each hanging toy */
  bodyRadius: number;
  /** Height of the mobile's hook above the toys (for the strings drawn by the client) */
  hangLength: number;
  damage: number;
}

export interface LoopMover {
  id: string;
  kind: 'loop';
  /** Closed track, at height y */
  points: Array<{ x: number; z: number }>;
  y: number;
  /** Distance per second along the track */
  speed: number;
  cars: number;
  carLength: number;
  carRadius: number;
  gap: number;
  damage: number;
}

export type MapMover = OrbitMover | LoopMover;

/** One moving piece: centre and heading (yaw around Y, 0 = facing -Z). */
export interface MoverPiece {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

function trackLength(points: LoopMover['points']): number {
  let len = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    len += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return len;
}

/** Point and heading at distance s along the closed track. */
function pointOnTrack(points: LoopMover['points'], s: number): { x: number; z: number; yaw: number } {
  const total = trackLength(points);
  let d = ((s % total) + total) % total;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= seg || i === points.length - 1) {
      const k = seg > 0 ? Math.min(1, d / seg) : 0;
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)) };
    }
    d -= seg;
  }
  return { x: points[0].x, z: points[0].z, yaw: 0 };
}

/** Where every piece of a mover is at this moment. */
export function moverPieces(m: MapMover, time: number): MoverPiece[] {
  const out: MoverPiece[] = [];
  if (m.kind === 'orbit') {
    for (let i = 0; i < m.arms; i++) {
      const a = m.speed * time + (i * Math.PI * 2) / m.arms;
      const x = m.cx + Math.cos(a) * m.radius;
      const z = m.cz + Math.sin(a) * m.radius;
      // Heading along the circle (direction of motion)
      const dx = -Math.sin(a) * Math.sign(m.speed || 1);
      const dz = Math.cos(a) * Math.sign(m.speed || 1);
      out.push({ x, y: m.cy, z, yaw: Math.atan2(-dx, -dz) });
    }
    return out;
  }
  const s0 = m.speed * time;
  for (let c = 0; c < m.cars; c++) {
    const p = pointOnTrack(m.points, s0 - c * (m.carLength + m.gap));
    out.push({ x: p.x, y: m.y, z: p.z, yaw: p.yaw });
  }
  return out;
}

/** Obstacles of the moving furniture right now (capsules), added to the room's fixed ones. */
export function getMoverColliders(map: MapDefinition, time: number): MapCollider[] {
  const movers = map.movers;
  if (!movers || movers.length === 0) return [];
  const out: MapCollider[] = [];
  for (const m of movers) {
    const pieces = moverPieces(m, time);
    pieces.forEach((p, i) => {
      const half = m.kind === 'orbit' ? m.bodyRadius * 0.6 : m.carLength * 0.5 - m.carRadius;
      const r = m.kind === 'orbit' ? m.bodyRadius : m.carRadius;
      const cy = m.kind === 'orbit' ? p.y : p.y + m.carRadius;
      const dx = -Math.sin(p.yaw);
      const dz = -Math.cos(p.yaw);
      out.push({
        id: `${m.id}_${i}`,
        kind: 'capsule',
        tier: 'static',
        ax: p.x - dx * half,
        ay: cy,
        az: p.z - dz * half,
        bx: p.x + dx * half,
        by: cy,
        bz: p.z + dz * half,
        radius: r,
        damageOnHit: m.damage,
      });
    });
  }
  return out;
}

/**
 * Everything a mover can ever occupy (its whole path), as fixed obstacles: rings, zones and spawn
 * points must keep clear of it.
 */
export function moverSweepColliders(map: MapDefinition): MapCollider[] {
  const out: MapCollider[] = [];
  for (const m of map.movers ?? []) {
    if (m.kind === 'orbit') {
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI * 2) / 24;
        out.push({
          id: `${m.id}_sweep_${i}`,
          kind: 'sphere',
          tier: 'static',
          x: m.cx + Math.cos(a) * m.radius,
          y: m.cy,
          z: m.cz + Math.sin(a) * m.radius,
          radius: m.bodyRadius,
        });
      }
    } else {
      m.points.forEach((a, i) => {
        const b = m.points[(i + 1) % m.points.length];
        out.push({
          id: `${m.id}_sweep_${i}`,
          kind: 'capsule',
          tier: 'static',
          ax: a.x,
          ay: m.y + m.carRadius,
          az: a.z,
          bx: b.x,
          by: m.y + m.carRadius,
          bz: b.z,
          radius: m.carRadius,
        });
      });
    }
  }
  return out;
}

/** Mover in gameplay units (positions and sizes × s; a train keeps its lap time). */
export function scaleMover(m: MapMover, s: number): MapMover {
  if (m.kind === 'orbit') {
    return { ...m, cx: m.cx * s, cy: m.cy * s, cz: m.cz * s, radius: m.radius * s, bodyRadius: m.bodyRadius * s, hangLength: m.hangLength * s };
  }
  return {
    ...m,
    points: m.points.map((p) => ({ x: p.x * s, z: p.z * s })),
    y: m.y * s,
    speed: m.speed * s,
    carLength: m.carLength * s,
    carRadius: m.carRadius * s,
    gap: m.gap * s,
  };
}
