export const REMOTE_INTERP_DELAY_MS = 95;
export const MAX_LAG_COMPENSATION_MS = 250;

export function computeLagCompensationMs(pingMs: number): number {
  const halfRtt = Math.max(0, Number.isFinite(pingMs) ? pingMs * 0.5 : 0);
  return Math.min(MAX_LAG_COMPENSATION_MS, halfRtt + REMOTE_INTERP_DELAY_MS);
}
