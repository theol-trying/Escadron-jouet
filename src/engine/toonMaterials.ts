import * as THREE from 'three';

let sharedGradientMap: THREE.DataTexture | null = null;
const outlineMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

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

export function getOutlineMaterial(color: number = 0x18181b): THREE.MeshBasicMaterial {
  const key = String(color);
  let mat = outlineMaterialCache.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.BackSide,
    });
    outlineMaterialCache.set(key, mat);
  }
  return mat;
}

export function addCartoonOutline(
  mesh: THREE.Mesh,
  thicknessRatio = 1.07,
  outlineColor = 0x16161d
): THREE.Mesh {
  const outline = new THREE.Mesh(mesh.geometry, getOutlineMaterial(outlineColor));
  outline.scale.setScalar(thicknessRatio);
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  return outline;
}

export function createWoodGrainTexture(maxAniso = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#D99B58';
  ctx.fillRect(0, 0, 512, 512);

  // Oversized cartoon wood planks & grain lines to sell miniature scale
  for (let i = 0; i < 42; i++) {
    const y = (i / 42) * 512;
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(130, 74, 28, 0.34)' : 'rgba(166, 102, 46, 0.25)';
    ctx.lineWidth = 3 + (i % 4) * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 64) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 7);
    }
    ctx.stroke();
  }

  // Plank seams
  ctx.strokeStyle = 'rgba(92, 48, 16, 0.4)';
  ctx.lineWidth = 4;
  for (let y = 128; y < 512; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.anisotropy = maxAniso;
  return tex;
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

export function createTileTexture(
  maxAniso = 4,
  colorA = '#FFFBEB',
  colorB = '#FED7AA',
  repeatX = 10,
  repeatY = 8
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const half = 128;

  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, half, half);
  ctx.fillRect(half, half, half, half);

  ctx.fillStyle = colorB;
  ctx.fillRect(half, 0, half, half);
  ctx.fillRect(0, half, half, half);

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.moveTo(half, 0);
  ctx.lineTo(half, 256);
  ctx.moveTo(0, half);
  ctx.lineTo(256, half);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAniso;
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
