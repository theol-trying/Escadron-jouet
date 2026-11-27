import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ARENA_SCALE } from '../../shared/constants';
import type { MapId } from '../../shared/types';
import { buildDeskScene } from './maps/buildDeskScene';
import type { MapSceneHandles } from './maps/types';

/** Renderer, lights and room scenes of the 3D view. */

export type SceneBuilder = (scene: THREE.Scene, maxAniso: number) => MapSceneHandles;

// The desk (title screen) ships with the engine; the other rooms are separate files loaded on demand
export const SCENE_LOADERS: Record<MapId, () => Promise<SceneBuilder>> = {
  desk: async () => buildDeskScene,
  kitchen: () => import('./maps/buildKitchenScene').then((m) => m.buildKitchenScene),
  garden: () => import('./maps/buildGardenScene').then((m) => m.buildGardenScene),
  attic: () => import('./maps/buildAtticScene').then((m) => m.buildAtticScene),
  bedroom: () => import('./maps/buildBedroomScene').then((m) => m.buildBedroomScene),
};

/** Software rendering (no graphics card available): lighter settings, slower frame pacing. */
export function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createRenderer(container: HTMLElement, softwareGl: boolean, width: number, height: number): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: !softwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(softwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = !softwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
 * Warm sunny window key light (with shadows), cool sky fill and a blue rim light. Returns each light
 * with its normal intensity (room events dim them during a blackout).
 */
export function addRoomLights(scene: THREE.Scene, softwareGl: boolean): Array<{ light: THREE.Light; base: number }> {
  const lights: Array<{ light: THREE.Light; base: number }> = [];
  const hemi = new THREE.HemisphereLight(0xdbeafe, 0xfde68a, 0.95);
  scene.add(hemi);
  lights.push({ light: hemi, base: hemi.intensity });

  const sunKey = new THREE.DirectionalLight(0xfff1d6, 1.45);
  sunKey.position.set(-220 * ARENA_SCALE, 240 * ARENA_SCALE, 60 * ARENA_SCALE);
  sunKey.castShadow = !softwareGl;
  // The shadow frustum covers the enlarged room: a bigger map keeps shadows as crisp as before
  sunKey.shadow.mapSize.width = 2048;
  sunKey.shadow.mapSize.height = 2048;
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
  return lights;
}

/** Room fog: the garden is open air, so it sees farther. */
export function roomFog(mapId: MapId, color: string): THREE.Fog {
  return new THREE.Fog(color, (mapId === 'garden' ? 320 : 240) * ARENA_SCALE, (mapId === 'garden' ? 760 : 560) * ARENA_SCALE);
}
