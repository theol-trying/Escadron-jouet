import * as THREE from 'three';
import type { GlowFx } from './glowFx';

interface ParticleItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  r: number;
  g: number;
  b: number;
}

const MAX_PARTICLES = 260;
const MAX_PROJECTILES = 120;

interface ProjectileView {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heavy: boolean;
  team: string;
}

export class ParticleAndProjectilePool {
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleItem[] = [];
  private cursor = 0;

  private projectileMesh: THREE.InstancedMesh;
  // Additive halo around each pellet so tracers stay readable against bright rooms
  private projectileGlowMesh: THREE.InstancedMesh;
  // Latest server projectiles and when they arrived: positions are extrapolated every frame
  private projectiles: ProjectileView[] = [];
  private projectilesAt = 0;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  /** Soft round halo around each pellet (« halo sur les balles traçantes ») */
  private glow: GlowFx | null = null;
  private projectileHex: number[] = [];

  public setGlow(glow: GlowFx): void {
    this.glow = glow;
  }

  constructor(scene: THREE.Scene) {
    // Toy plastic shards / sparks / smoke cubes (cel-styled rounded low-poly)
    const pGeo = new THREE.DodecahedronGeometry(0.7, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, MAX_PARTICLES);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        gravity: 0,
        r: 1,
        g: 1,
        b: 1,
      });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
      this.particleMesh.setColorAt(i, this.color.setHex(0xffffff));
    }
    this.particleMesh.count = MAX_PARTICLES;
    scene.add(this.particleMesh);

    // Toy dart/pellet tracer capsules
    const bGeo = new THREE.CapsuleGeometry(0.42, 2.2, 4, 6);
    bGeo.rotateX(Math.PI / 2);
    const bMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.projectileMesh = new THREE.InstancedMesh(bGeo, bMat, MAX_PROJECTILES);
    this.projectileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projectileMesh.frustumCulled = false;
    this.projectileMesh.count = 0;
    scene.add(this.projectileMesh);

    const gGeo = new THREE.CapsuleGeometry(1.1, 3.4, 4, 8);
    gGeo.rotateX(Math.PI / 2);
    const gMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.projectileGlowMesh = new THREE.InstancedMesh(gGeo, gMat, MAX_PROJECTILES);
    this.projectileGlowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projectileGlowMesh.frustumCulled = false;
    this.projectileGlowMesh.count = 0;
    scene.add(this.projectileGlowMesh);
  }

  public spawnBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    hexColors: number[],
    speed: number,
    size: number,
    gravity = 35,
    maxLife = 0.55
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.45 + Math.random() * 0.75);

      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.sin(phi) * Math.cos(theta) * sp;
      p.vy = Math.cos(phi) * sp + gravity * 0.15;
      p.vz = Math.sin(phi) * Math.sin(theta) * sp;
      p.life = maxLife * (0.7 + Math.random() * 0.5);
      p.maxLife = p.life;
      p.size = size * (0.7 + Math.random() * 0.6);
      p.gravity = gravity;

      this.color.setHex(hexColors[i % hexColors.length]);
      p.r = this.color.r;
      p.g = this.color.g;
      p.b = this.color.b;
    }
  }

  /** One puff of smoke: `darkness` 0 (pale grey) … 1 (black), bigger and longer-lived when asked. */
  public spawnSmokePuff(x: number, y: number, z: number, darkness = 0, size = 1.15, life = 0.45): void {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    p.active = true;
    p.x = x + (Math.random() - 0.5) * 2;
    p.y = y + (Math.random() - 0.5) * 2;
    p.z = z + (Math.random() - 0.5) * 2;
    p.vx = (Math.random() - 0.5) * 8;
    p.vy = 6 + Math.random() * 8;
    p.vz = (Math.random() - 0.5) * 8;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.gravity = -4;
    const shade = 0.92 - darkness * 0.72;
    p.r = shade;
    p.g = shade;
    p.b = shade + 0.03;
  }

  public updateParticles(dt: number): void {
    let anyActive = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyActive = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.setScalar(0.001);
        this.dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const t = p.life / p.maxLife;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.life * 6, p.life * 4, 0);
      this.dummy.scale.setScalar(p.size * t);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
      this.color.setRGB(p.r, p.g, p.b);
      this.particleMesh.setColorAt(i, this.color);
    }
    if (anyActive) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /** New server projectiles (20 Hz). Colours are set here, positions every frame. */
  public syncProjectiles(projectiles: ProjectileView[]): void {
    this.projectiles = projectiles.slice(0, MAX_PROJECTILES);
    this.projectilesAt = performance.now();
    const count = this.projectiles.length;
    this.projectileMesh.count = count;
    this.projectileGlowMesh.count = count;
    for (let i = 0; i < count; i++) {
      const pr = this.projectiles[i];
      const hex =
        pr.team === 'red' ? 0xff4d4d : pr.team === 'blue' ? 0x38bdf8 : pr.heavy ? 0xf97316 : 0xfacc15;
      this.projectileHex[i] = hex;
      this.color.setHex(hex);
      this.projectileMesh.setColorAt(i, this.color);
      this.projectileGlowMesh.setColorAt(i, this.color);
    }
    if (this.projectileMesh.instanceColor) this.projectileMesh.instanceColor.needsUpdate = true;
    if (this.projectileGlowMesh.instanceColor) this.projectileGlowMesh.instanceColor.needsUpdate = true;
    this.updateProjectiles(this.projectilesAt);
  }

  /**
   * Moves pellets smoothly between server updates (they fly straight) and stretches them into
   * streaks along their velocity, so shots read as tracers instead of 20 Hz jumps.
   */
  public updateProjectiles(nowMs: number): void {
    const count = this.projectiles.length;
    if (count === 0) return;
    const age = Math.min(0.12, Math.max(0, (nowMs - this.projectilesAt) / 1000));
    for (let i = 0; i < count; i++) {
      const pr = this.projectiles[i];
      const x = pr.x + pr.vx * age;
      const y = pr.y + pr.vy * age;
      const z = pr.z + pr.vz * age;
      this.dummy.position.set(x, y, z);
      this.dummy.lookAt(x + pr.vx, y + pr.vy, z + pr.vz);
      const w = pr.heavy ? 1.5 : 1.0;
      this.dummy.scale.set(w, w, w * 1.9);
      this.dummy.updateMatrix();
      this.projectileMesh.setMatrixAt(i, this.dummy.matrix);
      this.projectileGlowMesh.setMatrixAt(i, this.dummy.matrix);
      this.glow?.add(x, y, z, pr.heavy ? 7 : 5, this.projectileHex[i] ?? 0xfacc15, 0.55);
    }
    this.projectileMesh.instanceMatrix.needsUpdate = true;
    this.projectileGlowMesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    this.projectileMesh.geometry.dispose();
    (this.projectileMesh.material as THREE.Material).dispose();
    this.projectileGlowMesh.geometry.dispose();
    (this.projectileGlowMesh.material as THREE.Material).dispose();
  }
}
