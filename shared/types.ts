import type { WireSnapshot } from './snapshotCodec';

export type PlaneId =
  | 'plastic_jet'
  | 'windup_biplane'
  | 'foam_glider'
  | 'diecast_bomber';

export type PaintId =
  | 'red'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'orange'
  | 'white'
  | 'purple'
  | 'pink'
  | 'gold';

export type StickerId = 'star' | 'lightning' | 'target' | 'flame' | 'heart' | 'crown';

export type PowerUpId =
  | 'rubber_missile'
  | 'water_bomb'
  | 'firecracker'
  | 'glue_mine'
  | 'turbo_battery'
  | 'bubble_shield'
  | 'repair_tape'
  | 'magnet';

export type SecondaryProjectileKind =
  | 'rubber_missile'
  | 'water_bomb'
  | 'firecracker'
  | 'glue_mine';

export type GameModeId = 'last_plane_ffa' | 'last_plane_teams' | 'ring_race' | 'king_of_sky';

export type MapId = 'desk' | 'kitchen' | 'garden' | 'attic';

export type TeamId = 'none' | 'red' | 'blue';

export type RoomPhase =
  | 'lobby'
  | 'countdown'
  | 'playing'
  | 'round_end'
  | 'match_end';

export type BotDifficulty = 'easy' | 'normal' | 'expert';

export interface RoomSettings {
  mode: GameModeId;
  mapId: MapId;
  livesPerRound: number;
  botsEnabled: boolean;
  botDifficulty: BotDifficulty;
  maxPlayers: number;
  friendlyFire: boolean;
  isPrivate: boolean;
}

export interface PlayerCosmetics {
  planeId: PlaneId;
  paintId: PaintId;
  stickerId: StickerId;
}

export interface PlayerLobbyInfo {
  id: string;
  nickname: string;
  isHost: boolean;
  isBot: boolean;
  ready: boolean;
  connected: boolean;
  team: TeamId;
  cosmetics: PlayerCosmetics;
  ping: number;
}

export interface MatchScoreEntry {
  playerId: string;
  nickname: string;
  isBot: boolean;
  team: TeamId;
  planeId: PlaneId;
  paintId: PaintId;
  kills: number;
  deaths: number;
  /** Deaths by own fault: crash, out of bounds, hazard, vacuum */
  crashes: number;
  /** Power-ups picked up */
  pickups: number;
  /** Household props destroyed */
  propsBroken: number;
  roundWins: number;
  score: number;
  alive: boolean;
  livesRemaining: number;
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: PlayerLobbyInfo[];
  roundNumber: number;
  maxRounds: number;
  roundTimer: number;
  countdownTimer: number;
  suddenDeath: boolean;
  teamRoundWins: { red: number; blue: number };
  lastRoundWinner: {
    winnerId: string | null;
    winnerTeam: TeamId;
    winnerName: string;
  } | null;
  scoreboard: MatchScoreEntry[];
}

export interface PlayerInputState {
  seq: number;
  dt: number;
  aimX: number; // -1..1 normalized steering offset from screen center
  aimY: number; // -1..1 normalized pitch steering offset
  throttle: number; // -1..1
  roll: number; // -1..1
  boost: boolean;
  fire: boolean;
  useSecondary: boolean;
  barrelRollDir: -1 | 0 | 1;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface PlaneSimState {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  speed: number;
  hp: number;
  maxHp: number;
  boost: number; // 0..100
  heat: number; // 0..100
  overheated: boolean;
  barrelRollTimer: number; // >0 while barrel rolling
  barrelRollCooldown: number;
  barrelRollDir: -1 | 0 | 1;
  invulnTimer: number;
  outOfBoundsTimer: number; // >0 when outside soft bounds
  alive: boolean;
  lives: number;
  respawnTimer: number;
  fireCooldown: number;
  secondaryCooldown: number;
  hitFlashTimer: number;
  collideCooldown: number;
  secondaryPowerUp: PowerUpId | null;
  secondaryUses: number;
  shieldTimer: number;
  shieldHp: number;
  turboTimer: number;
  glueTimer: number;
  magnetTimer: number;
}

export interface SnapshotPlane {
  id: string;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  speed: number;
  hp: number;
  boost: number;
  heat: number;
  overheated: boolean;
  alive: boolean;
  lives: number;
  invuln: boolean;
  outOfBounds: number;
  barrelRoll: number;
  secondaryPowerUp: PowerUpId | null;
  secondaryUses: number;
  shielded: boolean;
  turboActive: boolean;
  glued: boolean;
  magnetActive: boolean;
  lastAckSeq: number;
  /** Objective modes: rings passed (race) or seconds held (king of the sky) */
  objective: number;
}

export interface SnapshotProjectile {
  id: number;
  ownerId: string;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heavy: boolean;
}

export interface SnapshotSecondaryProjectile {
  id: number;
  kind: SecondaryProjectileKind;
  ownerId: string;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface SnapshotPowerUpPickup {
  id: string;
  powerUpId: PowerUpId;
  x: number;
  y: number;
  z: number;
}

export interface SnapshotDestructible {
  id: string;
  hp: number;
  maxHp: number;
  destroyed: boolean;
}

export interface SnapshotVacuum {
  active: boolean;
  x: number;
  y: number;
  z: number;
  safeRadius: number;
}

export interface SnapshotPayload {
  tick: number;
  serverTime: number;
  roundTimer: number;
  suddenDeath: boolean;
  fanAngle: number;
  mapEventTime: number;
  planes: SnapshotPlane[];
  projectiles: SnapshotProjectile[];
  secondaryProjectiles: SnapshotSecondaryProjectile[];
  powerUps: SnapshotPowerUpPickup[];
  destructibles: SnapshotDestructible[];
  vacuum: SnapshotVacuum | null;
}

export interface KillFeedEntry {
  id: string;
  killerName: string;
  killerTeam: TeamId;
  victimName: string;
  victimTeam: TeamId;
  reason: 'gun' | 'crash' | 'oob' | 'secondary' | 'vacuum' | 'hazard';
  powerUpId?: PowerUpId;
  hazardNameFr?: string;
  timestamp: number;
}

export interface HitFeedbackEvent {
  targetId: string;
  attackerId: string;
  damage: number;
  x: number;
  y: number;
  z: number;
  fatal: boolean;
}

export interface JoinRoomPayload {
  mode: 'quick' | 'create' | 'join';
  roomCode?: string;
  nickname: string;
  cosmetics: PlayerCosmetics;
  sessionToken: string;
}

export interface ClientToServerEvents {
  'room:join': (
    payload: JoinRoomPayload,
    ack: (res: { ok: boolean; room?: RoomState; playerId?: string; error?: string }) => void
  ) => void;
  'room:leave': () => void;
  'room:updateSettings': (settings: Partial<RoomSettings>) => void;
  'room:setReady': (ready: boolean) => void;
  'room:switchTeam': (team: TeamId) => void;
  'room:updateCosmetics': (cosmetics: PlayerCosmetics) => void;
  'room:startMatch': () => void;
  'room:playAgain': () => void;
  'game:input': (input: PlayerInputState) => void;
  'net:ping': (clientSentAt: number, ack: (clientSentAt: number) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'game:snapshot': (snapshot: WireSnapshot) => void;
  'game:hit': (event: HitFeedbackEvent) => void;
  'game:killfeed': (entry: KillFeedEntry) => void;
  'room:error': (message: string) => void;
  'net:probe': (ack: () => void) => void;
  'server:hello': (info: { protocol: number }) => void;
}
