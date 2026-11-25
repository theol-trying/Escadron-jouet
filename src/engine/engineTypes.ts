import type * as THREE from 'three';
import type {
  PaintId,
  PlaneId,
  PowerUpId,
  SnapshotPlane,
  StickerId,
  TeamId,
} from '../../shared/types';
import type { ZoneState } from './objectives3d';
import type { BuiltPlaneRig } from './planeBuilder';

/** Shared types of the 3D engine (ThreeGameEngine and its helpers). */

export type CameraView = 'chase' | 'cockpit';

export type EngineMode = 'title_tour' | 'hangar_preview' | 'playing' | 'podium';

export interface ProjectedLabel {
  id: string;
  nickname: string;
  team: TeamId;
  hpRatio: number;
  screenX: number;
  screenY: number;
  inFront: boolean;
  onScreen: boolean;
  angle: number; // for off-screen edge arrow
  distance: number;
  isTarget: boolean;
}

export interface MinimapBlip {
  id: string;
  x: number;
  z: number;
  yaw: number;
  team: TeamId;
  isLocal: boolean;
}

export interface HudFrameData {
  hp: number;
  maxHp: number;
  lives: number;
  boost: number;
  heat: number;
  overheated: boolean;
  speed: number;
  outOfBounds: number;
  alive: boolean;
  spectatingName: string;
  roundTimer: number;
  secondaryPowerUp: PowerUpId | null;
  secondaryUses: number;
  shielded: boolean;
  turboActive: boolean;
  glued: boolean;
  magnetActive: boolean;
  suddenDeath: boolean;
  labels: ProjectedLabel[];
  minimapBlips: MinimapBlip[];
  /** Cockpit view is on (own plane alive): the HUD shows the plane's instrument panel. */
  cockpit: boolean;
  planeId: PlaneId;
  /** Attitude for the artificial horizon (degrees; bank > 0 = banked right, pitch > 0 = nose up). */
  bankDeg: number;
  pitchDeg: number;
  /** Height above the floor and vertical speed (world units = cm, cm/s). */
  altitude: number;
  climbRate: number;
  /** Objective modes HUD (null in elimination modes) */
  objective: ObjectiveHud | null;
  /** Room event in progress, for the HUD banner */
  roomEvent: 'cat' | 'blackout' | 'fridge' | null;
  /** Screen marker toward the next ring / the zone (null when none) */
  objectiveMarker: ScreenMarker | null;
}

export interface ScreenMarker {
  x: number;
  y: number;
  onScreen: boolean;
  angle: number;
  distance: number;
}

export type ObjectiveHud =
  | {
      kind: 'race';
      ringsPassed: number;
      ringsTotal: number;
      lap: number;
      laps: number;
      time: number;
      finished: boolean;
      best: number | null;
      newRecord: boolean;
    }
  | {
      kind: 'king';
      mine: number;
      target: number;
      leaderName: string;
      leaderValue: number;
      zoneState: ZoneState;
      movesIn: number;
    };

export interface RemoteBufferEntry {
  time: number;
  data: SnapshotPlane;
}

/** A plane of the match in the 3D scene, with its recent snapshots for interpolation. */
export interface ActivePlaneVisual {
  id: string;
  rig: BuiltPlaneRig;
  cosmeticsKey: string;
  team: TeamId;
  buffer: RemoteBufferEntry[];
  interpPos: THREE.Vector3;
  interpQuat: THREE.Quaternion;
  smokeTimer: number;
  wasAlive: boolean;
  /** Distance to our plane last frame and cooldown, for the fly-by whoosh */
  lastDistToLocal: number;
  flybyCooldown: number;
  hitFlashTimer: number;
}

/** What the engine knows about each pilot of the room (from the lobby state). */
export interface RoomPlayerMeta {
  nickname: string;
  isBot: boolean;
  team: TeamId;
  planeId: PlaneId;
  paintId: PaintId;
  stickerId: StickerId;
  maxHp: number;
}
