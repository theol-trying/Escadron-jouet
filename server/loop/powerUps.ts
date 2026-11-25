import { getPlaneForward } from '../../shared/flightPhysics';
import { POWERUPS, pickRandomPowerUp } from '../../shared/powerups';
import { canDamageTarget } from '../../shared/rules';
import type { ServerPlayer, ServerRoom } from '../types';
import type { LoopCallbacks } from './callbacks';
import { round2 } from './geometry';

/* Power-ups: glowing spots, pickup, magnet aura and the special items themselves. */

/** Glowing power-up spots: a new pickup appears a while after the last one was taken. */
export function respawnSpotPowerUps(room: ServerRoom, dt: number): void {
  for (const spot of room.powerUpSpots) {
    const occupied = room.powerUps.some((p) => p.spotId === spot.id);
    if (!occupied) {
      spot.respawnTimer -= dt;
      if (spot.respawnTimer <= 0) {
        room.powerUps.push({
          id: `pu_${room.nextPowerUpId++}`,
          powerUpId: pickRandomPowerUp(),
          x: spot.x,
          y: spot.y,
          z: spot.z,
          spotId: spot.id,
        });
      }
    }
  }
}

/** Magnet aura: pulls nearby enemies off course and attracts nearby power-ups. */
export function applyMagnet(room: ServerRoom, player: ServerPlayer, allPlayers: ServerPlayer[], dt: number): void {
  if (!player.sim.alive || player.sim.magnetTimer <= 0) return;
  for (const other of allPlayers) {
    if (!other.sim.alive) continue;
    if (
      !canDamageTarget(
        room.settings.mode,
        room.settings.friendlyFire,
        player.id,
        player.team,
        other.id,
        other.team
      )
    ) {
      continue;
    }
    const dx = player.sim.x - other.sim.x;
    const dy = player.sim.y - other.sim.y;
    const dz = player.sim.z - other.sim.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 6 && dist < 95) {
      const pull = ((1 - dist / 95) * 44 * dt) / dist;
      other.sim.x += dx * pull;
      other.sim.y += dy * pull;
      other.sim.z += dz * pull;
    }
  }
  for (const pu of room.powerUps) {
    const dx = player.sim.x - pu.x;
    const dy = player.sim.y - pu.y;
    const dz = player.sim.z - pu.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 2 && dist < 80) {
      const pull = (75 * dt) / dist;
      pu.x += dx * pull;
      pu.y += dy * pull;
      pu.z += dz * pull;
    }
  }
}

/** Flying through a power-up takes it (replaces the item carried). */
export function pickUpPowerUp(room: ServerRoom, player: ServerPlayer): void {
  if (!player.sim.alive) return;
  for (let i = room.powerUps.length - 1; i >= 0; i--) {
    const pu = room.powerUps[i];
    const dist = Math.hypot(pu.x - player.sim.x, pu.y - player.sim.y, pu.z - player.sim.z);
    if (dist < 13) {
      player.sim.secondaryPowerUp = pu.powerUpId;
      player.sim.secondaryUses = POWERUPS[pu.powerUpId].uses;
      player.pickups++;
      if (pu.spotId) {
        const spot = room.powerUpSpots.find((s) => s.id === pu.spotId);
        if (spot) spot.respawnTimer = 14;
      }
      room.powerUps.splice(i, 1);
      break;
    }
  }
}

export function activateSecondaryPowerUp(
  room: ServerRoom,
  player: ServerPlayer,
  callbacks: LoopCallbacks
): void {
  const powerUpId = player.sim.secondaryPowerUp;
  if (!powerUpId || player.sim.secondaryUses <= 0 || player.sim.secondaryCooldown > 0) return;

  player.sim.secondaryCooldown = 0.45;
  player.sim.secondaryUses--;
  if (player.sim.secondaryUses <= 0) {
    player.sim.secondaryPowerUp = null;
  }

  const fwd = getPlaneForward(player.sim);

  if (powerUpId === 'repair_tape') {
    player.sim.hp = Math.min(player.sim.maxHp, player.sim.hp + 45);
    callbacks.emitHit(room, {
      targetId: player.id,
      attackerId: player.id,
      damage: 0,
      x: round2(player.sim.x),
      y: round2(player.sim.y),
      z: round2(player.sim.z),
      fatal: false,
    });
    return;
  }

  if (powerUpId === 'bubble_shield') {
    player.sim.shieldTimer = 7.0;
    player.sim.shieldHp = 60;
    return;
  }

  if (powerUpId === 'turbo_battery') {
    player.sim.turboTimer = 5.5;
    player.sim.boost = 100;
    return;
  }

  if (powerUpId === 'magnet') {
    player.sim.magnetTimer = 6.0;
    return;
  }

  if (powerUpId === 'rubber_missile') {
    const speed = 250;
    room.secondaryProjectiles.push({
      id: room.nextProjectileId++,
      kind: 'rubber_missile',
      ownerId: player.id,
      team: player.team,
      x: player.sim.x + fwd.x * 8,
      y: player.sim.y + fwd.y * 8,
      z: player.sim.z + fwd.z * 8,
      vx: fwd.x * speed,
      vy: fwd.y * speed,
      vz: fwd.z * speed,
      damage: 34,
      radius: 4.0,
      ttl: 3.2,
      maxTtl: 3.2,
    });
    return;
  }

  if (powerUpId === 'water_bomb') {
    const speed = 195;
    room.secondaryProjectiles.push({
      id: room.nextProjectileId++,
      kind: 'water_bomb',
      ownerId: player.id,
      team: player.team,
      x: player.sim.x + fwd.x * 8,
      y: player.sim.y + fwd.y * 8,
      z: player.sim.z + fwd.z * 8,
      vx: fwd.x * speed,
      vy: fwd.y * speed + 28,
      vz: fwd.z * speed,
      damage: 38,
      radius: 4.5,
      ttl: 1.35,
      maxTtl: 1.35,
    });
    return;
  }

  if (powerUpId === 'firecracker') {
    const speed = 520;
    room.secondaryProjectiles.push({
      id: room.nextProjectileId++,
      kind: 'firecracker',
      ownerId: player.id,
      team: player.team,
      x: player.sim.x + fwd.x * 8,
      y: player.sim.y + fwd.y * 8,
      z: player.sim.z + fwd.z * 8,
      vx: fwd.x * speed,
      vy: fwd.y * speed,
      vz: fwd.z * speed,
      damage: 42,
      radius: 3.5,
      ttl: 1.15,
      maxTtl: 1.15,
    });
    return;
  }

  if (powerUpId === 'glue_mine') {
    room.secondaryProjectiles.push({
      id: room.nextProjectileId++,
      kind: 'glue_mine',
      ownerId: player.id,
      team: player.team,
      x: player.sim.x - fwd.x * 10,
      y: player.sim.y - fwd.y * 10,
      z: player.sim.z - fwd.z * 10,
      vx: -fwd.x * 10,
      vy: 0,
      vz: -fwd.z * 10,
      damage: 14,
      radius: 15,
      ttl: 18,
      maxTtl: 18,
    });
  }
}
