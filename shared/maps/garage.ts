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

// 1 unit = 1 cm. « Le garage »: workbench and pegboard at the back-left, metal shelves at the
// back-right, a bicycle hung upside down from the ceiling, lawnmower, scooter, tyres and oil drum at
// the front, and the overhead door half open: daylight and gusts of wind come in from the street.

/** Hung bicycle, upside down: wheels on top (hooks to the ceiling), frame, saddle and handlebar below. */
export const GARAGE_BIKE = {
  z: 0,
  rearHubX: -55,
  frontHubX: 15,
  hubY: 186,
  wheelRadius: 28,
  tyreRadius: 2.5,
  /** Frame joints (x, y) — the frame hangs below the wheels */
  bottomBracket: { x: -25, y: 191 },
  seatTop: { x: -35, y: 156 },
  headTop: { x: 5, y: 154 },
  headBottom: { x: 8, y: 171 },
  saddleY: 150,
  handlebarY: 146,
  handlebarHalfWidth: 18,
} as const;

/** Points of a wheel's rim, as a polygon in the bike's plane (vertical, along X). */
export function bikeWheelPoints(hubX: number, segments = 8): Array<{ x: number; y: number }> {
  const b = GARAGE_BIKE;
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return { x: hubX + Math.cos(a) * b.wheelRadius, y: b.hubY + Math.sin(a) * b.wheelRadius };
  });
}

function bikeColliders(): MapCollider[] {
  const b = GARAGE_BIKE;
  const z = b.z;
  const out: MapCollider[] = [];
  for (const [name, hubX] of [['rear', b.rearHubX], ['front', b.frontHubX]] as const) {
    const pts = bikeWheelPoints(hubX);
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      out.push(capsule(`bike_${name}_wheel_${i}`, p.x, p.y, z, q.x, q.y, z, b.tyreRadius));
    });
    // Hook from the ceiling to the top of the wheel
    out.push(capsule(`bike_${name}_hook`, hubX, b.hubY + b.wheelRadius, z, hubX, 222, z, 1.2));
  }
  const seg = (id: string, a: { x: number; y: number }, c: { x: number; y: number }, r = 2.2) =>
    out.push(capsule(id, a.x, a.y, z, c.x, c.y, z, r));
  const rear = { x: b.rearHubX, y: b.hubY };
  const front = { x: b.frontHubX, y: b.hubY };
  seg('bike_chainstay', b.bottomBracket, rear);
  seg('bike_seatstay', b.seatTop, rear);
  seg('bike_seattube', b.bottomBracket, b.seatTop);
  seg('bike_toptube', b.seatTop, b.headTop);
  seg('bike_downtube', b.bottomBracket, b.headBottom);
  seg('bike_headtube', b.headTop, b.headBottom, 2.6);
  seg('bike_fork', b.headBottom, front);
  out.push(capsule('bike_saddle', b.seatTop.x - 9, b.saddleY, z, b.seatTop.x + 7, b.saddleY, z, 4));
  out.push(capsule('bike_handlebar', b.headTop.x - 2, b.handlebarY, z - b.handlebarHalfWidth, b.headTop.x - 2, b.handlebarY, z + b.handlebarHalfWidth, 2));
  return out;
}

/** Map authored in design units — the 3D scene is built from this version. */
export const GARAGE_MAP_DESIGN: MapDefinition = {
  id: 'garage',
  nameFr: 'Le garage',
  subtitleFr: 'Établi, étagères en métal, vélo suspendu… et la porte entrouverte qui laisse entrer les rafales.',
  available: true,
  hardBounds: { minX: -250, maxX: 250, minY: 6, maxY: 222, minZ: -185, maxZ: 185 },
  softBounds: { minX: -236, maxX: 236, minY: 8, maxY: 210, minZ: -174, maxZ: 174 },
  skyColor: '#F1F5F9',
  fogColor: '#E2E8F0',
  colliders: [
    // Workbench (back-left): top, legs, lower shelf, vice, pegboard with its tools
    box('workbench_top', -200, 78, -185, -40, 86, -130),
    box('workbench_leg_fl', -198, 0, -136, -192, 78, -130),
    box('workbench_leg_fr', -48, 0, -136, -42, 78, -130),
    box('workbench_leg_bl', -198, 0, -183, -192, 78, -177),
    box('workbench_leg_br', -48, 0, -183, -42, 78, -177),
    box('workbench_shelf', -198, 20, -183, -42, 25, -132),
    box('vice', -80, 86, -140, -60, 104, -126),
    box('pegboard', -205, 100, -185, -35, 190, -176),
    // Chest freezer against the back wall
    box('freezer', 10, 0, -183, 110, 85, -128),
    // Metal shelves (back-right): four uprights, four boards, a bucket
    capsule('shelf_post_1', 152, 0, -183, 152, 200, -183, 2),
    capsule('shelf_post_2', 243, 0, -183, 243, 200, -183, 2),
    capsule('shelf_post_3', 152, 0, -142, 152, 200, -142, 2),
    capsule('shelf_post_4', 243, 0, -142, 243, 200, -142, 2),
    box('shelf_board_1', 150, 38, -185, 245, 42, -140),
    box('shelf_board_2', 150, 88, -185, 245, 92, -140),
    box('shelf_board_3', 150, 138, -185, 245, 142, -140),
    box('shelf_board_4', 150, 188, -185, 245, 192, -140),
    box('shelf_bucket', 160, 142, -178, 190, 165, -150),
    // Bicycle hung from the ceiling
    ...bikeColliders(),
    // Fluorescent tubes
    capsule('neon_left', -160, 214, -80, -40, 214, -80, 4, 'medium'),
    capsule('neon_right', 40, 214, -80, 160, 214, -80, 4, 'medium'),
    // Rails of the overhead door under the ceiling
    capsule('door_rail_left', -152, 214, 185, -152, 214, 60, 2),
    capsule('door_rail_right', 152, 214, 185, 152, 214, 60, 2),
    // Lawnmower (front-left): body, grass bag, handle
    box('mower_body', -235, 0, 100, -175, 40, 150),
    box('mower_bag', -228, 8, 150, -182, 42, 168),
    capsule('mower_handle', -205, 40, 150, -205, 92, 178, 2.5),
    capsule('mower_bar', -225, 92, 178, -185, 92, 178, 2.5),
    // Kick scooter against the right wall
    box('scooter_deck', 222, 4, 105, 238, 11, 175),
    capsule('scooter_stem', 230, 11, 170, 230, 95, 176, 2.2),
    capsule('scooter_bar', 230, 95, 158, 230, 95, 182, 2),
    // Destructible props
    box('toolbox', -180, 86, -170, -140, 110, -145, 'small'),
    box('paint_cans', 165, 42, -175, 205, 62, -150, 'small'),
    box('carton', 200, 92, -180, 240, 128, -145, 'small'),
    box('tyre_stack', 100, 0, 120, 160, 48, 180, 'small'),
    box('oil_drum', -150, 0, 140, -110, 60, 180, 'small'),
  ],
  destructibles: [
    { id: 'toolbox', colliderId: 'toolbox', nameFr: 'Caisse à outils', kind: 'toaster', x: -160, y: 98, z: -157, radius: 18, maxHp: 30, dropsPowerUp: true, rewardPool: ['rubber_missile', 'repair_tape', 'magnet'] },
    { id: 'paint_cans', colliderId: 'paint_cans', nameFr: 'Pots de peinture', kind: 'snack_box', x: 185, y: 52, z: -162, radius: 18, maxHp: 22, dropsPowerUp: true, rewardPool: ['glue_mine', 'water_bomb', 'firecracker'] },
    { id: 'carton', colliderId: 'carton', nameFr: 'Carton de bric-à-brac', kind: 'cereal_box', x: 220, y: 110, z: -162, radius: 20, maxHp: 24, dropsPowerUp: true, rewardPool: ['bubble_shield', 'turbo_battery', 'firecracker'] },
    { id: 'tyre_stack', colliderId: 'tyre_stack', nameFr: 'Pile de pneus', kind: 'lego', x: 130, y: 24, z: 150, radius: 28, maxHp: 40, dropsPowerUp: true },
    { id: 'oil_drum', colliderId: 'oil_drum', nameFr: 'Bidon d’huile', kind: 'piggy_bank', x: -130, y: 30, z: 160, radius: 22, maxHp: 30, dropsPowerUp: true, rewardPool: ['turbo_battery', 'rubber_missile', 'glue_mine'] },
  ],
  spawns: [
    // Chosen so that each one flies 5 s straight across the room without hitting anything
    { x: -200, y: 115, z: -150, yaw: -2.214 },
    { x: 200, y: 55, z: 150, yaw: 0.927 },
    { x: 125, y: 175, z: -150, yaw: 2.797 },
    { x: -100, y: 175, z: 150, yaw: -0.238 },
    { x: -200, y: 55, z: 50, yaw: -1.326 },
    { x: 100, y: 175, z: 75, yaw: 1.277 },
    { x: 200, y: 55, z: -75, yaw: 1.93 },
    { x: 0, y: 55, z: 125, yaw: 0 },
    { x: -25, y: 55, z: -125, yaw: -2.944 },
    { x: -50, y: 175, z: -100, yaw: -2.328 },
    { x: -200, y: 175, z: 0, yaw: -1.221 },
    { x: 200, y: 145, z: -25, yaw: 2.045 },
    { x: -200, y: 115, z: 150, yaw: -0.927 },
    { x: -100, y: 115, z: 50, yaw: -1.107 },
    { x: 100, y: 85, z: 50, yaw: 1.107 },
    { x: 200, y: 145, z: 150, yaw: 0.927 },
  ],
  windZones: [
    {
      // Gusts of wind through the half-open overhead door, toward the back of the garage
      originX: 0,
      originY: 60,
      originZ: 183,
      range: 230,
      coneHalfAngle: 0.5,
      baseYaw: 0,
      sweepAmplitude: 0.3,
      sweepSpeed: 0.25,
      pushStrength: 50,
      verticalHalfExtent: 55,
    },
  ],
  updraftZones: [],
  hazardZones: [],
  catPath: { ax: 238, az: 80, bx: -238, bz: 80, y: 6 },
  powerUpSpots: [
    { id: 'pu_garage_bench', x: -120, y: 125, z: -110 },
    { id: 'pu_garage_shelves', x: 120, y: 120, z: -115 },
    { id: 'pu_garage_bike', x: -20, y: 110, z: 40 },
    { id: 'pu_garage_door', x: 0, y: 70, z: 140 },
    { id: 'pu_garage_tyres', x: 160, y: 100, z: 90 },
  ],
};

/** Gameplay version (server + client prediction), enlarged by ARENA_SCALE. */
export const GARAGE_MAP: MapDefinition = scaleMapDefinition(GARAGE_MAP_DESIGN);
