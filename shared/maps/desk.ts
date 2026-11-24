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

// 1 unit = 1 cm. Playable bedroom corner "Le bureau".
// Desk surface at Y = 76 cm; room floor at Y = 0; ceiling at Y = 230.
/** Map authored in design units — the 3D scene is built from this version. */
export const DESK_MAP_DESIGN: MapDefinition = {
  id: 'desk',
  nameFr: 'Le bureau',
  subtitleFr: 'Coin bureau géant : clavier canyon, tiroir tunnel, tours de briques et ventilateur oscillant.',
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
  skyColor: '#D6EEFF',
  fogColor: '#E5F2FF',
  colliders: [
    // Desk main tabletop (Y: 70..76)
    box('desk_top', -195, 70, -120, 145, 76, 35),
    // Desk left pedestal cabinet
    box('desk_left_leg', -190, 0, -115, -135, 70, 28),
    // Desk right drawer cabinet frame (under tabletop, leaving upper drawer tunnel open)
    box('desk_right_lower', 45, 0, -115, 140, 40, 28),
    box('desk_right_side_l', 45, 40, -115, 53, 70, 28),
    box('desk_right_side_r', 132, 40, -115, 140, 70, 28),
    // Open drawer pulled out in front (+Z), forming a fly-through canyon/tunnel
    box('open_drawer_bottom', 54, 42, 28, 130, 46, 98),
    box('open_drawer_left', 54, 46, 28, 59, 64, 98),
    box('open_drawer_right', 125, 46, 28, 130, 64, 98),
    box('open_drawer_front', 54, 46, 93, 130, 66, 98),

    // Giant Monitor Wall (gap underneath Y: 76..92 to fly under!)
    box('monitor_base', -65, 76, -98, -25, 80, -76),
    box('monitor_neck', -51, 80, -94, -39, 94, -84),
    box('monitor_screen', -108, 92, -92, 18, 160, -82),

    // Keyboard Canyon on desk
    box('keyboard_body', -105, 76, -46, -5, 83, -10),

    // Pencil cup (cylinder approximated with capsule) + protruding giant pencils
    capsule('pencil_cup', 62, 78, -58, 62, 100, -58, 10),
    capsule('giant_pencil_1', 59, 100, -56, 54, 126, -52, 2.2),
    capsule('giant_pencil_2', 66, 100, -61, 72, 124, -64, 2.2),

    // Book stacks on left desk
    box('desk_books_1', -172, 76, -72, -130, 92, -32, 'medium'),
    box('desk_books_2', -168, 92, -68, -134, 106, -36, 'medium'),
    box('desk_books_3', -164, 106, -64, -138, 118, -40, 'medium'),

    // Floor book stack (under-desk / bedside side)
    box('floor_books_1', -170, 0, 88, -120, 20, 132, 'medium'),
    box('floor_books_2', -164, 20, 92, -124, 38, 128, 'medium'),
    box('floor_books_3', -158, 38, 95, -128, 52, 125, 'medium'),

    // Lego tower on right side of desk (tall landmark)
    box('lego_desk_tower_base', 86, 76, -68, 124, 116, -34, 'small'),
    box('lego_desk_tower_top', 92, 116, -62, 118, 142, -40, 'small'),

    // Floor Lego Archway on right side (fly through the arch!)
    box('lego_arch_left', 162, 0, 48, 184, 62, 76, 'small'),
    box('lego_arch_right', 162, 0, 108, 184, 62, 136, 'small'),
    box('lego_arch_bridge', 162, 62, 48, 184, 82, 136, 'small'),

    // Wall Shelf high on back wall (-Z)
    box('wall_shelf', -175, 146, -182, 145, 154, -138),
    // Globe & trophy on wall shelf
    sphere('shelf_globe', -120, 168, -158, 14),
    box('shelf_books', 70, 154, -176, 125, 182, -144, 'medium'),

    // Window Sill on left wall (-X)
    box('window_sill', -248, 66, -110, -220, 74, 110),

    // Desk Fan on left-front corner of desk
    box('fan_base', -178, 76, -8, -150, 82, 20),
    capsule('fan_stem', -164, 82, 6, -164, 108, 6, 3.5),
    sphere('fan_cage', -164, 112, 6, 16),

    // Bedside lamp / mug near front-left floor/corner
    capsule('floor_mug', -22, 0, 118, -22, 24, 118, 14),

    // Interactive/destructible piggy bank on wall shelf & cereal/biscuit box on desk
    sphere('piggy_bank', -32, 166, -158, 12, 'small'),
    box('snack_box', 108, 76, 4, 134, 108, 24, 'small'),
  ],
  destructibles: [
    {
      id: 'lego_desk_tower_top',
      colliderId: 'lego_desk_tower_top',
      nameFr: 'Sommet en briques',
      kind: 'lego',
      x: 105,
      y: 129,
      z: -51,
      radius: 16,
      maxHp: 35,
      dropsPowerUp: true,
    },
    {
      id: 'lego_desk_tower_base',
      colliderId: 'lego_desk_tower_base',
      nameFr: 'Tour de briques',
      kind: 'lego',
      x: 105,
      y: 96,
      z: -51,
      radius: 22,
      maxHp: 55,
      dropsPowerUp: true,
    },
    {
      id: 'lego_arch_bridge',
      colliderId: 'lego_arch_bridge',
      nameFr: 'Arche en briques',
      kind: 'lego',
      x: 173,
      y: 72,
      z: 92,
      radius: 28,
      maxHp: 45,
      dropsPowerUp: true,
    },
    {
      id: 'desk_books_3',
      colliderId: 'desk_books_3',
      nameFr: 'Livre du haut',
      kind: 'book',
      x: -151,
      y: 112,
      z: -52,
      radius: 16,
      maxHp: 60,
      dropsPowerUp: true,
    },
    {
      id: 'piggy_bank',
      colliderId: 'piggy_bank',
      nameFr: 'Tirelire cochon',
      kind: 'piggy_bank',
      x: -32,
      y: 166,
      z: -158,
      radius: 13,
      maxHp: 30,
      dropsPowerUp: true,
      rewardPool: ['bubble_shield', 'rubber_missile', 'magnet', 'repair_tape'],
    },
    {
      id: 'snack_box',
      colliderId: 'snack_box',
      nameFr: 'Boîte de biscuits',
      kind: 'snack_box',
      x: 121,
      y: 92,
      z: 14,
      radius: 17,
      maxHp: 28,
      dropsPowerUp: true,
      rewardPool: ['firecracker', 'water_bomb', 'turbo_battery', 'glue_mine'],
    },
  ],
  spawns: [
    // Open upper-mid airspace along clear perimeter/desk lanes (5s+ unobstructed)
    { x: -165, y: 148, z: 125, yaw: -Math.PI * 0.44 },
    { x: 175, y: 152, z: 118, yaw: Math.PI * 0.44 },
    { x: -175, y: 172, z: -20, yaw: -Math.PI * 0.52 },
    { x: 185, y: 172, z: -30, yaw: Math.PI * 0.52 },
    { x: -185, y: 132, z: 72, yaw: -Math.PI * 0.48 },
    { x: 190, y: 132, z: 65, yaw: Math.PI * 0.48 },
    { x: 165, y: 126, z: -115, yaw: Math.PI * 0.58 },
    { x: -165, y: 126, z: -115, yaw: -Math.PI * 0.58 },
    { x: -75, y: 176, z: 115, yaw: -Math.PI * 0.35 },
    { x: 75, y: 176, z: 115, yaw: Math.PI * 0.35 },
    { x: -190, y: 98, z: 130, yaw: -Math.PI * 0.46 },
    { x: 195, y: 98, z: 125, yaw: Math.PI * 0.46 },
    { x: -135, y: 174, z: -105, yaw: -Math.PI * 0.55 },
    { x: 140, y: 174, z: -105, yaw: Math.PI * 0.55 },
    { x: -40, y: 182, z: 128, yaw: -Math.PI * 0.42 },
    { x: 40, y: 182, z: 128, yaw: Math.PI * 0.42 },
  ],
  windZones: [
    {
      originX: -164,
      originY: 112,
      originZ: 6,
      range: 135,
      coneHalfAngle: 0.42,
      baseYaw: -Math.PI * 0.42, // blows +X / slightly -Z across the desk
      sweepAmplitude: 0.55,
      sweepSpeed: 0.65,
      pushStrength: 68,
    },
  ],
  updraftZones: [],
  hazardZones: [],
  powerUpSpots: [
    { id: 'pu_under_monitor', x: -45, y: 85, z: -87 },
    { id: 'pu_drawer_tunnel', x: 92, y: 58, z: 62 },
    { id: 'pu_lego_arch', x: 173, y: 34, z: 92 },
    { id: 'pu_wall_shelf', x: -15, y: 168, z: -156 },
    { id: 'pu_keyboard_canyon', x: -55, y: 102, z: -28 },
  ],
};

/** Gameplay version (server + client prediction), enlarged by ARENA_SCALE. */
export const DESK_MAP: MapDefinition = scaleMapDefinition(DESK_MAP_DESIGN);
