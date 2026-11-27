/**
 * « Qualité graphique »: low / medium / high, or « auto » (picked from the graphics card). Each level
 * is a profile of what the 3D view draws and how finely (shadows, pixel density, effects…).
 */
export type GraphicsQuality = 'low' | 'medium' | 'high';
export type GraphicsQualitySetting = 'auto' | GraphicsQuality;

export interface GraphicsProfile {
  quality: GraphicsQuality;
  /** Sun shadows: none, filtered but tight (cheap), or wide and soft */
  shadows: 'off' | 'sharp' | 'soft';
  shadowMapSize: number;
  /** Shadow filter radius in shadow-map texels (PCF) */
  shadowRadius: number;
  /** Cap on the screen pixel density (sharper on high-density screens, costlier) */
  maxPixelRatio: number;
  /** Cartoon outlines on the room furniture (the planes always keep theirs) */
  roomOutlines: boolean;
  /** Light shafts through the windows, and how many dust motes float in them */
  sunShafts: boolean;
  dustMotes: number;
  /** Garden: waving grass blades */
  grassBlades: number;
  /** Bathroom mirror: real reflection resolution (0 = plain shiny surface) */
  mirrorResolution: number;
  /** Detail of the room materials (bigger textures, relief) */
  detailedMaterials: boolean;
  /** Multiplier on the number of effect particles (confetti, sparks, splashes, smoke) */
  effects: number;
  /** Speed lines on turbo */
  speedLines: boolean;
}

const PROFILES: Record<GraphicsQuality, GraphicsProfile> = {
  low: {
    quality: 'low',
    shadows: 'off',
    shadowMapSize: 512,
    shadowRadius: 1,
    maxPixelRatio: 1,
    roomOutlines: false,
    sunShafts: false,
    dustMotes: 0,
    grassBlades: 0,
    mirrorResolution: 0,
    detailedMaterials: false,
    effects: 0.5,
    speedLines: true,
  },
  medium: {
    quality: 'medium',
    shadows: 'sharp',
    shadowMapSize: 1024,
    shadowRadius: 1,
    maxPixelRatio: 1.25,
    roomOutlines: true,
    sunShafts: true,
    dustMotes: 60,
    grassBlades: 5000,
    mirrorResolution: 256,
    detailedMaterials: false,
    effects: 0.8,
    speedLines: true,
  },
  high: {
    quality: 'high',
    shadows: 'soft',
    shadowMapSize: 2048,
    shadowRadius: 3.5,
    maxPixelRatio: 2,
    roomOutlines: true,
    sunShafts: true,
    dustMotes: 160,
    grassBlades: 14000,
    mirrorResolution: 512,
    detailedMaterials: true,
    effects: 1,
    speedLines: true,
  },
};

export function graphicsProfile(quality: GraphicsQuality): GraphicsProfile {
  return PROFILES[quality];
}

/**
 * Level suited to a graphics card, from the name the browser gives (WEBGL_debug_renderer_info).
 * Software rendering → low; integrated chips (Intel, AMD APUs, phone GPUs, entry-level GeForce MX)
 * → medium; dedicated cards and Apple chips → high; unknown → medium (the safe middle).
 */
export function detectGraphicsQuality(gpuName: string, softwareGl: boolean): GraphicsQuality {
  if (softwareGl || /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuName)) return 'low';
  const name = gpuName.toLowerCase();
  if (!name) return 'medium';
  if (/geforce (mx|gt \d{2,3}\b)|quadro (k|p)\d{3,4}m?\b/.test(name)) return 'medium';
  if (/rtx|gtx|geforce|quadro|radeon (rx|pro|r9)|radeon\(tm\) (rx|pro)|arc\(tm\)|intel\(r\) arc|apple (m\d|gpu)/.test(name)) {
    return 'high';
  }
  if (/intel|iris|uhd|hd graphics|radeon|vega|mali|adreno|powervr|videocore|vivante|apple a\d/.test(name)) return 'medium';
  return 'medium';
}

export function resolveGraphicsQuality(setting: GraphicsQualitySetting, detected: GraphicsQuality): GraphicsQuality {
  return setting === 'auto' ? detected : setting;
}

export function parseGraphicsQualitySetting(value: unknown): GraphicsQualitySetting {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'auto';
}

let detectedGpu: { name: string; software: boolean } | null = null;

/** Name of the graphics card and whether rendering is done in software (checked once, then cached). */
export function detectGpu(): { name: string; software: boolean } {
  if (detectedGpu) return detectedGpu;
  let name = '';
  let software = true;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
      software = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(name);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    // no WebGL at all: treated as software rendering
  }
  detectedGpu = { name, software };
  return detectedGpu;
}

/** Level « auto » would pick on this computer. */
export function detectedQualityHere(): GraphicsQuality {
  const gpu = detectGpu();
  return detectGraphicsQuality(gpu.name, gpu.software);
}
