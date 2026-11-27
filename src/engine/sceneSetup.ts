import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ARENA_SCALE } from '../../shared/constants';
import type { MapId } from '../../shared/types';
import { detectGpu, type GraphicsProfile } from '../settings/graphicsQuality';
import { buildDeskScene } from './maps/buildDeskScene';
import type { MapSceneHandles } from './maps/types';

/** Renderer, lights and room scenes of the 3D view. */

export interface SceneBuildOptions {
  /** « Qualité graphique »: what the room may draw (mirror, light shafts, grass, detailed materials…) */
  profile?: GraphicsProfile;
}

export type SceneBuilder = (scene: THREE.Scene, maxAniso: number, opts?: SceneBuildOptions) => MapSceneHandles;

// The desk (title screen) ships with the engine; the other rooms are separate files loaded on demand
export const SCENE_LOADERS: Record<MapId, () => Promise<SceneBuilder>> = {
  desk: async () => buildDeskScene,
  kitchen: () => import('./maps/buildKitchenScene').then((m) => m.buildKitchenScene),
  garden: () => import('./maps/buildGardenScene').then((m) => m.buildGardenScene),
  attic: () => import('./maps/buildAtticScene').then((m) => m.buildAtticScene),
  bedroom: () => import('./maps/buildBedroomScene').then((m) => m.buildBedroomScene),
  bathroom: () => import('./maps/buildBathroomScene').then((m) => m.buildBathroomScene),
  garage: () => import('./maps/buildGarageScene').then((m) => m.buildGarageScene),
};

/** Software rendering (no graphics card available): lighter settings, slower frame pacing. */
export function detectSoftwareGl(): boolean {
  return detectGpu().software;
}

/** Screen pixel density used for a quality level (capped: sharper costs more). */
export function pixelRatioFor(profile: GraphicsProfile, softwareGl: boolean): number {
  return softwareGl ? 1 : Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
}

export function createRenderer(
  container: HTMLElement,
  softwareGl: boolean,
  width: number,
  height: number,
  profile: GraphicsProfile
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    // Edge smoothing is chosen when the 3D view starts (it can't change afterwards)
    antialias: !softwareGl && profile.quality !== 'low',
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(pixelRatioFor(profile, softwareGl));
  renderer.setSize(width, height);
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.enabled = !softwareGl && profile.shadows !== 'off';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);
  return renderer;
}

/** Studio reflections for the shiny toy materials. */
export function addEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

/**
 * Sun shadows for a quality level: off, a tight filter on a smaller map (cheap on integrated chips),
 * or a wide soft filter on a big map. Materials are recompiled when shadows are switched on or off.
 */
export function applyShadowProfile(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  sun: THREE.DirectionalLight,
  profile: GraphicsProfile,
  softwareGl: boolean
): void {
  const enabled = !softwareGl && profile.shadows !== 'off';
  const wasEnabled = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = enabled;
  sun.castShadow = enabled;
  if (sun.shadow.mapSize.width !== profile.shadowMapSize) {
    sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  sun.shadow.radius = profile.shadowRadius;
  if (wasEnabled !== enabled) {
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
  }
}

/**
 * Warm sunny window key light (with shadows), cool sky fill and a blue rim light. Returns each light
 * with its normal intensity (room events dim them during a blackout), and the sun (shadow caster).
 */
export function addRoomLights(
  scene: THREE.Scene,
  softwareGl: boolean,
  profile: GraphicsProfile
): { lights: Array<{ light: THREE.Light; base: number }>; sun: THREE.DirectionalLight } {
  const lights: Array<{ light: THREE.Light; base: number }> = [];
  const hemi = new THREE.HemisphereLight(0xdbeafe, 0xfde68a, 0.95);
  scene.add(hemi);
  lights.push({ light: hemi, base: hemi.intensity });

  const sunKey = new THREE.DirectionalLight(0xfff1d6, 1.45);
  sunKey.position.set(-220 * ARENA_SCALE, 240 * ARENA_SCALE, 60 * ARENA_SCALE);
  sunKey.castShadow = !softwareGl && profile.shadows !== 'off';
  // The shadow frustum covers the enlarged room; map size and softness follow the quality level
  sunKey.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
  sunKey.shadow.radius = profile.shadowRadius;
  sunKey.shadow.camera.near = 20 * ARENA_SCALE;
  sunKey.shadow.camera.far = 650 * ARENA_SCALE;
  sunKey.shadow.camera.left = -240 * ARENA_SCALE;
  sunKey.shadow.camera.right = 240 * ARENA_SCALE;
  sunKey.shadow.camera.top = 220 * ARENA_SCALE;
  sunKey.shadow.camera.bottom = -220 * ARENA_SCALE;
  sunKey.shadow.bias = -0.0005;
  sunKey.shadow.normalBias = 0.02;
  scene.add(sunKey);
  lights.push({ light: sunKey, base: sunKey.intensity });

  const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
  rimLight.position.set(180, 140, -160);
  scene.add(rimLight);
  lights.push({ light: rimLight, base: rimLight.intensity });
  return { lights, sun: sunKey };
}

/** Room fog: the garden is open air, so it sees farther. */
export function roomFog(mapId: MapId, color: string): THREE.Fog {
  return new THREE.Fog(color, (mapId === 'garden' ? 320 : 240) * ARENA_SCALE, (mapId === 'garden' ? 760 : 560) * ARENA_SCALE);
}
