import type { HazardZoneConfig, MapCollider, MapDefinition } from './maps/types';
import type { PlaneArchetype } from './planes';
import type { PlaneSimState, PlayerInputState, Vec3 } from './types';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function rotateVecByQuat(
  vx: number,
  vy: number,
  vz: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number
): Vec3 {
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

export function mulQuat(
  ax: number,
  ay: number,
  az: number,
  aw: number,
  bx: number,
  by: number,
  bz: number,
  bw: number
): [number, number, number, number] {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatFromAxisAngle(
  ax: number,
  ay: number,
  az: number,
  angle: number
): [number, number, number, number] {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return [ax * s, ay * s, az * s, Math.cos(half)];
}

export function normalizeQuat(
  qx: number,
  qy: number,
  qz: number,
  qw: number
): [number, number, number, number] {
  const len = Math.hypot(qx, qy, qz, qw) || 1;
  return [qx / len, qy / len, qz / len, qw / len];
}

export function quatFromYaw(yaw: number): [number, number, number, number] {
  return quatFromAxisAngle(0, 1, 0, yaw);
}

export function getPlaneForward(state: Pick<PlaneSimState, 'qx' | 'qy' | 'qz' | 'qw'>): Vec3 {
  return rotateVecByQuat(0, 0, -1, state.qx, state.qy, state.qz, state.qw);
}

export function getPlaneUp(state: Pick<PlaneSimState, 'qx' | 'qy' | 'qz' | 'qw'>): Vec3 {
  return rotateVecByQuat(0, 1, 0, state.qx, state.qy, state.qz, state.qw);
}

export function getPlaneRight(state: Pick<PlaneSimState, 'qx' | 'qy' | 'qz' | 'qw'>): Vec3 {
  return rotateVecByQuat(1, 0, 0, state.qx, state.qy, state.qz, state.qw);
}

export function isOutsideSoftBounds(
  x: number,
  y: number,
  z: number,
  map: MapDefinition
): boolean {
  const sb = map.softBounds;
  return (
    x < sb.minX ||
    x > sb.maxX ||
    y < sb.minY ||
    y > sb.maxY ||
    z < sb.minZ ||
    z > sb.maxZ
  );
}

export function getFanYawAtTime(
  baseYaw: number,
  sweepAmplitude: number,
  sweepSpeed: number,
  elapsedTime: number,
  continuousSpin = false
): number {
  if (continuousSpin) {
    return baseYaw + elapsedTime * sweepSpeed;
  }
  return baseYaw + Math.sin(elapsedTime * sweepSpeed) * sweepAmplitude;
}

export function getHingeDoorAngleAtTime(
  maxAngle: number,
  cycleSeconds: number,
  elapsedTime: number
): number {
  const openRatio = 0.5 - 0.5 * Math.cos((elapsedTime * Math.PI * 2) / Math.max(1, cycleSeconds));
  const angle = maxAngle * openRatio;
  return angle === 0 ? 0 : angle;
}

export interface StepPlaneResult {
  collided: boolean;
  collisionDamage: number;
  hitNormal: Vec3 | null;
  collidedColliderId: string | null;
  triggeredHazard: HazardZoneConfig | null;
}

function closestPointOnSegment(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): Vec3 {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq <= 1e-6) return { x: ax, y: ay, z: az };
  const t = clamp(((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lenSq, 0, 1);
  return {
    x: ax + abx * t,
    y: ay + aby * t,
    z: az + abz * t,
  };
}

export function resolveSphereVsCollider(
  sx: number,
  sy: number,
  sz: number,
  radius: number,
  collider: MapCollider,
  elapsedTime = 0
): { nx: number; ny: number; nz: number; depth: number } | null {
  if (collider.kind === 'box') {
    if (collider.hinge) {
      const { pivotX, pivotZ, lengthX, thicknessZ, maxAngle, cycleSeconds } = collider.hinge;
      const angle = getHingeDoorAngleAtTime(maxAngle, cycleSeconds, elapsedTime);
      const cosA = Math.cos(-angle);
      const sinA = Math.sin(-angle);
      const dxp = sx - pivotX;
      const dzp = sz - pivotZ;
      // Transform sphere center into door-local frame (door spans X: 0..lengthX, Z: -thicknessZ/2..thicknessZ/2)
      const lx = dxp * cosA + dzp * sinA;
      const lz = -dxp * sinA + dzp * cosA;
      const halfT = thicknessZ * 0.5;
      const cx = clamp(lx, 0, lengthX);
      const cy = clamp(sy, collider.minY, collider.maxY);
      const cz = clamp(lz, -halfT, halfT);
      const ddx = lx - cx;
      const ddy = sy - cy;
      const ddz = lz - cz;
      const distSq = ddx * ddx + ddy * ddy + ddz * ddz;
      if (distSq >= radius * radius) return null;
      const dist = Math.sqrt(distSq) || 0.001;
      const lnx = distSq > 1e-6 ? ddx / dist : 0;
      const lny = distSq > 1e-6 ? ddy / dist : 0;
      const lnz = distSq > 1e-6 ? ddz / dist : 1;
      const cosFwd = Math.cos(angle);
      const sinFwd = Math.sin(angle);
      return {
        nx: lnx * cosFwd + lnz * sinFwd,
        ny: lny,
        nz: -lnx * sinFwd + lnz * cosFwd,
        depth: radius - dist,
      };
    }

    const cx = clamp(sx, collider.minX, collider.maxX);
    const cy = clamp(sy, collider.minY, collider.maxY);
    const cz = clamp(sz, collider.minZ, collider.maxZ);
    const dx = sx - cx;
    const dy = sy - cy;
    const dz = sz - cz;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq >= radius * radius) return null;

    if (distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      return {
        nx: dx / dist,
        ny: dy / dist,
        nz: dz / dist,
        depth: radius - dist,
      };
    }

    // Sphere center is inside box: push out along nearest face
    const dMinX = Math.abs(sx - collider.minX);
    const dMaxX = Math.abs(collider.maxX - sx);
    const dMinY = Math.abs(sy - collider.minY);
    const dMaxY = Math.abs(collider.maxY - sy);
    const dMinZ = Math.abs(sz - collider.minZ);
    const dMaxZ = Math.abs(collider.maxZ - sz);
    const minDist = Math.min(dMinX, dMaxX, dMinY, dMaxY, dMinZ, dMaxZ);
    if (minDist === dMinX) return { nx: -1, ny: 0, nz: 0, depth: radius + dMinX };
    if (minDist === dMaxX) return { nx: 1, ny: 0, nz: 0, depth: radius + dMaxX };
    if (minDist === dMinY) return { nx: 0, ny: -1, nz: 0, depth: radius + dMinY };
    if (minDist === dMaxY) return { nx: 0, ny: 1, nz: 0, depth: radius + dMaxY };
    if (minDist === dMinZ) return { nx: 0, ny: 0, nz: -1, depth: radius + dMinZ };
    return { nx: 0, ny: 0, nz: 1, depth: radius + dMaxZ };
  }

  if (collider.kind === 'sphere') {
    const dx = sx - collider.x;
    const dy = sy - collider.y;
    const dz = sz - collider.z;
    const minR = radius + collider.radius;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq >= minR * minR) return null;
    const dist = Math.sqrt(distSq) || 0.001;
    return {
      nx: dx / dist,
      ny: dy / dist,
      nz: dz / dist,
      depth: minR - dist,
    };
  }

  // Capsule
  const cp = closestPointOnSegment(
    sx,
    sy,
    sz,
    collider.ax,
    collider.ay,
    collider.az,
    collider.bx,
    collider.by,
    collider.bz
  );
  const dx = sx - cp.x;
  const dy = sy - cp.y;
  const dz = sz - cp.z;
  const minR = radius + collider.radius;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq >= minR * minR) return null;
  const dist = Math.sqrt(distSq) || 0.001;
  return {
    nx: dx / dist,
    ny: dy / dist,
    nz: dz / dist,
    depth: minR - dist,
  };
}

export function stepPlanePhysics(
  state: PlaneSimState,
  input: PlayerInputState,
  archetype: PlaneArchetype,
  map: MapDefinition,
  elapsedTime: number,
  destroyedColliderIds?: ReadonlySet<string>
): StepPlaneResult {
  const dt = clamp(input.dt, 0.001, 0.05);
  const result: StepPlaneResult = {
    collided: false,
    collisionDamage: 0,
    hitNormal: null,
    collidedColliderId: null,
    triggeredHazard: null,
  };

  if (!state.alive) return result;

  // Timers
  if (state.invulnTimer > 0) state.invulnTimer = Math.max(0, state.invulnTimer - dt);
  if (state.hitFlashTimer > 0) state.hitFlashTimer = Math.max(0, state.hitFlashTimer - dt);
  if (state.collideCooldown > 0) state.collideCooldown = Math.max(0, state.collideCooldown - dt);
  if (state.fireCooldown > 0) state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  if (state.secondaryCooldown > 0) {
    state.secondaryCooldown = Math.max(0, state.secondaryCooldown - dt);
  }
  if (state.barrelRollCooldown > 0) {
    state.barrelRollCooldown = Math.max(0, state.barrelRollCooldown - dt);
  }
  if (state.shieldTimer > 0) {
    state.shieldTimer = Math.max(0, state.shieldTimer - dt);
    if (state.shieldTimer <= 0) state.shieldHp = 0;
  }
  if (state.turboTimer > 0) state.turboTimer = Math.max(0, state.turboTimer - dt);
  if (state.glueTimer > 0) state.glueTimer = Math.max(0, state.glueTimer - dt);
  if (state.magnetTimer > 0) state.magnetTimer = Math.max(0, state.magnetTimer - dt);

  // Barrel roll trigger
  if (input.barrelRollDir !== 0 && state.barrelRollTimer <= 0 && state.barrelRollCooldown <= 0) {
    state.barrelRollTimer = 0.34;
    state.barrelRollCooldown = 1.15;
    state.barrelRollDir = input.barrelRollDir;
  }

  // Boost & speed (affected by Pile turbo & Mine de colle)
  const turboActive = state.turboTimer > 0;
  const glued = state.glueTimer > 0;
  const isBoosting = turboActive || (input.boost && state.boost > 1);
  if (turboActive) {
    state.boost = 100;
  } else if (isBoosting) {
    state.boost = Math.max(0, state.boost - 34 * dt);
  } else {
    state.boost = Math.min(100, state.boost + 18 * dt);
  }

  const throttle = clamp(input.throttle, -1, 1);
  let targetSpeed = archetype.cruiseSpeed;
  if (turboActive) {
    targetSpeed = archetype.boostSpeed * 1.15;
  } else if (isBoosting) {
    targetSpeed = archetype.boostSpeed;
  } else if (throttle > 0.05) {
    targetSpeed =
      archetype.cruiseSpeed + (archetype.maxSpeed - archetype.cruiseSpeed) * throttle;
  } else if (throttle < -0.05) {
    targetSpeed =
      archetype.cruiseSpeed + (archetype.cruiseSpeed - archetype.minSpeed) * throttle;
  }
  if (glued) {
    targetSpeed *= 0.56;
  }
  const speedLerp = 1 - Math.exp(-6.5 * dt);
  state.speed += (targetSpeed - state.speed) * speedLerp;

  // Weapon heat cooling
  state.heat = Math.max(0, state.heat - archetype.coolRate * dt);
  if (state.overheated && state.heat <= 22) {
    state.overheated = false;
  }

  // Steering: apply pitch & yaw in world-friendly arcade space while preserving banking
  const aimX = clamp(input.aimX, -1, 1);
  const aimY = clamp(input.aimY, -1, 1);
  const rollInput = clamp(input.roll, -1, 1);
  const effectiveTurnRate = glued ? archetype.turnRate * 0.65 : archetype.turnRate;

  const yawDelta = -aimX * effectiveTurnRate * dt;
  const pitchDelta = aimY * effectiveTurnRate * 0.9 * dt;

  // Rotate quaternion in local space for pitch (local X) and world-up-assisted yaw
  let [qx, qy, qz, qw] = [state.qx, state.qy, state.qz, state.qw];

  // Apply yaw around world Y for intuitive arcade mouse-aim
  const [wyx, wyy, wyz, wyw] = quatFromAxisAngle(0, 1, 0, yawDelta);
  [qx, qy, qz, qw] = mulQuat(wyx, wyy, wyz, wyw, qx, qy, qz, qw);

  // Apply local pitch around local X
  const [px, py, pz, pw] = quatFromAxisAngle(1, 0, 0, pitchDelta);
  [qx, qy, qz, qw] = mulQuat(qx, qy, qz, qw, px, py, pz, pw);

  // Clamp extreme pitch so plane never flips upside down from aim alone
  const forwardCheck = rotateVecByQuat(0, 0, -1, qx, qy, qz, qw);
  if (Math.abs(forwardCheck.y) > 0.9) {
    // Softly push pitch back toward horizon
    const fixPitch = (forwardCheck.y > 0 ? -1 : 1) * (Math.abs(forwardCheck.y) - 0.9) * 1.4;
    const [fx, fy, fz, fw] = quatFromAxisAngle(1, 0, 0, fixPitch);
    [qx, qy, qz, qw] = mulQuat(qx, qy, qz, qw, fx, fy, fz, fw);
  }

  // Manual roll or gentle auto-level with turn banking
  if (state.barrelRollTimer > 0) {
    state.barrelRollTimer = Math.max(0, state.barrelRollTimer - dt);
    const spinRate = (Math.PI * 2) / 0.34;
    const [rx, ry, rz, rw] = quatFromAxisAngle(0, 0, -1, state.barrelRollDir * spinRate * dt);
    [qx, qy, qz, qw] = mulQuat(qx, qy, qz, qw, rx, ry, rz, rw);
  } else if (Math.abs(rollInput) > 0.05) {
    const [rx, ry, rz, rw] = quatFromAxisAngle(0, 0, -1, rollInput * archetype.rollRate * dt);
    [qx, qy, qz, qw] = mulQuat(qx, qy, qz, qw, rx, ry, rz, rw);
  } else {
    // Auto-level toward desired bank angle from aimX (max ~35 deg)
    const up = rotateVecByQuat(0, 1, 0, qx, qy, qz, qw);
    const right = rotateVecByQuat(1, 0, 0, qx, qy, qz, qw);
    const currentBank = Math.atan2(right.y, up.y); // negative = banked right when right.y < 0
    const targetBank = -aimX * 0.58; // bank right when turning right
    const bankError = targetBank - currentBank;
    const autoRoll = clamp(bankError, -1, 1) * 2.8 * dt;
    const [rx, ry, rz, rw] = quatFromAxisAngle(0, 0, -1, -autoRoll);
    [qx, qy, qz, qw] = mulQuat(qx, qy, qz, qw, rx, ry, rz, rw);
  }

  [qx, qy, qz, qw] = normalizeQuat(qx, qy, qz, qw);
  state.qx = qx;
  state.qy = qy;
  state.qz = qz;
  state.qw = qw;

  // Move forward
  const fwd = rotateVecByQuat(0, 0, -1, qx, qy, qz, qw);
  let nx = state.x + fwd.x * state.speed * dt;
  let ny = state.y + fwd.y * state.speed * dt;
  let nz = state.z + fwd.z * state.speed * dt;

  // Barrel roll lateral dodge burst
  if (state.barrelRollTimer > 0) {
    const right = rotateVecByQuat(1, 0, 0, qx, qy, qz, qw);
    const dodgeSpeed = 48;
    nx += right.x * state.barrelRollDir * dodgeSpeed * dt;
    ny += right.y * state.barrelRollDir * dodgeSpeed * dt;
    nz += right.z * state.barrelRollDir * dodgeSpeed * dt;
  }

  // Dynamic wind zones (e.g., oscillating desk fan or spinning lawn sprinkler)
  for (const wz of map.windZones) {
    const dx = nx - wz.originX;
    const dy = ny - wz.originY;
    const dz = nz - wz.originZ;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 2 && dist < wz.range) {
      const fanYaw = getFanYawAtTime(
        wz.baseYaw,
        wz.sweepAmplitude,
        wz.sweepSpeed,
        elapsedTime,
        wz.continuousSpin
      );
      const dirX = -Math.sin(fanYaw);
      const dirZ = -Math.cos(fanYaw);
      const dot = (dx * dirX + dz * dirZ) / dist;
      if (dot > Math.cos(wz.coneHalfAngle) && Math.abs(dy) < (wz.verticalHalfExtent ?? 35)) {
        const falloff = 1 - dist / wz.range;
        nx += dirX * wz.pushStrength * falloff * dt;
        nz += dirZ * wz.pushStrength * falloff * dt;
      }
    }
  }

  // Thermal updraft zones (e.g., kitchen stove burner)
  for (const uz of map.updraftZones) {
    const horiz = Math.hypot(nx - uz.x, nz - uz.z);
    if (horiz <= uz.radius && ny >= uz.y - 4 && ny <= uz.y + uz.height) {
      const radialFalloff = 1 - (horiz / uz.radius) * 0.45;
      ny += uz.liftStrength * radialFalloff * dt;
    }
  }

  // Collisions against map colliders
  const r = archetype.hitboxRadius;
  for (const col of map.colliders) {
    if (destroyedColliderIds?.has(col.id)) continue;
    const hit = resolveSphereVsCollider(nx, ny, nz, r, col, elapsedTime);
    if (hit) {
      nx += hit.nx * (hit.depth + 0.3);
      ny += hit.ny * (hit.depth + 0.3);
      nz += hit.nz * (hit.depth + 0.3);

      // Gently deflect orientation away from surface normal if flying into it
      const dot = fwd.x * hit.nx + fwd.y * hit.ny + fwd.z * hit.nz;
      if (dot < -0.1) {
        // Compute deflected forward direction
        const reflX = fwd.x - 1.45 * dot * hit.nx;
        const reflY = fwd.y - 1.45 * dot * hit.ny;
        const reflZ = fwd.z - 1.45 * dot * hit.nz;
        const rLen = Math.hypot(reflX, reflY, reflZ) || 1;
        const targetYaw = Math.atan2(-reflX / rLen, -reflZ / rLen);
        const targetPitch = Math.asin(clamp(reflY / rLen, -0.75, 0.75));
        const [yq0, yq1, yq2, yq3] = quatFromAxisAngle(0, 1, 0, targetYaw);
        const [pq0, pq1, pq2, pq3] = quatFromAxisAngle(1, 0, 0, targetPitch);
        const [nq0, nq1, nq2, nq3] = normalizeQuat(
          ...mulQuat(yq0, yq1, yq2, yq3, pq0, pq1, pq2, pq3)
        );
        state.qx = nq0;
        state.qy = nq1;
        state.qz = nq2;
        state.qw = nq3;
        state.speed = Math.max(archetype.minSpeed, state.speed * 0.72);
      }

      result.collided = true;
      result.hitNormal = { x: hit.nx, y: hit.ny, z: hit.nz };
      result.collidedColliderId = col.id;

      if (state.collideCooldown <= 0 && state.invulnTimer <= 0) {
        const dmg = col.damageOnHit ?? Math.round(clamp((state.speed / archetype.maxSpeed) * 14, 6, 16));
        result.collisionDamage = dmg;
        state.collideCooldown = 0.55;
      }
      break;
    }
  }

  // Deadly map hazard zones (e.g., spinning blender blades)
  if (state.invulnTimer <= 0) {
    for (const hz of map.hazardZones) {
      const horiz = Math.hypot(nx - hz.x, nz - hz.z);
      if (horiz <= hz.radius + r * 0.6 && ny >= hz.y - 4 && ny <= hz.y + hz.height) {
        result.triggeredHazard = hz;
        break;
      }
    }
  }

  // Hard room bounds clamp & soft deflection
  const hb = map.hardBounds;
  if (nx < hb.minX + r) {
    nx = hb.minX + r;
    result.collided = true;
  } else if (nx > hb.maxX - r) {
    nx = hb.maxX - r;
    result.collided = true;
  }
  if (ny < hb.minY + r) {
    ny = hb.minY + r;
    // Gently pull nose level if scraping floor
    if (fwd.y < -0.05) {
      const [fx, fy, fz, fw] = quatFromAxisAngle(1, 0, 0, 0.15);
      const [nq0, nq1, nq2, nq3] = normalizeQuat(
        ...mulQuat(state.qx, state.qy, state.qz, state.qw, fx, fy, fz, fw)
      );
      state.qx = nq0;
      state.qy = nq1;
      state.qz = nq2;
      state.qw = nq3;
    }
    result.collided = true;
  } else if (ny > hb.maxY - r) {
    ny = hb.maxY - r;
    if (fwd.y > 0.05) {
      const [fx, fy, fz, fw] = quatFromAxisAngle(1, 0, 0, -0.15);
      const [nq0, nq1, nq2, nq3] = normalizeQuat(
        ...mulQuat(state.qx, state.qy, state.qz, state.qw, fx, fy, fz, fw)
      );
      state.qx = nq0;
      state.qy = nq1;
      state.qz = nq2;
      state.qw = nq3;
    }
    result.collided = true;
  }
  if (nz < hb.minZ + r) {
    nz = hb.minZ + r;
    result.collided = true;
  } else if (nz > hb.maxZ - r) {
    nz = hb.maxZ - r;
    result.collided = true;
  }

  state.x = nx;
  state.y = ny;
  state.z = nz;

  // Out-of-bounds timer
  if (isOutsideSoftBounds(nx, ny, nz, map)) {
    state.outOfBoundsTimer += dt;
  } else {
    state.outOfBoundsTimer = 0;
  }

  return result;
}
