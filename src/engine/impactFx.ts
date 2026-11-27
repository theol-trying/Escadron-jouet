import * as THREE from 'three';

interface Bit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  spin: number;
  life: number;
  maxLife: number;
  size: number;
}

const MAX_CONFETTI = 420;
const MAX_SPARKS = 220;

/**
 * Plastic confetti (« explosions en confettis de plastique »): small flat coloured flakes that burst
 * out, flutter and twirl down slowly (air drag), rest on the floor a moment and vanish.
 */
export class ConfettiFx {
  private mesh: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private cursor = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(1.3, 0.8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_CONFETTI);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_CONFETTI; i++) {
      this.bits.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, spin: 0, life: 0, maxLife: 1, size: 1 });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.setHex(0xffffff));
    }
    scene.add(this.mesh);
  }

  public burst(x: number, y: number, z: number, count: number, colors: number[], speed = 60): void {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_CONFETTI;
      const b = this.bits[i];
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.35 + Math.random() * 0.8);
      b.x = x;
      b.y = y;
      b.z = z;
      b.vx = Math.sin(phi) * Math.cos(theta) * sp;
      b.vy = Math.cos(phi) * sp * 0.8 + speed * 0.35;
      b.vz = Math.sin(phi) * Math.sin(theta) * sp;
      b.rx = Math.random() * 6;
      b.ry = Math.random() * 6;
      b.rz = Math.random() * 6;
      b.spin = 4 + Math.random() * 10;
      b.life = 2.4 + Math.random() * 1.6;
      b.maxLife = b.life;
      b.size = 0.7 + Math.random() * 0.8;
      this.mesh.setColorAt(i, this.color.setHex(colors[n % colors.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  public update(dt: number, time: number, floorY: number): void {
    let any = false;
    for (let i = 0; i < MAX_CONFETTI; i++) {
      const b = this.bits[i];
      if (b.life <= 0) continue;
      any = true;
      b.life -= dt;
      if (b.life <= 0) {
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.setScalar(0.001);
      } else {
        // Strong air drag: they burst out then flutter down slowly, swaying
        const drag = Math.exp(-dt * 2.6);
        b.vx *= drag;
        b.vz *= drag;
        b.vy = b.vy * drag - 28 * dt;
        if (b.vy < -22) b.vy = -22;
        const sway = Math.sin(time * 5 + i) * 8;
        b.x += (b.vx + sway * 0.3) * dt;
        b.y += b.vy * dt;
        b.z += (b.vz + Math.cos(time * 4 + i) * 2.4) * dt;
        if (b.y <= floorY) {
          b.y = floorY;
          b.vx = b.vy = b.vz = 0;
          b.rx = -Math.PI / 2;
          b.spin = 0;
        } else {
          b.rx += b.spin * dt;
          b.ry += b.spin * 0.7 * dt;
        }
        const fade = Math.min(1, b.life / 0.5);
        this.dummy.position.set(b.x, b.y, b.z);
        this.dummy.rotation.set(b.rx, b.ry, b.rz);
        this.dummy.scale.setScalar(b.size * fade);
      }
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  public clear(): void {
    for (const b of this.bits) b.life = Math.min(b.life, 0.01);
  }

  public dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/**
 * Sparks (« étincelles quand on frôle un mur »): bright streaks shooting from the scraping point,
 * stretched along their speed, falling and dying out fast.
 */
export class SparkFx {
  private mesh: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private cursor = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly target = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.16, 0.16, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_SPARKS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      this.bits.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, spin: 0, life: 0, maxLife: 1, size: 1 });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    scene.add(this.mesh);
  }

  /** Sparks thrown off a surface (normal n) while sliding along it (velocity v of the plane). */
  public scrape(x: number, y: number, z: number, nx: number, ny: number, nz: number, vx: number, vy: number, vz: number, count: number): void {
    for (let k = 0; k < count; k++) {
      const b = this.bits[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_SPARKS;
      const out = 25 + Math.random() * 45;
      b.x = x;
      b.y = y;
      b.z = z;
      b.vx = nx * out + vx * (0.3 + Math.random() * 0.4) + (Math.random() - 0.5) * 30;
      b.vy = ny * out + vy * (0.3 + Math.random() * 0.4) + Math.random() * 25;
      b.vz = nz * out + vz * (0.3 + Math.random() * 0.4) + (Math.random() - 0.5) * 30;
      b.life = 0.2 + Math.random() * 0.3;
      b.maxLife = b.life;
      b.size = 0.8 + Math.random() * 0.6;
    }
  }

  public update(dt: number): void {
    let any = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const b = this.bits[i];
      if (b.life <= 0) continue;
      any = true;
      b.life -= dt;
      if (b.life <= 0) {
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.setScalar(0.001);
        this.dummy.rotation.set(0, 0, 0);
      } else {
        b.vy -= 160 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        const speed = Math.hypot(b.vx, b.vy, b.vz);
        this.dummy.position.set(b.x, b.y, b.z);
        this.target.set(b.x + b.vx, b.y + b.vy, b.z + b.vz);
        this.dummy.lookAt(this.target);
        const k = b.life / b.maxLife;
        this.dummy.scale.set(b.size * k, b.size * k, Math.max(0.3, speed * 0.035) * k);
      }
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  public clear(): void {
    for (const b of this.bits) b.life = Math.min(b.life, 0.01);
  }

  public dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
