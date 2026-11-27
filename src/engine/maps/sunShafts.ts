import * as THREE from 'three';
import type { GraphicsProfile } from '../../settings/graphicsQuality';

/** A window the sun shines through, in the room's design units. */
export interface SunWindow {
  center: [number, number, number];
  /** Unit vectors along the window's width and height */
  right: [number, number, number];
  up: [number, number, number];
  width: number;
  height: number;
  /** Panes separated by the window bars (columns × rows), each its own beam */
  panes?: [number, number];
  /** Direction the light travels into the room (normalised here) */
  dir: [number, number, number];
  /** How far the beams reach before fading out */
  length: number;
  color?: number;
  /** Beam brightness (additive) */
  strength?: number;
  /** Bright patch where the light reaches this floor height (none if undefined) */
  floorY?: number;
}

export interface RoomFx {
  update: (time: number) => void;
  dispose: () => void;
}

const SHAFT_VERTEX = /* glsl */ `
attribute float along;
varying float vAlong;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vAlong = along;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SHAFT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uTime;
uniform vec3 uAcross;
varying float vAlong;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec3 toCam = normalize(cameraPosition - vWorldPos);
  // Faces seen straight on glow, grazing ones fade: soft edges for the beam
  float facing = abs(dot(vWorldNormal, toCam));
  float k = dot(vWorldPos, uAcross);
  // Slowly drifting streaks inside the beam
  float streaks = 0.65 + 0.35 * sin(k * 0.11 + uTime * 0.35) * sin(k * 0.27 - uTime * 0.21 + 1.7);
  float fade = pow(1.0 - vAlong, 1.6) * smoothstep(0.0, 0.06, vAlong);
  float a = uStrength * fade * mix(0.15, 1.0, facing) * streaks;
  gl_FragColor = vec4(uColor * a, 1.0);
}
`;

const DUST_VERTEX = /* glsl */ `
attribute vec4 seed;
uniform float uTime;
uniform vec3 uOrigin;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uDir;
uniform float uLength;
uniform float uPixel;
varying float vAlpha;
void main() {
  // Each mote drifts slowly down the beam, wobbling, and loops back to the window
  float t = fract(seed.z + uTime * (0.006 + seed.w * 0.01));
  vec3 p = uOrigin + uRight * seed.x + uUp * seed.y + uDir * (t * uLength);
  p += vec3(sin(uTime * 0.7 + seed.w * 40.0), sin(uTime * 0.5 + seed.x), cos(uTime * 0.6 + seed.y)) * 2.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uPixel * 1.6 / max(1.0, -mv.z), 1.0, 5.0);
  // Glints: some motes twinkle as they turn in the light
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + seed.w * 3.0) + seed.x);
  vAlpha = sin(3.14159 * t) * twinkle;
}
`;

const DUST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  if (d > 1.0) discard;
  gl_FragColor = vec4(uColor * (1.0 - d) * vAlpha, 1.0);
}
`;

let softRectTexture: THREE.CanvasTexture | null = null;
/** White rectangle with blurred edges (the sunlit patch on the floor). */
function getSoftRectTexture(): THREE.CanvasTexture {
  if (softRectTexture) return softRectTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const ex = Math.min(x, 63 - x) / 12;
      const ey = Math.min(y, 63 - y) / 12;
      const v = Math.round(255 * Math.min(1, ex) * Math.min(1, ey));
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  softRectTexture = new THREE.CanvasTexture(c);
  return softRectTexture;
}

const v3 = (a: [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2]);

/**
 * Sun shafts (« rayons de soleil ») through the room's windows: a soft glowing beam per pane that
 * fades along its length, a bright patch where it lands, and dust motes floating in the light.
 * Nothing is added on « Qualité graphique : basse ».
 */
export function addSunShafts(parent: THREE.Object3D, windows: SunWindow[], profile: GraphicsProfile | undefined): RoomFx {
  const disposables: Array<{ dispose: () => void }> = [];
  const timeUniforms: Array<{ value: number }> = [];
  const objects: THREE.Object3D[] = [];
  if (profile && !profile.sunShafts) return { update: () => {}, dispose: () => {} };

  for (const w of windows) {
    const right = v3(w.right).normalize();
    const up = v3(w.up).normalize();
    const dir = v3(w.dir).normalize();
    const center = v3(w.center);
    const [cols, rows] = w.panes ?? [1, 1];
    const gap = 4;
    const paneW = (w.width - gap * (cols - 1)) / cols;
    const paneH = (w.height - gap * (rows - 1)) / rows;
    const color = new THREE.Color(w.color ?? 0xfff1c4);
    const across = new THREE.Vector3().crossVectors(dir, up).normalize();
    const time = { value: 0 };
    timeUniforms.push(time);
    const shaftMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color },
        uStrength: { value: w.strength ?? 0.16 },
        uTime: time,
        uAcross: { value: across },
      },
      vertexShader: SHAFT_VERTEX,
      fragmentShader: SHAFT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    disposables.push(shaftMat);
    const poolMat = new THREE.MeshBasicMaterial({
      color,
      alphaMap: getSoftRectTexture(),
      transparent: true,
      opacity: Math.min(0.4, (w.strength ?? 0.16) * 2),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    disposables.push(poolMat);

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const pc = center
          .clone()
          .addScaledVector(right, -w.width / 2 + paneW / 2 + c * (paneW + gap))
          .addScaledVector(up, -w.height / 2 + paneH / 2 + r * (paneH + gap));
        const near = [
          pc.clone().addScaledVector(right, -paneW / 2).addScaledVector(up, -paneH / 2),
          pc.clone().addScaledVector(right, paneW / 2).addScaledVector(up, -paneH / 2),
          pc.clone().addScaledVector(right, paneW / 2).addScaledVector(up, paneH / 2),
          pc.clone().addScaledVector(right, -paneW / 2).addScaledVector(up, paneH / 2),
        ];
        // The far end opens up a little (light spreading)
        const farCenter = pc.clone().addScaledVector(dir, w.length);
        const far = near.map((p) => p.clone().addScaledVector(dir, w.length).sub(farCenter).multiplyScalar(1.18).add(farCenter));
        const pos: number[] = [];
        const along: number[] = [];
        for (let i = 0; i < 4; i++) {
          const a = near[i];
          const b = near[(i + 1) % 4];
          const fa = far[i];
          const fb = far[(i + 1) % 4];
          pos.push(a.x, a.y, a.z, b.x, b.y, b.z, fb.x, fb.y, fb.z, a.x, a.y, a.z, fb.x, fb.y, fb.z, fa.x, fa.y, fa.z);
          along.push(0, 0, 1, 0, 1, 1);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
        geo.computeVertexNormals();
        disposables.push(geo);
        const shaft = new THREE.Mesh(geo, shaftMat);
        shaft.renderOrder = 4;
        shaft.frustumCulled = false;
        parent.add(shaft);
        objects.push(shaft);

        // Sunlit patch where the beam lands on the floor
        if (w.floorY !== undefined && dir.y < -0.05) {
          const hit = near.map((p) => p.clone().addScaledVector(dir, (w.floorY! - p.y) / dir.y));
          const g = new THREE.BufferGeometry();
          g.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(
              [hit[0], hit[1], hit[2], hit[0], hit[2], hit[3]].flatMap((p) => [p.x, w.floorY! + 0.5, p.z]),
              3
            )
          );
          g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
          g.computeVertexNormals();
          disposables.push(g);
          const patch = new THREE.Mesh(g, poolMat);
          patch.material.side = THREE.DoubleSide;
          patch.renderOrder = 3;
          parent.add(patch);
          objects.push(patch);
        }
      }
    }

    // Dust floating in the light
    const motes = profile?.dustMotes ?? 100;
    if (motes > 0) {
      const seeds = new Float32Array(motes * 4);
      for (let i = 0; i < motes; i++) {
        seeds[i * 4] = (Math.random() - 0.5) * w.width;
        seeds[i * 4 + 1] = (Math.random() - 0.5) * w.height;
        seeds[i * 4 + 2] = Math.random();
        seeds[i * 4 + 3] = Math.random();
      }
      const geo = new THREE.BufferGeometry();
      // Positions are computed in the shader: a placeholder attribute keeps three.js happy
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(motes * 3), 3));
      geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
      const dustMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: time,
          uOrigin: { value: center.clone() },
          uRight: { value: right.clone() },
          uUp: { value: up.clone() },
          uDir: { value: dir.clone() },
          uLength: { value: w.length * 0.8 },
          uPixel: { value: 520 },
          uColor: { value: new THREE.Color(0xfff7e0) },
        },
        vertexShader: DUST_VERTEX,
        fragmentShader: DUST_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      disposables.push(geo, dustMat);
      const dust = new THREE.Points(geo, dustMat);
      dust.frustumCulled = false;
      dust.renderOrder = 5;
      parent.add(dust);
      objects.push(dust);
    }
  }

  return {
    update: (t: number) => {
      for (const u of timeUniforms) u.value = t;
    },
    dispose: () => {
      for (const o of objects) o.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}

let edgeGradient: THREE.CanvasTexture | null = null;
/** Opaque at v = 0 (the corner), fading to nothing at v = 1. */
function getEdgeGradient(): THREE.CanvasTexture {
  if (edgeGradient) return edgeGradient;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 64; y++) {
    const t = y / 63;
    const v = Math.round(255 * Math.pow(1 - t, 2.2));
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, 63 - y, 4, 1);
  }
  edgeGradient = new THREE.CanvasTexture(c);
  return edgeGradient;
}

export interface RoomBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  /** Shade where walls meet the ceiling too (not under a pitched roof) */
  ceiling?: boolean;
  /** Which walls exist (all by default) */
  walls?: Array<'minX' | 'maxX' | 'minZ' | 'maxZ'>;
}

/**
 * Soft shading in the room's corners (« ombres plus douces dans les coins »): dark gradients where
 * the floor meets the walls, up the vertical corners and under the ceiling, like light that reaches
 * less into the nooks. Cheap (a few transparent quads), drawn at every quality level.
 */
export function addCornerShading(parent: THREE.Object3D, room: RoomBox, strength = 0.3): RoomFx {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x2b1d12,
    alphaMap: getEdgeGradient(),
    transparent: true,
    opacity: strength,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const pos: number[] = [];
  const uv: number[] = [];
  /** Quad from edge a→b, extending by `out` (v goes 0 at the edge → 1 at the far side) */
  const strip = (a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3) => {
    const c = b.clone().add(out);
    const d = a.clone().add(out);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };
  const { minX, maxX, minZ, maxZ, height } = room;
  const walls = new Set(room.walls ?? ['minX', 'maxX', 'minZ', 'maxZ']);
  const e = 0.4; // just off the surfaces
  const floorW = 46;
  const wallW = 34;
  const ceilW = 30;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const wallDefs: Array<{ key: 'minX' | 'maxX' | 'minZ' | 'maxZ'; a: THREE.Vector3; b: THREE.Vector3; inward: THREE.Vector3 }> = [
    { key: 'minX', a: V(minX + e, 0, minZ), b: V(minX + e, 0, maxZ), inward: V(1, 0, 0) },
    { key: 'maxX', a: V(maxX - e, 0, minZ), b: V(maxX - e, 0, maxZ), inward: V(-1, 0, 0) },
    { key: 'minZ', a: V(minX, 0, minZ + e), b: V(maxX, 0, minZ + e), inward: V(0, 0, 1) },
    { key: 'maxZ', a: V(minX, 0, maxZ - e), b: V(maxX, 0, maxZ - e), inward: V(0, 0, -1) },
  ];
  for (const w of wallDefs) {
    if (!walls.has(w.key)) continue;
    const fa = w.a.clone().setY(e);
    const fb = w.b.clone().setY(e);
    strip(fa, fb, w.inward.clone().multiplyScalar(floorW)); // on the floor
    strip(w.a.clone().setY(0), w.b.clone().setY(0), V(0, wallW, 0)); // up the wall
    if (room.ceiling) {
      strip(w.a.clone().setY(height - e), w.b.clone().setY(height - e), w.inward.clone().multiplyScalar(ceilW));
      strip(w.a.clone().setY(height), w.b.clone().setY(height), V(0, -ceilW * 0.8, 0));
    }
  }
  // Vertical corners: a strip on each of the two walls
  const corners: Array<[number, number, number, number, 'minX' | 'maxX', 'minZ' | 'maxZ']> = [
    [minX, minZ, 1, 1, 'minX', 'minZ'],
    [maxX, minZ, -1, 1, 'maxX', 'minZ'],
    [minX, maxZ, 1, -1, 'minX', 'maxZ'],
    [maxX, maxZ, -1, -1, 'maxX', 'maxZ'],
  ];
  for (const [x, z, sx, sz, wx, wz] of corners) {
    if (!walls.has(wx) || !walls.has(wz)) continue;
    // on the X wall (plane x = const), spreading along z
    strip(V(x + sx * e, 0, z + sz * e), V(x + sx * e, height, z + sz * e), V(0, 0, sz * wallW));
    // on the Z wall (plane z = const), spreading along x
    strip(V(x + sx * e, 0, z + sz * e), V(x + sx * e, height, z + sz * e), V(sx * wallW, 0, 0));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  parent.add(mesh);
  return {
    update: () => {},
    dispose: () => {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}
