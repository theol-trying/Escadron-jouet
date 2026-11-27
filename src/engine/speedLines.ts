import * as THREE from 'three';

const COUNT = 56;

interface Streak {
  angle: number;
  radius: number;
  z: number;
  length: number;
  speed: number;
}

/**
 * Turbo speed effect: thin white streaks rushing past the edges of the view (attached to the
 * camera, so they work in chase and cockpit views). Fades in with the turbo, out when it stops.
 */
export class SpeedLines {
  private mesh: THREE.InstancedMesh;
  private streaks: Streak[] = [];
  private intensity = 0;
  private readonly dummy = new THREE.Object3D();
  private material: THREE.MeshBasicMaterial;

  constructor(camera: THREE.Camera) {
    const geo = new THREE.BoxGeometry(0.035, 0.035, 1);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, COUNT);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
    for (let i = 0; i < COUNT; i++) this.streaks.push(this.spawn({} as Streak, true));
    camera.add(this.mesh);
  }

  private spawn(s: Streak, anywhere: boolean): Streak {
    s.angle = Math.random() * Math.PI * 2;
    // Around the edges of the picture: the middle stays clear to see where we fly
    s.radius = 3.2 + Math.random() * 3.2;
    s.z = anywhere ? -2 - Math.random() * 26 : -22 - Math.random() * 6;
    s.length = 1.2 + Math.random() * 2.8;
    s.speed = 38 + Math.random() * 30;
    return s;
  }

  /** `target` 0..1: how strong the effect should be now (turbo on = 1). */
  public update(target: number, dt: number): void {
    this.intensity += (target - this.intensity) * Math.min(1, dt * (target > this.intensity ? 6 : 3));
    const visible = this.intensity > 0.02;
    this.mesh.visible = visible;
    if (!visible) return;
    this.material.opacity = 0.36 * this.intensity;
    for (let i = 0; i < COUNT; i++) {
      const s = this.streaks[i];
      s.z += s.speed * dt * (0.6 + this.intensity * 0.6);
      if (s.z > -1) this.spawn(s, false);
      // Perspective: streaks spread out as they come closer
      const r = s.radius * (1 + (28 + s.z) * 0.01);
      this.dummy.position.set(Math.cos(s.angle) * r, Math.sin(s.angle) * r * 0.75, s.z);
      this.dummy.scale.set(1, 1, s.length * (0.5 + this.intensity));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
