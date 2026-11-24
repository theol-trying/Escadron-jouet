import type { BoxCollider, HingeDoorAnimation, MapCollider, MapDefinition } from './types';

function box(
  id: string,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  tier: 'static' | 'medium' | 'small' = 'static',
  hinge?: HingeDoorAnimation
): BoxCollider {
  return { id, kind: 'box', tier, minX, minY, minZ, maxX, maxY, maxZ, hinge };
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

// 1 unit = 1 cm. Playable kitchen "La cuisine".
// Main back counter top at Y = 88 cm; central island top at Y = 84 cm; floor at Y = 0.
export const KITCHEN_MAP: MapDefinition = {
  id: 'kitchen',
  nameFr: 'La cuisine',
  subtitleFr: 'Îlot tunnel, frigo animé, courant chaud des plaques et mixeur géant mortel.',
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
  skyColor: '#FFF3D6',
  fogColor: '#FFF7E5',
  colliders: [
    // Main back counter along -Z wall (Y: 0..88)
    box('counter_back', -225, 0, -182, 110, 88, -102),

    // Central island with open fly-through tunnel underneath (X: -56..56, Y: 0..74)
    box('island_top', -94, 74, 10, 94, 84, 78),
    box('island_leg_left', -90, 0, 14, -56, 74, 74),
    box('island_leg_right', 56, 0, 14, 90, 74, 74),

    // Dish rack on left back counter
    box('dish_rack', -185, 88, -162, -135, 118, -118, 'medium'),

    // Tall arched chrome sink faucet
    capsule('faucet_post', -95, 88, -158, -95, 142, -158, 3.5),
    capsule('faucet_arch', -95, 142, -158, -95, 142, -128, 3.2),
    capsule('faucet_nozzle', -95, 142, -128, -95, 128, -128, 2.8),

    // Stove burner base (updraft sits directly above)
    box('stove_base', -24, 88, -168, 40, 95, -116),

    // Giant fridge + animated swinging door
    box('fridge_body', 158, 0, -178, 244, 202, -92),
    box('fridge_door', 158, 4, -92, 240, 198, -84, 'static', {
      pivotX: 158,
      pivotZ: -90,
      lengthX: 82,
      thicknessZ: 8,
      maxAngle: -1.18,
      cycleSeconds: 10,
    }),

    // Overhead hanging pan rack & 3 giant hanging pans
    box('pan_rack_bar', -130, 194, -48, 45, 200, -40),
    capsule('pan_1', -105, 194, -44, -105, 162, -44, 14, 'medium'),
    capsule('pan_2', -42, 194, -44, -42, 158, -44, 16, 'medium'),
    capsule('pan_3', 20, 194, -44, 20, 164, -44, 14, 'medium'),

    // Blender base & jar on island (deadly spinning blades inside hazardZone)
    capsule('blender_body', 44, 84, 44, 44, 108, 44, 14),

    // Left window sill
    box('kitchen_window_sill', -248, 84, -70, -214, 94, 95),

    // Destructible props
    box('cereal_box_1', -74, 84, 28, -46, 124, 52, 'small'),
    box('cereal_box_2', -212, 88, -158, -184, 128, -132, 'small'),
    box('toaster', 68, 88, -156, 96, 112, -130, 'small'),
    box('milk_carton', -240, 94, 15, -218, 124, 37, 'small'),
    sphere('spice_jar', -118, 98, 44, 11, 'small'),
  ],
  destructibles: [
    {
      id: 'cereal_box_1',
      colliderId: 'cereal_box_1',
      nameFr: 'Boîte de céréales',
      kind: 'cereal_box',
      x: -60,
      y: 104,
      z: 40,
      radius: 19,
      maxHp: 32,
      dropsPowerUp: true,
      rewardPool: ['rubber_missile', 'firecracker', 'turbo_battery'],
    },
    {
      id: 'cereal_box_2',
      colliderId: 'cereal_box_2',
      nameFr: 'Paquet de flocons',
      kind: 'cereal_box',
      x: -198,
      y: 108,
      z: -145,
      radius: 19,
      maxHp: 32,
      dropsPowerUp: true,
      rewardPool: ['water_bomb', 'bubble_shield', 'repair_tape'],
    },
    {
      id: 'toaster',
      colliderId: 'toaster',
      nameFr: 'Grille-pain',
      kind: 'toaster',
      x: 82,
      y: 100,
      z: -143,
      radius: 16,
      maxHp: 40,
      dropsPowerUp: true,
      rewardPool: ['firecracker', 'magnet', 'turbo_battery'],
    },
    {
      id: 'milk_carton',
      colliderId: 'milk_carton',
      nameFr: 'Brique de lait',
      kind: 'snack_box',
      x: -229,
      y: 109,
      z: 26,
      radius: 16,
      maxHp: 28,
      dropsPowerUp: true,
      rewardPool: ['glue_mine', 'repair_tape', 'bubble_shield'],
    },
    {
      id: 'spice_jar',
      colliderId: 'spice_jar',
      nameFr: 'Pot d’épices',
      kind: 'piggy_bank',
      x: -118,
      y: 98,
      z: 44,
      radius: 13,
      maxHp: 26,
      dropsPowerUp: true,
    },
  ],
  spawns: [
    // Unobstructed south, center-corridor, and high airspace lanes
    { x: -185, y: 136, z: 128, yaw: -Math.PI * 0.48 },
    { x: 185, y: 140, z: 122, yaw: Math.PI * 0.48 },
    { x: -175, y: 108, z: 140, yaw: -Math.PI * 0.46 },
    { x: 175, y: 110, z: 140, yaw: Math.PI * 0.46 },
    { x: -175, y: 122, z: -16, yaw: -Math.PI * 0.5 },
    { x: 115, y: 124, z: -18, yaw: Math.PI * 0.5 },
    { x: -180, y: 178, z: 118, yaw: -Math.PI * 0.48 },
    { x: 180, y: 180, z: 112, yaw: Math.PI * 0.48 },
    { x: -185, y: 186, z: -84, yaw: -Math.PI * 0.5 },
    { x: 120, y: 186, z: -84, yaw: Math.PI * 0.5 },
    { x: -190, y: 54, z: 126, yaw: -Math.PI * 0.47 },
    { x: 190, y: 56, z: 126, yaw: Math.PI * 0.47 },
    { x: -180, y: 52, z: -32, yaw: -Math.PI * 0.5 },
    { x: 135, y: 52, z: -36, yaw: Math.PI * 0.5 },
    { x: -115, y: 182, z: 134, yaw: -Math.PI * 0.45 },
    { x: 115, y: 182, z: 134, yaw: Math.PI * 0.45 },
  ],
  windZones: [],
  updraftZones: [
    {
      id: 'stove_updraft',
      x: 8,
      y: 92,
      z: -142,
      radius: 36,
      height: 120,
      liftStrength: 135,
    },
  ],
  hazardZones: [
    {
      id: 'blender_hazard',
      nameFr: 'le mixeur géant',
      x: 44,
      y: 112,
      z: 44,
      radius: 17,
      height: 36,
      damage: 9999,
    },
  ],
  powerUpSpots: [
    { id: 'pu_island_tunnel', x: 0, y: 38, z: 44 },
    { id: 'pu_sink_arch', x: -95, y: 116, z: -136 },
    { id: 'pu_stove_thermal', x: 8, y: 158, z: -142 },
    { id: 'pu_hanging_pans', x: -74, y: 168, z: -44 },
    { id: 'pu_fridge_corner', x: 128, y: 115, z: -65 },
  ],
};
