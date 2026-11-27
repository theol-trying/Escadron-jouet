import * as THREE from 'three';

const MAX_GLOWS = 420;
const MAX_FLASHES = 96;
const MAX_RINGS = 8;

interface Flash {
  x: number;
  y: number;
  z: number;
  size: number;
  growth: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  radius: number;
}

const GLOW_VERTEX = /* glsl */ `
attribute float size;
attribute vec4 tint;
varying vec4 vTint;
uniform float uScale;
void main() {
  vTint = tint;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(512.0, size * uScale / max(1.0, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
}
`;

const GLOW_FRAGMENT = /* glsl */ `
varying vec4 vTint;
void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  if (d > 1.0) discard;
  // Bright core and a soft halo around it
  float halo = pow(1.0 - d, 2.2);
  float core = smoothstep(0.35, 0.0, d);
  gl_FragColor = vec4(vTint.rgb * (halo + core * 0.8) * vTint.a, 1.0);
}
`;

/**
 * Glows (« halos »): soft additive light blobs, one draw call for all of them. Some are refreshed
 * every frame by their owner (the halo of each pellet), others are short flashes that swell and fade
 * by themselves (explosions, hits, muzzle flashes, sparks), plus a few expanding shockwave rings.
 */
export class GlowFx {
  private points: THREE.Points;
  private positions = new Float32Array(MAX_GLOWS * 3);
  private sizes = new Float32Array(MAX_GLOWS);
  private tints = new Float32Array(MAX_GLOWS * 4);
  private count = 0;
  private flashes: Flash[] = [];
  private rings: Ring[] = [];
  private ringMat: THREE.MeshBasicMaterial[] = [];
  private material: THREE.ShaderMaterial;
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('tint', new THREE.BufferAttribute(this.tints, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);

    const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    for (let i = 0; i < MAX_RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.ringMat.push(mat);
      this.rings.push({ mesh, life: 0, maxLife: 1, radius: 1 });
    }
  }

  /** Point size scale for the current view (pixels for a size-1 glow at 1 unit). */
  public setViewport(fovDeg: number, heightPx: number): void {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  /** A glow drawn this frame only (call every frame to keep it). */
  public add(x: number, y: number, z: number, size: number, hex: number, intensity = 1): void {
    if (this.count >= MAX_GLOWS) return;
    this.color.setHex(hex);
    this.write(x, y, z, size, this.color.r, this.color.g, this.color.b, intensity);
  }

  private write(x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number): void {
    if (this.count >= MAX_GLOWS) return;
    const i = this.count++;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.sizes[i] = size;
    this.tints[i * 4] = r;
    this.tints[i * 4 + 1] = g;
    this.tints[i * 4 + 2] = b;
    this.tints[i * 4 + 3] = a;
  }

  /** A flash that swells (or shrinks, growth < 0) and fades out by itself. */
  public flash(x: number, y: number, z: number, size: number, hex: number, life = 0.3, growth = 1.2): void {
    if (this.flashes.length >= MAX_FLASHES) this.flashes.shift();
    this.color.setHex(hex);
    this.flashes.push({ x, y, z, size, growth, life, maxLife: life, r: this.color.r, g: this.color.g, b: this.color.b });
  }

  /** An expanding ring of light facing the camera (explosion shockwave). */
  public shockwave(x: number, y: number, z: number, radius: number, hex: number, life = 0.45): void {
    let ring = this.rings.find((r) => r.life <= 0);
    if (!ring) ring = this.rings.reduce((a, b) => (a.life < b.life ? a : b));
    ring.mesh.position.set(x, y, z);
    ring.life = life;
    ring.maxLife = life;
    ring.radius = radius;
    ring.mesh.visible = true;
    (ring.mesh.material as THREE.MeshBasicMaterial).color.setHex(hex);
  }

  /** Call once per frame before the owners add their glows. */
  public begin(): void {
    this.count = 0;
  }

  /** Ages the flashes and rings, then uploads everything for drawing. */
  public end(dt: number, camera: THREE.Camera): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.flashes.splice(i, 1);
        continue;
      }
      const k = f.life / f.maxLife; // 1 → 0
      const size = f.size * (1 + f.growth * (1 - k));
      this.write(f.x, f.y, f.z, size, f.r, f.g, f.b, k * k);
    }
    for (const ring of this.rings) {
      if (ring.life <= 0) continue;
      ring.life -= dt;
      if (ring.life <= 0) {
        ring.mesh.visible = false;
        continue;
      }
      const k = 1 - ring.life / ring.maxLife; // 0 → 1
      ring.mesh.scale.setScalar(ring.radius * (0.2 + k * 1.1));
      ring.mesh.quaternion.copy(camera.quaternion);
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.count);
    for (const name of ['position', 'size', 'tint']) {
      const attr = geo.getAttribute(name) as THREE.BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, this.count * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  public clear(): void {
    this.flashes.length = 0;
    for (const r of this.rings) {
      r.life = 0;
      r.mesh.visible = false;
    }
  }

  public dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.material.dispose();
    for (const r of this.rings) r.mesh.removeFromParent();
    this.rings[0]?.mesh.geometry.dispose();
    for (const m of this.ringMat) m.dispose();
  }
}
