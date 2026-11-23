import * as THREE from 'three';

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

export class ParticleAndProjectilePool {
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleItem[] = [];
  private cursor = 0;

  private projectileMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

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

  public spawnSmokePuff(x: number, y: number, z: number, dark = false): void {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    p.active = true;
    p.x = x + (Math.random() - 0.5) * 2;
    p.y = y + (Math.random() - 0.5) * 2;
    p.z = z + (Math.random() - 0.5) * 2;
    p.vx = (Math.random() - 0.5) * 8;
    p.vy = 6 + Math.random() * 8;
    p.vz = (Math.random() - 0.5) * 8;
    p.life = 0.45;
    p.maxLife = 0.45;
    p.size = dark ? 1.8 : 1.15;
    p.gravity = -4;
    if (dark) {
      p.r = 0.25;
      p.g = 0.25;
      p.b = 0.28;
    } else {
      p.r = 0.95;
      p.g = 0.96;
      p.b = 1.0;
    }
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

  public syncProjectiles(
    projectiles: Array<{
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      heavy: boolean;
      team: string;
    }>
  ): void {
    const count = Math.min(MAX_PROJECTILES, projectiles.length);
    this.projectileMesh.count = count;
    for (let i = 0; i < count; i++) {
      const pr = projectiles[i];
      this.dummy.position.set(pr.x, pr.y, pr.z);
      this.dummy.lookAt(pr.x + pr.vx, pr.y + pr.vy, pr.z + pr.vz);
      this.dummy.scale.setScalar(pr.heavy ? 1.5 : 1.0);
      this.dummy.updateMatrix();
      this.projectileMesh.setMatrixAt(i, this.dummy.matrix);
      const hex =
        pr.team === 'red'
          ? 0xff4d4d
          : pr.team === 'blue'
            ? 0x38bdf8
            : pr.heavy
              ? 0xf97316
              : 0xfacc15;
      this.projectileMesh.setColorAt(i, this.color.setHex(hex));
    }
    this.projectileMesh.instanceMatrix.needsUpdate = true;
    if (this.projectileMesh.instanceColor) {
      this.projectileMesh.instanceColor.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    this.projectileMesh.geometry.dispose();
    (this.projectileMesh.material as THREE.Material).dispose();
  }
}
