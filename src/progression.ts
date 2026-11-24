import { PAINT_PALETTES, STICKERS } from '../shared/planes';
import type { PaintId, PlayerCosmetics, StickerId } from '../shared/types';

/**
 * Paints and stickers unlocked by playing, saved on this device only (cosmetic, no server check).
 * Items without a requirement are available from the start.
 */
export interface UnlockRequirement {
  kind: 'matches' | 'wins' | 'kills';
  count: number;
}

export const PAINT_UNLOCKS: Partial<Record<PaintId, UnlockRequirement>> = {
  orange: { kind: 'matches', count: 2 },
  white: { kind: 'kills', count: 10 },
  purple: { kind: 'wins', count: 1 },
  pink: { kind: 'matches', count: 5 },
  gold: { kind: 'wins', count: 3 },
};

export const STICKER_UNLOCKS: Partial<Record<StickerId, UnlockRequirement>> = {
  heart: { kind: 'matches', count: 3 },
  flame: { kind: 'kills', count: 15 },
  crown: { kind: 'wins', count: 2 },
};

export interface PlayerProgress {
  matches: number;
  wins: number;
  kills: number;
  /** Items kept unlocked regardless of stats (what the player already used before progression) */
  kept: string[];
}

export interface UnlockedItem {
  kind: 'paint' | 'sticker';
  id: string;
  nameFr: string;
}

const KEY = 'ej_progress';

export function loadProgress(current: PlayerCosmetics): PlayerProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<PlayerProgress>;
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
      return {
        matches: n(p.matches),
        wins: n(p.wins),
        kills: n(p.kills),
        kept: Array.isArray(p.kept) ? p.kept.filter((k): k is string => typeof k === 'string') : [],
      };
    }
  } catch {
    // corrupted or unavailable storage: start fresh
  }
  // First time: whatever the player already flies with stays available
  const fresh: PlayerProgress = {
    matches: 0,
    wins: 0,
    kills: 0,
    kept: [`paint:${current.paintId}`, `sticker:${current.stickerId}`],
  };
  saveProgress(fresh);
  return fresh;
}

export function saveProgress(p: PlayerProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable: progress simply won't persist
  }
}

const meets = (p: PlayerProgress, req: UnlockRequirement) => p[req.kind] >= req.count;

export function isPaintUnlocked(p: PlayerProgress, id: PaintId): boolean {
  const req = PAINT_UNLOCKS[id];
  return !req || meets(p, req) || p.kept.includes(`paint:${id}`);
}

export function isStickerUnlocked(p: PlayerProgress, id: StickerId): boolean {
  const req = STICKER_UNLOCKS[id];
  return !req || meets(p, req) || p.kept.includes(`sticker:${id}`);
}

/** Adds a finished match; returns the new progress and the items it just unlocked. */
export function recordMatch(
  p: PlayerProgress,
  result: { kills: number; won: boolean }
): { progress: PlayerProgress; unlocked: UnlockedItem[] } {
  const next: PlayerProgress = {
    ...p,
    matches: p.matches + 1,
    wins: p.wins + (result.won ? 1 : 0),
    kills: p.kills + Math.max(0, Math.floor(result.kills)),
  };
  const unlocked: UnlockedItem[] = [];
  for (const [id, req] of Object.entries(PAINT_UNLOCKS) as Array<[PaintId, UnlockRequirement]>) {
    if (!isPaintUnlocked(p, id) && meets(next, req)) {
      unlocked.push({ kind: 'paint', id, nameFr: PAINT_PALETTES[id].nameFr });
    }
  }
  for (const [id, req] of Object.entries(STICKER_UNLOCKS) as Array<[StickerId, UnlockRequirement]>) {
    if (!isStickerUnlocked(p, id) && meets(next, req)) {
      unlocked.push({ kind: 'sticker', id, nameFr: STICKERS[id].nameFr });
    }
  }
  return { progress: next, unlocked };
}

/** Short French label of what is needed, with progress, e.g. « 1 / 3 victoires ». */
export function requirementLabel(p: PlayerProgress, req: UnlockRequirement): string {
  const have = Math.min(req.count, p[req.kind]);
  const noun =
    req.kind === 'matches'
      ? req.count > 1 ? 'parties jouées' : 'partie jouée'
      : req.kind === 'wins'
        ? req.count > 1 ? 'victoires' : 'victoire'
        : req.count > 1 ? 'avions abattus' : 'avion abattu';
  return `${have} / ${req.count} ${noun}`;
}
