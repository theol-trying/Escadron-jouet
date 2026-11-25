import * as THREE from 'three';
import type { PaintId, PlaneId, SnapshotPlane, StickerId } from '../../shared/types';
import type { ActivePlaneVisual } from './engineTypes';
import type { ParticleAndProjectilePool } from './particlePool';
import { buildToyPlane } from './planeBuilder';

/** The planes of a match in the 3D scene: creation, interpolation of the others, live effects. */

export function createPlaneVisual(
  data: SnapshotPlane,
  planeId: PlaneId,
  paintId: PaintId,
  stickerId: StickerId,
  cosmeticsKey: string,
  visible: boolean
): ActivePlaneVisual {
  const rig = buildToyPlane(planeId, paintId, stickerId, data.team);
  rig.root.visible = visible;
  return {
    id: data.id,
    rig,
    cosmeticsKey,
    team: data.team,
    buffer: [],
    interpPos: new THREE.Vector3(data.x, data.y, data.z),
    interpQuat: new THREE.Quaternion(data.qx, data.qy, data.qz, data.qw),
    smokeTimer: 0,
    wasAlive: data.alive,
    hitFlashTimer: 0,
    lastDistToLocal: Infinity,
    flybyCooldown: 0,
  };
}

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

/** Another pilot's plane, shown slightly in the past (renderTime) between the two updates around it. */
export function interpolateRemote(pv: ActivePlaneVisual, renderTime: number): void {
  let a = pv.buffer[0];
  let b = pv.buffer[pv.buffer.length - 1];
  for (let i = 0; i < pv.buffer.length - 1; i++) {
    if (pv.buffer[i].time <= renderTime && pv.buffer[i + 1].time >= renderTime) {
      a = pv.buffer[i];
      b = pv.buffer[i + 1];
      break;
    }
  }
  const span = Math.max(1, b.time - a.time);
  const alpha = Math.max(0, Math.min(1, (renderTime - a.time) / span));
  pv.interpPos.set(
    a.data.x + (b.data.x - a.data.x) * alpha,
    a.data.y + (b.data.y - a.data.y) * alpha,
    a.data.z + (b.data.z - a.data.z) * alpha
  );
  _q1.set(a.data.qx, a.data.qy, a.data.qz, a.data.qw);
  _q2.set(b.data.qx, b.data.qy, b.data.qz, b.data.qw);
  pv.interpQuat.copy(_q1).slerp(_q2, alpha);
}

/**
 * True when another plane just brushed past ours (closest approach just passed): time for the
 * fly-by whoosh. Keeps its own distance memory and cooldown.
 */
export function detectFlyby(
  pv: ActivePlaneVisual,
  latest: SnapshotPlane,
  localPos: THREE.Vector3 | null,
  dt: number
): boolean {
  pv.flybyCooldown = Math.max(0, pv.flybyCooldown - dt);
  if (!localPos || !latest.alive) {
    pv.lastDistToLocal = Infinity;
    return false;
  }
  const dist = pv.interpPos.distanceTo(localPos);
  const passed = pv.lastDistToLocal < 38 && dist > pv.lastDistToLocal && pv.flybyCooldown <= 0 && latest.speed > 30;
  if (passed) pv.flybyCooldown = 1.6;
  pv.lastDistToLocal = dist;
  return passed;
}

const FLASH_ON = new THREE.Color(0xffffff);
const FLASH_OFF = new THREE.Color(0x000000);

/** Propellers and wind-up key, status auras, hit flash and damage smoke of one plane. */
export function animatePlaneVisual(
  pv: ActivePlaneVisual,
  latest: SnapshotPlane,
  maxHp: number,
  dt: number,
  elapsedTime: number,
  pool: ParticleAndProjectilePool
): void {
  const rig = pv.rig;
  const speedSpin = 18 + latest.speed * 0.25;
  for (const prop of rig.propellers) prop.rotation.z += dt * speedSpin;
  if (rig.windupKey) rig.windupKey.rotation.y += dt * (4 + latest.speed * 0.06);

  // Power-up status auras
  rig.shieldMesh.visible = latest.shielded;
  // Spawn protection: pulsing golden lattice so everyone sees why shots do nothing
  const protectedNow = latest.invuln && latest.alive;
  rig.spawnShieldMesh.visible = protectedNow;
  if (protectedNow) {
    rig.spawnShieldMesh.rotation.y += dt * 1.2;
    rig.spawnShieldMesh.rotation.x += dt * 0.5;
    (rig.spawnShieldMesh.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.3 * Math.sin(elapsedTime * 9);
  }
  rig.magnetRingMesh.visible = latest.magnetActive;
  if (latest.magnetActive) {
    rig.magnetRingMesh.rotation.y += dt * 4.5;
  }
  rig.glueBlobMesh.visible = latest.glued;

  // Hit flash feedback
  if (pv.hitFlashTimer > 0) {
    pv.hitFlashTimer = Math.max(0, pv.hitFlashTimer - dt);
    for (const m of rig.hitFlashMaterials) {
      if ('emissive' in m) {
        (m as THREE.MeshStandardMaterial).emissive.copy(pv.hitFlashTimer > 0 ? FLASH_ON : FLASH_OFF);
      }
    }
  }

  // Damage smoke trail when HP < 45%
  if (rig.root.visible && latest.hp < maxHp * 0.45) {
    pv.smokeTimer -= dt;
    if (pv.smokeTimer <= 0) {
      pv.smokeTimer = 0.08;
      pool.spawnSmokePuff(pv.interpPos.x, pv.interpPos.y, pv.interpPos.z, latest.hp < maxHp * 0.25);
    }
  }
}
