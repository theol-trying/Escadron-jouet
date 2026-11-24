import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ARENA_SCALE,
  PLANE_SPEED_SCALE,
  REMOTE_INTERP_DELAY_MS,
} from '../../shared/constants';
import {
  getPlaneForward,
  getPlaneRight,
  quatFromYaw,
  stepPlanePhysics,
} from '../../shared/flightPhysics';
import { MAPS } from '../../shared/maps/index';
import type { MapDefinition } from '../../shared/maps/types';
import { PLANE_ARCHETYPES } from '../../shared/planes';
import type {
  GameModeId,
  HitFeedbackEvent,
  MapId,
  PaintId,
  PlaneId,
  PlaneSimState,
  PlayerCosmetics,
  PlayerInputState,
  PlayerLobbyInfo,
  PowerUpId,
  SnapshotPayload,
  SnapshotPlane,
  StickerId,
  TeamId,
} from '../../shared/types';
import { music } from '../audio/music';
import { soundEngine } from '../audio/soundEngine';
import { MatchExtrasRenderer } from './m3Visuals';
import { buildDeskScene } from './maps/buildDeskScene';
import { buildGardenScene } from './maps/buildGardenScene';
import { buildKitchenScene } from './maps/buildKitchenScene';
import type { MapSceneHandles } from './maps/types';
import { ParticleAndProjectilePool } from './particlePool';
import { WingTrails, type TrailInput } from './wingTrails';
import { DebrisField } from './debris';
import { Podium, type PodiumEntry } from './podium';
import { ObjectiveRenderer, type ZoneState } from './objectives3d';
import { CatVisual } from './catModel';
import { getCatPose, getRoomEvent } from '../../shared/roomEvents';
import { getHingeDoorAngleAtTime } from '../../shared/flightPhysics';
import {
  KING_TARGET,
  RACE_LAPS,
  getKingZone,
  getRaceCourse,
  isObjectiveMode,
  roundDuration,
} from '../../shared/objectives';
import { buildToyPlane, type BuiltPlaneRig } from './planeBuilder';

// Hangar preview spot on the desk (design units 18, 115, 18), following the arena scale
export type CameraView = 'chase' | 'cockpit';

// Cockpit view: pilot eye position in the plane's local frame (nose toward -Z) and field of view.
// The eye sits just above the fuselage so the plane's own nose, wings, propellers or cannons stay
// in sight; canopies/visors are hidden (BuiltPlaneRig.cockpitHidden).
const COCKPIT_VIEWS: Record<PlaneId, { x: number; y: number; z: number; fov: number }> = {
  plastic_jet: { x: 0, y: 1.45, z: -0.7, fov: 78 },
  windup_biplane: { x: 0, y: 2.6, z: 0.9, fov: 74 }, // above the upper wing (it would fill the view)
  foam_glider: { x: 0, y: 1.5, z: -0.3, fov: 80 },
  diecast_bomber: { x: 0, y: 1.55, z: 1.3, fov: 72 },
};

// Chase view: camera offset behind/above the plane and look-ahead point (plane local frame)
const CHASE_OFFSET = { y: 6.6, z: 27 };
const CHASE_LOOK = { y: 2.2, z: -30 };

// Aim assist only engages for targets this close to the nose (radians) and within this range
const AIM_ASSIST_CONE = 0.2;
const AIM_ASSIST_RANGE = 320;

const HANGAR_SPOT = { x: 18 * ARENA_SCALE, y: 115 * ARENA_SCALE, z: 18 * ARENA_SCALE };

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
  objectiveMarker: { x: number; y: number; onScreen: boolean; angle: number; distance: number } | null;
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

interface RemoteBufferEntry {
  time: number;
  data: SnapshotPlane;
}

interface ActivePlaneVisual {
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

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class ThreeGameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private maxAniso = 4;
  private currentMapId: MapId = 'desk';
  private currentMap: MapDefinition = MAPS.desk;
  private mapHandles: MapSceneHandles;
  private pool: ParticleAndProjectilePool;
  private trails: WingTrails;
  private debris: DebrisField;
  private podium: Podium | null = null;
  private objectives3d: ObjectiveRenderer;
  /** Room events: lights dimmed during a blackout, the giant cat */
  private lights: Array<{ light: THREE.Light; base: number }> = [];
  private lightLevel = 1;
  private cat!: CatVisual;
  private gameMode: GameModeId = 'last_plane_ffa';
  private raceResult: { time: number; best: number | null; newRecord: boolean } | null = null;
  private prevLocalObjective = 0;
  private readonly podiumAnchor = new THREE.Vector3();
  private confettiTimer = 0;

  private mode: EngineMode = 'title_tour';
  private frameId = 0;
  private disposed = false;
  private lastTickTime = performance.now();
  private elapsedTime = 0;

  // Hangar preview plane
  private hangarPlane: BuiltPlaneRig | null = null;
  private hangarCosmeticsKey = '';

  // Title tour ambient planes
  private tourPlanes: Array<{ rig: BuiltPlaneRig; phase: number; radius: number; y: number }> = [];

  // Active gameplay state
  private localPlayerId: string | null = null;
  private localSim: PlaneSimState | null = null;
  private localCosmetics: PlayerCosmetics = {
    planeId: 'plastic_jet',
    paintId: 'red',
    stickerId: 'star',
  };
  private pendingInputs: PlayerInputState[] = [];
  private inputSeq = 0;
  private localFireVisualCooldown = 0;

  private planeVisuals = new Map<string, ActivePlaneVisual>();
  private roomPlayersMeta = new Map<
    string,
    {
      nickname: string;
      isBot: boolean;
      team: TeamId;
      planeId: PlaneId;
      paintId: PaintId;
      stickerId: StickerId;
      maxHp: number;
    }
  >();
  private latestSnapshot: SnapshotPayload | null = null;
  private spectatorIndex = 0;
  private currentSpectatingName = '';
  private destroyedColliderIds = new Set<string>();
  private knownDestroyedProps = new Set<string>();
  private wasSuddenDeath = false;
  private extrasRenderer: MatchExtrasRenderer;

  // Camera state
  private camPos = new THREE.Vector3(0, 140, 180);
  private camTarget = new THREE.Vector3(0, 100, 0);
  private currentFov = 70;
  private cameraTrauma = 0;
  private snapCameraNextFrame = false;

  // Controls input state (updated externally by event listeners)
  public inputState = {
    aimX: 0,
    aimY: 0,
    throttle: 0,
    roll: 0,
    boost: false,
    fire: false,
    useSecondaryQueued: false,
    barrelRollQueued: 0 as -1 | 0 | 1,
    paused: false,
  };

  /** Light aim assist: 0 = off, otherwise the share of the aiming correction applied (≤ 1). */
  public aimAssistStrength = 0;

  private cameraView: CameraView = 'chase';
  private cockpitActive = false;

  public setCameraView(view: CameraView): void {
    this.cameraView = view;
  }

  private hudCallback: ((data: HudFrameData) => void) | null = null;
  private resizeObserver: ResizeObserver;

  // Pre-allocated scratch math objects (Zero-GC in tick)
  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly _v3 = new THREE.Vector3();
  private readonly _q1 = new THREE.Quaternion();
  private readonly _q2 = new THREE.Quaternion();
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _listenFwd = new THREE.Vector3();
  private readonly _listenUp = new THREE.Vector3();
  /** Projectile ids present in the previous snapshot (new ids = new shots to hear) */
  private heardProjectileIds = new Set<number>();
  private lastShotSoundAt = new Map<string, number>();
  private readonly _emissiveFlash = new THREE.Color(0xffffff);
  private readonly _emissiveZero = new THREE.Color(0x000000);

  constructor(container: HTMLElement, onHudUpdate: (data: HudFrameData) => void) {
    this.container = container;
    this.hudCallback = onHudUpdate;
    this.isSoftwareGl = detectSoftwareGl();

    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(240, container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.currentMap.skyColor);
    this.scene.fog = new THREE.Fog(this.currentMap.fogColor, 240 * ARENA_SCALE, 560 * ARENA_SCALE);

    // Mandatory studio environment reflection (RoomEnvironment)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.5, 950 * ARENA_SCALE);

    // Warm sunny window directional key light + cool HemisphereLight fill
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0xfde68a, 0.95);
    this.scene.add(hemi);
    this.lights.push({ light: hemi, base: hemi.intensity });

    const sunKey = new THREE.DirectionalLight(0xfff1d6, 1.45);
    sunKey.position.set(-220 * ARENA_SCALE, 240 * ARENA_SCALE, 60 * ARENA_SCALE);
    sunKey.castShadow = !this.isSoftwareGl;
    // The shadow frustum covers the enlarged room: a bigger map keeps shadows as crisp as before
    sunKey.shadow.mapSize.width = 2048;
    sunKey.shadow.mapSize.height = 2048;
    sunKey.shadow.camera.near = 20 * ARENA_SCALE;
    sunKey.shadow.camera.far = 650 * ARENA_SCALE;
    sunKey.shadow.camera.left = -240 * ARENA_SCALE;
    sunKey.shadow.camera.right = 240 * ARENA_SCALE;
    sunKey.shadow.camera.top = 220 * ARENA_SCALE;
    sunKey.shadow.camera.bottom = -220 * ARENA_SCALE;
    sunKey.shadow.bias = -0.0005;
    sunKey.shadow.normalBias = 0.02;
    this.scene.add(sunKey);
    this.lights.push({ light: sunKey, base: sunKey.intensity });

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    rimLight.position.set(180, 140, -160);
    this.scene.add(rimLight);
    this.lights.push({ light: rimLight, base: rimLight.intensity });
    this.cat = new CatVisual(this.scene);

    // Build initial 3D world
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.mapHandles = this.buildMapScene(this.currentMapId);
    this.pool = new ParticleAndProjectilePool(this.scene);
    this.trails = new WingTrails(this.scene);
    this.debris = new DebrisField(this.scene);
    this.objectives3d = new ObjectiveRenderer(this.scene);
    this.extrasRenderer = new MatchExtrasRenderer(this.scene);

    // Ambient planes for the title flyover
    const tourConfigs: Array<[PlayerCosmetics, number, number, number]> = [
      [{ planeId: 'plastic_jet', paintId: 'red', stickerId: 'star' }, 0, 115, 138],
      [{ planeId: 'windup_biplane', paintId: 'yellow', stickerId: 'lightning' }, 2.1, 88, 122],
      [{ planeId: 'foam_glider', paintId: 'blue', stickerId: 'target' }, 4.2, 135, 152],
    ];
    for (const [cos, phase, radius, y] of tourConfigs) {
      const rig = buildToyPlane(cos.planeId, cos.paintId, cos.stickerId);
      this.scene.add(rig.root);
      // Orbits are authored for the design-size room: they follow the arena scale
      this.tourPlanes.push({ rig, phase, radius: radius * ARENA_SCALE, y: y * ARENA_SCALE });
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    // Render frame 0 synchronously so first paint shows the 3D desk scene immediately
    this.updateScene(0.016, performance.now());
    this.renderer.render(this.scene, this.camera);

    this.startLoop();
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(320, this.container.clientWidth);
    const height = Math.max(240, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.render(this.scene, this.camera);
  }

  private buildMapScene(mapId: MapId): MapSceneHandles {
    if (mapId === 'kitchen') return buildKitchenScene(this.scene, this.maxAniso);
    if (mapId === 'garden') return buildGardenScene(this.scene, this.maxAniso);
    return buildDeskScene(this.scene, this.maxAniso);
  }

  public setMap(mapId: MapId): void {
    if (this.currentMapId === mapId) return;
    this.mapHandles.dispose();
    this.currentMapId = mapId;
    this.currentMap = MAPS[mapId] ?? MAPS.desk;
    this.mapHandles = this.buildMapScene(mapId);
    this.objectives3d.configure(this.gameMode, this.currentMap);
    this.scene.background = new THREE.Color(this.currentMap.skyColor);
    this.scene.fog = new THREE.Fog(
      this.currentMap.fogColor,
      (mapId === 'garden' ? 320 : 240) * ARENA_SCALE,
      (mapId === 'garden' ? 760 : 560) * ARENA_SCALE
    );
    this.destroyedColliderIds.clear();
    this.knownDestroyedProps.clear();
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
    this.updateScene(0.016, performance.now());
    this.renderer.render(this.scene, this.camera);
  }

  private updateRoomEvents(dt: number): HudFrameData['roomEvent'] {
    const t = this.latestSnapshot?.mapEventTime ?? this.elapsedTime;
    const ev = this.mode === 'playing' ? getRoomEvent(this.currentMap, t) : null;
    this.cat.update(this.mode === 'playing' ? getCatPose(this.currentMap, t) : null, this.elapsedTime);

    // Blackout: lights fade down to a dim glow, then come back
    const target = ev?.kind === 'blackout' ? 0.16 : 1;
    this.lightLevel += (target - this.lightLevel) * Math.min(1, dt * 4);
    for (const l of this.lights) l.light.intensity = l.base * this.lightLevel;

    let fridgeOpening = false;
    if (this.currentMapId === 'kitchen' && this.mode === 'playing') {
      fridgeOpening = getHingeDoorAngleAtTime(-1.18, 10, t) !== 0;
    }
    if (ev) return ev.kind;
    return fridgeOpening ? 'fridge' : null;
  }

  /** Objective modes: per-frame markers, HUD figures and the screen pointer. */
  private updateObjectives(livingPlanes: ActivePlaneVisual[]): {
    hud: ObjectiveHud | null;
    marker: HudFrameData['objectiveMarker'];
  } {
    const snap = this.latestSnapshot;
    const active = isObjectiveMode(this.gameMode) && this.mode === 'playing' && !!snap;
    this.objectives3d.setVisible(active);
    if (!active || !snap) return { hud: null, marker: null };

    const roundElapsed = roundDuration(this.gameMode) - snap.roundTimer;
    const localData = this.localPlayerId ? snap.planes.find((p) => p.id === this.localPlayerId) : undefined;
    const localObjective = localData?.objective ?? 0;
    let target: THREE.Vector3 | null = null;
    let hud: ObjectiveHud;

    if (this.gameMode === 'ring_race') {
      const course = getRaceCourse(this.currentMap);
      const total = course.length * RACE_LAPS;
      const finished = localObjective >= total;
      if (localObjective < this.prevLocalObjective) this.raceResult = null; // new round
      if (finished && this.prevLocalObjective < total && !this.raceResult) {
        // Personal best per room, kept on this device
        const key = `ej_race_best_${this.currentMapId}`;
        let best: number | null = null;
        try {
          const v = Number(localStorage.getItem(key));
          best = Number.isFinite(v) && v > 0 ? v : null;
        } catch {
          best = null;
        }
        const newRecord = best === null || roundElapsed < best;
        if (newRecord) {
          try {
            localStorage.setItem(key, String(roundElapsed));
          } catch {
            // storage unavailable
          }
        }
        this.raceResult = { time: roundElapsed, best: newRecord ? roundElapsed : best, newRecord };
      }
      this.prevLocalObjective = localObjective;
      this.objectives3d.updateRace(localObjective, finished, this.elapsedTime);
      if (!finished) {
        const r = course[localObjective % course.length];
        target = this._v3.set(r.x, r.y, r.z);
      }
      hud = {
        kind: 'race',
        ringsPassed: Math.min(localObjective, total),
        ringsTotal: total,
        lap: Math.min(RACE_LAPS, Math.floor(localObjective / course.length) + 1),
        laps: RACE_LAPS,
        time: this.raceResult?.time ?? roundElapsed,
        finished,
        best: this.raceResult?.best ?? null,
        newRecord: this.raceResult?.newRecord ?? false,
      };
    } else {
      const zone = getKingZone(this.currentMap, roundElapsed);
      let insideMine = false;
      let insideOthers = 0;
      for (const pv of livingPlanes) {
        if (pv.interpPos.distanceTo(this._v1.set(zone.x, zone.y, zone.z)) < zone.radius) {
          if (pv.id === this.localPlayerId) insideMine = true;
          else insideOthers++;
        }
      }
      const state: ZoneState =
        insideMine && insideOthers === 0 ? 'mine' : !insideMine && insideOthers === 1 ? 'theirs' : insideMine || insideOthers > 1 ? 'contested' : 'free';
      const hb = this.currentMap.hardBounds;
      this.objectives3d.updateZone(zone, state, hb.minY, hb.maxY, this.elapsedTime);
      let leader = snap.planes[0];
      for (const p of snap.planes) if (p.objective > (leader?.objective ?? -1)) leader = p;
      target = this._v3.set(zone.x, zone.y, zone.z);
      hud = {
        kind: 'king',
        mine: localObjective,
        target: KING_TARGET,
        leaderName: leader && leader.objective > 0 ? (this.roomPlayersMeta.get(leader.id)?.nickname ?? '') : '',
        leaderValue: leader?.objective ?? 0,
        zoneState: state,
        movesIn: zone.movesIn,
      };
    }

    let marker: HudFrameData['objectiveMarker'] = null;
    if (target) {
      const width = this.container.clientWidth || 1;
      const height = this.container.clientHeight || 1;
      const distance = this.camera.position.distanceTo(target);
      const p = this._v2.copy(target).project(this.camera);
      const behind = p.z > 1;
      let nx = behind ? -p.x : p.x;
      let ny = behind ? -p.y : p.y;
      const onScreen = !behind && Math.abs(nx) < 0.92 && Math.abs(ny) < 0.88;
      if (!onScreen) {
        // Clamp to the screen edge along the direction of the target
        const k = 1 / Math.max(Math.abs(nx) / 0.92, Math.abs(ny) / 0.88, 1e-6);
        nx *= k;
        ny *= k;
      }
      marker = {
        x: (nx * 0.5 + 0.5) * width,
        y: (-ny * 0.5 + 0.5) * height,
        onScreen,
        angle: Math.atan2(-ny, nx),
        distance,
      };
    }
    return { hud, marker };
  }

  /** Game mode of the room (objective modes show rings / the king zone). */
  public setGameMode(mode: GameModeId): void {
    this.gameMode = mode;
    this.objectives3d.configure(mode, this.currentMap);
  }

  /** End of match: top-3 planes on a toy podium floating in the room, camera orbiting around. */
  public showPodium(entries: PodiumEntry[]): void {
    this.podium?.dispose();
    this.podium = new Podium(entries);
    const hb = this.currentMap.hardBounds;
    // Open air in the upper part of the room, where the planes usually fly
    this.podiumAnchor.set(0, hb.minY + (hb.maxY - hb.minY) * 0.6, 0);
    this.podium.group.position.copy(this.podiumAnchor);
    this.scene.add(this.podium.group);
    this.setMode('podium');
  }

  public setMode(mode: EngineMode, cosmetics?: PlayerCosmetics): void {
    this.mode = mode;
    this.objectives3d.setVisible(mode === 'playing' && isObjectiveMode(this.gameMode));
    if (mode !== 'podium' && this.podium) {
      this.podium.dispose();
      this.podium = null;
    }

    // Show/hide tour planes
    for (const tp of this.tourPlanes) {
      tp.rig.root.visible = mode === 'title_tour';
    }

    // Show/hide hangar plane
    if (mode === 'hangar_preview' && cosmetics) {
      this.updateHangarPlane(cosmetics);
      if (this.hangarPlane) this.hangarPlane.root.visible = true;
    } else if (this.hangarPlane) {
      this.hangarPlane.root.visible = false;
    }

    // Show/hide match planes
    for (const pv of this.planeVisuals.values()) {
      pv.rig.root.visible = mode === 'playing';
    }

    if (mode !== 'playing') {
      this.pool.syncProjectiles([]);
    } else {
      this.snapCameraNextFrame = true;
    }
    this.updateScene(0.016, performance.now());
    this.renderer.render(this.scene, this.camera);
  }

  public updateHangarPlane(cosmetics: PlayerCosmetics): void {
    const key = `${cosmetics.planeId}_${cosmetics.paintId}_${cosmetics.stickerId}`;
    if (this.hangarPlane && this.hangarCosmeticsKey === key) return;

    if (this.hangarPlane) {
      this.scene.remove(this.hangarPlane.root);
      this.hangarPlane.dispose();
    }
    this.hangarPlane = buildToyPlane(
      cosmetics.planeId,
      cosmetics.paintId,
      cosmetics.stickerId
    );
    this.hangarPlane.root.position.set(HANGAR_SPOT.x, HANGAR_SPOT.y - 1, HANGAR_SPOT.z);
    this.hangarPlane.root.scale.setScalar(1.45);
    this.hangarPlane.root.visible = this.mode === 'hangar_preview';
    this.hangarCosmeticsKey = key;
    this.scene.add(this.hangarPlane.root);
  }

  public setLocalPlayer(
    playerId: string | null,
    cosmetics: PlayerCosmetics,
    options?: { preserveSim?: boolean }
  ): void {
    this.localPlayerId = playerId;
    this.localCosmetics = { ...cosmetics };
    if (!options?.preserveSim) {
      this.localSim = null;
      this.pendingInputs.length = 0;
    }
  }

  public updateLocalCosmetics(cosmetics: PlayerCosmetics): void {
    this.localCosmetics = { ...cosmetics };
  }

  public syncRoomPlayers(players: PlayerLobbyInfo[]): void {
    const validIds = new Set<string>();
    for (const p of players) {
      validIds.add(p.id);
      const arch = PLANE_ARCHETYPES[p.cosmetics.planeId] ?? PLANE_ARCHETYPES.plastic_jet;
      this.roomPlayersMeta.set(p.id, {
        nickname: p.nickname,
        isBot: p.isBot,
        team: p.team,
        planeId: p.cosmetics.planeId,
        paintId: p.cosmetics.paintId,
        stickerId: p.cosmetics.stickerId,
        maxHp: arch.maxHp,
      });
      if (p.id === this.localPlayerId) {
        this.localCosmetics = { ...p.cosmetics };
      }
    }
    for (const id of Array.from(this.roomPlayersMeta.keys())) {
      if (!validIds.has(id)) {
        this.roomPlayersMeta.delete(id);
      }
    }
  }

  public resetMatchVisuals(): void {
    this.trails.clear();
    this.debris.clear();
    for (const pv of this.planeVisuals.values()) {
      this.scene.remove(pv.rig.root);
      pv.rig.dispose();
    }
    this.planeVisuals.clear();
    this.localSim = null;
    this.pendingInputs.length = 0;
    this.latestSnapshot = null;
    this.destroyedColliderIds.clear();
    this.knownDestroyedProps.clear();
    this.wasSuddenDeath = false;
    for (const group of this.mapHandles.destructibleGroups.values()) {
      group.visible = true;
    }
    this.extrasRenderer.syncAndAnimate(this.elapsedTime, [], [], null, false);
  }

  public cycleSpectator(dir: -1 | 1): void {
    // Q/D also steer: only switch the watched pilot when the local plane is out of the round
    if (this.localSim?.alive) return;
    this.spectatorIndex += dir;
  }

  public ingestSnapshot(snapshot: SnapshotPayload): void {
    this.latestSnapshot = snapshot;
    const now = performance.now();

    const seenIds = new Set<string>();
    for (const pData of snapshot.planes) {
      seenIds.add(pData.id);
      const meta = this.roomPlayersMeta.get(pData.id);
      const planeId =
        meta?.planeId ?? (pData.id === this.localPlayerId ? this.localCosmetics.planeId : 'plastic_jet');
      const paintId =
        meta?.paintId ?? (pData.id === this.localPlayerId ? this.localCosmetics.paintId : 'red');
      const stickerId =
        meta?.stickerId ?? (pData.id === this.localPlayerId ? this.localCosmetics.stickerId : 'star');
      const cosmeticsKey = `${planeId}_${paintId}_${stickerId}_${pData.team}`;
      let pv = this.planeVisuals.get(pData.id);

      if (!pv || pv.cosmeticsKey !== cosmeticsKey) {
        if (pv) {
          this.scene.remove(pv.rig.root);
          pv.rig.dispose();
        }
        const rig = buildToyPlane(planeId, paintId, stickerId, pData.team);
        rig.root.visible = this.mode === 'playing';
        this.scene.add(rig.root);
        pv = {
          id: pData.id,
          rig,
          cosmeticsKey,
          team: pData.team,
          buffer: [],
          interpPos: new THREE.Vector3(pData.x, pData.y, pData.z),
          interpQuat: new THREE.Quaternion(pData.qx, pData.qy, pData.qz, pData.qw),
          smokeTimer: 0,
          wasAlive: pData.alive,
          hitFlashTimer: 0,
          lastDistToLocal: Infinity,
          flybyCooldown: 0,
        };
        this.planeVisuals.set(pData.id, pv);
      }

      pv.buffer.push({ time: now, data: pData });
      while (pv.buffer.length > 10) pv.buffer.shift();

      // Detect elimination transition for cartoon POP burst
      if (pv.wasAlive && !pData.alive) {
        this.pool.spawnBurst(
          pData.x,
          pData.y,
          pData.z,
          24,
          [0xef4444, 0xfacc15, 0x38bdf8, 0xffffff],
          72,
          2.0,
          45,
          0.75
        );
        soundEngine.playPopExplosion(
          pData.id === this.localPlayerId ? undefined : { x: pData.x, y: pData.y, z: pData.z }
        );
        if (pData.id === this.localPlayerId) {
          this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.75);
        }
      }
      pv.wasAlive = pData.alive;

      // Reconcile local predicted plane
      if (pData.id === this.localPlayerId) {
        this.reconcileLocal(pData);
      }
    }

    // Remove departed planes
    for (const [id, pv] of this.planeVisuals.entries()) {
      if (!seenIds.has(id)) {
        this.scene.remove(pv.rig.root);
        pv.rig.dispose();
        this.planeVisuals.delete(id);
      }
    }

    // Sync destructible household props
    for (const d of snapshot.destructibles) {
      const group = this.mapHandles.destructibleGroups.get(d.id);
      if (group) {
        group.visible = !d.destroyed;
      }
      if (d.destroyed) {
        const cfg = this.currentMap.destructibles.find((item) => item.id === d.id);
        if (cfg) {
          this.destroyedColliderIds.add(cfg.colliderId);
        }
        if (!this.knownDestroyedProps.has(d.id)) {
          this.knownDestroyedProps.add(d.id);
          if (cfg) {
            // The prop bursts into chunky pieces of its own colours
            this.debris.burst(cfg.x, cfg.y, cfg.z, cfg.radius, DebrisField.colorsOf(group));
            this.pool.spawnBurst(
              cfg.x,
              cfg.y,
              cfg.z,
              24,
              [0xfacc15, 0xef4444, 0x38bdf8, 0xf472b6, 0xffffff],
              68,
              2.2,
              42,
              0.75
            );
          }
          soundEngine.playPropBreak(cfg ? { x: cfg.x, y: cfg.y, z: cfg.z } : undefined);
        }
      }
    }

    // Sudden death transition alert
    if (snapshot.suddenDeath && !this.wasSuddenDeath) {
      this.wasSuddenDeath = true;
      soundEngine.playVacuumAlert();
      music.setIntensity(true);
      this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.55);
    } else if (!snapshot.suddenDeath) {
      if (this.wasSuddenDeath) music.setIntensity(false);
      this.wasSuddenDeath = false;
    }

    // Hear other pilots' new shots where they are fired (own shots are played at input time)
    const currentIds = new Set<number>();
    const nowMs = performance.now();
    for (const p of snapshot.projectiles) {
      currentIds.add(p.id);
      if (this.heardProjectileIds.has(p.id) || p.ownerId === this.localPlayerId) continue;
      const last = this.lastShotSoundAt.get(p.ownerId) ?? 0;
      if (nowMs - last < 70) continue;
      this.lastShotSoundAt.set(p.ownerId, nowMs);
      soundEngine.playPelletShot(p.heavy, { x: p.x, y: p.y, z: p.z });
    }
    this.heardProjectileIds = currentIds;

    // Sync projectiles immediately
    this.pool.syncProjectiles(snapshot.projectiles);
  }

  public ingestHitEvent(ev: HitFeedbackEvent): void {
    const involvesMe = ev.targetId === this.localPlayerId || ev.attackerId === this.localPlayerId;
    const where = involvesMe ? undefined : { x: ev.x, y: ev.y, z: ev.z };
    if (ev.damage <= 0 && !ev.fatal) {
      // Absorbed (spawn protection, bubble shield) or repair: light spark only — no hit flash or
      // camera shake, and a sound that says why nothing happened.
      this.pool.spawnBurst(ev.x, ev.y, ev.z, 4, [0xbae6fd, 0xffffff], 50, 1.0, 20, 0.25);
      if (ev.attackerId !== ev.targetId) {
        const target = this.planeVisuals.get(ev.targetId)?.buffer.at(-1)?.data;
        if (target?.invuln) soundEngine.playDeflect(where);
        else soundEngine.playShieldBoing(where);
      }
      return;
    }
    this.pool.spawnBurst(ev.x, ev.y, ev.z, ev.fatal ? 18 : 7, [0xfacc15, 0xf97316, 0xffffff], 50, 1.3, 20, 0.35);
    const pv = this.planeVisuals.get(ev.targetId);
    if (pv) {
      pv.hitFlashTimer = 0.08;
    }
    // Our own hits are played up front; other duels are heard from where they happen
    soundEngine.playHit(where);
    if (ev.targetId === this.localPlayerId) {
      this.cameraTrauma = Math.min(1, this.cameraTrauma + (ev.fatal ? 0.8 : 0.35));
    }
  }

  private reconcileLocal(auth: SnapshotPlane): void {
    const meta = this.roomPlayersMeta.get(auth.id);
    if (meta) {
      this.localCosmetics = {
        planeId: meta.planeId,
        paintId: meta.paintId,
        stickerId: meta.stickerId,
      };
    }
    const arch = PLANE_ARCHETYPES[this.localCosmetics.planeId];
    if (!this.localSim || (!this.localSim.alive && auth.alive)) {
      this.snapCameraNextFrame = true;
      this.localSim = {
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
      this.pendingInputs.length = 0;
      return;
    }

    const prevPu = this.localSim.secondaryPowerUp;
    const prevUses = this.localSim.secondaryUses;

    // Authoritative health, lives, boost, heat, power-up & status buffs
    this.localSim.hp = auth.hp;
    this.localSim.maxHp = arch.maxHp;
    this.localSim.lives = auth.lives;
    this.localSim.alive = auth.alive;
    this.localSim.invulnTimer = auth.invuln ? 0.5 : 0;
    this.localSim.outOfBoundsTimer = auth.outOfBounds;
    this.localSim.heat = auth.heat;
    this.localSim.overheated = auth.overheated;
    this.localSim.boost = auth.boost;
    this.localSim.secondaryPowerUp = auth.secondaryPowerUp;
    this.localSim.secondaryUses = auth.secondaryUses;
    if (this.localSim.shieldTimer > 0 && !auth.shielded && auth.alive) soundEngine.playShieldPop();
    this.localSim.shieldTimer = auth.shielded ? 1 : 0;
    this.localSim.turboTimer = auth.turboActive ? 1 : 0;
    this.localSim.glueTimer = auth.glued ? 1 : 0;
    this.localSim.magnetTimer = auth.magnetActive ? 1 : 0;

    if (
      auth.secondaryPowerUp &&
      (auth.secondaryPowerUp !== prevPu || auth.secondaryUses > prevUses)
    ) {
      soundEngine.playPickup();
    }

    // Discard acknowledged inputs
    while (this.pendingInputs.length > 0 && this.pendingInputs[0].seq <= auth.lastAckSeq) {
      this.pendingInputs.shift();
    }

    // Replay unacknowledged inputs from authoritative state
    const replaySim: PlaneSimState = {
      ...this.localSim,
      x: auth.x,
      y: auth.y,
      z: auth.z,
      qx: auth.qx,
      qy: auth.qy,
      qz: auth.qz,
      qw: auth.qw,
      speed: auth.speed,
    };
    for (const inp of this.pendingInputs) {
      stepPlanePhysics(
        replaySim,
        inp,
        arch,
        this.currentMap,
        this.latestSnapshot?.mapEventTime ?? this.elapsedTime,
        this.destroyedColliderIds
      );
    }

    // Smoothly correct local position without jarring snaps
    const errDist = Math.hypot(
      replaySim.x - this.localSim.x,
      replaySim.y - this.localSim.y,
      replaySim.z - this.localSim.z
    );
    if (errDist > 16) {
      this.localSim.x = replaySim.x;
      this.localSim.y = replaySim.y;
      this.localSim.z = replaySim.z;
      this.localSim.qx = replaySim.qx;
      this.localSim.qy = replaySim.qy;
      this.localSim.qz = replaySim.qz;
      this.localSim.qw = replaySim.qw;
    } else if (errDist > 0.35) {
      this.localSim.x += (replaySim.x - this.localSim.x) * 0.22;
      this.localSim.y += (replaySim.y - this.localSim.y) * 0.22;
      this.localSim.z += (replaySim.z - this.localSim.z) * 0.22;
    }
  }

  /**
   * Light aim assist. When an opponent (with lead for pellet travel time) sits within a small cone
   * around the nose, returns the steering input that would centre it and a blend weight that fades
   * to 0 at the cone edge. The server stays authoritative: this only shapes the input sent.
   */
  private computeAimAssist(
    arch: (typeof PLANE_ARCHETYPES)[keyof typeof PLANE_ARCHETYPES]
  ): { x: number; y: number; weight: number } | null {
    if (this.aimAssistStrength <= 0 || !this.localSim || !this.localPlayerId) return null;
    const sim = this.localSim;
    const fwd = getPlaneForward(sim);
    const heading = Math.atan2(-fwd.x, -fwd.z);
    const elevation = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
    const myTeam = this.roomPlayersMeta.get(this.localPlayerId)?.team ?? 'none';
    const pelletSpeed = arch.projectileSpeed + sim.speed * 0.35;

    let best: { yawErr: number; pitchErr: number; score: number } | null = null;
    for (const pv of this.planeVisuals.values()) {
      if (pv.id === this.localPlayerId) continue;
      const data = pv.buffer[pv.buffer.length - 1]?.data;
      if (!data || !data.alive || data.invuln) continue;
      if (myTeam !== 'none' && data.team === myTeam) continue;
      const dist = Math.hypot(data.x - sim.x, data.y - sim.y, data.z - sim.z);
      if (dist < 8 || dist > AIM_ASSIST_RANGE) continue;
      const tFwd = getPlaneForward(data);
      const lead = dist / pelletSpeed;
      const dx = data.x + tFwd.x * data.speed * lead - sim.x;
      const dy = data.y + tFwd.y * data.speed * lead - sim.y;
      const dz = data.z + tFwd.z * data.speed * lead - sim.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      let yawErr = Math.atan2(-dx, -dz) - heading;
      yawErr = Math.atan2(Math.sin(yawErr), Math.cos(yawErr));
      const pitchErr = Math.asin(Math.max(-1, Math.min(1, dy / d))) - elevation;
      const score = Math.hypot(yawErr, pitchErr);
      if (score > AIM_ASSIST_CONE) continue;
      if (!best || score < best.score) best = { yawErr, pitchErr, score };
    }
    if (!best) return null;

    // Steering that would centre the target in ~0.35 s (heading grows by -aimX·turnRate·dt)
    const tau = 0.35;
    const x = Math.max(-1, Math.min(1, -best.yawErr / (arch.turnRate * tau)));
    const y = Math.max(-1, Math.min(1, best.pitchErr / (arch.turnRate * 0.9 * tau)));
    const weight = this.aimAssistStrength * (1 - best.score / AIM_ASSIST_CONE);
    return { x, y, weight };
  }

  public stepAndSendInput(
    dt: number,
    emitInput: (inp: PlayerInputState) => void,
    canControl: boolean
  ): void {
    if (this.mode !== 'playing' || !this.localSim || !this.localSim.alive) return;

    const barrelRollDir = canControl ? this.inputState.barrelRollQueued : 0;
    this.inputState.barrelRollQueued = 0;

    const useSecondary = canControl ? this.inputState.useSecondaryQueued : false;
    this.inputState.useSecondaryQueued = false;

    let aimX = canControl ? this.inputState.aimX : 0;
    let aimY = canControl ? this.inputState.aimY : 0;
    if (canControl) {
      const assist = this.computeAimAssist(PLANE_ARCHETYPES[this.localCosmetics.planeId]);
      if (assist) {
        aimX += (assist.x - aimX) * assist.weight;
        aimY += (assist.y - aimY) * assist.weight;
      }
    }

    const inp: PlayerInputState = {
      seq: ++this.inputSeq,
      dt,
      aimX,
      aimY,
      throttle: canControl ? this.inputState.throttle : 0,
      roll: canControl ? this.inputState.roll : 0,
      boost: canControl ? this.inputState.boost : false,
      fire: canControl ? this.inputState.fire : false,
      useSecondary,
      barrelRollDir,
    };

    if (
      useSecondary &&
      this.localSim.secondaryPowerUp &&
      this.localSim.secondaryUses > 0 &&
      this.localSim.secondaryCooldown <= 0
    ) {
      soundEngine.playSecondaryUse(this.localSim.secondaryPowerUp);
      this.localSim.secondaryCooldown = 0.45;
    }

    const arch = PLANE_ARCHETYPES[this.localCosmetics.planeId];
    const res = stepPlanePhysics(
      this.localSim,
      inp,
      arch,
      this.currentMap,
      this.latestSnapshot?.mapEventTime ?? this.elapsedTime,
      this.destroyedColliderIds
    );
    if (res.collided && res.collisionDamage > 0) {
      this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.3);
      soundEngine.playHit();
    }

    // Muzzle audio + spark locally for crisp feel
    this.localFireVisualCooldown = Math.max(0, this.localFireVisualCooldown - dt);
    if (inp.fire && !this.localSim.overheated && this.localFireVisualCooldown <= 0) {
      this.localFireVisualCooldown = 1 / arch.fireRate;
      soundEngine.playPelletShot(arch.heavyGun);
      const fwd = getPlaneForward(this.localSim);
      this.pool.spawnBurst(
        this.localSim.x + fwd.x * 6,
        this.localSim.y + fwd.y * 6,
        this.localSim.z + fwd.z * 6,
        2,
        [0xfacc15, 0xffffff],
        18,
        0.55,
        0,
        0.15
      );
    }

    const speedRatio =
      (this.localSim.speed - arch.minSpeed) / (arch.boostSpeed - arch.minSpeed);
    soundEngine.updateEnginePitch(
      Math.max(0, Math.min(1, speedRatio)),
      this.localSim.alive,
      this.localSim.turboTimer > 0 || (inp.boost && this.localSim.boost > 2)
    );

    this.pendingInputs.push(inp);
    if (this.pendingInputs.length > 60) this.pendingInputs.shift();
    emitInput(inp);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTickTime) / 1000));
      this.lastTickTime = now;
      this.elapsedTime += dt;

      this.updateScene(dt, now);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateScene(dt: number, now: number): void {
    const animTime =
      this.mode === 'playing' && this.latestSnapshot
        ? this.latestSnapshot.mapEventTime
        : this.elapsedTime;
    this.mapHandles.updateAnimations(animTime, dt);

    this.pool.updateParticles(dt);
    this.pool.updateProjectiles(now);
    this.debris.update(dt);
    this.extrasRenderer.syncAndAnimate(
      this.elapsedTime,
      this.latestSnapshot?.powerUps ?? [],
      this.latestSnapshot?.secondaryProjectiles ?? [],
      this.latestSnapshot?.vacuum ?? null,
      this.mode === 'playing'
    );

    if (this.mode === 'podium' && this.podium) {
      this.podium.update(this.elapsedTime, dt);
      const a = this.elapsedTime * 0.22;
      const R = 92;
      const c = this.podiumAnchor;
      this.camera.position.set(c.x + Math.sin(a) * R, c.y + 32, c.z + Math.cos(a) * R);
      // Furniture between the podium and the camera (monitor, lamp…): move in closer
      this._v1.set(c.x, c.y + 10, c.z);
      this._v3.subVectors(this.camera.position, this._v1);
      const camDist = this._v3.length();
      this._v3.divideScalar(camDist);
      this._raycaster.set(this._v1, this._v3);
      this._raycaster.far = camDist;
      const block = this._raycaster
        .intersectObjects(this.mapHandles.cameraColliders, false)
        .find((h) => h.object.visible);
      if (block) {
        this.camera.position.copy(this._v1).addScaledVector(this._v3, Math.max(45, block.distance - 4));
      }
      // On wide screens the score panel sits on the right: shift the podium to the left third
      const shift = this.container.clientWidth > 1000 ? 20 : 0;
      this.camera.lookAt(c.x + Math.cos(a) * shift, c.y + 10, c.z - Math.sin(a) * shift);
      if (this.camera.fov !== 55) {
        this.camera.fov = 55;
        this.camera.updateProjectionMatrix();
      }
      // Confetti
      this.confettiTimer -= dt;
      if (this.confettiTimer <= 0) {
        this.confettiTimer = 0.28;
        this.pool.spawnBurst(
          c.x + (Math.random() - 0.5) * 60,
          c.y + 38 + Math.random() * 10,
          c.z + (Math.random() - 0.5) * 40,
          8,
          [0xef4444, 0xfacc15, 0x22c55e, 0x38bdf8, 0xf472b6, 0xffffff],
          22,
          1.1,
          18,
          1.8
        );
      }
      return;
    }

    if (this.mode === 'title_tour') {
      const t = this.elapsedTime * 0.18;
      const s = ARENA_SCALE;
      this.camera.position.set(
        Math.cos(t) * 190 * s,
        (142 + Math.sin(t * 1.4) * 18) * s,
        Math.sin(t) * 145 * s
      );
      this.camera.lookAt(-15 * s, 96 * s, -20 * s);
      if (this.camera.fov !== 62) {
        this.camera.fov = 62;
        this.camera.updateProjectionMatrix();
      }

      // Larger orbits flown at the slowed plane speed: angular rate = 0.72 × speed / room scale
      const tourAngularRate = 0.72 * (PLANE_SPEED_SCALE / ARENA_SCALE);
      for (const tp of this.tourPlanes) {
        const a = this.elapsedTime * tourAngularRate + tp.phase;
        const x = Math.cos(a) * tp.radius;
        const z = Math.sin(a) * tp.radius * 0.78;
        const y = tp.y + Math.sin(a * 2) * 8 * ARENA_SCALE;
        tp.rig.root.position.set(x, y, z);
        const dx = -Math.sin(a) * tp.radius;
        const dz = Math.cos(a) * tp.radius * 0.78;
        tp.rig.root.rotation.set(0, Math.atan2(-dx, -dz), 0.35);
        for (const prop of tp.rig.propellers) prop.rotation.z += dt * 28;
        if (tp.rig.windupKey) tp.rig.windupKey.rotation.y += dt * 7;
      }
      return;
    }

    if (this.mode === 'hangar_preview' && this.hangarPlane) {
      this.hangarPlane.root.rotation.y = this.elapsedTime * 0.75;
      // Plane sits at its usual spot on the (enlarged) desk; the camera keeps the same close framing
      const hx = HANGAR_SPOT.x;
      const hy = HANGAR_SPOT.y;
      const hz = HANGAR_SPOT.z;
      this.hangarPlane.root.position.y = hy + Math.sin(this.elapsedTime * 2.2) * 1.5;
      for (const prop of this.hangarPlane.propellers) prop.rotation.z += dt * 24;
      if (this.hangarPlane.windupKey) this.hangarPlane.windupKey.rotation.y += dt * 6;
      this.camera.position.set(hx + 24, hy + 6, hz + 27);
      this.camera.lookAt(hx - 7, hy - 1, hz + 4);
      if (this.camera.fov !== 50) {
        this.camera.fov = 50;
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    // Playing mode: update all plane visuals
    const renderTime = now - REMOTE_INTERP_DELAY_MS;
    const minimapBlips: MinimapBlip[] = [];
    const livingPlanes: ActivePlaneVisual[] = [];

    for (const pv of this.planeVisuals.values()) {
      const latest = pv.buffer[pv.buffer.length - 1]?.data;
      if (!latest) continue;

      if (pv.id === this.localPlayerId && this.localSim) {
        pv.interpPos.set(this.localSim.x, this.localSim.y, this.localSim.z);
        pv.interpQuat.set(
          this.localSim.qx,
          this.localSim.qy,
          this.localSim.qz,
          this.localSim.qw
        );
        pv.rig.root.visible = this.localSim.alive;
      } else {
        // Interpolate remote plane from snapshot buffer
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
        this._q1.set(a.data.qx, a.data.qy, a.data.qz, a.data.qw);
        this._q2.set(b.data.qx, b.data.qy, b.data.qz, b.data.qw);
        pv.interpQuat.copy(this._q1).slerp(this._q2, alpha);
        pv.rig.root.visible = latest.alive;
      }

      pv.rig.root.position.copy(pv.interpPos);
      pv.rig.root.quaternion.copy(pv.interpQuat);

      // Fly-by whoosh when another plane brushes past ours (closest approach just passed)
      if (pv.id !== this.localPlayerId) {
        pv.flybyCooldown = Math.max(0, pv.flybyCooldown - dt);
        const localVisual = this.localPlayerId ? this.planeVisuals.get(this.localPlayerId) : null;
        if (localVisual && this.localSim?.alive && latest.alive) {
          const dist = pv.interpPos.distanceTo(localVisual.interpPos);
          if (pv.lastDistToLocal < 38 && dist > pv.lastDistToLocal && pv.flybyCooldown <= 0 && latest.speed > 30) {
            const meta = this.roomPlayersMeta.get(pv.id);
            soundEngine.playFlyby(meta?.planeId ?? 'plastic_jet', {
              x: pv.interpPos.x,
              y: pv.interpPos.y,
              z: pv.interpPos.z,
            });
            pv.flybyCooldown = 1.6;
          }
          pv.lastDistToLocal = dist;
        } else {
          pv.lastDistToLocal = Infinity;
        }
      }

      // Animate propellers & windup key
      const speedSpin = 18 + latest.speed * 0.25;
      for (const prop of pv.rig.propellers) prop.rotation.z += dt * speedSpin;
      if (pv.rig.windupKey) pv.rig.windupKey.rotation.y += dt * (4 + latest.speed * 0.06);

      // Power-up status auras
      pv.rig.shieldMesh.visible = latest.shielded;
      // Spawn protection: pulsing golden lattice so everyone sees why shots do nothing
      const protectedNow = latest.invuln && latest.alive;
      pv.rig.spawnShieldMesh.visible = protectedNow;
      if (protectedNow) {
        pv.rig.spawnShieldMesh.rotation.y += dt * 1.2;
        pv.rig.spawnShieldMesh.rotation.x += dt * 0.5;
        (pv.rig.spawnShieldMesh.material as THREE.MeshBasicMaterial).opacity =
          0.4 + 0.3 * Math.sin(this.elapsedTime * 9);
      }
      pv.rig.magnetRingMesh.visible = latest.magnetActive;
      if (latest.magnetActive) {
        pv.rig.magnetRingMesh.rotation.y += dt * 4.5;
      }
      pv.rig.glueBlobMesh.visible = latest.glued;

      // Hit flash feedback
      if (pv.hitFlashTimer > 0) {
        pv.hitFlashTimer = Math.max(0, pv.hitFlashTimer - dt);
        for (const m of pv.rig.hitFlashMaterials) {
          if ('emissive' in m) {
            (m as THREE.MeshStandardMaterial).emissive.copy(
              pv.hitFlashTimer > 0 ? this._emissiveFlash : this._emissiveZero
            );
          }
        }
      }

      // Damage smoke trail when HP < 45%
      const metaMaxHp = this.roomPlayersMeta.get(pv.id)?.maxHp ?? 100;
      if (pv.rig.root.visible && latest.hp < metaMaxHp * 0.45) {
        pv.smokeTimer -= dt;
        if (pv.smokeTimer <= 0) {
          pv.smokeTimer = 0.08;
          this.pool.spawnSmokePuff(pv.interpPos.x, pv.interpPos.y, pv.interpPos.z, latest.hp < metaMaxHp * 0.25);
        }
      }

      if (pv.rig.root.visible) {
        livingPlanes.push(pv);
        this._v1.set(0, 0, -1).applyQuaternion(pv.interpQuat);
        const yaw = Math.atan2(-this._v1.x, -this._v1.z);
        minimapBlips.push({
          id: pv.id,
          x: pv.interpPos.x,
          z: pv.interpPos.z,
          yaw,
          team: pv.team,
          isLocal: pv.id === this.localPlayerId,
        });
      }
    }

    // Update chase camera (local player or spectator target)
    let focusPos: THREE.Vector3 | null = null;
    let focusQuat: THREE.Quaternion | null = null;
    let isBoosting = false;

    const localPv = this.localPlayerId ? this.planeVisuals.get(this.localPlayerId) : null;
    if (localPv && this.localSim && this.localSim.alive) {
      focusPos = localPv.interpPos;
      focusQuat = localPv.interpQuat;
      isBoosting = this.inputState.boost && this.localSim.boost > 2;
      this.currentSpectatingName = '';
    } else if (livingPlanes.length > 0) {
      const idx =
        ((this.spectatorIndex % livingPlanes.length) + livingPlanes.length) %
        livingPlanes.length;
      const spec = livingPlanes[idx];
      focusPos = spec.interpPos;
      focusQuat = spec.interpQuat;
      this.currentSpectatingName = this.roomPlayersMeta.get(spec.id)?.nickname ?? '';
    }

    // Objective modes: markers, HUD figures and a screen pointer toward the next ring / the zone
    const objectiveFrame = this.updateObjectives(livingPlanes);

    // Room events (same clock as the server): cat crossing, blackout, fridge opening by itself
    const roomEvent = this.updateRoomEvents(dt);

    // Wing trails (white ribbons from the wingtips, brighter at full throttle or turbo)
    const trailInputs: TrailInput[] = [];
    for (const pv of this.planeVisuals.values()) {
      const latest = pv.buffer[pv.buffer.length - 1]?.data;
      const meta = this.roomPlayersMeta.get(pv.id);
      const arch = PLANE_ARCHETYPES[meta?.planeId ?? 'plastic_jet'] ?? PLANE_ARCHETYPES.plastic_jet;
      const speed = pv.id === this.localPlayerId ? (this.localSim?.speed ?? 0) : (latest?.speed ?? 0);
      trailInputs.push({
        id: pv.id,
        position: pv.interpPos,
        quaternion: pv.interpQuat,
        halfSpan: arch.wingspan * 0.5 - 0.3,
        visible: pv.rig.root.visible,
        intense: Boolean(latest?.turboActive) || speed > arch.maxSpeed * 1.02,
      });
    }
    this.trails.update(trailInputs, dt);

    // Cockpit view only while flying our own plane (spectating always uses the chase view)
    const cockpitActive =
      this.cameraView === 'cockpit' && !!localPv && !!this.localSim?.alive && focusPos === localPv.interpPos;
    if (localPv) {
      for (const part of localPv.rig.cockpitHidden) part.visible = !cockpitActive;
    }
    this.cockpitActive = cockpitActive;

    if (focusPos && focusQuat && cockpitActive) {
      const eye = COCKPIT_VIEWS[this.localCosmetics.planeId] ?? COCKPIT_VIEWS.plastic_jet;
      if (this.localSim && this.localSim.turboTimer > 0) isBoosting = true;
      this._v1.set(eye.x, eye.y, eye.z).applyQuaternion(focusQuat).add(focusPos);
      this.camPos.copy(this._v1);
      this.camera.position.copy(this._v1);
      this.camera.quaternion.copy(focusQuat);
      // Keep the chase target ahead of the nose so switching back to chase is smooth
      this.camTarget.set(0, CHASE_LOOK.y, CHASE_LOOK.z).applyQuaternion(focusQuat).add(focusPos);

      // Lighter shake: the pilot's head is attached to the plane
      if (this.cameraTrauma > 0) {
        this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.2);
        const shake = this.cameraTrauma * this.cameraTrauma * 0.35;
        this.camera.position.x += (Math.random() - 0.5) * shake;
        this.camera.position.y += (Math.random() - 0.5) * shake;
      }

      const targetFov = isBoosting ? eye.fov + 10 : eye.fov;
      if (Math.abs(this.currentFov - targetFov) > 0.05) {
        this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-8 * dt));
        this.camera.fov = this.currentFov;
        this.camera.updateProjectionMatrix();
      }
    } else if (focusPos && focusQuat) {
      // Desired chase offset behind and slightly above plane
      this._v1.set(0, CHASE_OFFSET.y, CHASE_OFFSET.z).applyQuaternion(focusQuat).add(focusPos);
      this._v2.set(0, CHASE_LOOK.y, CHASE_LOOK.z).applyQuaternion(focusQuat).add(focusPos);

      const localPv2 = this.localPlayerId ? this.planeVisuals.get(this.localPlayerId) : null;
      if (localPv2 && this.localSim && this.localSim.alive && this.localSim.turboTimer > 0) {
        isBoosting = true;
      }

      // Camera collision raycast so it never clips inside furniture while keeping plane visible
      this._v3.subVectors(this._v1, focusPos);
      const desiredDist = this._v3.length();
      if (desiredDist > 0.1) {
        this._v3.divideScalar(desiredDist);
        this._raycaster.set(focusPos, this._v3);
        this._raycaster.far = desiredDist;
        const hits = this._raycaster.intersectObjects(this.mapHandles.cameraColliders, false);
        const visibleHit = hits.find((h) => {
          let cur: THREE.Object3D | null = h.object;
          while (cur) {
            if (!cur.visible) return false;
            cur = cur.parent;
          }
          return true;
        });
        if (visibleHit && visibleHit.distance < desiredDist) {
          const safeDist = Math.max(12, visibleHit.distance - 2.2);
          this._v1.copy(focusPos).addScaledVector(this._v3, safeDist);
          // Lift camera slightly higher when pulled close so own plane stays framed
          if (safeDist < 18) {
            this._v1.y += (18 - safeDist) * 0.75;
          }
        }
      }

      // Clamp camera inside the room walls (taken from the map: rooms follow ARENA_SCALE)
      const hb = this.currentMap.hardBounds;
      this._v1.x = Math.max(hb.minX + 6, Math.min(hb.maxX - 6, this._v1.x));
      this._v1.y = Math.max(hb.minY + 2, Math.min(hb.maxY - 2, this._v1.y));
      this._v1.z = Math.max(hb.minZ + 5, Math.min(hb.maxZ - 5, this._v1.z));

      // If wall clamping pushed camera too close to plane, elevate slightly for clear view
      const clampedDist = this._v1.distanceTo(focusPos);
      if (clampedDist < 15) {
        const lift = 15 - clampedDist;
        this._v1.y = Math.min(hb.maxY - 2, this._v1.y + lift * 0.9);
      }

      if (this.snapCameraNextFrame) {
        this.camPos.copy(this._v1);
        this.camTarget.copy(this._v2);
        this.snapCameraNextFrame = false;
      } else {
        const camDamp = 1 - Math.exp(-12 * dt);
        this.camPos.lerp(this._v1, camDamp);
        this.camTarget.lerp(this._v2, camDamp);
      }

      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camTarget);

      // Trauma shake
      if (this.cameraTrauma > 0) {
        this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.2);
        const shake = this.cameraTrauma * this.cameraTrauma * 1.4;
        this.camera.position.x += (Math.random() - 0.5) * shake;
        this.camera.position.y += (Math.random() - 0.5) * shake;
      }

      // Wide FOV that widens further on boost
      const targetFov = isBoosting ? 84 : 70;
      if (Math.abs(this.currentFov - targetFov) > 0.05) {
        this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-8 * dt));
        this.camera.fov = this.currentFov;
        this.camera.updateProjectionMatrix();
      }
    }

    // 3D sound: the listener is the camera (works in chase, cockpit and spectator views)
    this._listenFwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this._listenUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    soundEngine.setListener(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
      this._listenFwd.x,
      this._listenFwd.y,
      this._listenFwd.z,
      this._listenUp.x,
      this._listenUp.y,
      this._listenUp.z
    );

    // Project enemy/ally labels & off-screen arrows for HUD
    if (this.hudCallback) {
      const width = this.container.clientWidth || 1;
      const height = this.container.clientHeight || 1;
      const labels: ProjectedLabel[] = [];

      for (const pv of livingPlanes) {
        if (pv.id === this.localPlayerId) continue;
        const data = pv.buffer[pv.buffer.length - 1]?.data;
        if (!data) continue;

        const dist = focusPos ? pv.interpPos.distanceTo(focusPos) : 0;
        this._v1.copy(pv.interpPos);
        this._v1.y += 4.5;
        this._v1.project(this.camera);

        const inFront = this._v1.z >= -1 && this._v1.z <= 1;
        let nx = this._v1.x;
        let ny = this._v1.y;
        if (!inFront) {
          nx = -nx;
          ny = -ny;
        }
        const onScreen = inFront && Math.abs(nx) <= 0.92 && Math.abs(ny) <= 0.9;
        const screenX = (nx * 0.5 + 0.5) * width;
        const screenY = (-ny * 0.5 + 0.5) * height;
        const angle = Math.atan2(-ny, nx);

        const meta = this.roomPlayersMeta.get(pv.id);
        labels.push({
          id: pv.id,
          nickname: meta?.nickname ?? 'Pilote',
          team: data.team,
          hpRatio: Math.max(0, data.hp / Math.max(1, meta?.maxHp ?? 100)),
          screenX,
          screenY,
          inFront,
          onScreen,
          angle,
          distance: Math.round(dist),
          isTarget: false,
        });
      }

      const sim = this.localSim;
      let bankDeg = 0;
      let pitchDeg = 0;
      let climbRate = 0;
      if (sim) {
        const fwd = getPlaneForward(sim);
        const right = getPlaneRight(sim);
        const upY = 1 - 2 * (sim.qx * sim.qx + sim.qz * sim.qz); // local up · world up
        bankDeg = (-Math.atan2(right.y, upY) * 180) / Math.PI;
        pitchDeg = (Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180) / Math.PI;
        climbRate = fwd.y * sim.speed;
      }
      this.hudCallback({
        cockpit: this.cockpitActive,
        planeId: this.localCosmetics.planeId,
        bankDeg,
        pitchDeg,
        altitude: Math.max(0, (sim?.y ?? 0) - this.currentMap.hardBounds.minY),
        climbRate,
        objective: objectiveFrame.hud,
        roomEvent,
        objectiveMarker: objectiveFrame.marker,
        hp: Math.round(sim?.hp ?? 0),
        maxHp: sim?.maxHp ?? 100,
        lives: sim?.lives ?? 0,
        boost: Math.round(sim?.boost ?? 0),
        heat: Math.round(sim?.heat ?? 0),
        overheated: sim?.overheated ?? false,
        speed: Math.round(sim?.speed ?? 0),
        outOfBounds: sim?.outOfBoundsTimer ?? 0,
        alive: sim?.alive ?? false,
        spectatingName: this.currentSpectatingName,
        roundTimer: this.latestSnapshot?.roundTimer ?? 240,
        secondaryPowerUp: sim?.secondaryPowerUp ?? null,
        secondaryUses: sim?.secondaryUses ?? 0,
        shielded: (sim?.shieldTimer ?? 0) > 0,
        turboActive: (sim?.turboTimer ?? 0) > 0,
        glued: (sim?.glueTimer ?? 0) > 0,
        magnetActive: (sim?.magnetTimer ?? 0) > 0,
        suddenDeath: this.latestSnapshot?.suddenDeath ?? false,
        labels,
        minimapBlips,
      });
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.resetMatchVisuals();
    for (const tp of this.tourPlanes) {
      this.scene.remove(tp.rig.root);
      tp.rig.dispose();
    }
    if (this.hangarPlane) {
      this.scene.remove(this.hangarPlane.root);
      this.hangarPlane.dispose();
    }
    this.mapHandles.dispose();
    this.pool.dispose();
    this.trails.dispose();
    this.debris.dispose();
    this.podium?.dispose();
    this.objectives3d.dispose();
    this.cat.dispose();
    this.extrasRenderer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
