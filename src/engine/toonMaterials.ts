import * as THREE from 'three';

let sharedGradientMap: THREE.DataTexture | null = null;
const outlineMaterialCache = new Map<string, THREE.ShaderMaterial>();

export function getToonGradientMap(): THREE.DataTexture {
  if (!sharedGradientMap) {
    // 3-step cel shading ramp (shadow, mid, bright sunlit)
    const colors = new Uint8Array([105, 195, 255]);
    const tex = new THREE.DataTexture(colors, 3, 1, THREE.RedFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    sharedGradientMap = tex;
  }
  return sharedGradientMap;
}

export function createCelMaterial(
  color: THREE.ColorRepresentation,
  options: {
    map?: THREE.Texture;
    emissive?: THREE.ColorRepresentation;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
    side?: THREE.Side;
  } = {}
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: options.map ? 0xffffff : color,
    gradientMap: getToonGradientMap(),
    map: options.map ?? null,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  });
}

/**
 * Cartoon outlines (« contour façon dessin animé »): a back-facing copy of the mesh pushed outward
 * along smoothed normals by a constant number of screen pixels (capped in world size), so every toy
 * gets an even ink line whatever its shape, size or distance.
 *  - 'toy': planes, items, small things (always drawn, thin cap)
 *  - 'prop': big creatures and the podium (always drawn)
 *  - 'room': the furniture (hidden on « Qualité graphique : basse »)
 */
export type OutlineKind = 'toy' | 'prop' | 'room';

const OUTLINE_STYLE: Record<OutlineKind, { px: number; maxWidth: number }> = {
  toy: { px: 2.2, maxWidth: 0.3 },
  prop: { px: 2.4, maxWidth: 3 },
  room: { px: 1.8, maxWidth: 3 },
};

/** Size of one screen pixel at 1 unit from the camera (updated every frame by the engine). */
const outlinePixelScale = { value: 0.0015 };
let roomOutlinesVisible = true;

export function setOutlinePixelScale(fovDeg: number, viewportHeightPx: number): void {
  outlinePixelScale.value = (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)) / Math.max(1, viewportHeightPx);
}

export function setRoomOutlinesVisible(visible: boolean): void {
  roomOutlinesVisible = visible;
  for (const [key, mat] of outlineMaterialCache) if (key.startsWith('room:')) mat.visible = visible;
}

const OUTLINE_VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec3 outlineNormal;
uniform float uWidthPx;
uniform float uPxScale;
uniform float uMaxWidth;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * outlineNormal);
  float dist = max(1.0, -mvPosition.z);
  mvPosition.xyz += n * min(uMaxWidth, uWidthPx * dist * uPxScale);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const OUTLINE_FRAGMENT = /* glsl */ `
uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(diffuse, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function getOutlineMaterial(color: number = 0x18181b, kind: OutlineKind = 'room', widthFactor = 1): THREE.ShaderMaterial {
  const key = `${kind}:${color}:${widthFactor.toFixed(2)}`;
  let mat = outlineMaterialCache.get(key);
  if (!mat) {
    const style = OUTLINE_STYLE[kind];
    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        diffuse: { value: new THREE.Color(color) },
        opacity: { value: 1 },
        uWidthPx: { value: style.px * widthFactor },
        uMaxWidth: { value: style.maxWidth * widthFactor },
      },
    ]);
    uniforms.uPxScale = outlinePixelScale; // shared: one update per frame for every outline
    mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: OUTLINE_VERTEX,
      fragmentShader: OUTLINE_FRAGMENT,
      side: THREE.BackSide,
      fog: true,
    });
    if (kind === 'room') mat.visible = roomOutlinesVisible;
    outlineMaterialCache.set(key, mat);
  }
  return mat;
}

/** Normals averaged over every vertex at the same place, so the pushed-out hull has no cracks at hard edges. */
export function ensureOutlineNormals(geometry: THREE.BufferGeometry): void {
  if (geometry.getAttribute('outlineNormal')) return;
  const pos = geometry.getAttribute('position');
  if (!pos) return;
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const nor = geometry.getAttribute('normal');
  const sums = new Map<string, [number, number, number]>();
  const keys: string[] = new Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    keys[i] = k;
    const sum = sums.get(k) ?? [0, 0, 0];
    sum[0] += nor.getX(i);
    sum[1] += nor.getY(i);
    sum[2] += nor.getZ(i);
    sums.set(k, sum);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = sums.get(keys[i])!;
    const len = Math.hypot(x, y, z);
    if (len > 1e-6) {
      out[i * 3] = x / len;
      out[i * 3 + 1] = y / len;
      out[i * 3 + 2] = z / len;
    } else {
      out[i * 3] = nor.getX(i);
      out[i * 3 + 1] = nor.getY(i);
      out[i * 3 + 2] = nor.getZ(i);
    }
  }
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
}

/**
 * Adds the ink outline to a mesh. `thicknessRatio` (historical scale-based value, 1.02…1.1) now
 * tunes the line width around the kind's default.
 */
export function addCartoonOutline(
  mesh: THREE.Mesh,
  thicknessRatio = 1.07,
  outlineColor = 0x16161d,
  kind: OutlineKind = 'room'
): THREE.Mesh {
  ensureOutlineNormals(mesh.geometry);
  const widthFactor = Math.min(1.5, Math.max(0.7, (thicknessRatio - 1) / 0.06));
  const outline = new THREE.Mesh(mesh.geometry, getOutlineMaterial(outlineColor, kind, Math.round(widthFactor * 4) / 4));
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.userData.isOutline = true;
  mesh.add(outline);
  return outline;
}


export function createCarpetTexture(maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3B82F6';
  ctx.fillRect(0, 0, 256, 256);

  // Playful woven checker/stripe rug pattern
  ctx.fillStyle = '#60A5FA';
  for (let y = 0; y < 256; y += 32) {
    ctx.fillRect(0, y, 256, 8);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let x = 0; x < 256; x += 16) {
    ctx.fillRect(x, 0, 4, 256);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 4);
  tex.anisotropy = maxAniso;
  return tex;
}

export function createWallpaperTexture(maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFF5D6';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#FDE6B0';
  for (let x = 0; x < 256; x += 64) {
    ctx.fillRect(x, 0, 28, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 3);
  tex.anisotropy = maxAniso;
  return tex;
}

export function createMonitorScreenTexture(maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0, '#38BDF8');
  grad.addColorStop(1, '#FDE047');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 320);

  // Cartoon hills & clouds on giant monitor
  ctx.fillStyle = '#4ADE80';
  ctx.beginPath();
  ctx.arc(160, 340, 180, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#22C55E';
  ctx.beginPath();
  ctx.arc(380, 350, 190, Math.PI, 0);
  ctx.fill();

  // Taskbar & desktop icons
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 290, 512, 30);
  ctx.fillStyle = '#EF4444';
  ctx.fillRect(28, 28, 34, 34);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(28, 78, 34, 34);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(140, 62, 240, 150);
  ctx.fillStyle = '#3B82F6';
  ctx.fillRect(140, 62, 240, 26);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export function createStickerTexture(stickerId: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  ctx.save();
  ctx.translate(64, 64);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#18181B';

  if (stickerId === 'star') {
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 48 : 21;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (stickerId === 'lightning') {
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.moveTo(10, -50);
    ctx.lineTo(-26, 6);
    ctx.lineTo(-2, 6);
    ctx.lineTo(-14, 52);
    ctx.lineTo(28, -8);
    ctx.lineTo(4, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (stickerId === 'target') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2563EB';
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
  } else if (stickerId === 'heart') {
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.moveTo(0, 44);
    ctx.bezierCurveTo(-60, 2, -36, -50, 0, -18);
    ctx.bezierCurveTo(36, -50, 60, 2, 0, 44);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FECACA';
    ctx.beginPath();
    ctx.arc(-18, -14, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (stickerId === 'crown') {
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.moveTo(-46, 30);
    ctx.lineTo(-46, -22);
    ctx.lineTo(-23, 2);
    ctx.lineTo(0, -40);
    ctx.lineTo(23, 2);
    ctx.lineTo(46, -22);
    ctx.lineTo(46, 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const [x, c] of [[-23, '#EF4444'], [0, '#2563EB'], [23, '#22C55E']] as const) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, 16, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Flame
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.moveTo(0, -50);
    ctx.quadraticCurveTo(44, -10, 26, 36);
    ctx.quadraticCurveTo(0, 56, -28, 36);
    ctx.quadraticCurveTo(-42, -6, 0, -50);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(0, 18, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}


export function createGraniteTexture(maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 0, 256, 256);

  const dots = ['#CBD5E1', '#94A3B8', '#E2E8F0', '#FDE68A', '#64748B'];
  const hash = (n: number) => {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < 650; i++) {
    const x = hash(i * 2 + 1) * 252;
    const y = hash(i * 2 + 2) * 252;
    const s = 1.8 + (i % 3);
    ctx.fillStyle = dots[i % dots.length];
    ctx.fillRect(x, y, s, s);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.anisotropy = maxAniso;
  return tex;
}

export function createGrassTexture(maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#34C759';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle soft mowing variation
  ctx.fillStyle = 'rgba(21, 128, 61, 0.14)';
  ctx.fillRect(0, 0, 128, 256);

  // Playful scattered grass blade tufts & tiny daisies
  for (let i = 0; i < 160; i++) {
    const x = (i * 59 + (i % 7) * 11) % 246;
    const y = (i * 97 + (i % 5) * 13) % 246;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(74, 222, 128, 0.45)' : 'rgba(21, 128, 61, 0.25)';
    ctx.fillRect(x, y, 2, 6);
    ctx.fillRect(x + 3, y + 1, 2, 5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.anisotropy = maxAniso;
  return tex;
}

export function createSandTexture(maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FDE68A';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 240; i++) {
    const x = (i * 67) % 252;
    const y = (i * 113) % 252;
    ctx.fillStyle = i % 2 === 0 ? '#FCD34D' : '#FEF3C7';
    ctx.fillRect(x, y, 4, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = maxAniso;
  return tex;
}

/** Wood planks and glazed tiles live in richTextures.ts (re-exported for the room builders). */
export { createTileTexture, createWoodGrainTexture } from './richTextures';
