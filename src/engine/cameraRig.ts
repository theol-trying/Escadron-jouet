import * as THREE from 'three';
import { ARENA_SCALE } from '../../shared/constants';
import type { MapDefinition } from '../../shared/maps/types';
import type { PlaneId } from '../../shared/types';

// Cockpit view: pilot eye position in the plane's local frame (nose toward -Z) and field of view.
// The eye sits just above the fuselage so the plane's own nose, wings, propellers or cannons stay
// in sight; canopies/visors are hidden (BuiltPlaneRig.cockpitHidden).
export const COCKPIT_VIEWS: Record<PlaneId, { x: number; y: number; z: number; fov: number }> = {
  plastic_jet: { x: 0, y: 1.45, z: -0.7, fov: 78 },
  windup_biplane: { x: 0, y: 2.6, z: 0.9, fov: 74 }, // above the upper wing (it would fill the view)
  foam_glider: { x: 0, y: 1.5, z: -0.3, fov: 80 },
  diecast_bomber: { x: 0, y: 1.55, z: 1.3, fov: 72 },
  toy_helicopter: { x: 0, y: 0.95, z: -1.3, fov: 80 }, // inside the bubble (hidden), low and forward
  paper_plane: { x: 0, y: 0.9, z: 0.6, fov: 82 }, // just above the fold
  // Survival enemies (never flown by a player)
  fly: { x: 0, y: 1, z: -1, fov: 80 },
  drone: { x: 0, y: 1, z: -1, fov: 80 },
};

// Chase view: camera offset behind/above the plane and look-ahead point (plane local frame)
export const CHASE_OFFSET = { y: 6.6, z: 27 };
export const CHASE_LOOK = { y: 2.2, z: -30 };

/**
 * The camera of the 3D view: title flyover, hangar close-up, podium orbit, and in flight the chase
 * view (kept out of the furniture and inside the room) or the cockpit view; shake on hits.
 */
export class CameraRig {
  private camPos = new THREE.Vector3(0, 140, 180);
  private camTarget = new THREE.Vector3(0, 100, 0);
  private currentFov = 70;
  private trauma = 0;
  private snapNext = false;
  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly _v3 = new THREE.Vector3();
  private readonly _raycaster = new THREE.Raycaster();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** Adds camera shake (0..1, saturates at 1). */
  public shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Jump straight to the next chase position (respawn, entering a match) instead of gliding there. */
  public snapNextFrame(): void {
    this.snapNext = true;
  }

  private setFixedFov(fov: number): void {
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private easeFov(targetFov: number, dt: number): void {
    if (Math.abs(this.currentFov - targetFov) > 0.05) {
      this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-8 * dt));
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private applyShake(dt: number, strength: number): void {
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 2.2);
      const shake = this.trauma * this.trauma * strength;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }
  }

  /** Title screen: slow flyover of the desk. */
  public titleFlyover(elapsed: number): void {
    const t = elapsed * 0.18;
    const s = ARENA_SCALE;
    this.camera.position.set(Math.cos(t) * 190 * s, (142 + Math.sin(t * 1.4) * 18) * s, Math.sin(t) * 145 * s);
    this.camera.lookAt(-15 * s, 96 * s, -20 * s);
    this.setFixedFov(62);
  }

  /** Hangar: close framing of the preview plane sitting at `spot`. */
  public hangarCloseUp(spot: { x: number; y: number; z: number }): void {
    this.camera.position.set(spot.x + 24, spot.y + 6, spot.z + 27);
    this.camera.lookAt(spot.x - 7, spot.y - 1, spot.z + 4);
    this.setFixedFov(50);
  }

  /**
   * End of match: orbit around the podium, moving in when furniture is in the way. On wide screens
   * the score panel sits on the right, so the podium is shifted to the left third.
   */
  public podiumOrbit(anchor: THREE.Vector3, elapsed: number, wideScreen: boolean, colliders: THREE.Object3D[]): void {
    const a = elapsed * 0.22;
    const R = 92;
    const c = anchor;
    this.camera.position.set(c.x + Math.sin(a) * R, c.y + 32, c.z + Math.cos(a) * R);
    this._v1.set(c.x, c.y + 10, c.z);
    this._v3.subVectors(this.camera.position, this._v1);
    const camDist = this._v3.length();
    this._v3.divideScalar(camDist);
    this._raycaster.set(this._v1, this._v3);
    this._raycaster.far = camDist;
    const block = this._raycaster.intersectObjects(colliders, false).find((h) => h.object.visible);
    if (block) {
      this.camera.position.copy(this._v1).addScaledVector(this._v3, Math.max(45, block.distance - 4));
    }
    const shift = wideScreen ? 20 : 0;
    this.camera.lookAt(c.x + Math.cos(a) * shift, c.y + 10, c.z - Math.sin(a) * shift);
    this.setFixedFov(55);
  }

  /** Cockpit view: the pilot's eye, attached to the plane (lighter shake, wider view on boost). */
  public cockpit(
    focusPos: THREE.Vector3,
    focusQuat: THREE.Quaternion,
    planeId: PlaneId,
    boosting: boolean,
    dt: number
  ): void {
    const eye = COCKPIT_VIEWS[planeId] ?? COCKPIT_VIEWS.plastic_jet;
    this._v1.set(eye.x, eye.y, eye.z).applyQuaternion(focusQuat).add(focusPos);
    this.camPos.copy(this._v1);
    this.camera.position.copy(this._v1);
    this.camera.quaternion.copy(focusQuat);
    // Keep the chase target ahead of the nose so switching back to chase is smooth
    this.camTarget.set(0, CHASE_LOOK.y, CHASE_LOOK.z).applyQuaternion(focusQuat).add(focusPos);
    this.applyShake(dt, 0.35);
    this.easeFov(boosting ? eye.fov + 10 : eye.fov, dt);
  }

  /**
   * Chase view: behind and above the plane, pulled in front of furniture (raycast against the
   * room's camera colliders), kept inside the room walls, smoothed, wider on boost.
   */
  public chase(
    focusPos: THREE.Vector3,
    focusQuat: THREE.Quaternion,
    boosting: boolean,
    dt: number,
    colliders: THREE.Object3D[],
    hb: MapDefinition['hardBounds']
  ): void {
    // Desired chase offset behind and slightly above plane
    this._v1.set(0, CHASE_OFFSET.y, CHASE_OFFSET.z).applyQuaternion(focusQuat).add(focusPos);
    this._v2.set(0, CHASE_LOOK.y, CHASE_LOOK.z).applyQuaternion(focusQuat).add(focusPos);

    // Camera collision raycast so it never clips inside furniture while keeping plane visible
    this._v3.subVectors(this._v1, focusPos);
    const desiredDist = this._v3.length();
    if (desiredDist > 0.1) {
      this._v3.divideScalar(desiredDist);
      this._raycaster.set(focusPos, this._v3);
      this._raycaster.far = desiredDist;
      const hits = this._raycaster.intersectObjects(colliders, false);
      const visibleHit = hits.find((h) => {
        let cur: THREE.Object3D | null = h.object;
        while (cur) {
          if (!cur.visible) return false;
          cur = cur.parent;
        }
        return true;
      });
      if (visibleHit && visibleHit.distance < desiredDist) {
        const safeDist = Math.max(12, visibleHit.distance - 2.2);
        this._v1.copy(focusPos).addScaledVector(this._v3, safeDist);
        // Lift camera slightly higher when pulled close so own plane stays framed
        if (safeDist < 18) {
          this._v1.y += (18 - safeDist) * 0.75;
        }
      }
    }

    // Clamp camera inside the room walls (taken from the map: rooms follow ARENA_SCALE)
    this._v1.x = Math.max(hb.minX + 6, Math.min(hb.maxX - 6, this._v1.x));
    this._v1.y = Math.max(hb.minY + 2, Math.min(hb.maxY - 2, this._v1.y));
    this._v1.z = Math.max(hb.minZ + 5, Math.min(hb.maxZ - 5, this._v1.z));

    // If wall clamping pushed camera too close to plane, elevate slightly for clear view
    const clampedDist = this._v1.distanceTo(focusPos);
    if (clampedDist < 15) {
      const lift = 15 - clampedDist;
      this._v1.y = Math.min(hb.maxY - 2, this._v1.y + lift * 0.9);
    }

    if (this.snapNext) {
      this.camPos.copy(this._v1);
      this.camTarget.copy(this._v2);
      this.snapNext = false;
    } else {
      const camDamp = 1 - Math.exp(-12 * dt);
      this.camPos.lerp(this._v1, camDamp);
      this.camTarget.lerp(this._v2, camDamp);
    }

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    this.applyShake(dt, 1.4);
    // Wide FOV that widens further on boost
    this.easeFov(boosting ? 84 : 70, dt);
  }
}
