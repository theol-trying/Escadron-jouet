import * as THREE from 'three';
import type { WindZoneConfig } from '../../../shared/maps/types';
import type { RoomFx } from './sunShafts';

const WATER_VERTEX = /* glsl */ `
attribute vec4 seed; // arm (0/1), start phase, sideways spread, kind (0 droplet, 1 splash)
uniform float uTime;
uniform float uYaw;
uniform float uSpin;
uniform vec3 uOrigin;
uniform float uPixel;
varying float vAlpha;
const float FLIGHT = 1.1;
const float REACH = 112.0;
vec2 dirAt(float yaw) { return vec2(-sin(yaw), -cos(yaw)); }
void main() {
  float arm = seed.x * 3.14159265;
  vec3 p;
  float size;
  if (seed.w < 0.5) {
    // Droplet along the jet: thrown when the arm pointed a little earlier (the jets curl as it spins)
    float t = fract(seed.y + uTime / FLIGHT);
    float yaw = uYaw + arm - t * FLIGHT * uSpin + seed.z * 0.16;
    vec2 d = dirAt(yaw);
    float reach = 14.0 + t * REACH * (0.92 + 0.08 * fract(seed.y * 7.0));
    p = uOrigin + vec3(d.x * reach, 0.0, d.y * reach);
    p.y = uOrigin.y * (1.0 - t * t) + 46.0 * t * (1.0 - t);
    size = 1.6;
    vAlpha = 0.75;
  } else {
    // Splash where the jet lands: little drops bouncing up and out
    float t = fract(seed.y + uTime / 0.45);
    float yaw = uYaw + arm - FLIGHT * uSpin - t * 0.45 * uSpin + seed.z * 0.2;
    vec2 d = dirAt(yaw);
    float reach = 14.0 + REACH * (0.95 + 0.1 * fract(seed.y * 13.0));
    float a = fract(seed.y * 31.0) * 6.2831;
    vec2 scatter = vec2(cos(a), sin(a)) * t * 9.0;
    p = uOrigin + vec3(d.x * reach + scatter.x, 0.0, d.y * reach + scatter.y);
    p.y = 0.5 + 18.0 * t * (1.0 - t) * (0.4 + fract(seed.y * 5.0));
    size = 1.2;
    vAlpha = 0.85 * (1.0 - t);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uPixel * size / max(1.0, -mv.z), 1.0, 6.0);
}
`;

const WATER_FRAGMENT = /* glsl */ `
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  if (d > 1.0) discard;
  // Light blue drop with a white glint
  vec3 col = mix(vec3(0.55, 0.82, 1.0), vec3(1.0), smoothstep(0.6, 0.0, length(c - vec2(-0.3, 0.3))));
  gl_FragColor = vec4(col, vAlpha * smoothstep(1.0, 0.6, d));
}
`;

/**
 * Lawn sprinkler water (« éclaboussures de l'arroseur »): droplets flying along both spinning jets in
 * curling arcs, and splashes bouncing where they land. All animated on the graphics card.
 */
export function addSprinklerWater(
  parent: THREE.Object3D,
  wz: WindZoneConfig,
  rotorHeight: number,
  amount: number
): RoomFx {
  const droplets = Math.round(380 * amount);
  const splashes = Math.round(160 * amount);
  const count = droplets + splashes;
  if (count <= 0) return { update: () => {}, dispose: () => {} };
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = i % 2;
    seeds[i * 4 + 1] = Math.random();
    seeds[i * 4 + 2] = (Math.random() - 0.5) * 2;
    seeds[i * 4 + 3] = i < droplets ? 0 : 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const uniforms = {
    uTime: { value: 0 },
    uYaw: { value: wz.baseYaw },
    uSpin: { value: wz.sweepSpeed },
    uOrigin: { value: new THREE.Vector3(wz.originX, rotorHeight, wz.originZ) },
    uPixel: { value: 600 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  parent.add(points);
  return {
    update: (t: number) => {
      uniforms.uTime.value = t;
      uniforms.uYaw.value = wz.baseYaw + t * wz.sweepSpeed;
    },
    dispose: () => {
      points.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}
