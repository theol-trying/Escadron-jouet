import * as THREE from 'three';

const MAX_PIECES = 220;
const GRAVITY = 260; // cm/s²
const LIFE = 2.8; // seconds before a piece shrinks away

interface Piece {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  size: number;
  floor: number;
  life: number;
}

/**
 * Chunky toy fragments when a household prop is destroyed: pieces take the prop's own colours,
 * burst outward, tumble, bounce on the surface the prop stood on, then shrink away.
 */
export class DebrisField {
  private mesh: THREE.InstancedMesh;
  private pieces: Piece[] = [];
  private cursor = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PIECES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    for (let i = 0; i < MAX_PIECES; i++) {
      this.pieces.push({
        active: false,
        x: 0, y: -999, z: 0,
        vx: 0, vy: 0, vz: 0,
        rx: 0, ry: 0, rz: 0,
        wx: 0, wy: 0, wz: 0,
        size: 1, floor: 0, life: 0,
      });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.setHex(0xffffff));
    }
    scene.add(this.mesh);
  }

  /** Colours of the prop's meshes (up to 5), to paint its fragments. */
  public static colorsOf(object: THREE.Object3D | undefined): number[] {
    const colors: number[] = [];
    object?.traverse((child) => {
      const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      const c = mat && !Array.isArray(mat) ? mat.color : undefined;
      if (c && colors.length < 5) {
        const hex = c.getHex();
        // Skip the near-black cartoon outlines
        if (hex !== 0x16161d && !colors.includes(hex)) colors.push(hex);
      }
    });
    return colors.length > 0 ? colors : [0xfacc15, 0xef4444, 0x38bdf8];
  }

  public burst(x: number, y: number, z: number, radius: number, colors: number[]): void {
    const count = Math.round(Math.min(34, 14 + radius * 0.8));
    const floor = y - radius * 0.85;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PIECES;
      const p = this.pieces[i];
      const a = Math.random() * Math.PI * 2;
      const out = 35 + Math.random() * 70;
      p.active = true;
      p.x = x + (Math.random() - 0.5) * radius;
      p.y = y + (Math.random() - 0.2) * radius * 0.8;
      p.z = z + (Math.random() - 0.5) * radius;
      p.vx = Math.cos(a) * out;
      p.vz = Math.sin(a) * out;
      p.vy = 50 + Math.random() * 110;
      p.rx = Math.random() * 6;
      p.ry = Math.random() * 6;
      p.rz = Math.random() * 6;
      p.wx = (Math.random() - 0.5) * 14;
      p.wy = (Math.random() - 0.5) * 14;
      p.wz = (Math.random() - 0.5) * 14;
      p.size = radius * (0.1 + Math.random() * 0.16);
      p.floor = floor;
      p.life = LIFE * (0.8 + Math.random() * 0.4);
      this.mesh.setColorAt(i, this.color.setHex(colors[n % colors.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  public update(dt: number): void {
    let any = false;
    for (let i = 0; i < MAX_PIECES; i++) {
      const p = this.pieces[i];
      if (!p.active) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.setScalar(0.001);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const half = p.size * 0.5;
      if (p.y < p.floor + half) {
        // Bounce and slide to a stop on the surface the prop stood on
        p.y = p.floor + half;
        p.vy = Math.abs(p.vy) > 30 ? -p.vy * 0.35 : 0;
        p.vx *= 0.7;
        p.vz *= 0.7;
        p.wx *= 0.6;
        p.wy *= 0.6;
        p.wz *= 0.6;
      }
      p.rx += p.wx * dt;
      p.ry += p.wy * dt;
      p.rz += p.wz * dt;
      const shrink = Math.min(1, p.life / 0.5);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.rx, p.ry, p.rz);
      this.dummy.scale.setScalar(p.size * shrink);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  public clear(): void {
    for (const p of this.pieces) p.life = Math.min(p.life, 0.001);
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
