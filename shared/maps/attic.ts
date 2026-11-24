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

// 1 unit = 1 cm. « Le grenier » (attic): pitched roof on wooden rafters (ridge along X at the top),
// furniture against the walls so the middle of the room stays open for dogfights.
export const ATTIC_RIDGE_Y = 214;
export const ATTIC_EAVES_Y = 150; // roof height at the long walls (z = ±185)
export const ATTIC_RAFTER_X = [-180, -60, 60, 180];

/** Roof height above a given z (straight slopes from the ridge to the eaves). */
export function atticRoofY(z: number): number {
  return ATTIC_RIDGE_Y - (ATTIC_RIDGE_Y - ATTIC_EAVES_Y) * Math.min(1, Math.abs(z) / 185);
}

// Under-roof volume blocked in bands (the visual slope sits on top of these steps)
const roofBands: MapCollider[] = [];
const BAND_EDGES = [20, 55, 90, 120, 150, 185];
for (const side of [-1, 1]) {
  for (let i = 0; i < BAND_EDGES.length - 1; i++) {
    const inner = BAND_EDGES[i];
    const outer = BAND_EDGES[i + 1];
    const y = atticRoofY(outer);
    const minZ = side > 0 ? inner : -outer;
    const maxZ = side > 0 ? outer : -inner;
    roofBands.push(box(`roof_${side > 0 ? 's' : 'n'}${i}`, -250, y, minZ, 250, 240, maxZ));
  }
}

const rafters: MapCollider[] = [];
for (const x of ATTIC_RAFTER_X) {
  for (const side of [-1, 1]) {
    rafters.push(
      capsule(`rafter_${x}_${side > 0 ? 's' : 'n'}`, x, ATTIC_RIDGE_Y, 0, x, ATTIC_EAVES_Y + 6, side * 183, 5)
    );
  }
}

/** Map authored in design units — the 3D scene is built from this version. */
export const ATTIC_MAP_DESIGN: MapDefinition = {
  id: 'attic',
  nameFr: 'Le grenier',
  subtitleFr: 'Charpente à slalomer, malle, cheval à bascule, courant d’air de la lucarne et toile d’araignée.',
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
  skyColor: '#F3E3C3',
  fogColor: '#EAD7B0',
  colliders: [
    ...roofBands,
    // Ridge beam and rafters (fly between them)
    capsule('ridge_beam', -250, ATTIC_RIDGE_Y, 0, 250, ATTIC_RIDGE_Y, 0, 7),
    ...rafters,

    // Hanging bare bulb in the middle of the room
    capsule('bulb_cord', 0, ATTIC_RIDGE_Y, 0, 0, 172, 0, 1.5),
    sphere('bulb', 0, 164, 0, 9, 'medium'),

    // Old travel trunk (back-left) with its lid open against the wall
    box('trunk', -215, 0, -175, -130, 48, -122),
    box('trunk_lid', -215, 48, -182, -130, 96, -172),

    // Big cardboard box tower (back-right)
    box('carton_tower', 128, 0, -177, 202, 56, -124),

    // Rocking horse (front-left)
    box('horse_rocker', -170, 0, 105, -80, 14, 136),
    capsule('horse_body', -150, 52, 120, -98, 52, 120, 14),
    capsule('horse_neck', -98, 52, 120, -84, 84, 120, 9),
    capsule('horse_leg_back', -146, 14, 120, -146, 44, 120, 5),
    capsule('horse_leg_front', -102, 14, 120, -102, 44, 120, 5),

    // Dressmaker mannequin (front-right)
    capsule('mannequin_pole', 192, 0, 128, 192, 64, 128, 4),
    capsule('mannequin_torso', 192, 72, 128, 192, 112, 128, 16),

    // Old cast-iron radiator on the left gable wall (warm updraft above it)
    box('radiator', -249, 0, -42, -228, 62, 42),

    // Destructible props
    sphere('old_vase', -172, 62, -148, 12, 'small'),
    box('carton_small', 140, 56, -166, 176, 86, -134, 'small'),
    box('carton_front', 146, 0, 112, 184, 34, 158, 'small'),
    box('toy_drum', 92, 0, 140, 134, 30, 176, 'small'),
    box('book_stack', -42, 0, -176, -2, 40, -140, 'small'),
  ],
  destructibles: [
    {
      id: 'old_vase',
      colliderId: 'old_vase',
      nameFr: 'Vieux vase',
      kind: 'flower_pot',
      x: -172,
      y: 62,
      z: -148,
      radius: 14,
      maxHp: 26,
      dropsPowerUp: true,
      rewardPool: ['firecracker', 'magnet', 'turbo_battery'],
    },
    {
      id: 'carton_small',
      colliderId: 'carton_small',
      nameFr: 'Carton de déménagement',
      kind: 'snack_box',
      x: 158,
      y: 71,
      z: -150,
      radius: 18,
      maxHp: 30,
      dropsPowerUp: true,
      rewardPool: ['rubber_missile', 'water_bomb', 'turbo_battery'],
    },
    {
      id: 'carton_front',
      colliderId: 'carton_front',
      nameFr: 'Carton de jouets',
      kind: 'snack_box',
      x: 165,
      y: 17,
      z: 135,
      radius: 20,
      maxHp: 30,
      dropsPowerUp: true,
      rewardPool: ['glue_mine', 'bubble_shield', 'repair_tape'],
    },
    {
      id: 'toy_drum',
      colliderId: 'toy_drum',
      nameFr: 'Tambour en fer-blanc',
      kind: 'piggy_bank',
      x: 113,
      y: 15,
      z: 158,
      radius: 20,
      maxHp: 36,
      dropsPowerUp: true,
    },
    {
      id: 'book_stack',
      colliderId: 'book_stack',
      nameFr: 'Pile de vieux livres',
      kind: 'book',
      x: -22,
      y: 20,
      z: -158,
      radius: 19,
      maxHp: 32,
      dropsPowerUp: true,
      rewardPool: ['repair_tape', 'bubble_shield', 'firecracker'],
    },
  ],
  spawns: [
    // Lanes across the room under the rafters, furniture kept along the walls
    { x: -185, y: 70, z: -80, yaw: -Math.PI * 0.5 },
    { x: 185, y: 70, z: 80, yaw: Math.PI * 0.5 },
    { x: -185, y: 110, z: -30, yaw: -Math.PI * 0.5 },
    { x: 185, y: 110, z: 30, yaw: Math.PI * 0.5 },
    { x: -185, y: 135, z: 50, yaw: -Math.PI * 0.5 },
    { x: 185, y: 135, z: -50, yaw: Math.PI * 0.5 },
    { x: -185, y: 92, z: 82, yaw: -Math.PI * 0.5 },
    { x: 185, y: 92, z: -88, yaw: Math.PI * 0.5 },
    { x: -120, y: 128, z: 150, yaw: 0 },
    { x: 120, y: 128, z: -150, yaw: Math.PI },
    { x: -30, y: 80, z: -150, yaw: Math.PI },
    { x: 30, y: 80, z: 150, yaw: 0 },
    { x: -105, y: 58, z: -100, yaw: -Math.PI * 0.5 },
    { x: 105, y: 58, z: 100, yaw: Math.PI * 0.5 },
    { x: -150, y: 150, z: 0, yaw: -Math.PI * 0.5 },
    { x: 150, y: 150, z: 10, yaw: Math.PI * 0.5 },
  ],
  windZones: [
    {
      // Gusts through the open dormer window on the right gable wall, blowing toward -X
      originX: 246,
      originY: 112,
      originZ: 60,
      range: 230,
      coneHalfAngle: 0.42,
      baseYaw: Math.PI / 2,
      sweepAmplitude: 0.3,
      sweepSpeed: 0.35,
      pushStrength: 55,
    },
  ],
  updraftZones: [
    {
      id: 'radiator_updraft',
      x: -222,
      y: 62,
      z: 0,
      radius: 30,
      height: 120,
      liftStrength: 120,
    },
  ],
  hazardZones: [
    {
      id: 'spider_web',
      nameFr: 'la toile d’araignée',
      x: 214,
      y: 118,
      z: -152,
      radius: 18,
      height: 34,
      damage: 9999,
    },
  ],
  catPath: { ax: -238, az: 70, bx: 238, bz: 70, y: 6 },
  powerUpSpots: [
    { id: 'pu_attic_center', x: 0, y: 100, z: 0 },
    { id: 'pu_attic_trunk', x: -120, y: 118, z: -60 },
    { id: 'pu_attic_dormer', x: 120, y: 118, z: 60 },
    { id: 'pu_attic_horse', x: -60, y: 70, z: 62 },
    { id: 'pu_attic_cartons', x: 100, y: 140, z: -80 },
  ],
};

/** Gameplay version (server + client prediction), enlarged by ARENA_SCALE. */
export const ATTIC_MAP: MapDefinition = scaleMapDefinition(ATTIC_MAP_DESIGN);
