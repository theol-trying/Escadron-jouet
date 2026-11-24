import test from 'node:test';
import assert from 'node:assert/strict';
import { isPaintUnlocked, isStickerUnlocked, recordMatch, requirementLabel, type PlayerProgress } from './progression';

const fresh = (kept: string[] = []): PlayerProgress => ({ matches: 0, wins: 0, kills: 0, kept });

test('progression: base items open, others unlock by matches, kills and wins', () => {
  const p0 = fresh();
  assert.equal(isPaintUnlocked(p0, 'red'), true);
  assert.equal(isPaintUnlocked(p0, 'green'), true);
  assert.equal(isPaintUnlocked(p0, 'gold'), false);
  assert.equal(isStickerUnlocked(p0, 'star'), true);
  assert.equal(isStickerUnlocked(p0, 'crown'), false);

  // A first win unlocks Violet Galaxie (1 win), not Or Trophée (3 wins)
  const r1 = recordMatch(p0, { kills: 4, won: true });
  assert.deepEqual(r1.unlocked.map((u) => u.id).sort(), ['purple']);
  assert.equal(r1.progress.matches, 1);

  // Second match: Orange (2 matches) unlocks; the 10th kill unlocks Blanc Nacré
  const r2 = recordMatch(r1.progress, { kills: 6, won: false });
  assert.deepEqual(r2.unlocked.map((u) => u.id).sort(), ['orange', 'white']);

  // Already unlocked items are never announced twice
  const r3 = recordMatch(r2.progress, { kills: 0, won: false });
  assert.ok(!r3.unlocked.some((u) => ['purple', 'orange', 'white'].includes(u.id)));
  assert.ok(r3.unlocked.some((u) => u.id === 'heart'), 'heart at 3 matches');
});

test('progression: items already used before progression stay available', () => {
  const p = fresh(['paint:white', 'sticker:flame']);
  assert.equal(isPaintUnlocked(p, 'white'), true);
  assert.equal(isStickerUnlocked(p, 'flame'), true);
  assert.equal(requirementLabel(fresh(), { kind: 'wins', count: 3 }), '0 / 3 victoires');
  assert.equal(requirementLabel({ ...fresh(), kills: 12 }, { kind: 'kills', count: 10 }), '10 / 10 avions abattus');
});
