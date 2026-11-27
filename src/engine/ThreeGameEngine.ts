import * as THREE from 'three';
import { ARENA_SCALE, REMOTE_INTERP_DELAY_MS } from '../../shared/constants';
import { getHingeDoorAngleAtTime, getPlaneForward, stepPlanePhysics } from '../../shared/flightPhysics';
import { MAPS } from '../../shared/maps/index';
import type { MapDefinition } from '../../shared/maps/types';
import { isObjectiveMode, roundDuration } from '../../shared/objectives';
import { PLANE_ARCHETYPES } from '../../shared/planes';
import { getCatPaw, getCatPose, getRoomEvent } from '../../shared/roomEvents';
import type {
  GameModeId,
  HitFeedbackEvent,
  MapId,
  PlaneSimState,
  PlayerCosmetics,
  PlayerInputState,
  PlayerLobbyInfo,
  SnapshotPayload,
  SnapshotPlane,
} from '../../shared/types';
import { music } from '../audio/music';
import { soundEngine } from '../audio/soundEngine';
import { computeAimAssist } from './aimAssist';
import { CameraRig } from './cameraRig';
import { CatVisual } from './catModel';
import { DebrisField } from './debris';
import type {
  ActivePlaneVisual,
  CameraView,
  EngineMode,
  HudFrameData,
  MinimapBlip,
  RoomPlayerMeta,
} from './engineTypes';
import { flightAttitude } from './flightAttitude';
import { projectPlaneLabels, screenEdgeMarker } from './hudProjection';
import { reconcileLocalSim, simFromSnapshot } from './localPrediction';
import { MatchExtrasRenderer } from './m3Visuals';
import { buildDeskScene } from './maps/buildDeskScene';
import type { MapSceneHandles } from './maps/types';
import { ObjectiveRenderer } from './objectives3d';
import { ObjectiveTracker } from './objectiveTracker';
import { ParticleAndProjectilePool } from './particlePool';
import { buildToyPlane, type BuiltPlaneRig } from './planeBuilder';
import { animatePlaneVisual, createPlaneVisual, detectFlyby, interpolateRemote } from './planeVisuals';
import { Podium, type PodiumEntry } from './podium';
import {
  SCENE_LOADERS,
  addEnvironment,
  addRoomLights,
  applyShadowProfile,
  createRenderer,
  detectSoftwareGl,
  pixelRatioFor,
  roomFog,
  type SceneBuilder,
} from './sceneSetup';
import { graphicsProfile, type GraphicsProfile, type GraphicsQuality } from '../settings/graphicsQuality';
import { setOutlinePixelScale, setRoomOutlinesVisible } from './toonMaterials';
import { TitleTour } from './titleTour';
import { RaceGhostRunner } from './raceGhost';
import { REPLAY_AFTER_MS, REPLAY_BEFORE_MS, ReplayBuffer } from './replayBuffer';
import type { TutorialProbe } from '../tutorial/tutorial';
import { WingTrails, type TrailInput } from './wingTrails';
import { GlowFx } from './glowFx';
import { SpeedLines } from './speedLines';
import { FallingParts } from './fallingParts';
import { SmokeFx } from './smokeFx';
import { ConfettiFx, SparkFx } from './impactFx';
import { inSprinklerSpray, movingColliders, roomContact } from './roomContact';
import { PAINT_PALETTES } from '../../shared/planes';

export type {
  CameraView,
  EngineMode,
  HudFrameData,
  MinimapBlip,
  ObjectiveHud,
  ProjectedLabel,
} from './engineTypes';

// Hangar preview spot on the desk (design units 18, 115, 18), following the arena scale
const HANGAR_SPOT = { x: 18 * ARENA_SCALE, y: 115 * ARENA_SCALE, z: 18 * ARENA_SCALE };

/**
 * The 3D view (Three.js). It shows the title flyover, the hangar, the match and the podium; in a
 * match it predicts our own plane (localPrediction.ts), interpolates the others (planeVisuals.ts),
 * and feeds the HUD every frame. Helpers: camera (cameraRig.ts), objective modes
 * (objectiveTracker.ts), name tags (hudProjection.ts), renderer and lights (sceneSetup.ts).
 */
export class ThreeGameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private cameraRig: CameraRig;
  private isSoftwareGl: boolean;
  private maxAniso = 4;
  private currentMapId: MapId = 'desk';
  private currentMap: MapDefinition = MAPS.desk;
  private mapHandles: MapSceneHandles;
  private pool: ParticleAndProjectilePool;
  private trails: WingTrails;
  private debris: DebrisField;
  /** Halos: pellets, explosion flashes and shockwaves, hits, muzzle flashes */
  private glow: GlowFx;
  /** Turbo speed streaks around the view */
  private speedLines: SpeedLines;
  /** Plane parts that broke off, tumbling to the floor */
  private fallingParts: FallingParts;
  /** Soft smoke of damaged planes */
  private smoke: SmokeFx;
  /** Plastic confetti of explosions, sparks of planes scraping the room */
  private confetti: ConfettiFx;
  private sparks: SparkFx;
  /** Per plane: when it may throw sparks / water drops again */
  private readonly sparkCooldown = new Map<string, number>();
  private readonly _vel = new THREE.Vector3();
  /** What moves in the room this frame (computed once for every plane's spark check) */
  private frameMoving: import('../../shared/maps/types').MapCollider[] | null = null;
  private podium: Podium | null = null;
  private objectives3d: ObjectiveRenderer;
  private objectiveTracker: ObjectiveTracker;
  private sceneBuilders = new Map<MapId, SceneBuilder>([['desk', buildDeskScene]]);
  /** Room events: lights dimmed during a blackout, the giant cat */
  private lights: Array<{ light: THREE.Light; base: number }>;
  private sun: THREE.DirectionalLight;
  private lightLevel = 1;
  /** « Qualité graphique »: what the 3D view draws and how finely */
  private profile: GraphicsProfile;
  private cat: CatVisual;
  private gameMode: GameModeId = 'last_plane_ffa';
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
  private titleTour: TitleTour;

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
  private roomPlayersMeta = new Map<string, RoomPlayerMeta>();
  private latestSnapshot: SnapshotPayload | null = null;
  /** When the latest snapshot arrived (performance.now), to run the race clock between updates */
  private latestSnapshotAt = 0;
  private raceGhost: RaceGhostRunner;
  /** « Revoir l'action »: the last seconds of updates, our last crash (with its clip once complete), the replay playing */
  private replayBuffer = new ReplayBuffer();
  private lastAttacker: { id: string; at: number } | null = null;
  private crash: { at: number; killerId: string | null; clip: ReplayBuffer | null } | null = null;
  private replay: {
    clip: ReplayBuffer;
    start: number;
    end: number;
    clockStart: number;
    focusId: string | null;
    frameIndex: number;
  } | null = null;
  private spectatorIndex = 0;
  private currentSpectatingName = '';
  private destroyedColliderIds = new Set<string>();
  private knownDestroyedProps = new Set<string>();
  private wasSuddenDeath = false;
  private extrasRenderer: MatchExtrasRenderer;

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

  /** « Premier vol »: what the screen pointer guides to (a prop to shoot, the nearest item), if anything */
  private guide: { prop: string } | { nearestPowerUp: true } | null = null;

  public setGuide(guide: { prop: string } | { nearestPowerUp: true } | null): void {
    this.guide = guide;
  }

  /** « Premier vol »: what our plane is doing right now (read ~10 times a second by the tutorial). */
  public getTutorialProbe(): TutorialProbe | null {
    const sim = this.localSim;
    if (this.mode !== 'playing' || !sim) return null;
    return {
      alive: sim.alive,
      aimX: this.inputState.aimX,
      aimY: this.inputState.aimY,
      throttle: this.inputState.throttle,
      boosting: sim.turboTimer > 0 || (this.inputState.boost && sim.boost > 1),
      rolling: sim.barrelRollTimer > 0,
      secondaryPowerUp: sim.secondaryPowerUp,
      secondaryUses: sim.secondaryUses,
      cockpit: this.cockpitActive,
      destroyedProps: this.knownDestroyedProps,
    };
  }

  private guideTarget(): { x: number; y: number; z: number } | null {
    const g = this.guide;
    if (!g) return null;
    if ('prop' in g) {
      if (this.knownDestroyedProps.has(g.prop)) return null;
      return this.currentMap.destructibles.find((d) => d.id === g.prop) ?? null;
    }
    const sim = this.localSim;
    let best: { x: number; y: number; z: number } | null = null;
    let bestD = Infinity;
    for (const pu of this.latestSnapshot?.powerUps ?? []) {
      const d = sim ? Math.hypot(pu.x - sim.x, pu.y - sim.y, pu.z - sim.z) : 0;
      if (d < bestD) {
        bestD = d;
        best = pu;
      }
    }
    return best;
  }

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
  private readonly _listenFwd = new THREE.Vector3();
  private readonly _listenUp = new THREE.Vector3();
  /** Projectile ids present in the previous snapshot (new ids = new shots to hear) */
  private heardProjectileIds = new Set<number>();
  private lastShotSoundAt = new Map<string, number>();

  constructor(container: HTMLElement, onHudUpdate: (data: HudFrameData) => void, quality: GraphicsQuality = 'medium') {
    this.container = container;
    this.hudCallback = onHudUpdate;
    this.isSoftwareGl = detectSoftwareGl();
    this.profile = graphicsProfile(this.isSoftwareGl ? 'low' : quality);
    setRoomOutlinesVisible(this.profile.roomOutlines);

    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(240, container.clientHeight || window.innerHeight);

    this.renderer = createRenderer(container, this.isSoftwareGl, width, height, this.profile);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.currentMap.skyColor);
    this.scene.fog = roomFog(this.currentMapId, this.currentMap.fogColor);
    addEnvironment(this.scene, this.renderer);

    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.5, 950 * ARENA_SCALE);
    this.cameraRig = new CameraRig(this.camera);
    const roomLights = addRoomLights(this.scene, this.isSoftwareGl, this.profile);
    this.lights = roomLights.lights;
    this.sun = roomLights.sun;
    this.cat = new CatVisual(this.scene);

    // Build initial 3D world
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.mapHandles = this.buildMapScene(this.currentMapId);
    this.pool = new ParticleAndProjectilePool(this.scene);
    this.glow = new GlowFx(this.scene);
    this.pool.setGlow(this.glow);
    this.scene.add(this.camera); // the speed lines ride on the camera
    this.speedLines = new SpeedLines(this.camera);
    this.fallingParts = new FallingParts(this.scene);
    this.smoke = new SmokeFx(this.scene);
    this.confetti = new ConfettiFx(this.scene);
    this.sparks = new SparkFx(this.scene);
    this.trails = new WingTrails(this.scene);
    this.debris = new DebrisField(this.scene);
    this.objectives3d = new ObjectiveRenderer(this.scene);
    this.objectiveTracker = new ObjectiveTracker(this.objectives3d);
    this.extrasRenderer = new MatchExtrasRenderer(this.scene);
    this.titleTour = new TitleTour(this.scene);
    this.raceGhost = new RaceGhostRunner(this.scene);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    // Render frame 0 synchronously so first paint shows the 3D desk scene immediately
    this.updateScene(0.016, performance.now());
    this.renderer.render(this.scene, this.camera);

    this.startLoop();
    // Fetch the other rooms' code once the first screen is up
    window.setTimeout(() => this.preloadScenes(), 2500);
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
    return (this.sceneBuilders.get(mapId) ?? buildDeskScene)(this.scene, this.maxAniso, { profile: this.profile });
  }

  /** « Qualité graphique »: shadows, pixel density, outlines and the room's extras (rebuilt). */
  public setGraphicsQuality(quality: GraphicsQuality): void {
    const next = graphicsProfile(this.isSoftwareGl ? 'low' : quality);
    if (next === this.profile) return;
    this.profile = next;
    this.renderer.setPixelRatio(pixelRatioFor(next, this.isSoftwareGl));
    this.handleResize();
    applyShadowProfile(this.renderer, this.scene, this.sun, next, this.isSoftwareGl);
    setRoomOutlinesVisible(next.roomOutlines);
    if (this.sceneBuilders.has(this.currentMapId)) this.applyMapScene(this.currentMapId);
  }

  /** Loads the other rooms' scene code in the background so switching rooms is instant. */
  private preloadScenes(): void {
    for (const id of Object.keys(SCENE_LOADERS) as MapId[]) {
      if (this.sceneBuilders.has(id)) continue;
      void SCENE_LOADERS[id]()
        .then((b) => this.sceneBuilders.set(id, b))
        .catch(() => {
          // offline or blocked: loaded again when the room is actually needed
        });
    }
  }

  public setMap(mapId: MapId): void {
    if (this.currentMapId === mapId) return;
    // Gameplay data (prediction, objectives, events) switches right away…
    this.currentMapId = mapId;
    this.currentMap = MAPS[mapId] ?? MAPS.desk;
    this.objectives3d.configure(this.gameMode, this.currentMap);
    this.destroyedColliderIds.clear();
    this.knownDestroyedProps.clear();
    // …the 3D scene as soon as its code is loaded (usually already preloaded)
    if (this.sceneBuilders.has(mapId)) {
      this.applyMapScene(mapId);
    } else {
      void SCENE_LOADERS[mapId]().then((builder) => {
        this.sceneBuilders.set(mapId, builder);
        if (!this.disposed && this.currentMapId === mapId) this.applyMapScene(mapId);
      });
    }
  }

  private applyMapScene(mapId: MapId): void {
    this.mapHandles.dispose();
    this.mapHandles = this.buildMapScene(mapId);
    this.scene.background = new THREE.Color(this.currentMap.skyColor);
    this.scene.fog = roomFog(mapId, this.currentMap.fogColor);
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
    this.updateScene(0.016, performance.now());
    this.renderer.render(this.scene, this.camera);
  }

  private updateRoomEvents(dt: number, planes: ActivePlaneVisual[] = []): HudFrameData['roomEvent'] {
    const t = this.latestSnapshot?.mapEventTime ?? this.elapsedTime;
    const playing = this.mode === 'playing';
    const ev = playing ? getRoomEvent(this.currentMap, t) : null;
    // The cat (if any) swats on the shared clock and watches the nearest plane
    this.cat.update(
      playing ? getCatPose(this.currentMap, t) : null,
      this.elapsedTime,
      playing ? getCatPaw(this.currentMap, t) : null,
      planes.map((p) => p.interpPos)
    );

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

    this.titleTour.setVisible(mode === 'title_tour');

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
      this.cameraRig.snapNextFrame();
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
    this.hangarPlane = buildToyPlane(cosmetics.planeId, cosmetics.paintId, cosmetics.stickerId);
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
    this.glow.clear();
    this.fallingParts.clear();
    this.smoke.clear();
    this.confetti.clear();
    this.sparks.clear();
    this.sparkCooldown.clear();
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
    this.replayBuffer.clear();
    this.crash = null;
    this.replay = null;
    this.lastAttacker = null;
  }

  /** « Revoir l'action »: starts (or stops) the replay of the seconds before our last crash. */
  public toggleReplay(): void {
    if (this.replay) {
      this.stopReplay();
      return;
    }
    const crash = this.crash;
    if (!crash?.clip || this.localSim?.alive || this.mode !== 'playing') return;
    this.replay = {
      clip: crash.clip,
      start: crash.at - REPLAY_BEFORE_MS,
      end: crash.at + REPLAY_AFTER_MS,
      clockStart: performance.now(),
      focusId: crash.killerId ?? this.localPlayerId,
      frameIndex: -1,
    };
    this.cameraRig.snapNextFrame();
  }

  /** While a replay plays, our controls are not sent (the plane flies straight, spawn-protected). */
  public isReplaying(): boolean {
    return this.replay !== null;
  }

  private stopReplay(): void {
    this.replay = null;
    this.pool.syncProjectiles(this.latestSnapshot?.projectiles ?? []);
    this.cameraRig.snapNextFrame();
  }

  public cycleSpectator(dir: -1 | 1): void {
    // Q/D also steer: only switch the watched pilot when the local plane is out of the round
    if (this.localSim?.alive) return;
    this.spectatorIndex += dir;
  }

  public ingestSnapshot(snapshot: SnapshotPayload): void {
    this.latestSnapshot = snapshot;
    this.latestSnapshotAt = performance.now();
    const now = performance.now();
    this.replayBuffer.push(now, snapshot);
    // Our crash is complete once a little of what followed has arrived: keep that clip
    if (this.crash && !this.crash.clip && now >= this.crash.at + REPLAY_AFTER_MS) {
      this.crash.clip = this.replayBuffer.copyWindow(this.crash.at - REPLAY_BEFORE_MS, this.crash.at + REPLAY_AFTER_MS);
    }

    const seenIds = new Set<string>();
    for (const pData of snapshot.planes) {
      seenIds.add(pData.id);
      const isLocal = pData.id === this.localPlayerId;
      const meta = this.roomPlayersMeta.get(pData.id);
      const planeId = meta?.planeId ?? (isLocal ? this.localCosmetics.planeId : 'plastic_jet');
      const paintId = meta?.paintId ?? (isLocal ? this.localCosmetics.paintId : 'red');
      const stickerId = meta?.stickerId ?? (isLocal ? this.localCosmetics.stickerId : 'star');
      const cosmeticsKey = `${planeId}_${paintId}_${stickerId}_${pData.team}`;
      let pv = this.planeVisuals.get(pData.id);

      if (!pv || pv.cosmeticsKey !== cosmeticsKey) {
        if (pv) {
          this.scene.remove(pv.rig.root);
          pv.rig.dispose();
        }
        pv = createPlaneVisual(pData, planeId, paintId, stickerId, cosmeticsKey, this.mode === 'playing');
        this.scene.add(pv.rig.root);
        this.planeVisuals.set(pData.id, pv);
      }

      pv.buffer.push({ time: now, data: pData });
      while (pv.buffer.length > 10) pv.buffer.shift();

      // Detect elimination transition for cartoon POP burst
      if (pv.wasAlive && !pData.alive) {
        this.pool.spawnBurst(pData.x, pData.y, pData.z, 24, [0xef4444, 0xfacc15, 0x38bdf8, 0xffffff], 72, 2.0, 45, 0.75);
        this.glow.flash(pData.x, pData.y, pData.z, 22, 0xffd27a, 0.45, 0.8);
        this.glow.flash(pData.x, pData.y, pData.z, 10, 0xffffff, 0.18, 1.5);
        this.glow.shockwave(pData.x, pData.y, pData.z, 15, 0xfde68a, 0.5);
        // Plastic confetti in the plane's colours and toy-box colours
        const palette = PAINT_PALETTES[paintId] ?? PAINT_PALETTES.red;
        const own =
          pData.team === 'red' ? ['#EF4444', '#FEE2E2'] : pData.team === 'blue' ? ['#2563EB', '#DBEAFE'] : [palette.primary, palette.secondary];
        this.confetti.burst(
          pData.x,
          pData.y,
          pData.z,
          Math.round(70 * this.profile.effects),
          [...own.map((c) => new THREE.Color(c).getHex()), 0xfacc15, 0x38bdf8, 0xf472b6, 0x22c55e, 0xffffff],
          70
        );
        soundEngine.playPopExplosion(isLocal ? undefined : { x: pData.x, y: pData.y, z: pData.z });
        if (isLocal) {
          this.cameraRig.shake(0.75);
          const killer = this.lastAttacker && now - this.lastAttacker.at < 6000 ? this.lastAttacker.id : null;
          this.crash = { at: now, killerId: killer, clip: null };
        }
      }
      pv.wasAlive = pData.alive;

      // Reconcile local predicted plane
      if (isLocal) this.reconcileLocal(pData);
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
            this.pool.spawnBurst(cfg.x, cfg.y, cfg.z, 24, [0xfacc15, 0xef4444, 0x38bdf8, 0xf472b6, 0xffffff], 68, 2.2, 42, 0.75);
            this.glow.flash(cfg.x, cfg.y, cfg.z, cfg.radius * 2.2, 0xffe4a0, 0.35, 0.7);
            this.glow.shockwave(cfg.x, cfg.y, cfg.z, cfg.radius * 1.6, 0xffffff, 0.4);
            this.confetti.burst(cfg.x, cfg.y, cfg.z, Math.round(36 * this.profile.effects), DebrisField.colorsOf(group), 55);
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
      this.cameraRig.shake(0.55);
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
    // (during a replay the pellets shown are the replayed ones)
    if (!this.replay) this.pool.syncProjectiles(snapshot.projectiles);
  }

  public ingestHitEvent(ev: HitFeedbackEvent): void {
    const involvesMe = ev.targetId === this.localPlayerId || ev.attackerId === this.localPlayerId;
    const where = involvesMe ? undefined : { x: ev.x, y: ev.y, z: ev.z };
    if (ev.targetId === this.localPlayerId && ev.attackerId !== ev.targetId) {
      this.lastAttacker = { id: ev.attackerId, at: performance.now() };
    }
    if (ev.damage <= 0 && !ev.fatal) {
      // Absorbed (spawn protection, bubble shield) or repair: light spark only — no hit flash or
      // camera shake, and a sound that says why nothing happened.
      this.pool.spawnBurst(ev.x, ev.y, ev.z, 4, [0xbae6fd, 0xffffff], 50, 1.0, 20, 0.25);
      this.glow.flash(ev.x, ev.y, ev.z, 7, 0x7dd3fc, 0.2, 0.6);
      if (ev.attackerId !== ev.targetId) {
        const target = this.planeVisuals.get(ev.targetId)?.buffer.at(-1)?.data;
        if (target?.invuln) soundEngine.playDeflect(where);
        else soundEngine.playShieldBoing(where);
      }
      return;
    }
    this.pool.spawnBurst(ev.x, ev.y, ev.z, ev.fatal ? 18 : 7, [0xfacc15, 0xf97316, 0xffffff], 50, 1.3, 20, 0.35);
    this.glow.flash(ev.x, ev.y, ev.z, ev.fatal ? 16 : 9, 0xffb347, 0.22, 0.9);
    const pv = this.planeVisuals.get(ev.targetId);
    if (pv) {
      pv.hitFlashTimer = 0.08;
    }
    // Our own hits are played up front; other duels are heard from where they happen
    soundEngine.playHit(where);
    if (ev.targetId === this.localPlayerId) {
      this.cameraRig.shake(ev.fatal ? 0.8 : 0.35);
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
      // First update, or back in flight after a crash: start from the server's state
      this.cameraRig.snapNextFrame();
      this.localSim = simFromSnapshot(auth, arch);
      this.pendingInputs.length = 0;
      return;
    }
    const heard = reconcileLocalSim(
      this.localSim,
      auth,
      this.pendingInputs,
      arch,
      this.currentMap,
      this.latestSnapshot?.mapEventTime ?? this.elapsedTime,
      this.destroyedColliderIds
    );
    if (heard.shieldPopped) soundEngine.playShieldPop();
    if (heard.pickedUp) soundEngine.playPickup();
  }

  /** Latest known state of every other plane (aim assist candidates). */
  private *opponentPlanes(): Generator<SnapshotPlane> {
    for (const pv of this.planeVisuals.values()) {
      if (pv.id === this.localPlayerId) continue;
      const data = pv.buffer[pv.buffer.length - 1]?.data;
      if (data) yield data;
    }
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
    if (canControl && this.localPlayerId) {
      const assist = computeAimAssist(
        this.localSim,
        this.opponentPlanes(),
        PLANE_ARCHETYPES[this.localCosmetics.planeId],
        this.aimAssistStrength,
        this.roomPlayersMeta.get(this.localPlayerId)?.team ?? 'none'
      );
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
      this.cameraRig.shake(0.3);
      soundEngine.playHit();
    }

    // Muzzle audio + spark locally for crisp feel
    this.localFireVisualCooldown = Math.max(0, this.localFireVisualCooldown - dt);
    if (inp.fire && !this.localSim.overheated && this.localFireVisualCooldown <= 0) {
      this.localFireVisualCooldown = 1 / arch.fireRate;
      soundEngine.playPelletShot(arch.heavyGun);
      const fwd = getPlaneForward(this.localSim);
      this.glow.flash(this.localSim.x + fwd.x * 7, this.localSim.y + fwd.y * 7, this.localSim.z + fwd.z * 7, 4, 0xfff1b0, 0.08, 0.5);
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

    const speedRatio = (this.localSim.speed - arch.minSpeed) / (arch.boostSpeed - arch.minSpeed);
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
      setOutlinePixelScale(this.camera.fov, this.container.clientHeight || 600);
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

  /** Software rendering: wait for the GPU fence before the next frame instead of piling frames up. */
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
    this.glow.begin();
    this.updateSceneParts(dt, now);
    if (this.mode !== 'playing') this.speedLines.update(0, dt);
    const buffer = this.renderer.getDrawingBufferSize(this._drawSize);
    this.glow.setViewport(this.camera.fov, buffer.y);
    this.smoke.setViewport(this.camera.fov, buffer.y);
    this.glow.end(dt, this.camera);
  }

  private readonly _drawSize = new THREE.Vector2();

  private updateSceneParts(dt: number, now: number): void {
    const animTime =
      this.mode === 'playing' && this.latestSnapshot ? this.latestSnapshot.mapEventTime : this.elapsedTime;
    this.mapHandles.updateAnimations(animTime, dt);

    this.pool.updateParticles(dt);
    this.fallingParts.update(dt, 0.8);
    this.smoke.update(dt);
    this.confetti.update(dt, this.elapsedTime, 0.6);
    this.sparks.update(dt);
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
      this.updatePodium(dt);
      return;
    }

    if (this.mode === 'title_tour') {
      this.cameraRig.titleFlyover(this.elapsedTime);
      this.titleTour.update(this.elapsedTime, dt);
      return;
    }

    if (this.mode === 'hangar_preview' && this.hangarPlane) {
      // Plane sits at its usual spot on the (enlarged) desk, slowly turning
      this.hangarPlane.root.rotation.y = this.elapsedTime * 0.75;
      this.hangarPlane.root.position.y = HANGAR_SPOT.y + Math.sin(this.elapsedTime * 2.2) * 1.5;
      for (const prop of this.hangarPlane.propellers) prop.rotation.z += dt * 24;
      if (this.hangarPlane.windupKey) this.hangarPlane.windupKey.rotation.y += dt * 6;
      this.cameraRig.hangarCloseUp(HANGAR_SPOT);
      return;
    }

    this.updateMatch(dt, now);
  }

  /**
   * A plane scraping the room throws sparks from the touching point; one flying through the
   * sprinkler's jet sprays water drops. Same clock as the room (moving pieces, cat).
   */
  private planeContactFx(pv: ActivePlaneVisual, dt: number): void {
    const wait = (this.sparkCooldown.get(pv.id) ?? 0) - dt;
    this.sparkCooldown.set(pv.id, wait);
    if (wait > 0) return;
    const p = pv.interpPos;
    this._vel.copy(p).sub(pv.prevPos).divideScalar(Math.max(0.001, dt));
    const speed = this._vel.length();
    if (speed < 20 || speed > 400) return;
    const meta = this.roomPlayersMeta.get(pv.id);
    const r = (PLANE_ARCHETYPES[meta?.planeId ?? 'plastic_jet'] ?? PLANE_ARCHETYPES.plastic_jet).hitboxRadius + 0.8;
    const t = this.latestSnapshot?.mapEventTime ?? this.elapsedTime;
    this.frameMoving ??= movingColliders(this.currentMap, t);
    const c = roomContact(this.currentMap, p.x, p.y, p.z, r, t, this.destroyedColliderIds, this.frameMoving);
    if (c) {
      this.sparks.scrape(c.x, c.y, c.z, c.nx, c.ny, c.nz, this._vel.x, this._vel.y, this._vel.z, 1 + Math.round(4 * this.profile.effects));
      this.glow.flash(c.x, c.y, c.z, 3.5, 0xffc46b, 0.12, 0.4);
      this.sparkCooldown.set(pv.id, 0.05);
      return;
    }
    if (inSprinklerSpray(this.currentMap, p.x, p.y, p.z, t)) {
      this.pool.spawnBurst(p.x, p.y, p.z, 2 + Math.round(4 * this.profile.effects), [0x7dd3fc, 0xe0f2fe, 0xffffff], 34, 0.55, 70, 0.45);
      this.sparkCooldown.set(pv.id, 0.07);
    }
  }

  /** End of match: the podium turns, the camera orbits it, confetti falls. */
  private updatePodium(dt: number): void {
    if (!this.podium) return;
    this.podium.update(this.elapsedTime, dt);
    this.cameraRig.podiumOrbit(
      this.podiumAnchor,
      this.elapsedTime,
      this.container.clientWidth > 1000,
      this.mapHandles.cameraColliders
    );
    this.confettiTimer -= dt;
    if (this.confettiTimer <= 0) {
      this.confettiTimer = 0.28;
      const c = this.podiumAnchor;
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
  }

  /** In a match: every plane, the camera, objectives, room events, 3D sound and the HUD frame. */
  private updateMatch(dt: number, now: number): void {
    const renderTime = now - REMOTE_INTERP_DELAY_MS;
    // « Revoir l'action »: time inside the replayed clip, or null when showing the live match
    let replayT: number | null = null;
    // (if our plane comes back meanwhile, it waits under its spawn protection: see isReplaying)
    if (this.replay) {
      replayT = this.replay.start + (now - this.replay.clockStart);
      if (replayT > this.replay.end) {
        this.stopReplay();
        replayT = null;
      }
    }
    const replay = replayT !== null ? this.replay : null;
    if (replay && replayT !== null) {
      const idx = replay.clip.indexAt(replayT);
      if (idx !== replay.frameIndex) {
        replay.frameIndex = idx;
        this.pool.syncProjectiles(replay.clip.frameAt(idx)?.snapshot.projectiles ?? []);
      }
    }
    this.frameMoving = null;
    const minimapBlips: MinimapBlip[] = [];
    const livingPlanes: ActivePlaneVisual[] = [];
    const localVisual = this.localPlayerId ? this.planeVisuals.get(this.localPlayerId) : undefined;

    for (const pv of this.planeVisuals.values()) {
      const latest = pv.buffer[pv.buffer.length - 1]?.data;
      if (!latest) continue;

      const rp = replay && replayT !== null ? replay.clip.planePose(pv.id, replayT) : null;
      const shown = rp?.data ?? latest;
      if (replay) {
        // Replay: every plane where it was at that moment
        if (rp) {
          pv.interpPos.set(rp.x, rp.y, rp.z);
          pv.interpQuat.set(rp.qx, rp.qy, rp.qz, rp.qw);
        }
        pv.rig.root.visible = !!rp && rp.alive;
      } else if (pv.id === this.localPlayerId && this.localSim) {
        // Our own plane: the predicted simulation
        pv.interpPos.set(this.localSim.x, this.localSim.y, this.localSim.z);
        pv.interpQuat.set(this.localSim.qx, this.localSim.qy, this.localSim.qz, this.localSim.qw);
        pv.rig.root.visible = this.localSim.alive;
      } else {
        interpolateRemote(pv, renderTime);
        pv.rig.root.visible = latest.alive;
      }

      pv.rig.root.position.copy(pv.interpPos);
      pv.rig.root.quaternion.copy(pv.interpQuat);

      // Fly-by whoosh when another plane brushes past ours
      if (pv.id !== this.localPlayerId && !replay) {
        const localPos = localVisual && this.localSim?.alive ? localVisual.interpPos : null;
        if (detectFlyby(pv, latest, localPos, dt)) {
          const meta = this.roomPlayersMeta.get(pv.id);
          soundEngine.playFlyby(meta?.planeId ?? 'plastic_jet', {
            x: pv.interpPos.x,
            y: pv.interpPos.y,
            z: pv.interpPos.z,
          });
        }
      }

      if (pv.rig.root.visible && !replay) this.planeContactFx(pv, dt);

      animatePlaneVisual(pv, shown, this.roomPlayersMeta.get(pv.id)?.maxHp ?? 100, dt, this.elapsedTime, {
        pool: this.pool,
        glow: this.glow,
        smoke: this.smoke,
        parts: this.fallingParts,
        effects: this.profile.effects,
      });

      if (pv.rig.root.visible) {
        livingPlanes.push(pv);
        this._v1.set(0, 0, -1).applyQuaternion(pv.interpQuat);
        minimapBlips.push({
          id: pv.id,
          x: pv.interpPos.x,
          z: pv.interpPos.z,
          yaw: Math.atan2(-this._v1.x, -this._v1.z),
          team: pv.team,
          isLocal: pv.id === this.localPlayerId,
        });
      }
    }

    // Camera focus: our plane, or the pilot we are watching once out of the round
    let focusPos: THREE.Vector3 | null = null;
    let focusQuat: THREE.Quaternion | null = null;
    let isBoosting = false;
    if (localVisual && this.localSim && this.localSim.alive) {
      focusPos = localVisual.interpPos;
      focusQuat = localVisual.interpQuat;
      isBoosting = (this.inputState.boost && this.localSim.boost > 2) || this.localSim.turboTimer > 0;
      this.currentSpectatingName = '';
    } else if (livingPlanes.length > 0) {
      const idx = ((this.spectatorIndex % livingPlanes.length) + livingPlanes.length) % livingPlanes.length;
      const spec = livingPlanes[idx];
      focusPos = spec.interpPos;
      focusQuat = spec.interpQuat;
      this.currentSpectatingName = this.roomPlayersMeta.get(spec.id)?.nickname ?? '';
    }

    if (replay) {
      // Replay: follow whoever shot us down (or our own plane)
      const target = (replay.focusId ? this.planeVisuals.get(replay.focusId) : undefined) ?? localVisual;
      if (target) {
        focusPos = target.interpPos;
        focusQuat = target.interpQuat;
        isBoosting = false;
      }
    }

    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;

    // Objective modes: markers, HUD figures and a screen pointer toward the next ring / the zone
    const objectiveFrame = this.objectiveTracker.update({
      snapshot: this.latestSnapshot,
      gameMode: this.gameMode,
      playing: this.mode === 'playing',
      map: this.currentMap,
      mapId: this.currentMapId,
      localPlayerId: this.localPlayerId,
      livingPlanes,
      nicknameOf: (id) => this.roomPlayersMeta.get(id)?.nickname ?? '',
      camera: this.camera,
      width,
      height,
      elapsedTime: this.elapsedTime,
    });

    // Room events (same clock as the server): cat crossing, blackout, fridge opening by itself
    const roomEvent = this.updateRoomEvents(dt, livingPlanes);

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
        // A helicopter leaves no wingtip ribbons
        visible: pv.rig.root.visible && !arch.hover,
        intense: Boolean(latest?.turboActive) || speed > arch.maxSpeed * 1.02,
      });
    }
    this.trails.update(trailInputs, dt);

    // Ring race: the ghost of our best race in this room, and the recording of this one
    const snap = this.latestSnapshot;
    const racing = this.gameMode === 'ring_race' && this.mode === 'playing' && !!snap;
    const raceHud = objectiveFrame.hud?.kind === 'race' ? objectiveFrame.hud : null;
    this.raceGhost.update({
      active: racing,
      map: this.currentMap,
      mapId: this.currentMapId,
      raceTime: snap
        ? roundDuration(this.gameMode) - snap.roundTimer + Math.min(0.2, (now - this.latestSnapshotAt) / 1000)
        : null,
      local: this.localSim,
      planeId: this.localCosmetics.planeId,
      paintId: this.localCosmetics.paintId,
      finishedTime: raceHud?.finished ? raceHud.time : null,
      dt,
    });

    // Cockpit view only while flying our own plane (spectating always uses the chase view)
    const cockpitActive =
      this.cameraView === 'cockpit' && !!localVisual && !!this.localSim?.alive && focusPos === localVisual.interpPos;
    if (localVisual) {
      for (const part of localVisual.rig.cockpitHidden) part.visible = !cockpitActive;
    }
    this.cockpitActive = cockpitActive;

    // Turbo: speed streaks around our own view (not while spectating or replaying)
    this.speedLines.update(
      this.profile.speedLines && !replay && focusPos === localVisual?.interpPos && isBoosting ? 1 : 0,
      dt
    );

    if (focusPos && focusQuat && cockpitActive) {
      this.cameraRig.cockpit(focusPos, focusQuat, this.localCosmetics.planeId, isBoosting, dt);
    } else if (focusPos && focusQuat) {
      this.cameraRig.chase(focusPos, focusQuat, isBoosting, dt, this.mapHandles.cameraColliders, this.currentMap.hardBounds);
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

    if (!this.hudCallback) return;
    const sim = this.localSim;
    const { bankDeg, pitchDeg, climbRate } = sim ? flightAttitude(sim) : { bankDeg: 0, pitchDeg: 0, climbRate: 0 };
    this.hudCallback({
      cockpit: this.cockpitActive,
      planeId: this.localCosmetics.planeId,
      bankDeg,
      pitchDeg,
      altitude: Math.max(0, (sim?.y ?? 0) - this.currentMap.hardBounds.minY),
      climbRate,
      objective: objectiveFrame.hud,
      roomEvent,
      objectiveMarker:
        objectiveFrame.marker ??
        ((): HudFrameData['objectiveMarker'] => {
          const t = this.guideTarget();
          return t ? screenEdgeMarker(t, this.camera, width, height) : null;
        })(),
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
      replay: {
        available: !this.replay && !!this.crash?.clip && !this.localSim?.alive,
        active: !!replay,
        progress: replay && replayT !== null ? (replayT - replay.start) / (replay.end - replay.start) : 0,
        killerName: this.crash?.killerId ? (this.roomPlayersMeta.get(this.crash.killerId)?.nickname ?? '') : '',
      },
      labels: projectPlaneLabels(livingPlanes, this.localPlayerId, focusPos, this.camera, width, height, (id) =>
        this.roomPlayersMeta.get(id)
      ),
      minimapBlips,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.resetMatchVisuals();
    this.titleTour.dispose();
    if (this.hangarPlane) {
      this.scene.remove(this.hangarPlane.root);
      this.hangarPlane.dispose();
    }
    this.mapHandles.dispose();
    this.pool.dispose();
    this.glow.dispose();
    this.speedLines.dispose();
    this.smoke.dispose();
    this.confetti.dispose();
    this.sparks.dispose();
    this.fallingParts.clear();
    this.trails.dispose();
    this.debris.dispose();
    this.podium?.dispose();
    this.objectives3d.dispose();
    this.raceGhost.dispose();
    this.cat.dispose();
    this.extrasRenderer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
