import type { MapId } from '../types';
import type { MapDefinition } from './types';
import { DESK_MAP } from './desk';

export const MAPS: Record<MapId, MapDefinition> = {
  desk: DESK_MAP,
  kitchen: {
    id: 'kitchen',
    nameFr: 'La cuisine',
    subtitleFr: 'Comptoir, grille-pain, évier et mixeur géant (Jalons 3–4).',
    available: false,
    hardBounds: DESK_MAP.hardBounds,
    softBounds: DESK_MAP.softBounds,
    skyColor: '#FFF3D6',
    fogColor: '#FFF7E5',
    colliders: [],
    spawns: DESK_MAP.spawns,
    windZones: [],
    powerUpSpots: [],
  },
  garden: {
    id: 'garden',
    nameFr: 'Le jardin',
    subtitleFr: 'Brins d’herbe géants, pots de fleurs et arroseur (Jalons 3–4).',
    available: false,
    hardBounds: DESK_MAP.hardBounds,
    softBounds: DESK_MAP.softBounds,
    skyColor: '#BEE9FF',
    fogColor: '#D6F2FF',
    colliders: [],
    spawns: DESK_MAP.spawns,
    windZones: [],
    powerUpSpots: [],
  },
};

export const MAP_ORDER: MapId[] = ['desk', 'kitchen', 'garden'];
