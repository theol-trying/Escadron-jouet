// ── Gameplay scale tuning (single place to adjust) ──────────────────────────────────────────────
// ARENA_SCALE enlarges every room: map data is authored in "design units" and multiplied by this
// factor for gameplay (server + client prediction); the 3D scenes are built in design units inside
// a group scaled by the same factor. Planes, bullets and power-ups keep their size, so the rooms
// feel bigger around them.
export const ARENA_SCALE = 1.4;
// PLANE_SPEED_SCALE slows every plane (min/cruise/max/boost speeds). Turn rates are unchanged, so
// turning circles tighten relative to the room. Environmental pushes (fan, updraft, vacuum pull)
// are scaled by the same factor to keep their effect relative to the planes' speed.
export const PLANE_SPEED_SCALE = 0.85;

/**
 * Network protocol version: bump it whenever the messages change shape. The server announces it on
 * connection; a page still running an older build reloads itself instead of misreading updates.
 * 2 = binary snapshots (shared/snapshotCodec.ts).
 * 3 = rings and king zones moved to open air, new king scoring (shared/objectives.ts is computed on
 *     both sides: an old page would draw them in the wrong place).
 * 4 = quick messages (chat:quick).
 */
export const PROTOCOL_VERSION = 4;

export const REMOTE_INTERP_DELAY_MS = 95;
export const MAX_LAG_COMPENSATION_MS = 250;

export function computeLagCompensationMs(pingMs: number): number {
  const halfRtt = Math.max(0, Number.isFinite(pingMs) ? pingMs * 0.5 : 0);
  return Math.min(MAX_LAG_COMPENSATION_MS, halfRtt + REMOTE_INTERP_DELAY_MS);
}
