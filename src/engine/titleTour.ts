import type * as THREE from 'three';
import { ARENA_SCALE, PLANE_SPEED_SCALE } from '../../shared/constants';
import type { PlayerCosmetics } from '../../shared/types';
import { buildToyPlane, type BuiltPlaneRig } from './planeBuilder';

// Ambient planes of the title flyover: cosmetics, phase on the orbit, orbit radius, height (design units)
const TOUR: Array<[PlayerCosmetics, number, number, number]> = [
  [{ planeId: 'plastic_jet', paintId: 'red', stickerId: 'star' }, 0, 115, 138],
  [{ planeId: 'windup_biplane', paintId: 'yellow', stickerId: 'lightning' }, 2.1, 88, 122],
  [{ planeId: 'foam_glider', paintId: 'blue', stickerId: 'target' }, 4.2, 135, 152],
];

/** Three toy planes circling over the desk behind the title screen and the lobby. */
export class TitleTour {
  private planes: Array<{ rig: BuiltPlaneRig; phase: number; radius: number; y: number }> = [];

  constructor(private readonly scene: THREE.Scene) {
    for (const [cos, phase, radius, y] of TOUR) {
      const rig = buildToyPlane(cos.planeId, cos.paintId, cos.stickerId);
      scene.add(rig.root);
      // Orbits are authored for the design-size room: they follow the arena scale
      this.planes.push({ rig, phase, radius: radius * ARENA_SCALE, y: y * ARENA_SCALE });
    }
  }

  public setVisible(visible: boolean): void {
    for (const tp of this.planes) tp.rig.root.visible = visible;
  }

  public update(elapsedTime: number, dt: number): void {
    // Larger orbits flown at the slowed plane speed: angular rate = 0.72 × speed / room scale
    const tourAngularRate = 0.72 * (PLANE_SPEED_SCALE / ARENA_SCALE);
    for (const tp of this.planes) {
      const a = elapsedTime * tourAngularRate + tp.phase;
      const x = Math.cos(a) * tp.radius;
      const z = Math.sin(a) * tp.radius * 0.78;
      const y = tp.y + Math.sin(a * 2) * 8 * ARENA_SCALE;
      tp.rig.root.position.set(x, y, z);
      const dx = -Math.sin(a) * tp.radius;
      const dz = Math.cos(a) * tp.radius * 0.78;
      tp.rig.root.rotation.set(0, Math.atan2(-dx, -dz), 0.35);
      for (const prop of tp.rig.propellers) prop.rotation.z += dt * 28;
      if (tp.rig.windupKey) tp.rig.windupKey.rotation.y += dt * 7;
    }
  }

  public dispose(): void {
    for (const tp of this.planes) {
      this.scene.remove(tp.rig.root);
      tp.rig.dispose();
    }
    this.planes = [];
  }
}
