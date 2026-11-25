import { getFanYawAtTime } from '../../shared/flightPhysics';
import { MAPS } from '../../shared/maps/index';
import { computeVacuumState } from '../../shared/powerups';
import type {
  SnapshotDestructible,
  SnapshotPayload,
  SnapshotPlane,
  SnapshotPowerUpPickup,
  SnapshotProjectile,
  SnapshotSecondaryProjectile,
} from '../../shared/types';
import type { ServerRoom } from '../types';
import { round2, round3 } from './geometry';

/** The state sent to the room ~20 times a second (encoded in binary by shared/snapshotCodec.ts). */
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
      objective: Math.round(p.objective * 10) / 10,
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
