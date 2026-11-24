import {
  computeLagCompensationMs,
  MAX_LAG_COMPENSATION_MS,
  PLANE_SPEED_SCALE,
} from '../shared/constants';
import {
  getFanYawAtTime,
  getPlaneForward,
  quatFromYaw,
  resolveSphereVsCollider,
  stepPlanePhysics,
} from '../shared/flightPhysics';
import { MAPS } from '../shared/maps/index';
import type { MapCollider } from '../shared/maps/types';
import { PLANE_ARCHETYPES } from '../shared/planes';
import { POWERUPS, computeVacuumState, pickRandomPowerUp } from '../shared/powerups';
import {
  applyDamageToSim,
  canDamageTarget,
  checkRoundWinner,
  ensureBothTeams,
  isMatchOver,
} from '../shared/rules';
import type {
  HitFeedbackEvent,
  KillFeedEntry,
  PlaneSimState,
  PlayerInputState,
  PowerUpId,
  SnapshotDestructible,
  SnapshotPayload,
  SnapshotPlane,
  SnapshotPowerUpPickup,
  SnapshotProjectile,
  SnapshotSecondaryProjectile,
} from '../shared/types';
import { computeBotInput } from './bots';
import type { RewindFrame, ServerPlayer, ServerRoom } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function segmentIntersectsSphere(
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

function pointInsideCollider(
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

export function initRoundEntities(room: ServerRoom): void {
  const map = MAPS[room.settings.mapId] ?? MAPS.desk;
  room.projectiles.length = 0;
  room.secondaryProjectiles.length = 0;
  room.powerUps.length = 0;
  room.destroyedColliderIds.clear();
  room.suddenDeath = false;
  room.suddenDeathElapsed = 0;

  room.destructibles = map.destructibles.map((d) => ({
    id: d.id,
    colliderId: d.colliderId,
    kind: d.kind,
    x: d.x,
    y: d.y,
    z: d.z,
    radius: d.radius,
    hp: d.maxHp,
    maxHp: d.maxHp,
    destroyed: false,
    dropsPowerUp: d.dropsPowerUp,
    rewardPool: d.rewardPool,
  }));

  room.powerUpSpots = map.powerUpSpots.map((sp, i) => ({
    id: sp.id,
    x: sp.x,
    y: sp.y,
    z: sp.z,
    // Spawn initial glowing pickups right after takeoff
    respawnTimer: 1.5 + i * 0.4,
  }));
}

export function spawnPlayerAtIndex(
  player: ServerPlayer,
  spawnIndex: number,
  mapId: ServerRoom['settings']['mapId'],
  resetLives: number | null
): void {
  const map = MAPS[mapId] ?? MAPS.desk;
  const sp = map.spawns[spawnIndex % map.spawns.length];
  const arch = PLANE_ARCHETYPES[player.cosmetics.planeId];
  const [qx, qy, qz, qw] = quatFromYaw(sp.yaw);

  const lives = resetLives !== null ? resetLives : player.sim.lives;
  const sim: PlaneSimState = {
    x: sp.x,
    y: sp.y,
    z: sp.z,
    qx,
    qy,
    qz,
    qw,
    speed: arch.cruiseSpeed,
    hp: arch.maxHp,
    maxHp: arch.maxHp,
    boost: 100,
    heat: 0,
    overheated: false,
    barrelRollTimer: 0,
    barrelRollCooldown: 0,
    barrelRollDir: 0,
    invulnTimer: 3.0,
    outOfBoundsTimer: 0,
    alive: lives > 0,
    lives,
    respawnTimer: 0,
    fireCooldown: 0,
    secondaryCooldown: 0,
    hitFlashTimer: 0,
    collideCooldown: 0,
    secondaryPowerUp: null,
    secondaryUses: 0,
    shieldTimer: 0,
    shieldHp: 0,
    turboTimer: 0,
    glueTimer: 0,
    magnetTimer: 0,
  };
  player.sim = sim;
  player.inputQueue.length = 0;
  player.lastInput = null;
  player.idleRepeatTime = 0;
  player.dtBudget = 0.05;
}

export interface LoopCallbacks {
  emitRoomState: (room: ServerRoom) => void;
  emitSnapshot: (room: ServerRoom, snapshot: SnapshotPayload) => void;
  emitHit: (room: ServerRoom, event: HitFeedbackEvent) => void;
  emitKillFeed: (room: ServerRoom, entry: KillFeedEntry) => void;
}

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

function damageDestructible(
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

function activateSecondaryPowerUp(
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

function applyCombatDamage(
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

export function stepRoomTick(
  room: ServerRoom,
  dt: number,
  callbacks: LoopCallbacks
): void {
  const map = MAPS[room.settings.mapId] ?? MAPS.desk;
  const now = Date.now();
  room.tick++;
  room.elapsedTime += dt;

  if (room.phase === 'countdown') {
    room.countdownTimer -= dt;
    if (room.countdownTimer <= 0) {
      room.phase = 'playing';
      room.countdownTimer = 0;
      callbacks.emitRoomState(room);
    }
    return;
  }

  if (room.phase === 'round_end') {
    room.roundEndTimer -= dt;
    if (room.roundEndTimer <= 0) {
      const sb = Array.from(room.players.values()).map((p) => ({ roundWins: p.roundWins }));
      const matchOver = isMatchOver(
        room.settings.mode,
        room.roundNumber,
        room.maxRounds,
        room.teamRoundWins,
        sb
      );
      const isTeams = room.settings.mode === 'last_plane_teams';
      // A team emptied mid-match (player left, bots off): refill it from the other team, or end
      // the match when a single pilot remains — otherwise the next round could only end on the timer.
      const teamsPlayable =
        matchOver || !isTeams || ensureBothTeams(Array.from(room.players.values()));
      if (matchOver || !teamsPlayable) {
        room.phase = 'match_end';
      } else {
        room.roundNumber++;
        room.roundTimer = 240;
        room.lastRoundWinner = null;
        room.roundHadBothTeams = isTeams;
        initRoundEntities(room);
        let idx = 0;
        for (const player of room.players.values()) {
          spawnPlayerAtIndex(player, idx++, room.settings.mapId, room.settings.livesPerRound);
        }
        room.phase = 'countdown';
        room.countdownTimer = 2.4;
      }
      callbacks.emitRoomState(room);
    }
    return;
  }

  if (room.phase !== 'playing') {
    return;
  }

  // Round timer & Sudden Death ("L'aspirateur arrive !")
  if (room.roundTimer > 0) {
    room.roundTimer = Math.max(0, room.roundTimer - dt);
  } else {
    if (!room.suddenDeath) {
      room.suddenDeath = true;
      room.suddenDeathElapsed = 0;
      callbacks.emitRoomState(room);
    }
    room.suddenDeathElapsed += dt;
  }

  const allPlayers = Array.from(room.players.values());

  // 0. Contested glowing power-up spawn zones
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

  // 1. Step each player / bot
  let spawnCounter = 0;
  for (const player of allPlayers) {
    spawnCounter++;
    const arch = PLANE_ARCHETYPES[player.cosmetics.planeId];

    if (!player.sim.alive) {
      if (player.sim.lives > 0 && player.sim.respawnTimer > 0) {
        player.sim.respawnTimer -= dt;
        if (player.sim.respawnTimer <= 0) {
          spawnPlayerAtIndex(
            player,
            spawnCounter + room.tick,
            room.settings.mapId,
            null
          );
        }
      }
      continue;
    }

    let latestInput: PlayerInputState | null = null;
    if (player.isBot) {
      latestInput = computeBotInput(
        player,
        allPlayers,
        room.settings,
        map,
        dt,
        room.elapsedTime,
        room.powerUps
      );
      player.lastProcessedSeq = latestInput.seq;
    } else {
      // Authoritative time budget prevents dt/packet-flood speed & cooldown cheats
      player.dtBudget = Math.min(0.06, player.dtBudget + dt);

      if (player.inputQueue.length > 0) {
        let firedInTick = false;
        let usedSecondaryInTick = false;
        while (player.inputQueue.length > 0 && player.dtBudget >= 0.004) {
          const inp = player.inputQueue.shift()!;
          const reqDt = Math.min(0.05, Math.max(0.005, inp.dt));
          const stepDt = Math.min(reqDt, player.dtBudget);
          player.dtBudget -= stepDt;

          const clampedInp: PlayerInputState = {
            ...inp,
            dt: stepDt,
          };
          const res = stepPlanePhysics(
            player.sim,
            clampedInp,
            arch,
            map,
            room.elapsedTime,
            room.destroyedColliderIds
          );
          player.lastProcessedSeq = clampedInp.seq;
          player.lastInput = {
            ...clampedInp,
            fire: false,
            useSecondary: false,
            barrelRollDir: 0,
          };
          player.idleRepeatTime = 0;
          if (clampedInp.fire) firedInTick = true;
          if (clampedInp.useSecondary) usedSecondaryInTick = true;

          if (res.collidedColliderId) {
            damageDestructible(room, res.collidedColliderId, 22, player.id, callbacks);
          }
          if (res.triggeredHazard) {
            handlePlaneCrashDamage(
              room,
              player,
              res.triggeredHazard.damage,
              'hazard',
              callbacks,
              res.triggeredHazard.nameFr
            );
          } else if (res.collisionDamage > 0) {
            handlePlaneCrashDamage(room, player, res.collisionDamage, 'crash', callbacks);
          }
          latestInput = clampedInp;
        }
        // Discard stale excess queue if client flooded inputs beyond budget
        if (player.inputQueue.length > 6) {
          player.inputQueue.splice(0, player.inputQueue.length - 6);
        }
        if (latestInput) {
          latestInput = {
            ...latestInput,
            fire: firedInTick,
            useSecondary: usedSecondaryInTick,
          };
        }
      } else {
        // Packet-loss smoothing: hold steering/throttle briefly (<=220ms) before returning to neutral
        player.idleRepeatTime += dt;
        const stepDt = Math.min(dt, player.dtBudget);
        player.dtBudget = Math.max(0, player.dtBudget - stepDt);
        const holdLast = player.lastInput !== null && player.idleRepeatTime <= 0.22;
        latestInput = {
          seq: player.lastProcessedSeq,
          dt: stepDt > 0 ? stepDt : dt,
          aimX: holdLast ? player.lastInput!.aimX : 0,
          aimY: holdLast ? player.lastInput!.aimY : 0,
          throttle: holdLast ? player.lastInput!.throttle : 0,
          roll: holdLast ? player.lastInput!.roll : 0,
          boost: holdLast ? player.lastInput!.boost : false,
          fire: false,
          useSecondary: false,
          barrelRollDir: 0,
        };
        const res = stepPlanePhysics(
          player.sim,
          latestInput,
          arch,
          map,
          room.elapsedTime,
          room.destroyedColliderIds
        );
        if (res.collidedColliderId) {
          damageDestructible(room, res.collidedColliderId, 22, player.id, callbacks);
        }
        if (res.triggeredHazard) {
          handlePlaneCrashDamage(
            room,
            player,
            res.triggeredHazard.damage,
            'hazard',
            callbacks,
            res.triggeredHazard.nameFr
          );
        } else if (res.collisionDamage > 0) {
          handlePlaneCrashDamage(room, player, res.collisionDamage, 'crash', callbacks);
        }
      }
    }

    if (player.isBot && latestInput) {
      const res = stepPlanePhysics(
        player.sim,
        latestInput,
        arch,
        map,
        room.elapsedTime,
        room.destroyedColliderIds
      );
      if (res.collidedColliderId) {
        damageDestructible(room, res.collidedColliderId, 22, player.id, callbacks);
      }
      if (res.triggeredHazard) {
        handlePlaneCrashDamage(
          room,
          player,
          res.triggeredHazard.damage,
          'hazard',
          callbacks,
          res.triggeredHazard.nameFr
        );
      } else if (res.collisionDamage > 0) {
        handlePlaneCrashDamage(room, player, res.collisionDamage, 'crash', callbacks);
      }
    }

    // Magnet aura pulls nearby enemies off course & attracts nearby power-ups
    if (player.sim.alive && player.sim.magnetTimer > 0) {
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

    // Power-up pickup collision
    if (player.sim.alive) {
      for (let i = room.powerUps.length - 1; i >= 0; i--) {
        const pu = room.powerUps[i];
        const dist = Math.hypot(pu.x - player.sim.x, pu.y - player.sim.y, pu.z - player.sim.z);
        if (dist < 13) {
          player.sim.secondaryPowerUp = pu.powerUpId;
          player.sim.secondaryUses = POWERUPS[pu.powerUpId].uses;
          if (pu.spotId) {
            const spot = room.powerUpSpots.find((s) => s.id === pu.spotId);
            if (spot) spot.respawnTimer = 14;
          }
          room.powerUps.splice(i, 1);
          break;
        }
      }
    }

    // Out-of-bounds elimination after 4 seconds
    if (player.sim.alive && player.sim.outOfBoundsTimer >= 4.0) {
      handlePlaneCrashDamage(room, player, 9999, 'oob', callbacks);
    }

    // Activate secondary power-up
    if (player.sim.alive && latestInput?.useSecondary) {
      activateSecondaryPowerUp(room, player, callbacks);
    }

    // Firing primary pellet/dart gun
    if (
      player.sim.alive &&
      latestInput?.fire &&
      !player.sim.overheated &&
      player.sim.fireCooldown <= 0
    ) {
      player.sim.fireCooldown = 1 / arch.fireRate;
      player.sim.heat = Math.min(100, player.sim.heat + arch.overheatPerShot);
      if (player.sim.heat >= 100) {
        player.sim.overheated = true;
      }

      const fwd = getPlaneForward(player.sim);
      room.projectiles.push({
        id: room.nextProjectileId++,
        ownerId: player.id,
        team: player.team,
        x: player.sim.x + fwd.x * 7,
        y: player.sim.y + fwd.y * 7,
        z: player.sim.z + fwd.z * 7,
        vx: fwd.x * (arch.projectileSpeed + player.sim.speed * 0.35),
        vy: fwd.y * (arch.projectileSpeed + player.sim.speed * 0.35),
        vz: fwd.z * (arch.projectileSpeed + player.sim.speed * 0.35),
        damage: arch.damage,
        heavy: arch.heavyGun,
        ttl: 1.4,
      });
    }
  }

  // Sudden Death giant cartoon vacuum suction & shrinking safe zone
  if (room.suddenDeath) {
    const vac = computeVacuumState(room.suddenDeathElapsed, map);
    for (const player of allPlayers) {
      if (!player.sim.alive) continue;
      const distCenter = Math.hypot(player.sim.x, player.sim.z);
      if (distCenter > vac.safeRadius && distCenter > 1) {
        // Pull speed follows the (slower) planes, the damage margin follows the room size
        const pull = 55 * PLANE_SPEED_SCALE * dt;
        player.sim.x -= (player.sim.x / distCenter) * pull;
        player.sim.z -= (player.sim.z / distCenter) * pull;
        if (distCenter > vac.safeRadius + 24 * (map.arenaScale ?? 1)) {
          handlePlaneCrashDamage(room, player, 22 * dt, 'vacuum', callbacks);
          if (!player.sim.alive) continue;
        }
      }
      const distNozzle = Math.hypot(
        player.sim.x - vac.nozzleX,
        player.sim.y - vac.nozzleY,
        player.sim.z - vac.nozzleZ
      );
      if (distNozzle < vac.suctionRadius) {
        handlePlaneCrashDamage(room, player, 9999, 'vacuum', callbacks);
      }
    }
  }

  // 2. Record rewind history frame (keep <= 250ms)
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

  // 3. Step primary projectiles & lag-compensated hit detection + destructibles
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

  // 3b. Step secondary projectiles (Missiles élastiques, Bombe à eau, Pétard-fusée, Mine de colle)
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

  // 4. Check round victory condition
  const outcome = checkRoundWinner(
    room.settings.mode,
    allPlayers.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      team: p.team,
      alive: p.sim.alive,
      lives: p.sim.lives,
    })),
    room.roundTimer,
    room.suddenDeathElapsed,
    room.roundHadBothTeams ? { hadBothTeams: true } : undefined
  );

  if (outcome.finished) {
    room.phase = 'round_end';
    room.roundEndTimer = 3.6;
    room.lastRoundWinner = {
      winnerId: outcome.winnerId,
      winnerTeam: outcome.winnerTeam,
      winnerName: outcome.winnerName,
    };

    if (room.settings.mode === 'last_plane_teams') {
      if (outcome.winnerTeam === 'red') room.teamRoundWins.red++;
      else if (outcome.winnerTeam === 'blue') room.teamRoundWins.blue++;
      for (const p of allPlayers) {
        if (p.team === outcome.winnerTeam) {
          p.roundWins++;
          p.score += 200;
        }
      }
    } else if (outcome.winnerId) {
      const winner = room.players.get(outcome.winnerId);
      if (winner) {
        winner.roundWins++;
        winner.score += 250;
      }
    }

    callbacks.emitRoomState(room);
  }
}

function handlePlaneCrashDamage(
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

export function buildCompactSnapshot(room: ServerRoom): SnapshotPayload {
  const map = MAPS[room.settings.mapId] ?? MAPS.desk;
  const wz = map.windZones[0];
  const fanAngle = wz
    ? round3(
        getFanYawAtTime(
          wz.baseYaw,
          wz.sweepAmplitude,
          wz.sweepSpeed,
          room.elapsedTime,
          wz.continuousSpin
        )
      )
    : 0;

  const planes: SnapshotPlane[] = [];
  for (const p of room.players.values()) {
    planes.push({
      id: p.id,
      team: p.team,
      x: round2(p.sim.x),
      y: round2(p.sim.y),
      z: round2(p.sim.z),
      qx: round3(p.sim.qx),
      qy: round3(p.sim.qy),
      qz: round3(p.sim.qz),
      qw: round3(p.sim.qw),
      speed: round2(p.sim.speed),
      hp: Math.round(p.sim.hp),
      boost: Math.round(p.sim.boost),
      heat: Math.round(p.sim.heat),
      overheated: p.sim.overheated,
      alive: p.sim.alive,
      lives: p.sim.lives,
      invuln: p.sim.invulnTimer > 0,
      outOfBounds: round2(p.sim.outOfBoundsTimer),
      barrelRoll: round2(p.sim.barrelRollTimer),
      secondaryPowerUp: p.sim.secondaryPowerUp,
      secondaryUses: p.sim.secondaryUses,
      shielded: p.sim.shieldTimer > 0 && p.sim.shieldHp > 0,
      turboActive: p.sim.turboTimer > 0,
      glued: p.sim.glueTimer > 0,
      magnetActive: p.sim.magnetTimer > 0,
      lastAckSeq: p.lastProcessedSeq,
    });
  }

  const projectiles: SnapshotProjectile[] = room.projectiles.map((pr) => ({
    id: pr.id,
    ownerId: pr.ownerId,
    team: pr.team,
    x: round2(pr.x),
    y: round2(pr.y),
    z: round2(pr.z),
    vx: round2(pr.vx),
    vy: round2(pr.vy),
    vz: round2(pr.vz),
    heavy: pr.heavy,
  }));

  const secondaryProjectiles: SnapshotSecondaryProjectile[] = room.secondaryProjectiles.map((sp) => ({
    id: sp.id,
    kind: sp.kind,
    ownerId: sp.ownerId,
    team: sp.team,
    x: round2(sp.x),
    y: round2(sp.y),
    z: round2(sp.z),
    vx: round2(sp.vx),
    vy: round2(sp.vy),
    vz: round2(sp.vz),
  }));

  const powerUps: SnapshotPowerUpPickup[] = room.powerUps.map((pu) => ({
    id: pu.id,
    powerUpId: pu.powerUpId,
    x: round2(pu.x),
    y: round2(pu.y),
    z: round2(pu.z),
  }));

  const destructibles: SnapshotDestructible[] = room.destructibles.map((d) => ({
    id: d.id,
    hp: Math.round(d.hp),
    maxHp: d.maxHp,
    destroyed: d.destroyed,
  }));

  const vac = room.suddenDeath ? computeVacuumState(room.suddenDeathElapsed, map) : null;

  return {
    tick: room.tick,
    serverTime: Date.now(),
    roundTimer: round2(room.roundTimer),
    suddenDeath: room.suddenDeath,
    fanAngle,
    mapEventTime: round2(room.elapsedTime),
    planes,
    projectiles,
    secondaryProjectiles,
    powerUps,
    destructibles,
    vacuum: vac
      ? {
          active: true,
          x: round2(vac.nozzleX),
          y: round2(vac.nozzleY),
          z: round2(vac.nozzleZ),
          safeRadius: round2(vac.safeRadius),
        }
      : null,
  };
}
