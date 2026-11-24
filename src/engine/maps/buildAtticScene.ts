import * as THREE from 'three';
import { ARENA_SCALE } from '../../../shared/constants';
import {
  ATTIC_EAVES_Y,
  ATTIC_MAP_DESIGN,
  ATTIC_RAFTER_X,
  ATTIC_RIDGE_Y,
} from '../../../shared/maps/attic';
import type { MapSceneHandles } from './types';
import { addCartoonOutline, createCelMaterial, createWoodGrainTexture } from '../toonMaterials';

/**
 * « Le grenier »: pitched roof on rafters, plank floor, furniture along the walls. Every solid
 * piece mirrors a collider of ATTIC_MAP_DESIGN (design units; the group is scaled by ARENA_SCALE).
 */
export function buildAtticScene(scene: THREE.Scene, maxAniso: number): MapSceneHandles {
  const disposables: Array<{ dispose: () => void }> = [];
  const cameraColliders: THREE.Object3D[] = [];
  const destructibleGroups = new Map<string, THREE.Object3D>();
  const powerUpZoneRings: THREE.Mesh[] = [];
  const rootGroup = new THREE.Group();
  // Built in design units; the whole room is enlarged by ARENA_SCALE (planes keep their size)
  rootGroup.scale.setScalar(ARENA_SCALE);
  scene.add(rootGroup);

  const woodTex = createWoodGrainTexture(maxAniso);
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.repeat.set(6, 4);
  disposables.push(woodTex);

  const mat = (color: number, opts: Parameters<typeof createCelMaterial>[1] = {}) => {
    const m = createCelMaterial(color, opts);
    disposables.push(m);
    return m;
  };
  const floorMat = mat(0xffffff, { map: woodTex });
  const wallMat = mat(0xe7d3ad);
  const roofMat = mat(0xc08552, { side: THREE.DoubleSide });
  const beamMat = mat(0x8b5a2b);
  const trunkMat = mat(0x6b3f1d);
  const brassMat = mat(0xd4a017);
  const cartonMat = mat(0xd6a86a);
  const tapeMat = mat(0xb08043);
  const horseMat = mat(0xf8fafc);
  const redMat = mat(0xdc2626);
  const maneMat = mat(0x7c2d12);
  const beigeMat = mat(0xe9cfa9);
  const darkMat = mat(0x374151);
  const bookColors = [0x1d4ed8, 0x15803d, 0xb91c1c, 0x7c3aed, 0xca8a04];

  const addMesh = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = rootGroup, outline = true, blocksCam = true) => {
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (outline) addCartoonOutline(mesh, 1.025);
    if (blocksCam) cameraColliders.push(mesh);
    parent.add(mesh);
    return mesh;
  };
  const addBox = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, m: THREE.Material, parent: THREE.Object3D = rootGroup, outline = true) => {
    const mesh = addMesh(new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ), m, parent, outline);
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    return mesh;
  };
  /** Cylinder between two points (matches the capsule colliders) */
  const addBeam = (a: THREE.Vector3, b: THREE.Vector3, radius: number, m: THREE.Material, parent: THREE.Object3D = rootGroup) => {
    const len = a.distanceTo(b);
    const mesh = addMesh(new THREE.CylinderGeometry(radius, radius, len, 10), m, parent);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  };

  // Floor
  const floorGeo = new THREE.PlaneGeometry(520, 400);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = addMesh(floorGeo, floorMat, rootGroup, false, false);
  floor.castShadow = false;

  // Gable walls (pentagon: knee walls up to the eaves, then the roof triangle)
  const gable = new THREE.Shape();
  gable.moveTo(-190, 0);
  gable.lineTo(190, 0);
  gable.lineTo(190, ATTIC_EAVES_Y);
  gable.lineTo(0, ATTIC_RIDGE_Y + 8);
  gable.lineTo(-190, ATTIC_EAVES_Y);
  gable.closePath();
  for (const side of [-1, 1]) {
    const g = new THREE.ShapeGeometry(gable);
    g.rotateY((side * Math.PI) / 2);
    const wall = addMesh(g, wallMat, rootGroup, false, false);
    wall.position.x = side * 251;
    (wall.material as THREE.Material).side = THREE.DoubleSide;
  }
  // Low knee walls along the long sides
  for (const side of [-1, 1]) {
    const g = new THREE.PlaneGeometry(520, ATTIC_EAVES_Y);
    const w = addMesh(g, wallMat, rootGroup, false, false);
    w.position.set(0, ATTIC_EAVES_Y / 2, side * 187);
    w.rotation.y = side > 0 ? Math.PI : 0;
  }

  // Roof slopes (boards seen from inside)
  const slopeLen = Math.hypot(187, ATTIC_RIDGE_Y + 8 - ATTIC_EAVES_Y);
  for (const side of [-1, 1]) {
    const g = new THREE.PlaneGeometry(520, slopeLen);
    const roof = addMesh(g, roofMat, rootGroup, false, false);
    const angle = Math.atan2(ATTIC_RIDGE_Y + 8 - ATTIC_EAVES_Y, 187);
    roof.position.set(0, (ATTIC_EAVES_Y + ATTIC_RIDGE_Y + 8) / 2, side * 93.5);
    roof.rotation.x = side > 0 ? -Math.PI / 2 + angle : Math.PI / 2 - angle;
  }

  // Ridge beam + rafters
  addBeam(new THREE.Vector3(-250, ATTIC_RIDGE_Y, 0), new THREE.Vector3(250, ATTIC_RIDGE_Y, 0), 7, beamMat);
  for (const x of ATTIC_RAFTER_X) {
    for (const side of [-1, 1]) {
      addBeam(new THREE.Vector3(x, ATTIC_RIDGE_Y, 0), new THREE.Vector3(x, ATTIC_EAVES_Y + 6, side * 183), 5, beamMat);
    }
  }

  // Hanging bulb (its own warm light keeps glowing during blackouts)
  const bulbPivot = new THREE.Group();
  bulbPivot.position.set(0, ATTIC_RIDGE_Y, 0);
  rootGroup.add(bulbPivot);
  addBeam(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 172 - ATTIC_RIDGE_Y, 0), 1.5, darkMat, bulbPivot);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
  disposables.push(bulbMat);
  const bulb = addMesh(new THREE.SphereGeometry(9, 16, 12), bulbMat, bulbPivot, true, false);
  bulb.position.y = 164 - ATTIC_RIDGE_Y;
  const bulbLight = new THREE.PointLight(0xffd27a, 1.6, 700, 1.3);
  bulbLight.position.copy(bulb.position);
  bulbPivot.add(bulbLight);

  // Old travel trunk with its lid open against the wall, brass bands
  addBox(-215, 0, -175, -130, 48, -122, trunkMat);
  addBox(-215, 48, -182, -130, 96, -172, trunkMat);
  for (const x of [-195, -150]) addBox(x - 3, 0, -176, x + 3, 49, -121, brassMat, rootGroup, false);

  // Cardboard box tower + tape
  addBox(128, 0, -177, 202, 56, -124, cartonMat);
  addBox(162, 0, -177.5, 168, 56.5, -123.5, tapeMat, rootGroup, false);

  // Rocking horse
  addBox(-170, 0, 105, -80, 14, 136, redMat);
  addBeam(new THREE.Vector3(-150, 52, 120), new THREE.Vector3(-98, 52, 120), 14, horseMat);
  addBeam(new THREE.Vector3(-98, 52, 120), new THREE.Vector3(-84, 84, 120), 9, horseMat);
  addBox(-92, 78, 112, -68, 96, 128, horseMat);
  addBox(-100, 70, 116, -82, 104, 124, maneMat, rootGroup, false);
  for (const x of [-146, -102]) addBeam(new THREE.Vector3(x, 14, 120), new THREE.Vector3(x, 44, 120), 5, redMat);
  addBeam(new THREE.Vector3(-128, 66, 108), new THREE.Vector3(-128, 66, 132), 2.5, redMat);

  // Dressmaker mannequin
  addBeam(new THREE.Vector3(192, 0, 128), new THREE.Vector3(192, 64, 128), 4, darkMat);
  const torso = addMesh(new THREE.CapsuleGeometry(16, 40, 6, 12), beigeMat);
  torso.position.set(192, 92, 128);

  // Cast-iron radiator with fins (warm updraft above)
  for (let z = -40; z <= 40; z += 10) addBox(-249, 0, z - 3.5, -228, 62, z + 3.5, darkMat, rootGroup, false);

  // Destructibles
  const vaseGroup = new THREE.Group();
  const vase = addMesh(
    new THREE.LatheGeometry(
      [new THREE.Vector2(6, -12), new THREE.Vector2(12, -4), new THREE.Vector2(11, 6), new THREE.Vector2(5, 12), new THREE.Vector2(7, 14)],
      18
    ),
    mat(0x0e7490),
    vaseGroup
  );
  vase.position.set(-172, 62, -148);
  rootGroup.add(vaseGroup);
  destructibleGroups.set('old_vase', vaseGroup);

  const cartonSmall = new THREE.Group();
  addBox(140, 56, -166, 176, 86, -134, cartonMat, cartonSmall);
  addBox(156, 56, -166.5, 160, 86.5, -133.5, tapeMat, cartonSmall, false);
  rootGroup.add(cartonSmall);
  destructibleGroups.set('carton_small', cartonSmall);

  const cartonFront = new THREE.Group();
  addBox(146, 0, 112, 184, 34, 158, cartonMat, cartonFront);
  addBox(146, 34, 112, 184, 36, 158, tapeMat, cartonFront, false);
  rootGroup.add(cartonFront);
  destructibleGroups.set('carton_front', cartonFront);

  const drum = new THREE.Group();
  const drumBody = addMesh(new THREE.CylinderGeometry(20, 20, 30, 20), redMat, drum);
  drumBody.position.set(113, 15, 158);
  for (const y of [1, 29]) {
    const rim = addMesh(new THREE.TorusGeometry(20, 1.6, 6, 24), brassMat, drum, false, false);
    rim.position.set(113, y, 158);
    rim.rotation.x = Math.PI / 2;
  }
  rootGroup.add(drum);
  destructibleGroups.set('toy_drum', drum);

  const books = new THREE.Group();
  bookColors.forEach((c, i) => {
    const b = addBox(-42 + (i % 2) * 2, i * 8, -176 + (i % 3), -2 - (i % 2) * 2, i * 8 + 8, -140 - (i % 2), mat(c), books);
    b.rotation.y = (i - 2) * 0.05;
  });
  rootGroup.add(books);
  destructibleGroups.set('book_stack', books);

  // Spider web in the corner (lethal hazard) + its spider
  const web = ATTIC_MAP_DESIGN.hazardZones[0];
  const webPts: number[] = [];
  const spokes = 10;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    webPts.push(0, 0, 0, Math.cos(a) * 30, Math.sin(a) * 30, 0);
  }
  for (const r of [8, 15, 22, 29]) {
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * Math.PI * 2;
      const a1 = ((i + 1) / spokes) * Math.PI * 2;
      webPts.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0);
    }
  }
  const webGeo = new THREE.BufferGeometry();
  webGeo.setAttribute('position', new THREE.Float32BufferAttribute(webPts, 3));
  const webMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  disposables.push(webGeo, webMat);
  const webMesh = new THREE.LineSegments(webGeo, webMat);
  webMesh.position.set(web.x, web.y + web.height / 2, web.z);
  webMesh.rotation.y = Math.PI / 4;
  rootGroup.add(webMesh);
  const spider = addMesh(new THREE.SphereGeometry(4, 10, 8), mat(0x111827), rootGroup, false, false);
  spider.position.set(web.x, web.y + web.height / 2, web.z);

  // Dormer window glow on the right gable + light shaft where the gusts come in
  const wz = ATTIC_MAP_DESIGN.windZones[0];
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xfff7d6, transparent: true, opacity: 0.12, depthWrite: false });
  disposables.push(windowMat, shaftMat);
  const win = addMesh(new THREE.PlaneGeometry(70, 52), windowMat, rootGroup, false, false);
  win.position.set(249.5, wz.originY, wz.originZ);
  win.rotation.y = -Math.PI / 2;
  const shaft = addMesh(new THREE.CylinderGeometry(30, 46, 200, 16, 1, true), shaftMat, rootGroup, false, false);
  shaft.position.set(150, wz.originY - 10, wz.originZ);
  shaft.rotation.z = Math.PI / 2;

  // Dust motes drifting in the air
  const dustCount = 160;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 460;
    dustPos[i * 3 + 1] = 10 + Math.random() * 180;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 320;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xfff7e0, size: 1.6, transparent: true, opacity: 0.7, depthWrite: false });
  disposables.push(dustGeo, dustMat);
  rootGroup.add(new THREE.Points(dustGeo, dustMat));

  // Power-up zone rings
  const zoneRingGeo = new THREE.TorusGeometry(9, 0.9, 8, 24);
  zoneRingGeo.rotateX(Math.PI / 2);
  const zoneRingMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 });
  disposables.push(zoneRingGeo, zoneRingMat);
  for (const sp of ATTIC_MAP_DESIGN.powerUpSpots) {
    const ring = new THREE.Mesh(zoneRingGeo, zoneRingMat);
    ring.position.set(sp.x, sp.y - 5, sp.z);
    rootGroup.add(ring);
    powerUpZoneRings.push(ring);
  }

  return {
    cameraColliders,
    destructibleGroups,
    powerUpZoneRings,
    updateAnimations: (elapsedTime: number, dt: number) => {
      // The bulb sways gently on its cord
      bulbPivot.rotation.z = Math.sin(elapsedTime * 0.9) * 0.05;
      bulbPivot.rotation.x = Math.sin(elapsedTime * 0.7 + 1) * 0.04;
      // The spider bobs on its web
      spider.position.y = web.y + web.height / 2 + Math.sin(elapsedTime * 1.7) * 3;
      // Dust drifts slowly upward and loops
      const attr = dustGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < dustCount; i++) {
        let y = attr.getY(i) + dt * 3;
        if (y > 190) y = 10;
        attr.setY(i, y);
        attr.setX(i, attr.getX(i) + Math.sin(elapsedTime * 0.3 + i) * dt * 2);
      }
      attr.needsUpdate = true;
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
  };
}
