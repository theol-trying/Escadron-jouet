import * as THREE from 'three';
import type { MapDefinition } from '../../shared/maps/types';
import {
  KING_TARGET,
  RACE_LAPS,
  getKingZone,
  getRaceCourse,
  getZoneControl,
  isObjectiveMode,
  roundDuration,
} from '../../shared/objectives';
import type { GameModeId, MapId, SnapshotPayload } from '../../shared/types';
import type { ObjectiveHud, ScreenMarker } from './engineTypes';
import { screenEdgeMarker } from './hudProjection';
import type { ObjectiveRenderer, ZoneState } from './objectives3d';

export interface ObjectiveFrameInput {
  snapshot: SnapshotPayload | null;
  gameMode: GameModeId;
  playing: boolean;
  map: MapDefinition;
  mapId: MapId;
  localPlayerId: string | null;
  /** Planes in flight this frame (interpolated positions) */
  livingPlanes: ReadonlyArray<{ id: string; interpPos: THREE.Vector3 }>;
  nicknameOf: (playerId: string) => string;
  camera: THREE.Camera;
  width: number;
  height: number;
  elapsedTime: number;
}

/**
 * Objective modes, client side: the 3D markers (rings, zone colour), the HUD figures (rings and
 * laps, personal best per room; crown seconds, leader, zone state) and the screen pointer toward
 * the next ring / the zone. The zone rule is the server's (shared/objectives.ts).
 */
export class ObjectiveTracker {
  private raceResult: { time: number; best: number | null; newRecord: boolean } | null = null;
  /** Record of the room before this race (shown while racing) */
  private storedBest: { mapId: MapId; best: number | null } | null = null;
  private prevLocalObjective = 0;
  private readonly _target = new THREE.Vector3();
  private readonly _zone = new THREE.Vector3();

  constructor(private readonly markers: ObjectiveRenderer) {}

  public update(f: ObjectiveFrameInput): { hud: ObjectiveHud | null; marker: ScreenMarker | null } {
    const snap = f.snapshot;
    const active = isObjectiveMode(f.gameMode) && f.playing && !!snap;
    this.markers.setVisible(active);
    if (!active || !snap) return { hud: null, marker: null };

    const roundElapsed = roundDuration(f.gameMode) - snap.roundTimer;
    const localData = f.localPlayerId ? snap.planes.find((p) => p.id === f.localPlayerId) : undefined;
    const localObjective = localData?.objective ?? 0;
    let target: THREE.Vector3 | null = null;
    let hud: ObjectiveHud;

    if (f.gameMode === 'ring_race') {
      const course = getRaceCourse(f.map);
      const total = course.length * RACE_LAPS;
      const finished = localObjective >= total;
      const newRound = localObjective < this.prevLocalObjective;
      if (newRound) this.raceResult = null;
      if (newRound || this.storedBest?.mapId !== f.mapId) {
        this.storedBest = { mapId: f.mapId, best: readBest(f.mapId) };
      }
      if (finished && this.prevLocalObjective < total && !this.raceResult) {
        this.raceResult = recordRaceTime(f.mapId, roundElapsed);
      }
      this.prevLocalObjective = localObjective;
      this.markers.updateRace(localObjective, finished, f.elapsedTime);
      if (!finished) {
        const r = course[localObjective % course.length];
        target = this._target.set(r.x, r.y, r.z);
      }
      hud = {
        kind: 'race',
        ringsPassed: Math.min(localObjective, total),
        ringsTotal: total,
        lap: Math.min(RACE_LAPS, Math.floor(localObjective / course.length) + 1),
        laps: RACE_LAPS,
        time: this.raceResult?.time ?? roundElapsed,
        finished,
        best: this.raceResult?.best ?? this.storedBest?.best ?? null,
        newRecord: this.raceResult?.newRecord ?? false,
      };
    } else {
      const zone = getKingZone(f.map, roundElapsed);
      // Same rule as the server: alone = full rate, shared = the closest to the centre scores at half rate
      const control = getZoneControl(
        zone,
        f.livingPlanes.map((pv) => ({ id: pv.id, x: pv.interpPos.x, y: pv.interpPos.y, z: pv.interpPos.z, alive: true }))
      );
      const localPv = f.livingPlanes.find((pv) => pv.id === f.localPlayerId);
      const insideMine = !!localPv && localPv.interpPos.distanceTo(this._zone.set(zone.x, zone.y, zone.z)) < zone.radius;
      const state: ZoneState =
        control.inside === 0
          ? 'free'
          : control.scorerId === f.localPlayerId
            ? control.rate >= 1
              ? 'mine'
              : 'mine_contested'
            : insideMine
              ? 'contested'
              : 'theirs';
      const hb = f.map.hardBounds;
      this.markers.updateZone(zone, state, hb.minY, hb.maxY, f.elapsedTime);
      let leader = snap.planes[0];
      for (const p of snap.planes) if (p.objective > (leader?.objective ?? -1)) leader = p;
      target = this._target.set(zone.x, zone.y, zone.z);
      hud = {
        kind: 'king',
        mine: localObjective,
        target: KING_TARGET,
        leaderName: leader && leader.objective > 0 ? f.nicknameOf(leader.id) : '',
        leaderValue: leader?.objective ?? 0,
        zoneState: state,
        movesIn: zone.movesIn,
      };
    }

    return { hud, marker: target ? screenEdgeMarker(target, f.camera, f.width, f.height) : null };
  }
}

/** Personal best per room, kept on this device. */
function readBest(mapId: MapId): number | null {
  try {
    const v = Number(localStorage.getItem(`ej_race_best_${mapId}`));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function recordRaceTime(mapId: MapId, time: number): { time: number; best: number | null; newRecord: boolean } {
  const key = `ej_race_best_${mapId}`;
  const best = readBest(mapId);
  const newRecord = best === null || time < best;
  if (newRecord) {
    try {
      localStorage.setItem(key, String(time));
    } catch {
      // storage unavailable
    }
  }
  return { time, best: newRecord ? time : best, newRecord };
}
