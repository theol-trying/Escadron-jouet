import * as THREE from 'three';
import { ARENA_SCALE } from '../../../shared/constants';
import type { PowerUpSpotConfig } from '../../../shared/maps/types';
import { addCartoonOutline, createCelMaterial } from '../toonMaterials';
import type { MapSceneHandles } from './types';

/**
 * Building blocks shared by the room scenes: a root group in design units (scaled by ARENA_SCALE),
 * cel-shaded materials, boxes / beams / meshes that block the camera, power-up rings, and the
 * handles the engine expects. Every solid piece should mirror a collider of the room's map.
 */
export function createRoomKit(scene: THREE.Scene) {
  const disposables: Array<{ dispose: () => void }> = [];
  const cameraColliders: THREE.Object3D[] = [];
  const destructibleGroups = new Map<string, THREE.Object3D>();
  const powerUpZoneRings: THREE.Mesh[] = [];
  const rootGroup = new THREE.Group();
  rootGroup.scale.setScalar(ARENA_SCALE);
  scene.add(rootGroup);

  const own = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const mat = (color: THREE.ColorRepresentation, opts: Parameters<typeof createCelMaterial>[1] = {}) =>
    own(createCelMaterial(color, opts));

  const addMesh = (
    geo: THREE.BufferGeometry,
    m: THREE.Material,
    parent: THREE.Object3D = rootGroup,
    outline = true,
    blocksCam = true
  ): THREE.Mesh => {
    own(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (outline) addCartoonOutline(mesh, 1.025);
    if (blocksCam) cameraColliders.push(mesh);
    parent.add(mesh);
    return mesh;
  };
  const addBox = (
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    m: THREE.Material,
    parent: THREE.Object3D = rootGroup,
    outline = true,
    blocksCam = true
  ): THREE.Mesh => {
    const mesh = addMesh(new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ), m, parent, outline, blocksCam);
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    return mesh;
  };
  /** Cylinder between two points (matches a capsule collider) */
  const addBeam = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    radius: number,
    m: THREE.Material,
    parent: THREE.Object3D = rootGroup,
    outline = true
  ): THREE.Mesh => {
    const a = new THREE.Vector3(ax, ay, az);
    const b = new THREE.Vector3(bx, by, bz);
    const mesh = addMesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 12), m, parent, outline);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    return mesh;
  };
  const addSphere = (x: number, y: number, z: number, r: number, m: THREE.Material, parent: THREE.Object3D = rootGroup, outline = true) => {
    const mesh = addMesh(new THREE.SphereGeometry(r, 18, 14), m, parent, outline);
    mesh.position.set(x, y, z);
    return mesh;
  };

  /** Floor, four walls (backs hidden from inside) and a ceiling, for a 500 × 370 room. */
  const addShell = (floorMat: THREE.Material, wallMat: THREE.Material, ceilingMat: THREE.Material, height = 224) => {
    const floorGeo = new THREE.PlaneGeometry(520, 400);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = addMesh(floorGeo, floorMat, rootGroup, false, false);
    floor.castShadow = false;
    const ceilGeo = new THREE.PlaneGeometry(520, 400);
    ceilGeo.rotateX(Math.PI / 2);
    const ceil = addMesh(ceilGeo, ceilingMat, rootGroup, false, false);
    ceil.position.y = height;
    ceil.castShadow = false;
    for (const side of [-1, 1]) {
      const back = addMesh(new THREE.PlaneGeometry(520, height), wallMat, rootGroup, false, false);
      back.position.set(0, height / 2, side * 187);
      back.rotation.y = side > 0 ? Math.PI : 0;
      back.castShadow = false;
      const end = addMesh(new THREE.PlaneGeometry(380, height), wallMat, rootGroup, false, false);
      end.position.set(side * 251, height / 2, 0);
      end.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      end.castShadow = false;
    }
  };

  const addPowerUpRings = (spots: PowerUpSpotConfig[]) => {
    const geo = own(new THREE.TorusGeometry(9, 0.9, 8, 24));
    geo.rotateX(Math.PI / 2);
    const m = own(new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 }));
    for (const sp of spots) {
      const ring = new THREE.Mesh(geo, m);
      ring.position.set(sp.x, sp.y - 5, sp.z);
      rootGroup.add(ring);
      powerUpZoneRings.push(ring);
    }
  };

  /** A destructible prop: its meshes in their own group (hidden when it breaks). */
  const destructible = (id: string): THREE.Group => {
    const g = new THREE.Group();
    rootGroup.add(g);
    destructibleGroups.set(id, g);
    return g;
  };

  const finish = (animate: (elapsedTime: number, dt: number) => void): MapSceneHandles => ({
    cameraColliders,
    destructibleGroups,
    powerUpZoneRings,
    updateAnimations: (elapsedTime: number, dt: number) => {
      animate(elapsedTime, dt);
      for (let i = 0; i < powerUpZoneRings.length; i++) {
        const ring = powerUpZoneRings[i];
        const pulse = 1 + Math.sin(elapsedTime * 3.2 + i) * 0.12;
        ring.scale.set(pulse, 1, pulse);
        ring.rotation.y = elapsedTime * 1.1;
      }
    },
    dispose: () => {
      scene.remove(rootGroup);
      for (const d of disposables) d.dispose();
    },
  });

  return { rootGroup, own, mat, addMesh, addBox, addBeam, addSphere, addShell, addPowerUpRings, destructible, finish };
}
