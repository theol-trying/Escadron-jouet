import type { MapDefinition } from '../../shared/maps/types';
import { KING_TARGET, RACE_LAPS, RING_RADIUS, getKingZone, getRaceCourse, getZoneControl } from '../../shared/objectives';
import type { ServerPlayer, ServerRoom } from '../types';
import type { LoopCallbacks } from './callbacks';

/** Objective modes: rings passed (race), time in the zone (king of the sky). */
export function scoreObjectives(
  room: ServerRoom,
  allPlayers: ServerPlayer[],
  map: MapDefinition,
  dt: number,
  roundElapsed: number,
  callbacks: LoopCallbacks
): void {
  if (room.settings.mode === 'ring_race') {
    const course = getRaceCourse(map);
    const total = course.length * RACE_LAPS;
    for (const p of allPlayers) {
      if (!p.sim.alive || p.finishTime !== null) continue;
      const ring = course[p.objective % course.length];
      if (Math.hypot(p.sim.x - ring.x, p.sim.y - ring.y, p.sim.z - ring.z) < RING_RADIUS) {
        p.objective++;
        p.score += 10;
        if (p.objective >= total) {
          p.finishTime = roundElapsed;
          p.score += room.raceFirstFinishAt === null ? 150 : 75;
          if (room.raceFirstFinishAt === null) room.raceFirstFinishAt = roundElapsed;
          callbacks.emitRoomState(room);
        }
      }
    }
  } else if (room.settings.mode === 'king_of_sky') {
    const zone = getKingZone(map, roundElapsed);
    // Alone in the zone = full rate; shared = the plane closest to the centre scores at half rate
    const control = getZoneControl(
      zone,
      allPlayers.map((p) => ({ id: p.id, x: p.sim.x, y: p.sim.y, z: p.sim.z, alive: p.sim.alive }))
    );
    const king = control.scorerId ? room.players.get(control.scorerId) : undefined;
    if (king) {
      const gain = dt * control.rate;
      king.objective = Math.min(KING_TARGET, king.objective + gain);
      king.score += gain * 10;
    }
  }
}
