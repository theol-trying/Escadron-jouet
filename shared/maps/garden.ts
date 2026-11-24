import { scaleMapDefinition } from './scale';
import type { MapCollider, MapDefinition } from './types';

function box(
  id: string,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  tier: 'static' | 'medium' | 'small' = 'static'
): MapCollider {
  return { id, kind: 'box', tier, minX, minY, minZ, maxX, maxY, maxZ };
}

function sphere(
  id: string,
  x: number,
  y: number,
  z: number,
  radius: number,
  tier: 'static' | 'medium' | 'small' = 'static'
): MapCollider {
  return { id, kind: 'sphere', tier, x, y, z, radius };
}

function capsule(
  id: string,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  radius: number,
  tier: 'static' | 'medium' | 'small' = 'static'
): MapCollider {
  return { id, kind: 'capsule', tier, ax, ay, az, bx, by, bz, radius };
}

// 1 unit = 1 cm. Playable outdoor backyard "Le jardin".
/** Map authored in design units — the 3D scene is built from this version. */
export const GARDEN_MAP_DESIGN: MapDefinition = {
  id: 'garden',
  nameFr: 'Le jardin',
  subtitleFr: 'Plein air : niche tunnel, balançoire géante, pots de fleurs, bac à sable et arroseur rotatif.',
  available: true,
  hardBounds: {
    minX: -250,
    maxX: 250,
    minY: 6,
    maxY: 222,
    minZ: -185,
    maxZ: 185,
  },
  softBounds: {
    minX: -236,
    maxX: 236,
    minY: 8,
    maxY: 210,
    minZ: -174,
    maxZ: 174,
  },
  skyColor: '#9ED8FF',
  fogColor: '#CDEEFF',
  colliders: [
    // Dog house with fly-through tunnel along Z (open doorway X: -146..-114, Y: 0..56)
    box('doghouse_left', -164, 0, -138, -146, 56, -72),
    box('doghouse_right', -114, 0, -138, -96, 56, -72),
    box('doghouse_roof', -170, 56, -142, -90, 82, -68),

    // Giant A-frame Swing Set
    capsule('swing_post_left', 10, 0, -110, 18, 168, -110, 4.5),
    capsule('swing_post_right', 110, 0, -110, 102, 168, -110, 4.5),
    capsule('swing_top_bar', 8, 168, -110, 112, 168, -110, 5.0),
    box('swing_seat_1', 34, 34, -120, 54, 42, -100, 'medium'),
    box('swing_seat_2', 66, 34, -120, 86, 42, -100, 'medium'),

    // Sandbox frame & sand floor + plastic bucket
    box('sandbox_wall_n', -185, 0, 55, -85, 18, 63),
    box('sandbox_wall_s', -185, 0, 137, -85, 18, 145),
    box('sandbox_wall_w', -185, 0, 63, -177, 18, 137),
    box('sandbox_wall_e', -93, 0, 63, -85, 18, 137),
    box('sandbox_floor', -177, 0, 63, -93, 10, 137),
    capsule('toy_bucket', -105, 10, 122, -105, 42, 122, 11, 'medium'),

    // Giant Terracotta Flower Pots & Blooming Stalks
    capsule('pot_big_1', 165, 0, -118, 165, 46, -118, 24),
    capsule('flower_stalk_1', 165, 46, -118, 165, 148, -118, 4.5),
    sphere('flower_head_1', 165, 152, -118, 18),

    capsule('pot_big_2', 176, 0, 82, 176, 42, 82, 22),
    capsule('flower_stalk_2', 176, 42, 82, 176, 122, 82, 4.0),
    sphere('flower_head_2', 176, 126, 82, 15),

    // Giant grass blade clusters in backyard corners
    capsule('grass_cluster_nw', -208, 0, -142, -208, 96, -142, 16, 'medium'),
    capsule('grass_cluster_sw', -210, 0, 148, -210, 86, 148, 15, 'medium'),
    capsule('grass_cluster_se', 212, 0, 142, 212, 90, 142, 15, 'medium'),

    // Lawn sprinkler hub
    capsule('sprinkler_hub', 18, 0, 18, 18, 22, 18, 12),

    // Destructible backyard props
    box('sandcastle', -152, 10, 84, -120, 48, 116, 'small'),
    capsule('garden_gnome', -36, 0, -128, -36, 44, -128, 12, 'small'),
    capsule('flower_pot_break', 112, 0, 118, 112, 40, 118, 15, 'small'),
    box('picnic_juice_box', -42, 0, 116, -20, 34, 134, 'small'),
  ],
  destructibles: [
    {
      id: 'sandcastle',
      colliderId: 'sandcastle',
      nameFr: 'Château de sable',
      kind: 'sandcastle',
      x: -136,
      y: 29,
      z: 100,
      radius: 20,
      maxHp: 35,
      dropsPowerUp: true,
      rewardPool: ['water_bomb', 'bubble_shield', 'turbo_battery'],
    },
    {
      id: 'garden_gnome',
      colliderId: 'garden_gnome',
      nameFr: 'Nain de jardin',
      kind: 'gnome',
      x: -36,
      y: 22,
      z: -128,
      radius: 15,
      maxHp: 30,
      dropsPowerUp: true,
      rewardPool: ['rubber_missile', 'firecracker', 'magnet'],
    },
    {
      id: 'flower_pot_break',
      colliderId: 'flower_pot_break',
      nameFr: 'Pot de fleurs',
      kind: 'flower_pot',
      x: 112,
      y: 20,
      z: 118,
      radius: 17,
      maxHp: 35,
      dropsPowerUp: true,
      rewardPool: ['repair_tape', 'glue_mine', 'bubble_shield'],
    },
    {
      id: 'picnic_juice_box',
      colliderId: 'picnic_juice_box',
      nameFr: 'Brique de jus',
      kind: 'snack_box',
      x: -31,
      y: 17,
      z: 125,
      radius: 15,
      maxHp: 28,
      dropsPowerUp: true,
      rewardPool: ['turbo_battery', 'firecracker', 'repair_tape'],
    },
  ],
  spawns: [
    // Clear sky corridors above & between lawn landmarks
    { x: -165, y: 128, z: -15, yaw: -Math.PI * 0.5 },
    { x: 165, y: 132, z: -15, yaw: Math.PI * 0.5 },
    { x: -175, y: 148, z: 32, yaw: -Math.PI * 0.48 },
    { x: 175, y: 152, z: 28, yaw: Math.PI * 0.48 },
    { x: -160, y: 116, z: -42, yaw: -Math.PI * 0.5 },
    { x: 145, y: 118, z: -44, yaw: Math.PI * 0.5 },
    { x: -175, y: 184, z: -102, yaw: -Math.PI * 0.48 },
    { x: 140, y: 184, z: -96, yaw: Math.PI * 0.48 },
    { x: -170, y: 176, z: 118, yaw: -Math.PI * 0.46 },
    { x: 165, y: 178, z: 118, yaw: Math.PI * 0.46 },
    { x: -165, y: 74, z: 12, yaw: -Math.PI * 0.5 },
    { x: 145, y: 76, z: 12, yaw: Math.PI * 0.5 },
    { x: -155, y: 78, z: -28, yaw: -Math.PI * 0.5 },
    { x: 135, y: 80, z: -28, yaw: Math.PI * 0.5 },
    { x: -75, y: 188, z: 128, yaw: -Math.PI * 0.42 },
    { x: 75, y: 188, z: 128, yaw: Math.PI * 0.42 },
  ],
  windZones: [
    // Twin spinning water-jet sprinkler arms at center lawn
    {
      originX: 18,
      originY: 22,
      originZ: 18,
      range: 135,
      coneHalfAngle: 0.34,
      baseYaw: 0,
      sweepAmplitude: 0,
      sweepSpeed: 1.15,
      pushStrength: 80,
      continuousSpin: true,
    },
    {
      originX: 18,
      originY: 22,
      originZ: 18,
      range: 135,
      coneHalfAngle: 0.34,
      baseYaw: Math.PI,
      sweepAmplitude: 0,
      sweepSpeed: 1.15,
      pushStrength: 80,
      continuousSpin: true,
    },
  ],
  updraftZones: [],
  hazardZones: [],
  // Along the east fence (only a grass tuft on the way) for the room-event cat
  catPath: { ax: 225, az: -172, bx: 225, bz: 172, y: 6 },
  powerUpSpots: [
    { id: 'pu_doghouse_tunnel', x: -130, y: 28, z: -105 },
    { id: 'pu_swing_arch', x: 60, y: 94, z: -110 },
    { id: 'pu_sprinkler_top', x: 18, y: 58, z: 18 },
    { id: 'pu_sandbox', x: -135, y: 68, z: 100 },
    { id: 'pu_flower_corridor', x: 142, y: 88, z: -18 },
  ],
};

/** Gameplay version (server + client prediction), enlarged by ARENA_SCALE. */
export const GARDEN_MAP: MapDefinition = scaleMapDefinition(GARDEN_MAP_DESIGN);
