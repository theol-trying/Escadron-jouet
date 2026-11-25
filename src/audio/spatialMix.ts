/**
 * 3D sound budget. HRTF spatialisation (precise front/back/up/down, but a convolution per sound) is
 * kept for nearby sounds, a few at a time; farther ones use the cheap equal-power panner (still
 * placed left/right and quieter with distance). With 12 planes firing, this bounds the audio work.
 */
export const HRTF_RANGE = 220; // cm: within this distance of the camera, sounds get HRTF
export const MAX_HRTF_VOICES = 8; // HRTF sounds playing at once
export const EARSHOT = 1400; // cm: panner maxDistance; beyond it a sound is not played at all

export type SpatialModel = 'HRTF' | 'equalpower';

/** How to place a one-shot sound `distance` cm from the camera (null = too far to bother). */
export function spatialModel(distance: number, activeHrtfVoices: number): SpatialModel | null {
  if (!Number.isFinite(distance) || distance > EARSHOT) return null;
  return distance <= HRTF_RANGE && activeHrtfVoices < MAX_HRTF_VOICES ? 'HRTF' : 'equalpower';
}
