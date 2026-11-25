import { MAPS } from '../shared/maps/index';
import { canShoot, hasNoSuddenDeath, isSurvival, roundDuration } from '../shared/objectives';
import { PLANE_ARCHETYPES } from '../shared/planes';
import type { LoopCallbacks } from './loop/callbacks';
import { handlePlaneCrashDamage } from './loop/damage';
import { firePrimary, stepPlayerFlight } from './loop/flight';
import { scoreObjectives } from './loop/objectivesTick';
import { activateSecondaryPowerUp, applyMagnet, pickUpPowerUp, respawnSpotPowerUps } from './loop/powerUps';
import { recordRewindFrame, stepProjectiles } from './loop/projectiles';
import { settleRound, stepRespawn, stepRoundEnd } from './loop/round';
import { stepSecondaryProjectiles } from './loop/secondary';
import { applySuddenDeath } from './loop/suddenDeath';
import { stepSurvival, survivalOutcome } from './survival';
import type { ServerRoom } from './types';

export type { LoopCallbacks } from './loop/callbacks';
export { initRoundEntities, roundLives, spawnPlayerAtIndex } from './loop/round';
export { buildCompactSnapshot } from './loop/snapshot';

/**
 * One 30 Hz tick of a room — the server is the authority. The steps live in server/loop/:
 * countdown / between rounds (round.ts) → timer and sudden death → power-up spots (powerUps.ts) →
 * each plane: respawn, flight (flight.ts), magnet, pickup, out of bounds, special item, gun →
 * vacuum (suddenDeath.ts) → lag-compensation frame and pellets (projectiles.ts) → special items
 * (secondary.ts) → objectives (objectivesTick.ts) → end of round (round.ts).
 * The order matters (who shoots first, who picks up first): keep it when changing a step.
 */
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
    stepRoundEnd(room, dt, callbacks);
    return;
  }

  if (room.phase !== 'playing') {
    return;
  }

  // Round timer & Sudden Death ("L'aspirateur arrive !")
  const objectiveMode = hasNoSuddenDeath(room.settings.mode);
  const isRace = room.settings.mode === 'ring_race';
  if (room.roundTimer > 0 || objectiveMode) {
    // Objective modes have no vacuum sudden death: the round simply ends on the timer
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

  // 0. Contested glowing power-up spawn zones (none in the race)
  if (!isRace) respawnSpotPowerUps(room, dt);

  // 1. Step each player / bot
  let spawnCounter = 0;
  for (const player of allPlayers) {
    spawnCounter++;
    const arch = PLANE_ARCHETYPES[player.cosmetics.planeId];

    if (!player.sim.alive) {
      stepRespawn(room, player, spawnCounter + room.tick, map, isRace, dt);
      continue;
    }

    const latestInput = stepPlayerFlight(room, player, allPlayers, map, arch, dt, callbacks);
    applyMagnet(room, player, allPlayers, dt);
    pickUpPowerUp(room, player);

    // Out-of-bounds elimination after 4 seconds
    if (player.sim.alive && player.sim.outOfBoundsTimer >= 4.0) {
      handlePlaneCrashDamage(room, player, 9999, 'oob', callbacks);
    }

    // Activate secondary power-up
    if (player.sim.alive && latestInput?.useSecondary && canShoot(room.settings.mode)) {
      activateSecondaryPowerUp(room, player, callbacks);
    }

    // Firing primary pellet/dart gun
    if (player.sim.alive && latestInput?.fire && canShoot(room.settings.mode)) {
      firePrimary(room, player, arch);
    }
  }

  // « Survie »: waves of flies and drones, fly stings
  if (isSurvival(room.settings.mode)) stepSurvival(room, map, dt, callbacks);

  // Sudden Death giant cartoon vacuum suction & shrinking safe zone
  applySuddenDeath(room, allPlayers, map, dt, callbacks);

  // 2. Record rewind history frame (keep <= 250ms)
  recordRewindFrame(room, allPlayers, now);

  // 3. Primary pellets (lag-compensated hits, destructibles), then special items
  stepProjectiles(room, allPlayers, map, dt, callbacks);
  stepSecondaryProjectiles(room, allPlayers, map, dt, callbacks);

  // 4. Objectives (rings, zone), then the end of the round
  const roundElapsed = roundDuration(room.settings.mode) - room.roundTimer;
  scoreObjectives(room, allPlayers, map, dt, roundElapsed, callbacks);
  settleRound(room, allPlayers, map, roundElapsed, callbacks, isSurvival(room.settings.mode) ? survivalOutcome(room) : undefined);
}
