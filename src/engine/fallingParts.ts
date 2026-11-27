import * as THREE from 'three';

interface Falling {
  obj: THREE.Object3D;
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinZ: number;
  life: number;
  landed: boolean;
}

const MAX_FALLING = 24;
const GRAVITY = 160;

/**
 * Plane parts that break off (« pièces qui se détachent »): a copy of the part tumbles down from
 * where it was, bounces once on the floor, lies there a moment and shrinks away.
 */
export class FallingParts {
  private items: Falling[] = [];
  private readonly _pos = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _scale = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {}

  /** Drops a copy of `part` (shares its geometry and materials) with the plane's velocity. */
  public drop(part: THREE.Object3D, velocity: THREE.Vector3): void {
    part.updateWorldMatrix(true, true);
    part.matrixWorld.decompose(this._pos, this._quat, this._scale);
    const copy = part.clone(true);
    copy.visible = true;
    copy.position.copy(this._pos);
    copy.quaternion.copy(this._quat);
    copy.scale.copy(this._scale);
    copy.traverse((o) => (o.castShadow = false));
    this.scene.add(copy);
    if (this.items.length >= MAX_FALLING) this.remove(0);
    this.items.push({
      obj: copy,
      vx: velocity.x * 0.6 + (Math.random() - 0.5) * 30,
      vy: velocity.y * 0.6 + 10 + Math.random() * 20,
      vz: velocity.z * 0.6 + (Math.random() - 0.5) * 30,
      spinX: (Math.random() - 0.5) * 14,
      spinZ: (Math.random() - 0.5) * 14,
      life: 4.5,
      landed: false,
    });
  }

  private remove(i: number): void {
    this.items[i].obj.removeFromParent();
    this.items.splice(i, 1);
  }

  public update(dt: number, floorY: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.remove(i);
        continue;
      }
      if (!f.landed) {
        f.vy -= GRAVITY * dt;
        f.obj.position.x += f.vx * dt;
        f.obj.position.y += f.vy * dt;
        f.obj.position.z += f.vz * dt;
        f.obj.rotation.x += f.spinX * dt;
        f.obj.rotation.z += f.spinZ * dt;
        if (f.obj.position.y < floorY) {
          f.obj.position.y = floorY;
          if (Math.abs(f.vy) > 40) {
            // One bounce, losing most of its energy
            f.vy = -f.vy * 0.3;
            f.vx *= 0.5;
            f.vz *= 0.5;
            f.spinX *= 0.4;
            f.spinZ *= 0.4;
          } else {
            f.landed = true;
          }
        }
      }
      // Shrinks away at the end
      if (f.life < 0.6) f.obj.scale.copy(this._scale.setScalar(Math.max(0.01, f.life / 0.6)));
    }
  }

  public clear(): void {
    while (this.items.length) this.remove(0);
  }
}
