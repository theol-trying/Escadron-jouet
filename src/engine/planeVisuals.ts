import * as THREE from 'three';
import type { PaintId, PlaneId, SnapshotPlane, StickerId } from '../../shared/types';
import type { ActivePlaneVisual } from './engineTypes';
import type { FallingParts } from './fallingParts';
import type { GlowFx } from './glowFx';
import type { ParticleAndProjectilePool } from './particlePool';
import type { SmokeFx } from './smokeFx';
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
    prevQuat: new THREE.Quaternion(data.qx, data.qy, data.qz, data.qw),
    prevPos: new THREE.Vector3(data.x, data.y, data.z),
    ctrl: { roll: 0, pitch: 0, yaw: 0 },
    detached: 0,
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

/** Effects a plane can trigger (smoke, fire glow, parts breaking off) and how many to draw. */
export interface PlaneFx {
  pool: ParticleAndProjectilePool;
  glow: GlowFx;
  smoke: SmokeFx;
  parts: FallingParts;
  /** « Qualité graphique » multiplier on the number of effect particles */
  effects: number;
}

const _dq = new THREE.Quaternion();
const _vel = new THREE.Vector3();
const _rear = new THREE.Vector3();

/**
 * Control surfaces follow how the plane actually turns (works the same for every pilot, from the
 * pose shown on screen): roll moves the ailerons, pitch the elevators, yaw the rudder.
 */
function animateControlSurfaces(pv: ActivePlaneVisual, dt: number): void {
  _dq.copy(pv.prevQuat).invert().multiply(pv.interpQuat);
  if (_dq.w < 0) _dq.set(-_dq.x, -_dq.y, -_dq.z, -_dq.w);
  const inv = dt > 0 ? 2 / dt : 0;
  // Local turn rates (rad/s): +x nose up, +y nose left, -z roll right
  const pitchRate = _dq.x * inv;
  const yawRate = _dq.y * inv;
  const rollRate = -_dq.z * inv;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const k = Math.min(1, dt * 10);
  pv.ctrl.roll += (clamp(rollRate / 2.4) - pv.ctrl.roll) * k;
  pv.ctrl.pitch += (clamp(pitchRate / 1.5) - pv.ctrl.pitch) * k;
  pv.ctrl.yaw += (clamp(yawRate / 1.2) - pv.ctrl.yaw) * k;
  for (const s of pv.rig.controlSurfaces) {
    // A negative turn about X lifts a flap's trailing edge
    if (s.kind === 'aileron') s.obj.rotation.x = s.side * pv.ctrl.roll * 0.45;
    else if (s.kind === 'elevator') s.obj.rotation.x = -pv.ctrl.pitch * 0.4;
    else if (s.kind === 'elevon') s.obj.rotation.x = -pv.ctrl.pitch * 0.35 + s.side * pv.ctrl.roll * 0.35;
    else s.obj.rotation.y = pv.ctrl.yaw * 0.4;
  }
}

/** Parts break off at 60 % and 35 % of the hull, and are back once the plane is repaired or respawns. */
function updateDetachedParts(pv: ActivePlaneVisual, latest: SnapshotPlane, maxHp: number, dt: number, fx: PlaneFx): void {
  const parts = pv.rig.detachables;
  if (parts.length === 0) return;
  const ratio = latest.hp / Math.max(1, maxHp);
  const want = !latest.alive ? pv.detached : ratio < 0.35 ? 2 : ratio < 0.6 ? 1 : 0;
  if (want < pv.detached) {
    for (let i = want; i < parts.length; i++) parts[i].visible = true;
    pv.detached = want;
  }
  while (pv.detached < Math.min(want, parts.length)) {
    const part = parts[pv.detached++];
    if (pv.rig.root.visible && part.visible) {
      _vel.copy(pv.interpPos).sub(pv.prevPos).divideScalar(Math.max(0.001, dt));
      if (_vel.lengthSq() > 250 * 250) _vel.setScalar(0);
      fx.parts.drop(part, _vel);
      part.getWorldPosition(_rear);
      fx.glow.flash(_rear.x, _rear.y, _rear.z, 6, 0xffc46b, 0.25, 0.8);
      fx.pool.spawnBurst(_rear.x, _rear.y, _rear.z, 6, [0xfacc15, 0xffffff, 0xf97316], 30, 0.7, 30, 0.35);
    }
    part.visible = false;
  }
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
  fx: PlaneFx
): void {
  const rig = pv.rig;
  animateControlSurfaces(pv, dt);
  updateDetachedParts(pv, latest, maxHp, dt, fx);
  const speedSpin = 18 + latest.speed * 0.25;
  for (const prop of rig.propellers) prop.rotation.z += dt * speedSpin;
  if (rig.windupKey) rig.windupKey.rotation.y += dt * (4 + latest.speed * 0.06);
  // Insect wings beat very fast
  for (const f of rig.flappers) f.obj.rotation.z = f.side * Math.sin(elapsedTime * 70) * 0.6;

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

  // Damage smoke from the back of the plane: it starts thin and pale, and grows bigger, denser and
  // darker as the hull gets weaker; near the end the engine burns (flickering orange glow)
  const damage = 1 - latest.hp / Math.max(1, maxHp);
  if (rig.root.visible && latest.alive && damage > 0.3) {
    const k = Math.min(1, (damage - 0.3) / 0.65);
    _rear.set(0, 0.4, 3).applyQuaternion(pv.interpQuat).add(pv.interpPos);
    pv.smokeTimer -= dt;
    if (pv.smokeTimer <= 0) {
      pv.smokeTimer = (0.16 - k * 0.12) / Math.max(0.3, fx.effects);
      fx.smoke.puff(_rear.x, _rear.y, _rear.z, k, 2.2 + k * 4, 0.7 + k * 0.9);
    }
    if (damage > 0.7) {
      const flicker = 0.7 + 0.3 * Math.sin(elapsedTime * 31 + pv.interpPos.x) * Math.sin(elapsedTime * 17);
      fx.glow.add(_rear.x, _rear.y, _rear.z, 4.5 * flicker, 0xff7a1a, 0.9);
      fx.glow.add(_rear.x, _rear.y, _rear.z, 2, 0xfff1b0, 0.8 * flicker);
    }
  }
  pv.prevQuat.copy(pv.interpQuat);
  pv.prevPos.copy(pv.interpPos);
}
