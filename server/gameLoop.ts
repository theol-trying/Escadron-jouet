import {
  getFanYawAtTime,
  getPlaneForward,
  quatFromYaw,
  stepPlanePhysics,
} from '../shared/flightPhysics';
import { MAPS } from '../shared/maps/index';
import type { MapCollider } from '../shared/maps/types';
import { PLANE_ARCHETYPES } from '../shared/planes';
import {
  applyDamageToSim,
  canDamageTarget,
  checkRoundWinner,
  isMatchOver,
} from '../shared/rules';
import type {
  HitFeedbackEvent,
  KillFeedEntry,
  PlaneSimState,
  PlayerInputState,
  SnapshotPayload,
  SnapshotPlane,
  SnapshotProjectile,
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

function pointInsideCollider(x: number, y: number, z: number, col: MapCollider): boolean {
  if (col.kind === 'box') {
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
  // capsule rough check
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
    hitFlashTimer: 0,
    collideCooldown: 0,
  };
  player.sim = sim;
  player.inputQueue.length = 0;
}

export interface LoopCallbacks {
  emitRoomState: (room: ServerRoom) => void;
  emitSnapshot: (room: ServerRoom, snapshot: SnapshotPayload) => void;
  emitHit: (room: ServerRoom, event: HitFeedbackEvent) => void;
  emitKillFeed: (room: ServerRoom, entry: KillFeedEntry) => void;
}

function getRewindSnapshot(room: ServerRoom, rewindMs: number): RewindFrame | null {
  if (room.rewindHistory.length === 0) return null;
  const clampedMs = Math.min(200, Math.max(0, rewindMs));
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
      if (isMatchOver(room.settings.mode, room.roundNumber, room.maxRounds, room.teamRoundWins, sb)) {
        room.phase = 'match_end';
      } else {
        room.roundNumber++;
        room.roundTimer = 240;
        room.projectiles.length = 0;
        room.lastRoundWinner = null;
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

  room.roundTimer = Math.max(0, room.roundTimer - dt);
  const allPlayers = Array.from(room.players.values());

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
        room.elapsedTime
      );
      player.lastProcessedSeq = latestInput.seq;
    } else if (player.inputQueue.length > 0) {
      // Drain up to 4 queued inputs per tick to stay responsive without speed-hacking
      const steps = player.inputQueue.splice(0, 4);
      for (const inp of steps) {
        const clampedInp: PlayerInputState = {
          ...inp,
          dt: Math.min(0.05, Math.max(0.005, inp.dt)),
        };
        const res = stepPlanePhysics(player.sim, clampedInp, arch, map, room.elapsedTime);
        player.lastProcessedSeq = clampedInp.seq;
        if (res.collisionDamage > 0) {
          handlePlaneCrashDamage(room, player, res.collisionDamage, 'crash', callbacks);
        }
        latestInput = clampedInp;
      }
    } else {
      // Keep flying forward smoothly if no packet arrived this tick
      latestInput = {
        seq: player.lastProcessedSeq,
        dt,
        aimX: 0,
        aimY: 0,
        throttle: 0,
        roll: 0,
        boost: false,
        fire: false,
        barrelRollDir: 0,
      };
      const res = stepPlanePhysics(player.sim, latestInput, arch, map, room.elapsedTime);
      if (res.collisionDamage > 0) {
        handlePlaneCrashDamage(room, player, res.collisionDamage, 'crash', callbacks);
      }
    }

    if (player.isBot && latestInput) {
      const res = stepPlanePhysics(player.sim, latestInput, arch, map, room.elapsedTime);
      if (res.collisionDamage > 0) {
        handlePlaneCrashDamage(room, player, res.collisionDamage, 'crash', callbacks);
      }
    }

    // Out-of-bounds elimination after 4 seconds
    if (player.sim.alive && player.sim.outOfBoundsTimer >= 4.0) {
      handlePlaneCrashDamage(room, player, 9999, 'oob', callbacks);
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
      const proj = {
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
      };
      room.projectiles.push(proj);
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
  while (room.rewindHistory.length > 0 && now - room.rewindHistory[0].time > 260) {
    room.rewindHistory.shift();
  }

  // 3. Step projectiles & lag-compensated hit detection
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

    // Check world bounds or static obstacle hit
    const hb = map.hardBounds;
    if (
      proj.x < hb.minX ||
      proj.x > hb.maxX ||
      proj.y < hb.minY ||
      proj.y > hb.maxY ||
      proj.z < hb.minZ ||
      proj.z > hb.maxZ ||
      map.colliders.some((c) => pointInsideCollider(proj.x, proj.y, proj.z, c))
    ) {
      room.projectiles.splice(i, 1);
      continue;
    }

    const owner = room.players.get(proj.ownerId);
    const rewind = owner && !owner.isBot ? getRewindSnapshot(room, owner.ping * 0.5) : null;

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
      const res = applyDamageToSim(hitPlayer.sim, proj.damage);
      if (hitPlayer.sim.invulnTimer <= 0) {
        hitPlayer.lastHitBy = proj.ownerId;
        hitPlayer.lastHitAt = now;
      }

      callbacks.emitHit(room, {
        targetId: hitPlayer.id,
        attackerId: proj.ownerId,
        damage: proj.damage,
        x: round2(proj.x),
        y: round2(proj.y),
        z: round2(proj.z),
        fatal: res.eliminated,
      });

      if (res.eliminated) {
        hitPlayer.deaths++;
        if (owner && owner.id !== hitPlayer.id) {
          owner.kills++;
          owner.score += 100;
        }
        callbacks.emitKillFeed(room, {
          id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
          killerName: owner?.nickname ?? 'Inconnu',
          killerTeam: owner?.team ?? 'none',
          victimName: hitPlayer.nickname,
          victimTeam: hitPlayer.team,
          reason: 'gun',
          timestamp: now,
        });
        callbacks.emitRoomState(room);
      }

      room.projectiles.splice(i, 1);
    }
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
    room.roundTimer
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
  reason: 'crash' | 'oob',
  callbacks: LoopCallbacks
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
      timestamp: now,
    });
    callbacks.emitRoomState(room);
  }
}

export function buildCompactSnapshot(room: ServerRoom): SnapshotPayload {
  const map = MAPS[room.settings.mapId] ?? MAPS.desk;
  const wz = map.windZones[0];
  const fanAngle = wz
    ? round3(getFanYawAtTime(wz.baseYaw, wz.sweepAmplitude, wz.sweepSpeed, room.elapsedTime))
    : 0;

  const planes: SnapshotPlane[] = [];
  for (const p of room.players.values()) {
    planes.push({
      id: p.id,
      nickname: p.nickname,
      isBot: p.isBot,
      team: p.team,
      planeId: p.cosmetics.planeId,
      paintId: p.cosmetics.paintId,
      stickerId: p.cosmetics.stickerId,
      x: round2(p.sim.x),
      y: round2(p.sim.y),
      z: round2(p.sim.z),
      qx: round3(p.sim.qx),
      qy: round3(p.sim.qy),
      qz: round3(p.sim.qz),
      qw: round3(p.sim.qw),
      speed: round2(p.sim.speed),
      hp: Math.round(p.sim.hp),
      maxHp: p.sim.maxHp,
      boost: Math.round(p.sim.boost),
      heat: Math.round(p.sim.heat),
      overheated: p.sim.overheated,
      alive: p.sim.alive,
      lives: p.sim.lives,
      invuln: p.sim.invulnTimer > 0,
      outOfBounds: round2(p.sim.outOfBoundsTimer),
      barrelRoll: round2(p.sim.barrelRollTimer),
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

  return {
    tick: room.tick,
    serverTime: Date.now(),
    roundTimer: round2(room.roundTimer),
    fanAngle,
    planes,
    projectiles,
  };
}
