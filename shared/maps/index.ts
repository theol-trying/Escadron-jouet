import type { MapId } from '../types';
import type { MapDefinition } from './types';
import { DESK_MAP } from './desk';
import { KITCHEN_MAP } from './kitchen';
import { GARDEN_MAP } from './garden';
import { ATTIC_MAP } from './attic';
import { BEDROOM_MAP } from './bedroom';
import { BATHROOM_MAP } from './bathroom';
import { GARAGE_MAP } from './garage';

export const MAPS: Record<MapId, MapDefinition> = {
  desk: DESK_MAP,
  kitchen: KITCHEN_MAP,
  garden: GARDEN_MAP,
  attic: ATTIC_MAP,
  bedroom: BEDROOM_MAP,
  bathroom: BATHROOM_MAP,
  garage: GARAGE_MAP,
};

export const MAP_ORDER: MapId[] = ['desk', 'kitchen', 'garden', 'attic', 'bedroom', 'bathroom', 'garage'];
