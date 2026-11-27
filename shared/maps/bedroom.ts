import { scaleMapDefinition } from './scale';
import type { BoxCollider, MapCollider, MapDefinition } from './types';

function box(
  id: string,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  tier: 'static' | 'medium' | 'small' = 'static'
): BoxCollider {
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

// 1 unit = 1 cm. « La chambre d’enfant »: bed and wardrobe at the back, toy chest and teddy bear at the
// front, a toy train circling the rug and a mobile turning under the ceiling (shared/maps/movers.ts).

/** Map authored in design units — the 3D scene is built from this version. */
export const BEDROOM_MAP_DESIGN: MapDefinition = {
  id: 'bedroom',
  nameFr: 'La chambre d’enfant',
  subtitleFr: 'Mobile qui tourne au plafond, petit train autour du tapis, nounours et coffre à jouets.',
  available: true,
  hardBounds: { minX: -250, maxX: 250, minY: 6, maxY: 222, minZ: -185, maxZ: 185 },
  softBounds: { minX: -236, maxX: 236, minY: 8, maxY: 210, minZ: -174, maxZ: 174 },
  skyColor: '#FDF2F8',
  fogColor: '#FCE7F3',
  colliders: [
    // Bed (back-left): frame, mattress, headboard, pillow
    box('bed_frame', -245, 0, -183, -95, 34, -70),
    box('mattress', -242, 34, -181, -98, 52, -72),
    box('headboard', -250, 0, -184, -238, 98, -68),
    capsule('pillow', -222, 60, -168, -222, 60, -86, 9),
    // Nightstand with its lamp
    box('nightstand', -90, 0, -183, -55, 48, -150),
    capsule('lamp_stem', -78, 48, -172, -78, 78, -172, 2.5),
    sphere('lamp_shade', -78, 88, -172, 13, 'medium'),
    // Wardrobe (back-right)
    box('wardrobe', 150, 0, -185, 248, 205, -125),
    // Toy chest (front-left)
    box('toy_chest', -245, 0, 125, -175, 42, 183),
    // Wall shelf on the right wall, with a row of toys
    box('wall_shelf', 205, 120, -40, 250, 126, 60),
    box('shelf_toys', 212, 126, -35, 246, 150, 50),
    // Teddy bear sitting on the floor (right)
    sphere('teddy_body', 215, 26, 100, 24),
    sphere('teddy_head', 215, 64, 100, 17),
    // Ceiling mobile: cord and hub (the toys turning under it are movers)
    capsule('mobile_cord', 0, 222, 0, 0, 196, 0, 1.5),
    sphere('mobile_hub', 0, 194, 0, 5),
    // Destructible props
    box('alarm_clock', -66, 48, -162, -57, 60, -152, 'small'),
    box('block_tower', -40, 0, -160, -4, 54, -124, 'small'),
    box('storybooks', 40, 0, -112, 80, 26, -80, 'small'),
    sphere('toy_ball', -60, 16, 40, 16, 'small'),
  ],
  destructibles: [
    { id: 'alarm_clock', colliderId: 'alarm_clock', nameFr: 'Réveil', kind: 'snack_box', x: -61, y: 54, z: -157, radius: 9, maxHp: 18, dropsPowerUp: true, rewardPool: ['turbo_battery', 'firecracker', 'magnet'] },
    { id: 'block_tower', colliderId: 'block_tower', nameFr: 'Tour de cubes', kind: 'lego', x: -22, y: 27, z: -142, radius: 22, maxHp: 34, dropsPowerUp: true, rewardPool: ['rubber_missile', 'water_bomb', 'bubble_shield'] },
    { id: 'storybooks', colliderId: 'storybooks', nameFr: 'Livres d’histoires', kind: 'book', x: 60, y: 13, z: -96, radius: 20, maxHp: 28, dropsPowerUp: true, rewardPool: ['repair_tape', 'glue_mine', 'firecracker'] },
    { id: 'toy_ball', colliderId: 'toy_ball', nameFr: 'Ballon', kind: 'flower_pot', x: -60, y: 16, z: 40, radius: 16, maxHp: 22, dropsPowerUp: true },
  ],
  spawns: [
    // Chosen so that each one flies 5 s straight across the room without hitting anything, the
    // mobile and the train included (whatever the moment)
    { x: -200, y: 85, z: -150, yaw: -2.214 },
    { x: 200, y: 175, z: 150, yaw: 1.277 },
    { x: -150, y: 175, z: 150, yaw: -0.435 },
    { x: 125, y: 55, z: -125, yaw: 2.356 },
    { x: 25, y: 55, z: 125, yaw: 0.197 },
    { x: -175, y: 55, z: 50, yaw: -1.292 },
    { x: 200, y: 175, z: -75, yaw: 2.28 },
    { x: -25, y: 145, z: -125, yaw: -2.944 },
    { x: 200, y: 55, z: 50, yaw: 1.326 },
    { x: -200, y: 175, z: -25, yaw: -1.345 },
    { x: 100, y: 130, z: 50, yaw: 1.107 },
    { x: -75, y: 55, z: -100, yaw: -2.498 },
    { x: 0, y: 145, z: 150, yaw: 0 },
    { x: -150, y: 175, z: -150, yaw: -2.006 },
    { x: -100, y: 85, z: 150, yaw: -0.588 },
    { x: 100, y: 145, z: -150, yaw: 2.554 },
  ],
  windZones: [
    {
      // Breeze from the open window in the front wall, toward the back of the room
      originX: 0,
      originY: 130,
      originZ: 183,
      range: 200,
      coneHalfAngle: 0.45,
      baseYaw: 0,
      sweepAmplitude: 0.25,
      sweepSpeed: 0.3,
      pushStrength: 45,
    },
  ],
  updraftZones: [],
  hazardZones: [],
  catPath: { ax: -165, az: 155, bx: 238, bz: 155, y: 6 },
  powerUpSpots: [
    { id: 'pu_bedroom_rug', x: 0, y: 110, z: 50 },
    { id: 'pu_bedroom_bed', x: -140, y: 118, z: 20 },
    { id: 'pu_bedroom_wardrobe', x: 110, y: 125, z: -70 },
    { id: 'pu_bedroom_window', x: 60, y: 150, z: 130 },
    { id: 'pu_bedroom_blocks', x: -60, y: 92, z: -40 },
  ],
  movers: [
    // Mobile: four toys turning slowly under the ceiling
    { id: 'mobile', kind: 'orbit', cx: 0, cy: 172, cz: 0, radius: 50, arms: 4, speed: 0.45, bodyRadius: 10, hangLength: 22, damage: 10 },
    // Toy train around the rug
    {
      id: 'toy_train',
      kind: 'loop',
      points: [
        { x: -150, z: -30 },
        { x: 130, z: -30 },
        { x: 165, z: 10 },
        { x: 165, z: 80 },
        { x: 130, z: 112 },
        { x: -150, z: 112 },
        { x: -185, z: 80 },
        { x: -185, z: 10 },
      ],
      y: 0,
      speed: 42,
      cars: 4,
      carLength: 24,
      carRadius: 9,
      gap: 5,
      damage: 14,
    },
  ],
};

/** Gameplay version (server + client prediction), enlarged by ARENA_SCALE. */
export const BEDROOM_MAP: MapDefinition = scaleMapDefinition(BEDROOM_MAP_DESIGN);
