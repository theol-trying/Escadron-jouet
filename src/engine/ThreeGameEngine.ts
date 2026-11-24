import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  getPlaneForward,
  quatFromYaw,
  stepPlanePhysics,
} from '../../shared/flightPhysics';
import { MAPS } from '../../shared/maps/index';
import type { MapDefinition } from '../../shared/maps/types';
import { PLANE_ARCHETYPES } from '../../shared/planes';
import type {
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
import { soundEngine } from '../audio/soundEngine';
import { MatchExtrasRenderer } from './m3Visuals';
import { buildDeskScene } from './maps/buildDeskScene';
import { buildGardenScene } from './maps/buildGardenScene';
import { buildKitchenScene } from './maps/buildKitchenScene';
import type { MapSceneHandles } from './maps/types';
import { ParticleAndProjectilePool } from './particlePool';
import { buildToyPlane, type BuiltPlaneRig } from './planeBuilder';

export type EngineMode = 'title_tour' | 'hangar_preview' | 'playing';

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
}

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

  private hudCallback: ((data: HudFrameData) => void) | null = null;
  private resizeObserver: ResizeObserver;

  // Pre-allocated scratch math objects (Zero-GC in tick)
  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly _v3 = new THREE.Vector3();
  private readonly _q1 = new THREE.Quaternion();
  private readonly _q2 = new THREE.Quaternion();
  private readonly _raycaster = new THREE.Raycaster();
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
    this.scene.fog = new THREE.Fog(this.currentMap.fogColor, 240, 560);

    // Mandatory studio environment reflection (RoomEnvironment)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.5, 950);

    // Warm sunny window directional key light + cool HemisphereLight fill
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0xfde68a, 0.95);
    this.scene.add(hemi);

    const sunKey = new THREE.DirectionalLight(0xfff1d6, 1.45);
    sunKey.position.set(-220, 240, 60);
    sunKey.castShadow = !this.isSoftwareGl;
    sunKey.shadow.mapSize.width = 1024;
    sunKey.shadow.mapSize.height = 1024;
    sunKey.shadow.camera.near = 20;
    sunKey.shadow.camera.far = 650;
    sunKey.shadow.camera.left = -240;
    sunKey.shadow.camera.right = 240;
    sunKey.shadow.camera.top = 220;
    sunKey.shadow.camera.bottom = -220;
    sunKey.shadow.bias = -0.0005;
    sunKey.shadow.normalBias = 0.02;
    this.scene.add(sunKey);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    rimLight.position.set(180, 140, -160);
    this.scene.add(rimLight);

    // Build initial 3D world
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.mapHandles = this.buildMapScene(this.currentMapId);
    this.pool = new ParticleAndProjectilePool(this.scene);
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
      this.tourPlanes.push({ rig, phase, radius, y });
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
    this.scene.background = new THREE.Color(this.currentMap.skyColor);
    this.scene.fog = new THREE.Fog(
      this.currentMap.fogColor,
      mapId === 'garden' ? 320 : 240,
      mapId === 'garden' ? 760 : 560
    );
    this.destroyedColliderIds.clear();
    this.knownDestroyedProps.clear();
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
    this.updateScene(0.016, performance.now());
    this.renderer.render(this.scene, this.camera);
  }

  public setMode(mode: EngineMode, cosmetics?: PlayerCosmetics): void {
    this.mode = mode;

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
    this.hangarPlane.root.position.set(18, 114, 18);
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
        soundEngine.playPopExplosion();
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
          soundEngine.playPropBreak();
        }
      }
    }

    // Sudden death transition alert
    if (snapshot.suddenDeath && !this.wasSuddenDeath) {
      this.wasSuddenDeath = true;
      soundEngine.playVacuumAlert();
      this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.55);
    } else if (!snapshot.suddenDeath) {
      this.wasSuddenDeath = false;
    }

    // Sync projectiles immediately
    this.pool.syncProjectiles(snapshot.projectiles);
  }

  public ingestHitEvent(ev: HitFeedbackEvent): void {
    this.pool.spawnBurst(ev.x, ev.y, ev.z, ev.fatal ? 18 : 7, [0xfacc15, 0xf97316, 0xffffff], 50, 1.3, 20, 0.35);
    const pv = this.planeVisuals.get(ev.targetId);
    if (pv) {
      pv.hitFlashTimer = 0.08;
    }
    if (ev.targetId === this.localPlayerId || ev.attackerId === this.localPlayerId) {
      soundEngine.playHit();
    }
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

    const inp: PlayerInputState = {
      seq: ++this.inputSeq,
      dt,
      aimX: canControl ? this.inputState.aimX : 0,
      aimY: canControl ? this.inputState.aimY : 0,
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
    this.extrasRenderer.syncAndAnimate(
      this.elapsedTime,
      this.latestSnapshot?.powerUps ?? [],
      this.latestSnapshot?.secondaryProjectiles ?? [],
      this.latestSnapshot?.vacuum ?? null,
      this.mode === 'playing'
    );

    if (this.mode === 'title_tour') {
      const t = this.elapsedTime * 0.18;
      this.camera.position.set(
        Math.cos(t) * 190,
        142 + Math.sin(t * 1.4) * 18,
        Math.sin(t) * 145
      );
      this.camera.lookAt(-15, 96, -20);
      if (this.camera.fov !== 62) {
        this.camera.fov = 62;
        this.camera.updateProjectionMatrix();
      }

      for (const tp of this.tourPlanes) {
        const a = this.elapsedTime * 0.72 + tp.phase;
        const x = Math.cos(a) * tp.radius;
        const z = Math.sin(a) * tp.radius * 0.78;
        const y = tp.y + Math.sin(a * 2) * 8;
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
      this.hangarPlane.root.position.y = 115 + Math.sin(this.elapsedTime * 2.2) * 1.5;
      for (const prop of this.hangarPlane.propellers) prop.rotation.z += dt * 24;
      if (this.hangarPlane.windupKey) this.hangarPlane.windupKey.rotation.y += dt * 6;
      this.camera.position.set(42, 121, 45);
      this.camera.lookAt(11, 114, 22);
      if (this.camera.fov !== 50) {
        this.camera.fov = 50;
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    // Playing mode: update all plane visuals
    const renderTime = now - 95; // ~95ms interpolation buffer for remote planes
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

      // Animate propellers & windup key
      const speedSpin = 18 + latest.speed * 0.25;
      for (const prop of pv.rig.propellers) prop.rotation.z += dt * speedSpin;
      if (pv.rig.windupKey) pv.rig.windupKey.rotation.y += dt * (4 + latest.speed * 0.06);

      // Power-up status auras
      pv.rig.shieldMesh.visible = latest.shielded;
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

    if (focusPos && focusQuat) {
      // Desired chase offset behind and slightly above plane
      this._v1.set(0, 5.4, 21.0).applyQuaternion(focusQuat).add(focusPos);
      this._v2.set(0, 1.8, -26).applyQuaternion(focusQuat).add(focusPos);

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
          const safeDist = Math.max(10.5, visibleHit.distance - 2.2);
          this._v1.copy(focusPos).addScaledVector(this._v3, safeDist);
          // Lift camera slightly higher when pulled close so own plane stays framed
          if (safeDist < 15) {
            this._v1.y += (15 - safeDist) * 0.75;
          }
        }
      }

      // Clamp camera inside room walls
      this._v1.x = Math.max(-244, Math.min(244, this._v1.x));
      this._v1.y = Math.max(8, Math.min(220, this._v1.y));
      this._v1.z = Math.max(-180, Math.min(180, this._v1.z));

      // If wall clamping pushed camera too close to plane, elevate slightly for clear view
      const clampedDist = this._v1.distanceTo(focusPos);
      if (clampedDist < 12.5) {
        const lift = 12.5 - clampedDist;
        this._v1.y = Math.min(220, this._v1.y + lift * 0.9);
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
      this.hudCallback({
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
    this.extrasRenderer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
