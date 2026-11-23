import type { MapId } from '../types';

export type ColliderTier = 'static' | 'medium' | 'small';

export interface BoxCollider {
  id: string;
  kind: 'box';
  tier: ColliderTier;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  damageOnHit?: number;
}

export interface SphereCollider {
  id: string;
  kind: 'sphere';
  tier: ColliderTier;
  x: number;
  y: number;
  z: number;
  radius: number;
  damageOnHit?: number;
}

export interface CapsuleCollider {
  id: string;
  kind: 'capsule';
  tier: ColliderTier;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  radius: number;
  damageOnHit?: number;
}

export type MapCollider = BoxCollider | SphereCollider | CapsuleCollider;

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number; // radians around Y; 0 = -Z forward
}

export interface WindZoneConfig {
  originX: number;
  originY: number;
  originZ: number;
  range: number;
  coneHalfAngle: number;
  baseYaw: number;
  sweepAmplitude: number;
  sweepSpeed: number;
  pushStrength: number; // cm/s^2 acceleration
}

export interface PowerUpSpotConfig {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface MapDefinition {
  id: MapId;
  nameFr: string;
  subtitleFr: string;
  available: boolean;
  hardBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  softBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  skyColor: string;
  fogColor: string;
  colliders: MapCollider[];
  spawns: SpawnPoint[];
  windZones: WindZoneConfig[];
  powerUpSpots: PowerUpSpotConfig[];
}
