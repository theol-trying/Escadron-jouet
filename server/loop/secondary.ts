import type { MapDefinition } from '../../shared/maps/types';
import { PLANE_ARCHETYPES } from '../../shared/planes';
import { canDamageTarget } from '../../shared/rules';
import type { ServerPlayer, ServerRoom } from '../types';
import type { LoopCallbacks } from './callbacks';
import { applyCombatDamage, damageDestructible } from './damage';
import { pointInsideCollider, round2, segmentIntersectsSphere } from './geometry';

/**
 * Special items in flight: rubber missile (homes gently), water bomb (falls, splashes around),
 * firecracker (fast), glue mine (left behind, sticks the plane that touches it).
 */
export function stepSecondaryProjectiles(
  room: ServerRoom,
  allPlayers: ServerPlayer[],
  map: MapDefinition,
  dt: number,
  callbacks: LoopCallbacks
): void {
  for (let i = room.secondaryProjectiles.length - 1; i >= 0; i--) {
    const sp = room.secondaryProjectiles[i];
    const owner = room.players.get(sp.ownerId);
    const prevX = sp.x;
    const prevY = sp.y;
    const prevZ = sp.z;

    if (sp.kind === 'rubber_missile') {
      // Home gently toward closest valid target
      let bestTarget: ServerPlayer | null = null;
      let bestDist = 240;
      for (const cand of allPlayers) {
        if (!cand.sim.alive) continue;
        if (
          !canDamageTarget(
            room.settings.mode,
            room.settings.friendlyFire,
            sp.ownerId,
            sp.team,
            cand.id,
            cand.team
          )
        ) {
          continue;
        }
        const d = Math.hypot(cand.sim.x - sp.x, cand.sim.y - sp.y, cand.sim.z - sp.z);
        if (d < bestDist) {
          bestDist = d;
          bestTarget = cand;
        }
      }
      if (bestTarget) {
        const curSpeed = Math.hypot(sp.vx, sp.vy, sp.vz) || 250;
        const tx = bestTarget.sim.x - sp.x;
        const ty = bestTarget.sim.y - sp.y;
        const tz = bestTarget.sim.z - sp.z;
        const tLen = Math.hypot(tx, ty, tz) || 1;
        const steer = 4.2 * dt;
        sp.vx += ((tx / tLen) * curSpeed - sp.vx) * steer;
        sp.vy += ((ty / tLen) * curSpeed - sp.vy) * steer;
        sp.vz += ((tz / tLen) * curSpeed - sp.vz) * steer;
        const nLen = Math.hypot(sp.vx, sp.vy, sp.vz) || 1;
        sp.vx = (sp.vx / nLen) * curSpeed;
        sp.vy = (sp.vy / nLen) * curSpeed;
        sp.vz = (sp.vz / nLen) * curSpeed;
      }
    } else if (sp.kind === 'water_bomb') {
      sp.vy -= 85 * dt;
    } else if (sp.kind === 'glue_mine') {
      sp.vx *= 0.94;
      sp.vy *= 0.94;
      sp.vz *= 0.94;
    }

    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.z += sp.vz * dt;
    sp.ttl -= dt;

    const hb = map.hardBounds;
    const hitWallOrFloor =
      sp.x < hb.minX ||
      sp.x > hb.maxX ||
      sp.y < hb.minY ||
      sp.y > hb.maxY ||
      sp.z < hb.minZ ||
      sp.z > hb.maxZ ||
      map.colliders.some(
        (c) =>
          !room.destroyedColliderIds.has(c.id) &&
          pointInsideCollider(sp.x, sp.y, sp.z, c, room.elapsedTime)
      );

    // Check destructibles
    let hitProp = false;
    if (sp.kind !== 'glue_mine') {
      for (const d of room.destructibles) {
        if (d.destroyed) continue;
        if (segmentIntersectsSphere(prevX, prevY, prevZ, sp.x, sp.y, sp.z, d.x, d.y, d.z, d.radius + 2)) {
          damageDestructible(room, d.id, sp.damage, sp.ownerId, callbacks);
          hitProp = true;
          break;
        }
      }
    }

    // Check player hit
    let directTarget: ServerPlayer | null = null;
    const mineArmed = sp.kind !== 'glue_mine' || sp.maxTtl - sp.ttl > 0.35;
    if (mineArmed) {
      for (const target of allPlayers) {
        if (!target.sim.alive) continue;
        if (
          !canDamageTarget(
            room.settings.mode,
            room.settings.friendlyFire,
            sp.ownerId,
            sp.team,
            target.id,
            target.team
          )
        ) {
          continue;
        }
        const hitR = PLANE_ARCHETYPES[target.cosmetics.planeId].hitboxRadius + sp.radius;
        if (
          segmentIntersectsSphere(
            prevX,
            prevY,
            prevZ,
            sp.x,
            sp.y,
            sp.z,
            target.sim.x,
            target.sim.y,
            target.sim.z,
            hitR
          )
        ) {
          directTarget = target;
          break;
        }
      }
    }

    const shouldDetonate =
      sp.kind === 'water_bomb'
        ? sp.ttl <= 0 || hitWallOrFloor || hitProp || directTarget !== null
        : sp.kind === 'glue_mine'
          ? sp.ttl <= 0 || directTarget !== null
          : hitWallOrFloor || hitProp || directTarget !== null || sp.ttl <= 0;

    if (!shouldDetonate) continue;

    if (sp.kind === 'water_bomb' && (sp.ttl <= 0 || hitWallOrFloor || hitProp || directTarget)) {
      const splashRadius = 42;
      for (const target of allPlayers) {
        if (!target.sim.alive) continue;
        if (
          !canDamageTarget(
            room.settings.mode,
            room.settings.friendlyFire,
            sp.ownerId,
            sp.team,
            target.id,
            target.team
          )
        ) {
          continue;
        }
        const d = Math.hypot(target.sim.x - sp.x, target.sim.y - sp.y, target.sim.z - sp.z);
        if (d <= splashRadius) {
          const dmg = Math.round(sp.damage * (1 - 0.55 * (d / splashRadius)));
          applyCombatDamage(
            room,
            target,
            owner,
            dmg,
            sp.x,
            sp.y,
            sp.z,
            'secondary',
            'water_bomb',
            callbacks
          );
        }
      }
      // Splash burst visual
      callbacks.emitHit(room, {
        targetId: directTarget?.id ?? 'splash',
        attackerId: sp.ownerId,
        damage: sp.damage,
        x: round2(sp.x),
        y: round2(sp.y),
        z: round2(sp.z),
        fatal: true,
      });
    } else if (directTarget) {
      if (sp.kind === 'glue_mine') {
        directTarget.sim.glueTimer = 3.5;
      }
      applyCombatDamage(
        room,
        directTarget,
        owner,
        sp.damage,
        sp.x,
        sp.y,
        sp.z,
        'secondary',
        sp.kind,
        callbacks
      );
    }

    room.secondaryProjectiles.splice(i, 1);
  }
}
