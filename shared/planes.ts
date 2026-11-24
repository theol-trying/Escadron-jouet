import { PLANE_SPEED_SCALE } from './constants';
import type { PaintId, PlaneId, StickerId } from './types';

export interface PlaneArchetype {
  id: PlaneId;
  nameFr: string;
  taglineFr: string;
  materialFeelFr: string;
  maxHp: number;
  minSpeed: number; // cm/s
  cruiseSpeed: number;
  maxSpeed: number;
  boostSpeed: number;
  turnRate: number; // rad/s pitch & yaw responsiveness
  rollRate: number; // rad/s
  fireRate: number; // shots/s
  damage: number;
  projectileSpeed: number; // cm/s
  overheatPerShot: number;
  coolRate: number; // heat units/s
  hitboxRadius: number; // cm
  wingspan: number; // cm
  heavyGun: boolean;
  // Normalized 1..5 stat bars for Hangar UI
  statsDisplay: {
    speed: number;
    agility: number;
    armor: number;
    firepower: number;
  };
}

/** Reference values (speeds before PLANE_SPEED_SCALE). */
const PLANE_ARCHETYPES_DESIGN: Record<PlaneId, PlaneArchetype> = {
  plastic_jet: {
    id: 'plastic_jet',
    nameFr: 'Jet en plastique',
    taglineFr: 'Polyvalent, vif et équilibré pour toutes les manœuvres.',
    materialFeelFr: 'Plastique ABS brillant',
    maxHp: 100,
    minSpeed: 40,
    cruiseSpeed: 68,
    maxSpeed: 92,
    boostSpeed: 130,
    turnRate: 2.35,
    rollRate: 3.8,
    fireRate: 7.5,
    damage: 14,
    projectileSpeed: 360,
    overheatPerShot: 7.5,
    coolRate: 28,
    hitboxRadius: 5.5,
    wingspan: 10.5,
    heavyGun: false,
    statsDisplay: { speed: 4, agility: 4, armor: 3, firepower: 3 },
  },
  windup_biplane: {
    id: 'windup_biplane',
    nameFr: 'Biplan à remontoir',
    taglineFr: 'Ultra maniable avec clé dorsale, idéal dans les virages serrés.',
    materialFeelFr: 'Fer-blanc peint',
    maxHp: 110,
    minSpeed: 34,
    cruiseSpeed: 58,
    maxSpeed: 80,
    boostSpeed: 115,
    turnRate: 3.15,
    rollRate: 4.5,
    fireRate: 8.5,
    damage: 13,
    projectileSpeed: 340,
    overheatPerShot: 6.5,
    coolRate: 32,
    hitboxRadius: 5.6,
    wingspan: 10.2,
    heavyGun: false,
    statsDisplay: { speed: 2, agility: 5, armor: 3, firepower: 3 },
  },
  foam_glider: {
    id: 'foam_glider',
    nameFr: 'Planeur en mousse',
    taglineFr: 'Le plus rapide de la chambre, mais fragile aux chocs.',
    materialFeelFr: 'Mousse PPE légère',
    maxHp: 82,
    minSpeed: 48,
    cruiseSpeed: 82,
    maxSpeed: 110,
    boostSpeed: 152,
    turnRate: 2.55,
    rollRate: 4.1,
    fireRate: 9.0,
    damage: 11.5,
    projectileSpeed: 380,
    overheatPerShot: 6.0,
    coolRate: 30,
    hitboxRadius: 5.2,
    wingspan: 11.4,
    heavyGun: false,
    statsDisplay: { speed: 5, agility: 4, armor: 1, firepower: 3 },
  },
  diecast_bomber: {
    id: 'diecast_bomber',
    nameFr: 'Bombardier en métal',
    taglineFr: 'Lourd et blindé, équipé de canons lourds à billes.',
    materialFeelFr: 'Métal moulé lourd',
    maxHp: 135,
    minSpeed: 34,
    cruiseSpeed: 56,
    maxSpeed: 76,
    boostSpeed: 112,
    turnRate: 1.75,
    rollRate: 2.9,
    fireRate: 3.8,
    damage: 23,
    projectileSpeed: 350,
    overheatPerShot: 14.0,
    coolRate: 24,
    hitboxRadius: 6.4,
    wingspan: 11.8,
    heavyGun: true,
    statsDisplay: { speed: 2, agility: 1, armor: 5, firepower: 4 },
  },
};


/** Gameplay archetypes: every speed is multiplied by PLANE_SPEED_SCALE (turn rates, weapons and
 * hit points unchanged), so planes cross the enlarged rooms in a comfortable amount of time. */
export const PLANE_ARCHETYPES: Record<PlaneId, PlaneArchetype> = Object.fromEntries(
  Object.entries(PLANE_ARCHETYPES_DESIGN).map(([id, a]) => [
    id,
    {
      ...a,
      minSpeed: a.minSpeed * PLANE_SPEED_SCALE,
      cruiseSpeed: a.cruiseSpeed * PLANE_SPEED_SCALE,
      maxSpeed: a.maxSpeed * PLANE_SPEED_SCALE,
      boostSpeed: a.boostSpeed * PLANE_SPEED_SCALE,
    },
  ])
) as Record<PlaneId, PlaneArchetype>;

export const PLANE_ORDER: PlaneId[] = [
  'plastic_jet',
  'windup_biplane',
  'foam_glider',
  'diecast_bomber',
];

export interface PaintPalette {
  id: PaintId;
  nameFr: string;
  primary: string;
  secondary: string;
  accent: string;
}

export const PAINT_PALETTES: Record<PaintId, PaintPalette> = {
  red: {
    id: 'red',
    nameFr: 'Rouge Pompier',
    primary: '#E63946',
    secondary: '#FFF3E0',
    accent: '#FFB703',
  },
  blue: {
    id: 'blue',
    nameFr: 'Bleu Azur',
    primary: '#2563EB',
    secondary: '#F8FAFC',
    accent: '#FACC15',
  },
  yellow: {
    id: 'yellow',
    nameFr: 'Jaune Taxi',
    primary: '#F59E0B',
    secondary: '#1E293B',
    accent: '#EF4444',
  },
  green: {
    id: 'green',
    nameFr: 'Vert Pomme',
    primary: '#16A34A',
    secondary: '#FEFCE8',
    accent: '#F97316',
  },
  orange: {
    id: 'orange',
    nameFr: 'Orange Mandarine',
    primary: '#F97316',
    secondary: '#FFFBEB',
    accent: '#0EA5E9',
  },
  white: {
    id: 'white',
    nameFr: 'Blanc Nacré',
    primary: '#F1F5F9',
    secondary: '#DC2626',
    accent: '#1D4ED8',
  },
};

export const PAINT_ORDER: PaintId[] = [
  'red',
  'blue',
  'yellow',
  'green',
  'orange',
  'white',
];

export interface StickerDefinition {
  id: StickerId;
  nameFr: string;
}

export const STICKERS: Record<StickerId, StickerDefinition> = {
  star: { id: 'star', nameFr: 'Étoile' },
  lightning: { id: 'lightning', nameFr: 'Éclair' },
  target: { id: 'target', nameFr: 'Cocarde' },
  flame: { id: 'flame', nameFr: 'Flamme' },
};

export const STICKER_ORDER: StickerId[] = ['star', 'lightning', 'target', 'flame'];
