import { pickRandomPowerUp } from '../../shared/powerups';
import { applyDamageToSim } from '../../shared/rules';
import type { PowerUpId } from '../../shared/types';
import type { ServerPlayer, ServerRoom } from '../types';
import type { LoopCallbacks } from './callbacks';
import { round2 } from './geometry';

/** Damage to props and planes: hits, kills, crashes, kill feed. */
export function damageDestructible(
  room: ServerRoom,
  colliderOrDestructibleId: string,
  damage: number,
  attackerId: string,
  callbacks: LoopCallbacks
): boolean {
  const d = room.destructibles.find(
    (prop) => !prop.destroyed && (prop.id === colliderOrDestructibleId || prop.colliderId === colliderOrDestructibleId)
  );
  if (!d) return false;

  d.hp = Math.max(0, d.hp - damage);
  if (d.hp > 0) return true;

  d.destroyed = true;
  const breaker = room.players.get(attackerId);
  if (breaker) breaker.propsBroken++;
  room.destroyedColliderIds.add(d.colliderId);

  callbacks.emitHit(room, {
    targetId: d.id,
    attackerId,
    damage,
    x: round2(d.x),
    y: round2(d.y),
    z: round2(d.z),
    fatal: true,
  });

  if (d.dropsPowerUp) {
    const powerUpId = pickRandomPowerUp(Math.random, d.rewardPool);
    room.powerUps.push({
      id: `pu_${room.nextPowerUpId++}`,
      powerUpId,
      x: d.x,
      y: Math.max(24, d.y + 4),
      z: d.z,
    });
  }
  return true;
}

export function applyCombatDamage(
  room: ServerRoom,
  target: ServerPlayer,
  attacker: ServerPlayer | undefined,
  damage: number,
  hx: number,
  hy: number,
  hz: number,
  reason: 'gun' | 'secondary',
  powerUpId: PowerUpId | undefined,
  callbacks: LoopCallbacks
): void {
  const now = Date.now();
  // Spawn protection absorbs the hit entirely: report 0 damage so clients show a light
  // "deflected" spark instead of a full hit (sound + camera shake) that did nothing.
  const absorbedBySpawnProtection = target.sim.invulnTimer > 0;
  const res = applyDamageToSim(target.sim, damage);
  if (!absorbedBySpawnProtection && attacker) {
    target.lastHitBy = attacker.id;
    target.lastHitAt = now;
  }

  callbacks.emitHit(room, {
    targetId: target.id,
    attackerId: attacker?.id ?? target.id,
    damage: res.shieldBlocked || absorbedBySpawnProtection ? 0 : damage,
    x: round2(hx),
    y: round2(hy),
    z: round2(hz),
    fatal: res.eliminated,
  });

  if (res.eliminated) {
    target.deaths++;
    if (attacker && attacker.id !== target.id) {
      attacker.kills++;
      attacker.score += 100;
    }
    callbacks.emitKillFeed(room, {
      id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      killerName: attacker?.nickname ?? 'Inconnu',
      killerTeam: attacker?.team ?? 'none',
      victimName: target.nickname,
      victimTeam: target.team,
      reason,
      powerUpId,
      timestamp: now,
    });
    callbacks.emitRoomState(room);
  }
}

export function handlePlaneCrashDamage(
  room: ServerRoom,
  player: ServerPlayer,
  damage: number,
  reason: 'crash' | 'oob' | 'vacuum' | 'hazard',
  callbacks: LoopCallbacks,
  hazardNameFr?: string
): void {
  const res = applyDamageToSim(player.sim, damage);
  if (res.eliminated) {
    const now = Date.now();
    player.deaths++;
    player.crashes++;
    const recentAttacker =
      player.lastHitBy && now - player.lastHitAt < 5000
        ? room.players.get(player.lastHitBy)
        : null;
    if (recentAttacker && recentAttacker.id !== player.id) {
      recentAttacker.kills++;
      recentAttacker.score += 100;
    }
    callbacks.emitHit(room, {
      targetId: player.id,
      attackerId: recentAttacker?.id ?? player.id,
      damage,
      x: round2(player.sim.x),
      y: round2(player.sim.y),
      z: round2(player.sim.z),
      fatal: true,
    });
    callbacks.emitKillFeed(room, {
      id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      killerName: recentAttacker?.nickname ?? '',
      killerTeam: recentAttacker?.team ?? 'none',
      victimName: player.nickname,
      victimTeam: player.team,
      reason,
      hazardNameFr,
      timestamp: now,
    });
    callbacks.emitRoomState(room);
  }
}
