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

// 1 unit = 1 cm. « La salle de bain »: a hot bath at the back-left whose steam lifts the planes, a
// rubber duck floating on it, the washbasin and its big mirror, the toilets on the right (don't fly
// into the bowl!) and the washing machine at the front.

/** Map authored in design units — the 3D scene is built from this version. */
export const BATHROOM_MAP_DESIGN: MapDefinition = {
  id: 'bathroom',
  nameFr: 'La salle de bain',
  subtitleFr: 'Bain fumant qui fait monter, canard en plastique, grand miroir… et gare aux toilettes !',
  available: true,
  hardBounds: { minX: -250, maxX: 250, minY: 6, maxY: 222, minZ: -185, maxZ: 185 },
  softBounds: { minX: -236, maxX: 236, minY: 8, maxY: 210, minZ: -174, maxZ: 174 },
  skyColor: '#F0F9FF',
  fogColor: '#E0F2FE',
  colliders: [
    // Bathtub (back-left): water level at 40, rims all around
    box('tub_water', -245, 0, -183, -45, 40, -108),
    box('tub_rim_front', -245, 0, -116, -45, 52, -108),
    box('tub_rim_back', -245, 0, -183, -45, 52, -176),
    box('tub_rim_left', -245, 0, -183, -237, 52, -108),
    box('tub_rim_right', -53, 0, -183, -45, 52, -108),
    // Shower pipe and head, curtain rail and the curtain bunched in the corner
    capsule('shower_pipe', -225, 52, -181, -225, 175, -181, 2.5),
    capsule('shower_head', -225, 178, -181, -225, 172, -165, 7),
    capsule('curtain_rail', -245, 200, -106, -45, 200, -106, 1.8),
    box('shower_curtain', -245, 110, -112, -225, 200, -100),
    // Washbasin on its cabinet, tap, and the mirror above
    box('sink_cabinet', 10, 0, -185, 120, 80, -130),
    box('basin', 20, 80, -180, 110, 90, -135),
    capsule('sink_tap', 65, 90, -178, 65, 104, -168, 2.5),
    box('mirror', 15, 105, -185, 115, 195, -181),
    // Toilets on the right wall: tank, raised lid, bowl (the bowl itself is a hazard zone)
    box('toilet_tank', 232, 40, 55, 250, 100, 115),
    box('toilet_lid', 224, 38, 62, 232, 86, 108),
    box('toilet_bowl', 190, 0, 65, 234, 38, 105),
    // Wall cabinet above the toilets
    box('wall_cabinet', 215, 130, 50, 250, 185, 120),
    // Towel warmer on the left wall
    box('towel_rail', -250, 30, -70, -238, 140, 0),
    // Washing machine (front-left)
    box('washer', -245, 0, 120, -170, 85, 183),
    // Ceiling lamp
    sphere('ceiling_lamp', 0, 216, 0, 14, 'medium'),
    // Destructible props
    sphere('rubber_duck', -150, 48, -146, 10, 'small'),
    box('tooth_cup', 90, 90, -178, 104, 108, -164, 'small'),
    box('toilet_paper', 200, 0, 135, 232, 40, 165, 'small'),
    box('laundry_basket', -160, 0, 140, -120, 34, 180, 'small'),
  ],
  destructibles: [
    { id: 'rubber_duck', colliderId: 'rubber_duck', nameFr: 'Canard en plastique', kind: 'flower_pot', x: -150, y: 48, z: -146, radius: 10, maxHp: 18, dropsPowerUp: true, rewardPool: ['bubble_shield', 'water_bomb', 'turbo_battery'] },
    { id: 'tooth_cup', colliderId: 'tooth_cup', nameFr: 'Gobelet à brosses à dents', kind: 'snack_box', x: 97, y: 99, z: -171, radius: 10, maxHp: 16, dropsPowerUp: true, rewardPool: ['firecracker', 'magnet', 'repair_tape'] },
    { id: 'toilet_paper', colliderId: 'toilet_paper', nameFr: 'Rouleaux de papier', kind: 'cereal_box', x: 216, y: 20, z: 150, radius: 20, maxHp: 26, dropsPowerUp: true, rewardPool: ['rubber_missile', 'glue_mine', 'water_bomb'] },
    { id: 'laundry_basket', colliderId: 'laundry_basket', nameFr: 'Panier à linge', kind: 'book', x: -140, y: 17, z: 160, radius: 20, maxHp: 28, dropsPowerUp: true },
  ],
  spawns: [
    // Chosen so that each one flies 5 s straight across the room without hitting anything
    { x: -200, y: 70, z: -150, yaw: -2.214 },
    { x: 200, y: 175, z: 150, yaw: 0.927 },
    { x: 175, y: 55, z: -150, yaw: 2.279 },
    { x: -150, y: 175, z: 150, yaw: -0.785 },
    { x: 0, y: 175, z: -125, yaw: 3.142 },
    { x: 25, y: 55, z: 125, yaw: 0.197 },
    { x: -175, y: 55, z: 50, yaw: -1.292 },
    { x: 200, y: 175, z: -50, yaw: 1.816 },
    { x: 200, y: 55, z: 50, yaw: 1.326 },
    { x: -175, y: 175, z: -50, yaw: -1.849 },
    { x: -25, y: 55, z: -125, yaw: -2.944 },
    { x: 25, y: 175, z: 125, yaw: 0.197 },
    { x: 100, y: 100, z: -50, yaw: 2.034 },
    { x: -100, y: 85, z: 150, yaw: -0.588 },
    { x: 125, y: 115, z: 100, yaw: 0.896 },
    { x: 125, y: 160, z: -150, yaw: 2.447 },
  ],
  windZones: [],
  updraftZones: [
    {
      // Steam rising from the hot bath
      id: 'bath_steam',
      x: -145,
      y: 52,
      z: -145,
      radius: 55,
      height: 110,
      liftStrength: 75,
    },
  ],
  hazardZones: [
    {
      id: 'toilet_hazard',
      nameFr: 'les toilettes',
      x: 208,
      y: 30,
      z: 85,
      radius: 14,
      height: 22,
      damage: 9999,
    },
  ],
  catPath: { ax: -238, az: 40, bx: 238, bz: 40, y: 6 },
  powerUpSpots: [
    { id: 'pu_bath_steam', x: -145, y: 150, z: -140 },
    { id: 'pu_bath_mirror', x: 65, y: 140, z: -110 },
    { id: 'pu_bath_toilet', x: 150, y: 110, z: 85 },
    { id: 'pu_bath_washer', x: -160, y: 125, z: 115 },
    { id: 'pu_bath_center', x: 0, y: 80, z: 40 },
  ],
};

/** Gameplay version (server + client prediction), enlarged by ARENA_SCALE. */
export const BATHROOM_MAP: MapDefinition = scaleMapDefinition(BATHROOM_MAP_DESIGN);
