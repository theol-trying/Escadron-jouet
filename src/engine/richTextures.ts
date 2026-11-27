import * as THREE from 'three';

/** Small deterministic random generator (the textures come out the same every time). */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toTexture(c: HTMLCanvasElement, srgb: boolean, repeatX: number, repeatY: number, maxAniso: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAniso;
  return tex;
}

/**
 * Wood planks (« grain du bois »): each plank its own tone, long wavy grain lines that bend around
 * knots, fine fibres, an end joint and seams with a light bevel. Detailed: twice the resolution and a
 * matching relief map (grain, knots and seams slightly sunken).
 */
export function createWoodGrainMaps(
  maxAniso = 4,
  detailed = false
): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture | null } {
  const size = detailed ? 1024 : 512;
  const u = size / 512;
  const color = document.createElement('canvas');
  color.width = color.height = size;
  const ctx = color.getContext('2d')!;
  let bumpCanvas: HTMLCanvasElement | null = null;
  let bctx: CanvasRenderingContext2D | null = null;
  if (detailed) {
    bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = bumpCanvas.height = size;
    bctx = bumpCanvas.getContext('2d')!;
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, size, size);
  }
  const rnd = seededRandom(1234);
  const planks = 4;
  const ph = size / planks;
  const tones = ['#D69B5B', '#CB8F50', '#DFA86A', '#D19656', '#C98A4A'];

  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    ctx.fillStyle = tones[(p * 3 + 1) % tones.length];
    ctx.fillRect(0, y0, size, ph);
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0, 'rgba(255, 230, 190, 0.10)');
    grad.addColorStop(0.5, 'rgba(120, 60, 20, 0.06)');
    grad.addColorStop(1, 'rgba(255, 230, 190, 0.08)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y0, size, ph);

    // Knots on this plank: the grain bends around them
    const knots = Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => ({
      x: rnd() * size,
      y: y0 + ph * (0.3 + rnd() * 0.4),
      r: (10 + rnd() * 12) * u,
    }));
    const lines = 26;
    for (let i = 0; i < lines; i++) {
      const baseY = y0 + ((i + 0.5) / lines) * ph;
      const amp = (2 + rnd() * 5) * u;
      const freq = (0.006 + rnd() * 0.01) / u;
      const phase = rnd() * Math.PI * 2;
      const dark = i % 4 === 0;
      ctx.strokeStyle = dark ? 'rgba(110, 58, 20, 0.38)' : 'rgba(140, 80, 34, 0.22)';
      ctx.lineWidth = (dark ? 2.2 : 1.2) * u;
      ctx.beginPath();
      if (bctx) {
        bctx.strokeStyle = dark ? 'rgba(40, 40, 40, 0.55)' : 'rgba(70, 70, 70, 0.35)';
        bctx.lineWidth = ctx.lineWidth;
        bctx.beginPath();
      }
      for (let x = 0; x <= size; x += 8 * u) {
        let y = baseY + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase * 1.3) * amp * 0.35;
        for (const k of knots) {
          const dx = (x - k.x) / (k.r * 2.4);
          const near = Math.max(0, 1 - Math.abs(y - k.y) / (ph * 0.5));
          const push = Math.exp(-dx * dx) * k.r * 1.6 * near;
          y += y < k.y ? -push : push;
        }
        y = Math.min(y0 + ph - 2 * u, Math.max(y0 + 2 * u, y));
        if (x === 0) {
          ctx.moveTo(x, y);
          bctx?.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
          bctx?.lineTo(x, y);
        }
      }
      ctx.stroke();
      bctx?.stroke();
    }
    // Knots: a dark heart and rings around it
    for (const k of knots) {
      for (let ring = 3; ring >= 0; ring--) {
        ctx.fillStyle = ring === 0 ? 'rgba(80, 38, 12, 0.85)' : `rgba(110, 58, 22, ${0.18 + 0.08 * (3 - ring)})`;
        ctx.beginPath();
        const rr = k.r * (0.35 + ring * 0.28);
        ctx.ellipse(k.x, k.y, rr * 1.6, rr * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (bctx) {
        bctx.fillStyle = 'rgba(30, 30, 30, 0.6)';
        bctx.beginPath();
        bctx.ellipse(k.x, k.y, k.r * 0.6, k.r * 0.3, 0, 0, Math.PI * 2);
        bctx.fill();
      }
    }
    // Fine fibres
    for (let f = 0; f < 260; f++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(255, 235, 200, 0.07)' : 'rgba(90, 45, 15, 0.07)';
      ctx.fillRect(rnd() * size, y0 + rnd() * ph, (8 + rnd() * 30) * u, u);
    }
    // End joint somewhere along the plank
    const jx = (0.2 + rnd() * 0.6) * size;
    ctx.fillStyle = 'rgba(80, 40, 12, 0.45)';
    ctx.fillRect(jx, y0, 2.5 * u, ph);
    // Seam with a light bevel under it
    ctx.fillStyle = 'rgba(70, 34, 10, 0.55)';
    ctx.fillRect(0, y0, size, 3 * u);
    ctx.fillStyle = 'rgba(255, 228, 185, 0.25)';
    ctx.fillRect(0, y0 + 3 * u, size, 2 * u);
    if (bctx) {
      bctx.fillStyle = '#202020';
      bctx.fillRect(jx, y0, 2.5 * u, ph);
      bctx.fillStyle = '#101010';
      bctx.fillRect(0, y0, size, 3 * u);
    }
  }
  return {
    map: toTexture(color, true, 3, 2, maxAniso),
    bump: bumpCanvas ? toTexture(bumpCanvas, false, 3, 2, maxAniso) : null,
  };
}

export function createWoodGrainTexture(maxAniso = 4): THREE.CanvasTexture {
  return createWoodGrainMaps(maxAniso, false).map;
}

/**
 * Glazed tiles (« carrelage »), 2 × 2 per repeat in two colours: each tile a slightly different
 * shade, bevelled edges, a glossy streak, a few speckles and recessed grout. Detailed: twice the
 * resolution and a relief map in which the grout lines sink.
 */
export function createTileMaps(
  maxAniso = 4,
  colorA = '#FFFBEB',
  colorB = '#FED7AA',
  repeatX = 10,
  repeatY = 8,
  detailed = false
): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture | null } {
  const size = detailed ? 512 : 256;
  const u = size / 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let bumpCanvas: HTMLCanvasElement | null = null;
  let bctx: CanvasRenderingContext2D | null = null;
  if (detailed) {
    bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = bumpCanvas.height = size;
    bctx = bumpCanvas.getContext('2d')!;
    bctx.fillStyle = '#303030';
    bctx.fillRect(0, 0, size, size);
  }
  const rnd = seededRandom(777);
  const half = size / 2;
  const grout = 5 * u;
  ctx.fillStyle = '#B8AFA3';
  ctx.fillRect(0, 0, size, size);
  const base = [new THREE.Color(colorA), new THREE.Color(colorB)];
  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 2; tx++) {
      const x0 = tx * half + grout / 2;
      const y0 = ty * half + grout / 2;
      const w = half - grout;
      const c = base[(tx + ty) % 2].clone();
      c.offsetHSL(0, 0, (rnd() - 0.5) * 0.04);
      ctx.fillStyle = `#${c.getHexString()}`;
      ctx.fillRect(x0, y0, w, w);
      // Glaze: lighter towards the top-left
      const g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + w);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      g.addColorStop(0.6, 'rgba(255, 255, 255, 0)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0.06)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, w, w);
      // Bevelled edges
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(x0, y0, w, 3 * u);
      ctx.fillRect(x0, y0, 3 * u, w);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
      ctx.fillRect(x0, y0 + w - 3 * u, w, 3 * u);
      ctx.fillRect(x0 + w - 3 * u, y0, 3 * u, w);
      // Glossy streak
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, w, w);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 7 * u;
      ctx.beginPath();
      ctx.moveTo(x0 + w * 0.15, y0 + w * 0.55);
      ctx.lineTo(x0 + w * 0.55, y0 + w * 0.15);
      ctx.stroke();
      ctx.lineWidth = 2.5 * u;
      ctx.beginPath();
      ctx.moveTo(x0 + w * 0.3, y0 + w * 0.62);
      ctx.lineTo(x0 + w * 0.62, y0 + w * 0.3);
      ctx.stroke();
      ctx.restore();
      // Speckles
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(15, 23, 42, 0.07)' : 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(x0 + rnd() * w, y0 + rnd() * w, 1.5 * u, 1.5 * u);
      }
      if (bctx) {
        bctx.fillStyle = '#e8e8e8';
        bctx.fillRect(x0 + 2 * u, y0 + 2 * u, w - 4 * u, w - 4 * u);
      }
    }
  }
  return {
    map: toTexture(canvas, true, repeatX, repeatY, maxAniso),
    bump: bumpCanvas ? toTexture(bumpCanvas, false, repeatX, repeatY, maxAniso) : null,
  };
}

export function createTileTexture(
  maxAniso = 4,
  colorA = '#FFFBEB',
  colorB = '#FED7AA',
  repeatX = 10,
  repeatY = 8
): THREE.CanvasTexture {
  return createTileMaps(maxAniso, colorA, colorB, repeatX, repeatY, false).map;
}
