import * as THREE from 'three';

const MAX_PUFFS = 320;

interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  growth: number;
  life: number;
  maxLife: number;
  shade: number;
  alpha: number;
}

const SMOKE_VERTEX = /* glsl */ `
attribute float size;
attribute vec2 look; // shade, alpha
varying vec2 vLook;
uniform float uScale;
void main() {
  vLook = look;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(400.0, size * uScale / max(1.0, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SMOKE_FRAGMENT = /* glsl */ `
varying vec2 vLook;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  if (d > 1.0) discard;
  // Soft round puff, a little lighter on its upper side
  float a = smoothstep(1.0, 0.25, d) * vLook.y;
  float shade = vLook.x + (0.5 - gl_PointCoord.y) * 0.12;
  gl_FragColor = vec4(vec3(shade), a);
}
`;

/**
 * Soft smoke (« fumée »): round puffs that drift up, swell and fade, drawn in one call with normal
 * transparency (pale grey to black). Used for damaged planes.
 */
export class SmokeFx {
  private points: THREE.Points;
  private positions = new Float32Array(MAX_PUFFS * 3);
  private sizes = new Float32Array(MAX_PUFFS);
  private looks = new Float32Array(MAX_PUFFS * 2);
  private puffs: Puff[] = [];
  private material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('look', new THREE.BufferAttribute(this.looks, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: SMOKE_VERTEX,
      fragmentShader: SMOKE_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }

  public setViewport(fovDeg: number, heightPx: number): void {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  /** A puff: `darkness` 0 (pale grey) … 1 (black), `size` in world units, `life` in seconds. */
  public puff(x: number, y: number, z: number, darkness: number, size: number, life: number): void {
    if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
    this.puffs.push({
      x: x + (Math.random() - 0.5) * 1.5,
      y: y + (Math.random() - 0.5) * 1.5,
      z: z + (Math.random() - 0.5) * 1.5,
      vx: (Math.random() - 0.5) * 6,
      vy: 5 + Math.random() * 6,
      vz: (Math.random() - 0.5) * 6,
      size,
      growth: 1.8 + darkness,
      life,
      maxLife: life,
      shade: 0.9 - darkness * 0.75,
      alpha: 0.55 + darkness * 0.3,
    });
  }

  public update(dt: number): void {
    let n = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.puffs.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.96;
      p.vz *= 0.96;
      const k = 1 - p.life / p.maxLife; // 0 → 1
      this.positions[n * 3] = p.x;
      this.positions[n * 3 + 1] = p.y;
      this.positions[n * 3 + 2] = p.z;
      this.sizes[n] = p.size * (1 + p.growth * k);
      this.looks[n * 2] = p.shade + k * 0.15;
      this.looks[n * 2 + 1] = p.alpha * Math.min(1, k * 6) * (1 - k);
      n++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    for (const name of ['position', 'size', 'look']) {
      const attr = geo.getAttribute(name) as THREE.BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  public clear(): void {
    this.puffs.length = 0;
  }

  public dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
