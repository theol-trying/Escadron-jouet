import { getPlaneForward, stepPlanePhysics } from '../../shared/flightPhysics';
import type { MapDefinition } from '../../shared/maps/types';
import { roundDuration } from '../../shared/objectives';
import type { PlaneArchetype } from '../../shared/planes';
import type { PlayerInputState } from '../../shared/types';
import { computeBotInput } from '../bots';
import type { ServerPlayer, ServerRoom } from '../types';
import type { LoopCallbacks } from './callbacks';
import { damageDestructible, handlePlaneCrashDamage } from './damage';

/** Consequences of a physics step: a prop that was hit takes damage, a hazard or a crash hurts the plane. */
function handleFlightContacts(
  room: ServerRoom,
  player: ServerPlayer,
  res: ReturnType<typeof stepPlanePhysics>,
  callbacks: LoopCallbacks
): void {
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

/**
 * Flies one plane for this tick and returns the input it used (null when none). Bots: their AI.
 * Players: their queued inputs within an authoritative time budget (no speed or cooldown cheats);
 * with no input received, the last steering is held briefly (packet loss) then released.
 */
export function stepPlayerFlight(
  room: ServerRoom,
  player: ServerPlayer,
  allPlayers: ServerPlayer[],
  map: MapDefinition,
  arch: PlaneArchetype,
  dt: number,
  callbacks: LoopCallbacks
): PlayerInputState | null {
  let latestInput: PlayerInputState | null = null;
  if (player.isBot) {
    latestInput = computeBotInput(
      player,
      allPlayers,
      room.settings,
      map,
      dt,
      room.elapsedTime,
      room.powerUps,
      roundDuration(room.settings.mode) - room.roundTimer
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

        handleFlightContacts(room, player, res, callbacks);
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
      handleFlightContacts(room, player, res, callbacks);
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
    handleFlightContacts(room, player, res, callbacks);
  }
  return latestInput;
}

/** Fires the primary gun (cooldown and overheating permitting). */
export function firePrimary(room: ServerRoom, player: ServerPlayer, arch: PlaneArchetype): void {
  if (player.sim.overheated || player.sim.fireCooldown > 0) return;
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
