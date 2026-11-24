import type { DestructiblePropConfig } from '../shared/maps/types';
import type {
  GameModeId,
  MapId,
  PlaneSimState,
  PlayerCosmetics,
  PlayerInputState,
  PowerUpId,
  RoomPhase,
  RoomSettings,
  SecondaryProjectileKind,
  TeamId,
} from '../shared/types';

export type BotPersonality = 'hunter' | 'evader' | 'ambusher';

export interface ServerProjectile {
  id: number;
  ownerId: string;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  heavy: boolean;
  ttl: number;
}

export interface ServerSecondaryProjectile {
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
  damage: number;
  radius: number;
  ttl: number;
  maxTtl: number;
}

export interface ServerPowerUpPickup {
  id: string;
  powerUpId: PowerUpId;
  x: number;
  y: number;
  z: number;
  spotId?: string;
}

export interface ServerPowerUpSpotState {
  id: string;
  x: number;
  y: number;
  z: number;
  respawnTimer: number;
}

export interface ServerDestructibleState {
  id: string;
  colliderId: string;
  kind: DestructiblePropConfig['kind'];
  x: number;
  y: number;
  z: number;
  radius: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  dropsPowerUp: boolean;
  rewardPool?: PowerUpId[];
}

export interface RewindFrame {
  time: number;
  planes: Map<string, { x: number; y: number; z: number; radius: number; alive: boolean }>;
}

export interface ServerPlayer {
  id: string;
  sessionToken: string;
  socketId: string | null;
  nickname: string;
  isHost: boolean;
  isBot: boolean;
  botPersonality?: BotPersonality;
  botThinkTimer?: number;
  botTargetId?: string | null;
  ready: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  team: TeamId;
  cosmetics: PlayerCosmetics;
  ping: number;
  sim: PlaneSimState;
  inputQueue: PlayerInputState[];
  lastInput: PlayerInputState | null;
  idleRepeatTime: number;
  dtBudget: number;
  lastProcessedSeq: number;
  kills: number;
  deaths: number;
  roundWins: number;
  score: number;
  lastHitBy: string | null;
  lastHitAt: number;
}

export interface ServerRoom {
  code: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: Map<string, ServerPlayer>;
  projectiles: ServerProjectile[];
  secondaryProjectiles: ServerSecondaryProjectile[];
  powerUps: ServerPowerUpPickup[];
  powerUpSpots: ServerPowerUpSpotState[];
  destructibles: ServerDestructibleState[];
  destroyedColliderIds: Set<string>;
  nextProjectileId: number;
  nextPowerUpId: number;
  tick: number;
  elapsedTime: number;
  roundNumber: number;
  maxRounds: number;
  roundTimer: number;
  countdownTimer: number;
  roundEndTimer: number;
  suddenDeath: boolean;
  suddenDeathElapsed: number;
  roundHadBothTeams: boolean;
  teamRoundWins: { red: number; blue: number };
  lastRoundWinner: {
    winnerId: string | null;
    winnerTeam: TeamId;
    winnerName: string;
  } | null;
  rewindHistory: RewindFrame[];
  createdAt: number;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  mode: 'last_plane_ffa' as GameModeId,
  mapId: 'desk' as MapId,
  livesPerRound: 3,
  botsEnabled: true,
  maxPlayers: 12,
  friendlyFire: false,
  isPrivate: false,
};
