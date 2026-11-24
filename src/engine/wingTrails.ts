import * as THREE from 'three';

// Trail length: samples × interval ≈ 0.55 s of flight behind each wingtip
const SAMPLES = 22;
const SAMPLE_INTERVAL = 0.025;
const BASE_WIDTH = 0.55;

interface Ribbon {
  points: THREE.Vector3[]; // newest first
  ups: THREE.Vector3[];
  geometry: THREE.BufferGeometry;
  mesh: THREE.Mesh;
}

interface PlaneTrails {
  left: Ribbon;
  right: Ribbon;
  sinceSample: number;
  material: THREE.MeshBasicMaterial;
}

export interface TrailInput {
  id: string;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  halfSpan: number;
  visible: boolean;
  /** Turbo / boost: brighter, wider trails */
  intense: boolean;
}

/**
 * White ribbons streaming from each wingtip, tapering and fading toward the tail. Triangle-strip
 * geometry rebuilt from a short history of wingtip positions (no extra draw calls per sample).
 */
export class WingTrails {
  private planes = new Map<string, PlaneTrails>();
  private readonly tmp = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {}

  private makeRibbon(material: THREE.Material): Ribbon {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(SAMPLES * 2 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const indices: number[] = [];
    for (let i = 0; i < SAMPLES - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.scene.add(mesh);
    return { points: [], ups: [], geometry, mesh };
  }

  private ensure(id: string): PlaneTrails {
    let t = this.planes.get(id);
    if (!t) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      t = { left: this.makeRibbon(material), right: this.makeRibbon(material), sinceSample: 0, material };
      this.planes.set(id, t);
    }
    return t;
  }

  public update(inputs: TrailInput[], dt: number): void {
    const seen = new Set<string>();
    for (const input of inputs) {
      seen.add(input.id);
      const t = this.ensure(input.id);
      if (!input.visible) {
        t.left.points.length = 0;
        t.right.points.length = 0;
        t.left.mesh.visible = false;
        t.right.mesh.visible = false;
        continue;
      }
      t.material.opacity += ((input.intense ? 0.55 : 0.28) - t.material.opacity) * Math.min(1, dt * 6);
      this.up.set(0, 1, 0).applyQuaternion(input.quaternion);
      t.sinceSample += dt;
      const sample = t.sinceSample >= SAMPLE_INTERVAL;
      if (sample) t.sinceSample = 0;
      for (const [ribbon, side] of [
        [t.left, -1],
        [t.right, 1],
      ] as const) {
        this.tmp.set(side * input.halfSpan, 0, 0.6).applyQuaternion(input.quaternion).add(input.position);
        if (sample || ribbon.points.length === 0) {
          ribbon.points.unshift(this.tmp.clone());
          ribbon.ups.unshift(this.up.clone());
          if (ribbon.points.length > SAMPLES) {
            ribbon.points.length = SAMPLES;
            ribbon.ups.length = SAMPLES;
          }
        } else {
          // Keep the head glued to the wingtip between samples
          ribbon.points[0].copy(this.tmp);
          ribbon.ups[0].copy(this.up);
        }
        this.writeRibbon(ribbon, input.intense ? 1.6 : 1);
      }
    }
    // Planes that left the match
    for (const [id, t] of this.planes) {
      if (!seen.has(id)) this.remove(id, t);
    }
  }

  private writeRibbon(ribbon: Ribbon, widthScale: number): void {
    const n = ribbon.points.length;
    ribbon.mesh.visible = n >= 2;
    if (n < 2) return;
    const pos = ribbon.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < SAMPLES; i++) {
      const k = Math.min(i, n - 1);
      const p = ribbon.points[k];
      const u = ribbon.ups[k];
      // Taper from full width at the wingtip to nothing at the tail
      const w = i < n ? BASE_WIDTH * widthScale * (1 - i / (n - 1)) : 0;
      pos.setXYZ(i * 2, p.x + u.x * w, p.y + u.y * w, p.z + u.z * w);
      pos.setXYZ(i * 2 + 1, p.x - u.x * w, p.y - u.y * w, p.z - u.z * w);
    }
    pos.needsUpdate = true;
  }

  private remove(id: string, t: PlaneTrails): void {
    for (const r of [t.left, t.right]) {
      this.scene.remove(r.mesh);
      r.geometry.dispose();
    }
    t.material.dispose();
    this.planes.delete(id);
  }

  public clear(): void {
    for (const [id, t] of this.planes) this.remove(id, t);
  }

  public dispose(): void {
    this.clear();
  }
}
