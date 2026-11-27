import { getFanYawAtTime, resolveSphereVsCollider } from '../../shared/flightPhysics';
import { getMoverColliders } from '../../shared/maps/movers';
import type { MapCollider, MapDefinition } from '../../shared/maps/types';
import { getEventColliders } from '../../shared/roomEvents';

export interface RoomContact {
  /** Point on the surface being touched */
  x: number;
  y: number;
  z: number;
  /** Surface normal, pointing away from the surface (toward the plane) */
  nx: number;
  ny: number;
  nz: number;
}

/** Everything that moves in the room at this moment (mobile, toy train, the event cat). */
export function movingColliders(map: MapDefinition, time: number): MapCollider[] {
  return [...getMoverColliders(map, time), ...getEventColliders(map, time)];
}

/**
 * Is a plane (sphere of radius r) touching the room — furniture, moving pieces, the cat, the walls,
 * floor or ceiling? Used for the sparks when a plane scrapes along something.
 */
export function roomContact(
  map: MapDefinition,
  x: number,
  y: number,
  z: number,
  r: number,
  time: number,
  destroyed?: Set<string>,
  /** What moves right now (mobile, train, cat), if already computed for this frame */
  moving?: MapCollider[]
): RoomContact | null {
  const hb = map.hardBounds;
  if (x - hb.minX < r) return { x: hb.minX, y, z, nx: 1, ny: 0, nz: 0 };
  if (hb.maxX - x < r) return { x: hb.maxX, y, z, nx: -1, ny: 0, nz: 0 };
  if (z - hb.minZ < r) return { x, y, z: hb.minZ, nx: 0, ny: 0, nz: 1 };
  if (hb.maxZ - z < r) return { x, y, z: hb.maxZ, nx: 0, ny: 0, nz: -1 };
  if (y - hb.minY < r) return { x, y: hb.minY, z, nx: 0, ny: 1, nz: 0 };
  if (hb.maxY - y < r) return { x, y: hb.maxY, z, nx: 0, ny: -1, nz: 0 };
  const check = (cols: Iterable<MapCollider>) => {
    for (const col of cols) {
      if (destroyed?.has(col.id)) continue;
      const hit = resolveSphereVsCollider(x, y, z, r, col, time);
      if (hit) {
        const d = r - hit.depth;
        return { x: x - hit.nx * d, y: y - hit.ny * d, z: z - hit.nz * d, nx: hit.nx, ny: hit.ny, nz: hit.nz };
      }
    }
    return null;
  };
  return check(map.colliders) ?? check(moving ?? [...getMoverColliders(map, time), ...getEventColliders(map, time)]);
}

/** Is this point inside the water jet of a spinning lawn sprinkler (the spinning wind zones)? */
export function inSprinklerSpray(map: MapDefinition, x: number, y: number, z: number, time: number): boolean {
  for (const wz of map.windZones) {
    if (!wz.continuousSpin) continue;
    const dx = x - wz.originX;
    const dy = y - wz.originY;
    const dz = z - wz.originZ;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 2 || dist > wz.range) continue;
    const yaw = getFanYawAtTime(wz.baseYaw, wz.sweepAmplitude, wz.sweepSpeed, time, true);
    const dot = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / dist;
    if (dot > Math.cos(wz.coneHalfAngle) && Math.abs(dy) < (wz.verticalHalfExtent ?? 35)) return true;
  }
  return false;
}
