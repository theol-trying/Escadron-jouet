import * as THREE from 'three';
import type { ActivePlaneVisual, ProjectedLabel, RoomPlayerMeta } from './engineTypes';

const _p = new THREE.Vector3();

/**
 * Name tags of the other planes for the HUD: screen position just above each plane, or the
 * direction of the screen-edge arrow when it is off-screen or behind the camera.
 */
export function projectPlaneLabels(
  planes: Iterable<ActivePlaneVisual>,
  localPlayerId: string | null,
  focusPos: THREE.Vector3 | null,
  camera: THREE.Camera,
  width: number,
  height: number,
  metaOf: (id: string) => RoomPlayerMeta | undefined
): ProjectedLabel[] {
  const labels: ProjectedLabel[] = [];
  for (const pv of planes) {
    if (pv.id === localPlayerId) continue;
    const data = pv.buffer[pv.buffer.length - 1]?.data;
    if (!data) continue;

    const dist = focusPos ? pv.interpPos.distanceTo(focusPos) : 0;
    _p.copy(pv.interpPos);
    _p.y += 4.5;
    _p.project(camera);

    const inFront = _p.z >= -1 && _p.z <= 1;
    let nx = _p.x;
    let ny = _p.y;
    if (!inFront) {
      nx = -nx;
      ny = -ny;
    }
    const onScreen = inFront && Math.abs(nx) <= 0.92 && Math.abs(ny) <= 0.9;
    const meta = metaOf(pv.id);
    labels.push({
      id: pv.id,
      nickname: meta?.nickname ?? 'Pilote',
      team: data.team,
      hpRatio: Math.max(0, data.hp / Math.max(1, meta?.maxHp ?? 100)),
      screenX: (nx * 0.5 + 0.5) * width,
      screenY: (-ny * 0.5 + 0.5) * height,
      inFront,
      onScreen,
      angle: Math.atan2(-ny, nx),
      distance: Math.round(dist),
      isTarget: false,
    });
  }
  return labels;
}
