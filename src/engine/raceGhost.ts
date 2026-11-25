import * as THREE from 'three';
import type { MapDefinition } from '../../shared/maps/types';
import type { MapId, PaintId, PlaneId } from '../../shared/types';
import { buildToyPlane, type BuiltPlaneRig } from './planeBuilder';
import {
  GhostRecorder,
  beatsGhost,
  courseKey,
  ghostPoseAt,
  ghostStorageKey,
  parseGhost,
  type RaceGhost,
} from './raceGhostData';

export interface GhostFrame {
  /** A ring race is being flown (match running, race mode) */
  active: boolean;
  map: MapDefinition;
  mapId: MapId;
  /** Race clock (seconds since the start), null when unknown */
  raceTime: number | null;
  local: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number; alive: boolean } | null;
  planeId: PlaneId;
  paintId: PaintId;
  /** Our finish time, once we crossed the last ring */
  finishedTime: number | null;
  dt: number;
}

/**
 * Ring race ghost: records our flight, keeps the best one per room on this device and replays it as
 * a see-through plane in the following races (data helpers in raceGhostData.ts).
 */
export class RaceGhostRunner {
  private recorder = new GhostRecorder();
  private recording = false;
  private savedThisRound = false;
  private lastTime = -1;
  private ghost: RaceGhost | null = null;
  private loadedFor = '';
  private courseByMap = new Map<MapId, string>();
  private rig: BuiltPlaneRig | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  public update(f: GhostFrame): void {
    if (!f.active || f.raceTime === null) {
      this.hide();
      this.lastTime = -1;
      return;
    }
    let course = this.courseByMap.get(f.mapId);
    if (!course) {
      course = courseKey(f.map);
      this.courseByMap.set(f.mapId, course);
    }
    if (this.loadedFor !== f.mapId) {
      this.loadedFor = f.mapId;
      this.setGhost(parseGhost(readStorage(ghostStorageKey(f.mapId)), course));
    }

    // Start of a race (first frame, or the clock went back for a new round): record from the start only
    if (this.lastTime < 0 || f.raceTime < this.lastTime - 0.5) {
      this.recorder.reset();
      this.recording = f.raceTime < 1.5;
      this.savedThisRound = false;
    }
    this.lastTime = f.raceTime;

    if (this.recording && f.finishedTime === null && f.local?.alive) {
      this.recorder.sample(f.raceTime, f.local);
    }
    if (f.finishedTime !== null && this.recording && !this.savedThisRound) {
      this.savedThisRound = true;
      if (beatsGhost(f.finishedTime, this.ghost)) {
        const ghost = this.recorder.finish(course, f.planeId, f.paintId, f.finishedTime);
        writeStorage(ghostStorageKey(f.mapId), JSON.stringify(ghost));
        // The new ghost flies from the next race on
        this.pending = ghost;
      }
    }
    if (this.pending && f.raceTime < 1) {
      this.setGhost(this.pending);
      this.pending = null;
    }

    const pose = this.ghost ? ghostPoseAt(this.ghost, f.raceTime) : null;
    if (!pose || !this.rig) {
      this.hide();
      return;
    }
    this.rig.root.visible = true;
    this.rig.root.position.set(pose.x, pose.y, pose.z);
    this.rig.root.quaternion.set(pose.qx, pose.qy, pose.qz, pose.qw);
    for (const p of this.rig.propellers) p.rotation.z += f.dt * 30;
  }

  private pending: RaceGhost | null = null;

  private setGhost(ghost: RaceGhost | null): void {
    this.ghost = ghost;
    if (this.rig) {
      this.scene.remove(this.rig.root);
      this.rig.dispose();
      this.rig = null;
    }
    if (!ghost) return;
    const rig = buildToyPlane(ghost.planeId, ghost.paintId, 'star');
    // See-through, no shadow, no sticker: clearly a ghost
    rig.stickerMesh.visible = false;
    rig.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        m.transparent = true;
        m.opacity = Math.min(m.opacity, 0.36);
        m.depthWrite = false;
      }
    });
    rig.root.visible = false;
    this.scene.add(rig.root);
    this.rig = rig;
  }

  private hide(): void {
    if (this.rig) this.rig.root.visible = false;
  }

  public dispose(): void {
    this.setGhost(null);
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage full or unavailable: no ghost this time
  }
}
