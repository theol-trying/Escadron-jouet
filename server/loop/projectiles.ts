import { computeLagCompensationMs, MAX_LAG_COMPENSATION_MS } from '../../shared/constants';
import type { MapDefinition } from '../../shared/maps/types';
import { PLANE_ARCHETYPES } from '../../shared/planes';
import { canDamageTarget } from '../../shared/rules';
import type { RewindFrame, ServerPlayer, ServerRoom } from '../types';
import type { LoopCallbacks } from './callbacks';
import { applyCombatDamage, damageDestructible } from './damage';
import { pointInsideCollider, segmentIntersectsSphere } from './geometry';

/* Gun pellets, with lag compensation: a player's shot is tested against where the targets were on
   that player's screen. */

function getRewindSnapshot(room: ServerRoom, rewindMs: number): RewindFrame | null {
  if (room.rewindHistory.length === 0) return null;
  const clampedMs = Math.min(MAX_LAG_COMPENSATION_MS, Math.max(0, rewindMs));
  const targetTime = Date.now() - clampedMs;
  let best = room.rewindHistory[room.rewindHistory.length - 1];
  let bestDiff = Math.abs(best.time - targetTime);
  for (let i = room.rewindHistory.length - 1; i >= 0; i--) {
    const frame = room.rewindHistory[i];
    const diff = Math.abs(frame.time - targetTime);
    if (diff <= bestDiff) {
      best = frame;
      bestDiff = diff;
    } else {
      break;
    }
  }
  return best;
}

/** Keeps where every plane was over the last ~300 ms (lag compensation). */
export function recordRewindFrame(room: ServerRoom, allPlayers: ServerPlayer[], now: number): void {
  const planePositions = new Map<
    string,
    { x: number; y: number; z: number; radius: number; alive: boolean }
  >();
  for (const p of allPlayers) {
    planePositions.set(p.id, {
      x: p.sim.x,
      y: p.sim.y,
      z: p.sim.z,
      radius: PLANE_ARCHETYPES[p.cosmetics.planeId].hitboxRadius + 1.4,
      alive: p.sim.alive,
    });
  }
  room.rewindHistory.push({ time: now, planes: planePositions });
  while (
    room.rewindHistory.length > 0 &&
    now - room.rewindHistory[0].time > MAX_LAG_COMPENSATION_MS + 50
  ) {
    room.rewindHistory.shift();
  }
}

/** Moves the pellets: props, walls and furniture stop them, planes get hit. */
export function stepProjectiles(
  room: ServerRoom,
  allPlayers: ServerPlayer[],
  map: MapDefinition,
  dt: number,
  callbacks: LoopCallbacks
): void {
  for (let i = room.projectiles.length - 1; i >= 0; i--) {
    const proj = room.projectiles[i];
    const prevX = proj.x;
    const prevY = proj.y;
    const prevZ = proj.z;
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    proj.z += proj.vz * dt;
    proj.ttl -= dt;

    if (proj.ttl <= 0) {
      room.projectiles.splice(i, 1);
      continue;
    }

    // Destructible prop hit check first
    let hitDestructible = false;
    for (const d of room.destructibles) {
      if (d.destroyed) continue;
      if (segmentIntersectsSphere(prevX, prevY, prevZ, proj.x, proj.y, proj.z, d.x, d.y, d.z, d.radius + 1.5)) {
        damageDestructible(room, d.id, proj.damage, proj.ownerId, callbacks);
        hitDestructible = true;
        break;
      }
    }
    if (hitDestructible) {
      room.projectiles.splice(i, 1);
      continue;
    }

    // Check world bounds or static obstacle hit (skipping destroyed props)
    const hb = map.hardBounds;
    if (
      proj.x < hb.minX ||
      proj.x > hb.maxX ||
      proj.y < hb.minY ||
      proj.y > hb.maxY ||
      proj.z < hb.minZ ||
      proj.z > hb.maxZ ||
      map.colliders.some(
        (c) =>
          !room.destroyedColliderIds.has(c.id) &&
          pointInsideCollider(proj.x, proj.y, proj.z, c, room.elapsedTime)
      )
    ) {
      room.projectiles.splice(i, 1);
      continue;
    }

    const owner = room.players.get(proj.ownerId);
    const rewind =
      owner && !owner.isBot ? getRewindSnapshot(room, computeLagCompensationMs(owner.ping)) : null;

    let hitPlayer: ServerPlayer | null = null;
    for (const target of allPlayers) {
      if (!target.sim.alive) continue;
      if (
        !canDamageTarget(
          room.settings.mode,
          room.settings.friendlyFire,
          proj.ownerId,
          proj.team,
          target.id,
          target.team
        )
      ) {
        continue;
      }

      const rewoundPos = rewind?.planes.get(target.id);
      const tx = rewoundPos && rewoundPos.alive ? rewoundPos.x : target.sim.x;
      const ty = rewoundPos && rewoundPos.alive ? rewoundPos.y : target.sim.y;
      const tz = rewoundPos && rewoundPos.alive ? rewoundPos.z : target.sim.z;
      const radius =
        PLANE_ARCHETYPES[target.cosmetics.planeId].hitboxRadius + (proj.heavy ? 2.1 : 1.5);

      if (segmentIntersectsSphere(prevX, prevY, prevZ, proj.x, proj.y, proj.z, tx, ty, tz, radius)) {
        hitPlayer = target;
        break;
      }
    }

    if (hitPlayer) {
      applyCombatDamage(
        room,
        hitPlayer,
        owner,
        proj.damage,
        proj.x,
        proj.y,
        proj.z,
        'gun',
        undefined,
        callbacks
      );
      room.projectiles.splice(i, 1);
    }
  }
}
