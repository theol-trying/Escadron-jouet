import type { MapId } from '../types';
import type { MapDefinition } from './types';
import { DESK_MAP } from './desk';
import { KITCHEN_MAP } from './kitchen';
import { GARDEN_MAP } from './garden';
import { ATTIC_MAP } from './attic';

export const MAPS: Record<MapId, MapDefinition> = {
  desk: DESK_MAP,
  kitchen: KITCHEN_MAP,
  garden: GARDEN_MAP,
  attic: ATTIC_MAP,
};

export const MAP_ORDER: MapId[] = ['desk', 'kitchen', 'garden', 'attic'];
