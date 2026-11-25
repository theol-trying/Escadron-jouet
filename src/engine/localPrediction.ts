import { stepPlanePhysics } from '../../shared/flightPhysics';
import type { MapDefinition } from '../../shared/maps/types';
import type { PlaneArchetype } from '../../shared/planes';
import type { PlaneSimState, PlayerInputState, SnapshotPlane } from '../../shared/types';

/**
 * Client-side prediction of our own plane: it flies right away with our inputs, then each server
 * update corrects it — authoritative status taken as is, inputs the server has not processed yet
 * replayed on top of its position, and the gap closed smoothly (or at once when it is large).
 */

/** Local simulation state rebuilt from a server update (first update, or back in flight after a crash). */
export function simFromSnapshot(auth: SnapshotPlane, arch: PlaneArchetype): PlaneSimState {
  return {
    x: auth.x,
    y: auth.y,
    z: auth.z,
    qx: auth.qx,
    qy: auth.qy,
    qz: auth.qz,
    qw: auth.qw,
    speed: auth.speed,
    hp: auth.hp,
    maxHp: arch.maxHp,
    boost: auth.boost,
    heat: auth.heat,
    overheated: auth.overheated,
    barrelRollTimer: auth.barrelRoll,
    barrelRollCooldown: 0,
    barrelRollDir: 0,
    invulnTimer: auth.invuln ? 1 : 0,
    outOfBoundsTimer: auth.outOfBounds,
    alive: auth.alive,
    lives: auth.lives,
    respawnTimer: 0,
    fireCooldown: 0,
    secondaryCooldown: 0,
    hitFlashTimer: 0,
    collideCooldown: 0,
    secondaryPowerUp: auth.secondaryPowerUp,
    secondaryUses: auth.secondaryUses,
    shieldTimer: auth.shielded ? 1 : 0,
    shieldHp: auth.shielded ? 60 : 0,
    turboTimer: auth.turboActive ? 1 : 0,
    glueTimer: auth.glued ? 1 : 0,
    magnetTimer: auth.magnetActive ? 1 : 0,
  };
}

/** Above this gap (cm) the predicted plane jumps to the corrected position; below, it glides there. */
export const SNAP_DISTANCE = 16;
export const SMOOTH_SHARE = 0.22;

/**
 * Applies a server update to the predicted plane. `pendingInputs` loses the inputs the server
 * acknowledged. Returns what the player should hear (an item picked up, the bubble popping).
 */
export function reconcileLocalSim(
  sim: PlaneSimState,
  auth: SnapshotPlane,
  pendingInputs: PlayerInputState[],
  arch: PlaneArchetype,
  map: MapDefinition,
  eventTime: number,
  destroyedColliderIds: ReadonlySet<string>
): { pickedUp: boolean; shieldPopped: boolean } {
  const prevPu = sim.secondaryPowerUp;
  const prevUses = sim.secondaryUses;

  // Authoritative health, lives, boost, heat, power-up & status buffs
  sim.hp = auth.hp;
  sim.maxHp = arch.maxHp;
  sim.lives = auth.lives;
  sim.alive = auth.alive;
  sim.invulnTimer = auth.invuln ? 0.5 : 0;
  sim.outOfBoundsTimer = auth.outOfBounds;
  sim.heat = auth.heat;
  sim.overheated = auth.overheated;
  sim.boost = auth.boost;
  sim.secondaryPowerUp = auth.secondaryPowerUp;
  sim.secondaryUses = auth.secondaryUses;
  const shieldPopped = sim.shieldTimer > 0 && !auth.shielded && auth.alive;
  sim.shieldTimer = auth.shielded ? 1 : 0;
  sim.turboTimer = auth.turboActive ? 1 : 0;
  sim.glueTimer = auth.glued ? 1 : 0;
  sim.magnetTimer = auth.magnetActive ? 1 : 0;

  const pickedUp = !!auth.secondaryPowerUp && (auth.secondaryPowerUp !== prevPu || auth.secondaryUses > prevUses);

  // Discard acknowledged inputs
  while (pendingInputs.length > 0 && pendingInputs[0].seq <= auth.lastAckSeq) {
    pendingInputs.shift();
  }

  // Replay unacknowledged inputs from authoritative state
  const replaySim: PlaneSimState = {
    ...sim,
    x: auth.x,
    y: auth.y,
    z: auth.z,
    qx: auth.qx,
    qy: auth.qy,
    qz: auth.qz,
    qw: auth.qw,
    speed: auth.speed,
  };
  for (const inp of pendingInputs) {
    stepPlanePhysics(replaySim, inp, arch, map, eventTime, destroyedColliderIds);
  }

  // Smoothly correct local position without jarring snaps
  const errDist = Math.hypot(replaySim.x - sim.x, replaySim.y - sim.y, replaySim.z - sim.z);
  if (errDist > SNAP_DISTANCE) {
    sim.x = replaySim.x;
    sim.y = replaySim.y;
    sim.z = replaySim.z;
    sim.qx = replaySim.qx;
    sim.qy = replaySim.qy;
    sim.qz = replaySim.qz;
    sim.qw = replaySim.qw;
  } else if (errDist > 0.35) {
    sim.x += (replaySim.x - sim.x) * SMOOTH_SHARE;
    sim.y += (replaySim.y - sim.y) * SMOOTH_SHARE;
    sim.z += (replaySim.z - sim.z) * SMOOTH_SHARE;
  }
  return { pickedUp, shieldPopped };
}
