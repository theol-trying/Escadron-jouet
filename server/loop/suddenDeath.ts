import { PLANE_SPEED_SCALE } from '../../shared/constants';
import type { MapDefinition } from '../../shared/maps/types';
import { computeVacuumState } from '../../shared/powerups';
import type { ServerPlayer, ServerRoom } from '../types';
import type { LoopCallbacks } from './callbacks';
import { handlePlaneCrashDamage } from './damage';

/** Sudden death: the giant vacuum pulls planes in, the safe zone shrinks, the nozzle is deadly. */
export function applySuddenDeath(
  room: ServerRoom,
  allPlayers: ServerPlayer[],
  map: MapDefinition,
  dt: number,
  callbacks: LoopCallbacks
): void {
  if (!room.suddenDeath) return;
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
