import type { MapId, PowerUpId } from '../types';

export type ColliderTier = 'static' | 'medium' | 'small';

export interface HingeDoorAnimation {
  pivotX: number;
  pivotZ: number;
  lengthX: number;
  thicknessZ: number;
  maxAngle: number; // radians, sweeps from 0 to maxAngle
  cycleSeconds: number;
}

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
  hinge?: HingeDoorAnimation;
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
  continuousSpin?: boolean;
}

export interface UpdraftZoneConfig {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  liftStrength: number;
}

export interface HazardZoneConfig {
  id: string;
  nameFr: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  damage: number;
}

export interface PowerUpSpotConfig {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface DestructiblePropConfig {
  id: string;
  colliderId: string;
  nameFr: string;
  kind:
    | 'lego'
    | 'book'
    | 'piggy_bank'
    | 'snack_box'
    | 'cereal_box'
    | 'toaster'
    | 'flower_pot'
    | 'gnome'
    | 'sandcastle';
  x: number;
  y: number;
  z: number;
  radius: number;
  maxHp: number;
  dropsPowerUp: boolean;
  rewardPool?: PowerUpId[];
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
  destructibles: DestructiblePropConfig[];
  spawns: SpawnPoint[];
  windZones: WindZoneConfig[];
  updraftZones: UpdraftZoneConfig[];
  hazardZones: HazardZoneConfig[];
  powerUpSpots: PowerUpSpotConfig[];
}
