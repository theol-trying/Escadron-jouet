import * as THREE from 'three';
import type { MapCollider } from '../../../shared/maps/types';
import { getToonGradientMap } from '../toonMaterials';
import type { RoomFx } from './sunShafts';

export type GrassAvoid = { x: number; z: number; r: number } | { minX: number; maxX: number; minZ: number; maxZ: number };

export interface GrassOptions {
  count: number;
  area: { minX: number; maxX: number; minZ: number; maxZ: number };
  avoid: GrassAvoid[];
  /** Blade heights (design units) */
  minHeight: number;
  maxHeight: number;
  receiveShadow: boolean;
}

/** Ground-level footprints of a room's colliders (to keep grass out of the sandbox, pots…). */
export function footprintsOf(colliders: MapCollider[], margin = 4): GrassAvoid[] {
  const out: GrassAvoid[] = [];
  for (const c of colliders) {
    if (c.kind === 'box') {
      if (c.minY > 6) continue;
      out.push({ minX: c.minX - margin, maxX: c.maxX + margin, minZ: c.minZ - margin, maxZ: c.maxZ + margin });
    } else if (c.kind === 'sphere') {
      if (c.y - c.radius > 6) continue;
      out.push({ x: c.x, z: c.z, r: c.radius + margin });
    } else {
      if (Math.min(c.ay, c.by) - c.radius > 6) continue;
      const low = c.ay < c.by ? { x: c.ax, z: c.az } : { x: c.bx, z: c.bz };
      out.push({ x: low.x, z: low.z, r: c.radius + margin });
    }
  }
  return out;
}

/** One tapered, slightly curved blade (height 1), darker at the root, lighter at the tip. */
function bladeGeometry(): THREE.BufferGeometry {
  const levels = [0, 0.35, 0.7];
  const pos: number[] = [];
  const col: number[] = [];
  const root = new THREE.Color(0x15803d);
  const tip = new THREE.Color(0x86efac);
  const c = new THREE.Color();
  for (const h of levels) {
    const w = 0.7 * (1 - h);
    const bend = h * h * 0.35;
    pos.push(-w, h, bend, w, h, bend);
    c.copy(root).lerp(tip, h);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  pos.push(0, 1, 0.35);
  col.push(tip.r, tip.g, tip.b);
  const index = [0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 4, 5, 6];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Lawn grass (« herbe du jardin qui ondule au vent »): thousands of small blades in one instanced
 * draw, bending with waves of wind that roll across the garden (animated on the graphics card).
 */
export function addGrassField(parent: THREE.Object3D, opts: GrassOptions): RoomFx & { mesh: THREE.InstancedMesh | null } {
  if (opts.count <= 0) return { update: () => {}, dispose: () => {}, mesh: null };
  const geo = bladeGeometry();
  const time = { value: 0 };
  const mat = new THREE.MeshToonMaterial({
    color: 0xffffff,
    vertexColors: true,
    gradientMap: getToonGradientMap(),
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  // Waves of wind rolling across the lawn, plus a quick flutter; the tip moves, the root stays
  vec2 ip = instanceMatrix[3].xz;
  float h = clamp( position.y, 0.0, 1.0 );
  float bladeH = length( instanceMatrix[1].xyz );
  float wave = sin( dot( ip, vec2( 0.035, 0.022 ) ) - uTime * 1.7 );
  float gust = 0.5 + 0.5 * sin( dot( ip, vec2( -0.011, 0.017 ) ) - uTime * 0.6 );
  float flutter = sin( uTime * 6.0 + ip.x * 0.9 + ip.y * 0.4 );
  float sway = ( 0.35 + 0.65 * ( 0.5 + 0.5 * wave ) * ( 0.4 + 0.6 * gust ) + 0.12 * flutter ) * h * h * bladeH * 0.3;
  mvPosition.xz += vec2( 0.8, 0.6 ) * sway;
  mvPosition.y -= sway * 0.25;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`
      );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, opts.count);
  mesh.receiveShadow = opts.receiveShadow;
  mesh.castShadow = false;
  const dummy = new THREE.Object3D();
  const { area, avoid } = opts;
  const blocked = (x: number, z: number) =>
    avoid.some((a) => ('r' in a ? (x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r : x > a.minX && x < a.maxX && z > a.minZ && z < a.maxZ));
  // Some blades grow in clumps, the rest spread over the lawn
  const clumps = Array.from({ length: 50 }, () => ({
    x: area.minX + Math.random() * (area.maxX - area.minX),
    z: area.minZ + Math.random() * (area.maxZ - area.minZ),
  }));
  let placed = 0;
  for (let tries = 0; placed < opts.count && tries < opts.count * 4; tries++) {
    let x: number;
    let z: number;
    if (Math.random() < 0.35) {
      const c = clumps[Math.floor(Math.random() * clumps.length)];
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 14;
      x = c.x + Math.cos(a) * r;
      z = c.z + Math.sin(a) * r;
    } else {
      x = area.minX + Math.random() * (area.maxX - area.minX);
      z = area.minZ + Math.random() * (area.maxZ - area.minZ);
    }
    if (x < area.minX || x > area.maxX || z < area.minZ || z > area.maxZ || blocked(x, z)) continue;
    const h = opts.minHeight + Math.random() * (opts.maxHeight - opts.minHeight);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.25);
    dummy.scale.set(0.8 + Math.random() * 0.6, h, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed++, dummy.matrix);
  }
  mesh.count = placed;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return {
    mesh,
    update: (t: number) => {
      time.value = t;
    },
    dispose: () => {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}
