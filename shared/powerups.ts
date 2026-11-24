import type { MapDefinition } from './maps/types';
import type { PowerUpId } from './types';

export interface PowerUpDefinition {
  id: PowerUpId;
  nameFr: string;
  shortDescFr: string;
  uses: number;
  colorHex: string;
  accentHex: string;
  kind: 'offensive' | 'defensive' | 'mobility' | 'utility';
}

export const POWERUP_ORDER: PowerUpId[] = [
  'rubber_missile',
  'water_bomb',
  'firecracker',
  'glue_mine',
  'turbo_battery',
  'bubble_shield',
  'repair_tape',
  'magnet',
];

export const POWERUPS: Record<PowerUpId, PowerUpDefinition> = {
  rubber_missile: {
    id: 'rubber_missile',
    nameFr: 'Missiles élastiques',
    shortDescFr: 'Missile à tête chercheuse (x2)',
    uses: 2,
    colorHex: '#EF4444',
    accentHex: '#FEF08A',
    kind: 'offensive',
  },
  water_bomb: {
    id: 'water_bomb',
    nameFr: 'Bombe à eau',
    shortDescFr: 'Explosion de zone éclaboussante',
    uses: 1,
    colorHex: '#0EA5E9',
    accentHex: '#E0F2FE',
    kind: 'offensive',
  },
  firecracker: {
    id: 'firecracker',
    nameFr: 'Pétard-fusée',
    shortDescFr: 'Roquette ultra-rapide (x2)',
    uses: 2,
    colorHex: '#F97316',
    accentHex: '#FACC15',
    kind: 'offensive',
  },
  glue_mine: {
    id: 'glue_mine',
    nameFr: 'Mine de colle',
    shortDescFr: 'Piège collant qui ralentit (x2)',
    uses: 2,
    colorHex: '#EAB308',
    accentHex: '#FEF9C3',
    kind: 'utility',
  },
  turbo_battery: {
    id: 'turbo_battery',
    nameFr: 'Pile turbo',
    shortDescFr: 'Vitesse maximale pendant 5,5 s',
    uses: 1,
    colorHex: '#22C55E',
    accentHex: '#BBF7D0',
    kind: 'mobility',
  },
  bubble_shield: {
    id: 'bubble_shield',
    nameFr: 'Bulle bouclier',
    shortDescFr: 'Bulle de savon protectrice (7 s)',
    uses: 1,
    colorHex: '#A855F7',
    accentHex: '#F3E8FF',
    kind: 'defensive',
  },
  repair_tape: {
    id: 'repair_tape',
    nameFr: 'Scotch réparateur',
    shortDescFr: 'Répare +45 pts de coque',
    uses: 1,
    colorHex: '#10B981',
    accentHex: '#ECFDF5',
    kind: 'defensive',
  },
  magnet: {
    id: 'magnet',
    nameFr: 'Aimant',
    shortDescFr: 'Dévie les ennemis proches (6 s)',
    uses: 1,
    colorHex: '#EC4899',
    accentHex: '#CBD5E1',
    kind: 'utility',
  },
};

export function pickRandomPowerUp(
  rng: () => number = Math.random,
  preferPool?: PowerUpId[]
): PowerUpId {
  const list = preferPool && preferPool.length > 0 ? preferPool : POWERUP_ORDER;
  return list[Math.floor(rng() * list.length) % list.length];
}

export interface VacuumState {
  active: boolean;
  elapsed: number;
  nozzleX: number;
  nozzleY: number;
  nozzleZ: number;
  safeRadius: number;
  suctionRadius: number;
}

export function computeVacuumState(
  suddenDeathElapsed: number,
  map: MapDefinition
): VacuumState {
  if (suddenDeathElapsed <= 0) {
    return {
      active: false,
      elapsed: 0,
      nozzleX: map.hardBounds.maxX + 60,
      nozzleY: 120,
      nozzleZ: 0,
      safeRadius: 340,
      suctionRadius: 42,
    };
  }

  // Sweeps in spirals from room perimeter inward over 48 seconds
  const progress = Math.min(1, suddenDeathElapsed / 48);
  const startRadius = 235;
  const minRadius = 26;
  const safeRadius = startRadius - (startRadius - minRadius) * progress;

  const angle = suddenDeathElapsed * 0.72;
  const nozzleX = Math.cos(angle) * safeRadius * 0.85;
  const nozzleZ = Math.sin(angle) * safeRadius * 0.7;
  const nozzleY = 108 + Math.sin(suddenDeathElapsed * 1.3) * 32;

  return {
    active: true,
    elapsed: suddenDeathElapsed,
    nozzleX,
    nozzleY,
    nozzleZ,
    safeRadius,
    suctionRadius: 40,
  };
}
