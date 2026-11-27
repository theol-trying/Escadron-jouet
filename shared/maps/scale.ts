import { ARENA_SCALE, PLANE_SPEED_SCALE } from '../constants';
import { scaleMover } from './movers';
import type { MapCollider, MapDefinition } from './types';

const DEFAULT_WIND_HALF_EXTENT = 35;

function scaleCollider(c: MapCollider, s: number): MapCollider {
  if (c.kind === 'box') {
    return {
      ...c,
      minX: c.minX * s,
      minY: c.minY * s,
      minZ: c.minZ * s,
      maxX: c.maxX * s,
      maxY: c.maxY * s,
      maxZ: c.maxZ * s,
      hinge: c.hinge
        ? {
            ...c.hinge,
            pivotX: c.hinge.pivotX * s,
            pivotZ: c.hinge.pivotZ * s,
            lengthX: c.hinge.lengthX * s,
            thicknessZ: c.hinge.thicknessZ * s,
          }
        : undefined,
    };
  }
  if (c.kind === 'sphere') {
    return { ...c, x: c.x * s, y: c.y * s, z: c.z * s, radius: c.radius * s };
  }
  return {
    ...c,
    ax: c.ax * s,
    ay: c.ay * s,
    az: c.az * s,
    bx: c.bx * s,
    by: c.by * s,
    bz: c.bz * s,
    radius: c.radius * s,
  };
}

function scaleBounds<T extends Record<string, number>>(b: T, s: number): T {
  const out = { ...b };
  for (const key of Object.keys(out) as Array<keyof T>) {
    out[key] = ((out[key] as number) * s) as T[keyof T];
  }
  return out;
}

/**
 * Turns a map authored in design units into its gameplay version: every position and size is
 * multiplied by `s` (about the world origin, like the scaled scene group on the client), and the
 * environmental push speeds by `v` so the fan/updraft keep the same effect on slower planes.
 * Angles, timings, damage and hit points are unchanged.
 */
export function scaleMapDefinition(
  def: MapDefinition,
  s: number = ARENA_SCALE,
  v: number = PLANE_SPEED_SCALE
): MapDefinition {
  return {
    ...def,
    arenaScale: (def.arenaScale ?? 1) * s,
    hardBounds: scaleBounds(def.hardBounds, s),
    softBounds: scaleBounds(def.softBounds, s),
    colliders: def.colliders.map((c) => scaleCollider(c, s)),
    destructibles: def.destructibles.map((d) => ({
      ...d,
      x: d.x * s,
      y: d.y * s,
      z: d.z * s,
      radius: d.radius * s,
    })),
    spawns: def.spawns.map((p) => ({ ...p, x: p.x * s, y: p.y * s, z: p.z * s })),
    windZones: def.windZones.map((w) => ({
      ...w,
      originX: w.originX * s,
      originY: w.originY * s,
      originZ: w.originZ * s,
      range: w.range * s,
      pushStrength: w.pushStrength * v,
      verticalHalfExtent: (w.verticalHalfExtent ?? DEFAULT_WIND_HALF_EXTENT) * s,
    })),
    updraftZones: def.updraftZones.map((u) => ({
      ...u,
      x: u.x * s,
      y: u.y * s,
      z: u.z * s,
      radius: u.radius * s,
      height: u.height * s,
      liftStrength: u.liftStrength * v,
    })),
    hazardZones: def.hazardZones.map((h) => ({
      ...h,
      x: h.x * s,
      y: h.y * s,
      z: h.z * s,
      radius: h.radius * s,
      height: h.height * s,
    })),
    powerUpSpots: def.powerUpSpots.map((p) => ({ ...p, x: p.x * s, y: p.y * s, z: p.z * s })),
    movers: def.movers?.map((m) => scaleMover(m, s)),
    catPath: def.catPath
      ? { ax: def.catPath.ax * s, az: def.catPath.az * s, bx: def.catPath.bx * s, bz: def.catPath.bz * s, y: def.catPath.y * s }
      : undefined,
  };
}
