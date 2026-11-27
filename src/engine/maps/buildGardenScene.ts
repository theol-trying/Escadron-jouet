import * as THREE from 'three';
import { getFanYawAtTime } from '../../../shared/flightPhysics';
import { ARENA_SCALE } from '../../../shared/constants';
import { GARDEN_MAP_DESIGN } from '../../../shared/maps/garden';
import type { MapSceneHandles } from './types';
import type { SceneBuildOptions } from '../sceneSetup';
import { addGrassField, footprintsOf } from './grassField';
import {
  addCartoonOutline,
  createCelMaterial,
  createGrassTexture,
  createSandTexture,
  createWoodGrainTexture,
} from '../toonMaterials';

export function buildGardenScene(scene: THREE.Scene, maxAniso: number, opts: SceneBuildOptions = {}): MapSceneHandles {
  const disposables: Array<{ dispose: () => void }> = [];
  const cameraColliders: THREE.Object3D[] = [];
  const destructibleGroups = new Map<string, THREE.Object3D>();
  const powerUpZoneRings: THREE.Mesh[] = [];
  const rootGroup = new THREE.Group();
  // Built in design units; the whole room is enlarged by ARENA_SCALE (planes keep their size)
  rootGroup.scale.setScalar(ARENA_SCALE);
  scene.add(rootGroup);

  const grassTex = createGrassTexture(maxAniso);
  const sandTex = createSandTexture(maxAniso);
  const woodTex = createWoodGrainTexture(maxAniso);
  disposables.push(grassTex, sandTex, woodTex);

  const grassMat = createCelMaterial(0xffffff, { map: grassTex });
  const sandMat = createCelMaterial(0xffffff, { map: sandTex });
  const woodMat = createCelMaterial(0xd99b58, { map: woodTex });
  const whiteFenceMat = createCelMaterial(0xf8fafc);
  const hedgeMat = createCelMaterial(0x15803d);
  const bladeMat = createCelMaterial(0x22c55e, { side: THREE.DoubleSide });
  const terracottaMat = createCelMaterial(0xc2410c);
  const stemMat = createCelMaterial(0x16a34a);
  const redMat = createCelMaterial(0xef4444);
  const yellowMat = createCelMaterial(0xfacc15);
  const pinkMat = createCelMaterial(0xf472b6);
  const blueMat = createCelMaterial(0x2563eb);
  const brownMat = createCelMaterial(0x78350f);
  const orangeMat = createCelMaterial(0xf97316);

  disposables.push(
    grassMat,
    sandMat,
    woodMat,
    whiteFenceMat,
    hedgeMat,
    bladeMat,
    terracottaMat,
    stemMat,
    redMat,
    yellowMat,
    pinkMat,
    blueMat,
    brownMat,
    orangeMat
  );

  const addStaticBox = (
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    mat: THREE.Material,
    outline = true,
    blocksCam = true
  ): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (outline) addCartoonOutline(mesh, 1.022);
    if (blocksCam) cameraColliders.push(mesh);
    rootGroup.add(mesh);
    return mesh;
  };

  // Extended sunlit outdoor backyard grass reaching smoothly into horizon sky fog
  const lawnGeo = new THREE.PlaneGeometry(1400, 1400);
  lawnGeo.rotateX(-Math.PI / 2);
  disposables.push(lawnGeo);
  const lawn = new THREE.Mesh(lawnGeo, grassMat);
  lawn.receiveShadow = true;
  rootGroup.add(lawn);

  // Playful stone garden path stepping stones
  const stoneGeo = new THREE.CylinderGeometry(16, 18, 2.2, 10);
  const stoneMat = createCelMaterial(0xcbd5e1);
  disposables.push(stoneGeo, stoneMat);
  for (const [sx, sz] of [
    [-48, -22],
    [-18, -8],
    [-55, 22],
    [-75, 44],
    [62, -40],
    [98, -12],
    [122, 26],
  ]) {
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    stone.position.set(sx, 1.1, sz);
    stone.receiveShadow = true;
    addCartoonOutline(stone, 1.03);
    rootGroup.add(stone);
  }

  // White wooden picket fence perimeter around the playable yard
  const picketGeo = new THREE.BoxGeometry(8, 36, 3);
  disposables.push(picketGeo);
  const picketPositions: Array<[number, number, number]> = [];
  for (let x = -245; x <= 245; x += 22) {
    picketPositions.push([x, -187, 0], [x, 187, 0]);
  }
  for (let z = -175; z <= 175; z += 22) {
    picketPositions.push([-252, z, Math.PI / 2], [252, z, Math.PI / 2]);
  }
  const pickets = new THREE.InstancedMesh(picketGeo, whiteFenceMat, picketPositions.length);
  const dummy = new THREE.Object3D();
  picketPositions.forEach(([px, pz, ry], i) => {
    dummy.position.set(px, 18, pz);
    dummy.rotation.set(0, ry, 0);
    dummy.updateMatrix();
    pickets.setMatrixAt(i, dummy.matrix);
  });
  pickets.instanceMatrix.needsUpdate = true;
  pickets.computeBoundingSphere();
  rootGroup.add(pickets);

  // Fence rails
  addStaticBox(-252, 24, -188, 252, 27, -186, whiteFenceMat, false, false);
  addStaticBox(-252, 24, 186, 252, 27, 188, whiteFenceMat, false, false);
  addStaticBox(-253, 24, -186, -251, 27, 186, whiteFenceMat, false, false);
  addStaticBox(251, 24, -186, 253, 27, 186, whiteFenceMat, false, false);

  // Distant garden hedge bushes outside fence for skyline depth
  const bushGeo = new THREE.SphereGeometry(28, 12, 10);
  disposables.push(bushGeo);
  for (const [bx, bz] of [
    [-280, -210],
    [-120, -225],
    [40, -225],
    [220, -215],
    [290, -40],
    [285, 130],
    [-290, 40],
    [-275, 195],
  ]) {
    const bush = new THREE.Mesh(bushGeo, hedgeMat);
    bush.position.set(bx, 18, bz);
    bush.scale.set(1.4, 0.9, 1.2);
    rootGroup.add(bush);
  }

  // Fluffy cartoon clouds in the sunny sky
  const cloudGeo = new THREE.SphereGeometry(18, 10, 8);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  disposables.push(cloudGeo, cloudMat);
  for (const [cx, cy, cz] of [
    [-160, 232, -130],
    [130, 238, -110],
    [-40, 242, 140],
    [180, 230, 120],
  ]) {
    const cg = new THREE.Group();
    cg.position.set(cx, cy, cz);
    const c1 = new THREE.Mesh(cloudGeo, cloudMat);
    const c2 = new THREE.Mesh(cloudGeo, cloudMat);
    c2.position.set(18, -3, 4);
    c2.scale.setScalar(0.8);
    const c3 = new THREE.Mesh(cloudGeo, cloudMat);
    c3.position.set(-16, -4, -3);
    c3.scale.setScalar(0.75);
    cg.add(c1, c2, c3);
    rootGroup.add(cg);
  }

  // Dog House with fly-through tunnel (-164..-96, 0..82, -138..-68)
  addStaticBox(-164, 0, -138, -146, 56, -72, woodMat);
  addStaticBox(-114, 0, -138, -96, 56, -72, woodMat);
  addStaticBox(-170, 56, -142, -90, 82, -68, redMat);
  // Bone name plaque above tunnel entrance
  addStaticBox(-142, 58, -70, -118, 66, -67, whiteFenceMat, true, false);

  // Giant A-frame Swing Set (X: 10..110, Y: 0..168, Z: -110)
  const postGeo = new THREE.CylinderGeometry(4.2, 4.8, 170, 12);
  const topBarGeo = new THREE.CylinderGeometry(4.8, 4.8, 106, 12);
  topBarGeo.rotateZ(Math.PI / 2);
  const chainGeo = new THREE.CylinderGeometry(0.9, 0.9, 130, 6);
  disposables.push(postGeo, topBarGeo, chainGeo);

  const postL = new THREE.Mesh(postGeo, yellowMat);
  postL.position.set(14, 84, -110);
  postL.rotation.z = -0.05;
  addCartoonOutline(postL, 1.06);
  cameraColliders.push(postL);
  rootGroup.add(postL);

  const postR = new THREE.Mesh(postGeo, yellowMat);
  postR.position.set(106, 84, -110);
  postR.rotation.z = 0.05;
  addCartoonOutline(postR, 1.06);
  cameraColliders.push(postR);
  rootGroup.add(postR);

  const topBar = new THREE.Mesh(topBarGeo, redMat);
  topBar.position.set(60, 168, -110);
  addCartoonOutline(topBar, 1.06);
  cameraColliders.push(topBar);
  rootGroup.add(topBar);

  // Swing seats + chains
  addStaticBox(34, 34, -120, 54, 42, -100, blueMat);
  addStaticBox(66, 34, -120, 86, 42, -100, blueMat);
  for (const cx of [36, 52, 68, 84]) {
    const ch = new THREE.Mesh(chainGeo, whiteFenceMat);
    ch.position.set(cx, 104, -110);
    rootGroup.add(ch);
  }

  // Sandbox (-185..-85, Z: 55..145) + plastic bucket
  addStaticBox(-185, 0, 55, -85, 18, 63, woodMat);
  addStaticBox(-185, 0, 137, -85, 18, 145, woodMat);
  addStaticBox(-185, 0, 63, -177, 18, 137, woodMat);
  addStaticBox(-93, 0, 63, -85, 18, 137, woodMat);
  addStaticBox(-177, 0, 63, -93, 10, 137, sandMat, false, false);

  const bucketGeo = new THREE.CylinderGeometry(11, 8.5, 32, 16);
  disposables.push(bucketGeo);
  const bucket = new THREE.Mesh(bucketGeo, blueMat);
  bucket.position.set(-105, 26, 122);
  addCartoonOutline(bucket, 1.04);
  cameraColliders.push(bucket);
  rootGroup.add(bucket);

  // Giant Flower Pots & Blooms
  const addGiantFlower = (
    fx: number,
    fz: number,
    potR: number,
    potH: number,
    stalkH: number,
    petalMat: THREE.Material
  ) => {
    const potGeo = new THREE.CylinderGeometry(potR, potR * 0.72, potH, 16);
    const rimGeo = new THREE.CylinderGeometry(potR * 1.1, potR * 1.06, 8, 16);
    const stalkGeo = new THREE.CylinderGeometry(4.2, 5, stalkH, 10);
    const centerGeo = new THREE.SphereGeometry(12, 14, 12);
    const petalGeo = new THREE.SphereGeometry(10, 10, 8);
    petalGeo.scale(1.3, 0.5, 0.7);
    disposables.push(potGeo, rimGeo, stalkGeo, centerGeo, petalGeo);

    const pot = new THREE.Mesh(potGeo, terracottaMat);
    pot.position.set(fx, potH * 0.5, fz);
    addCartoonOutline(pot, 1.04);
    cameraColliders.push(pot);
    rootGroup.add(pot);

    const rim = new THREE.Mesh(rimGeo, terracottaMat);
    rim.position.set(fx, potH - 3, fz);
    addCartoonOutline(rim, 1.04);
    rootGroup.add(rim);

    const stalk = new THREE.Mesh(stalkGeo, stemMat);
    stalk.position.set(fx, potH + stalkH * 0.5, fz);
    addCartoonOutline(stalk, 1.06);
    cameraColliders.push(stalk);
    rootGroup.add(stalk);

    const headGroup = new THREE.Group();
    headGroup.position.set(fx, potH + stalkH + 4, fz);
    const center = new THREE.Mesh(centerGeo, brownMat);
    addCartoonOutline(center, 1.06);
    headGroup.add(center);
    for (let p = 0; p < 8; p++) {
      const a = (p / 8) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.position.set(Math.cos(a) * 16, 0, Math.sin(a) * 16);
      petal.rotation.y = -a;
      addCartoonOutline(petal, 1.07);
      headGroup.add(petal);
    }
    rootGroup.add(headGroup);
  };

  addGiantFlower(165, -118, 24, 46, 102, yellowMat);
  addGiantFlower(176, 82, 22, 42, 80, pinkMat);

  // Giant Grass Blade Clusters (collider clusters + extra scenic tufts)
  const bladeGeo = new THREE.ConeGeometry(5, 86, 5);
  bladeGeo.translate(0, 43, 0);
  disposables.push(bladeGeo);
  for (const [gx, gz, hScale] of [
    [-208, -142, 1.08],
    [-210, 148, 0.96],
    [212, 142, 1.02],
  ]) {
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * Math.PI * 2;
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(gx + Math.cos(a) * 8, 0, gz + Math.sin(a) * 8);
      blade.rotation.set(Math.sin(a) * 0.22, a, Math.cos(a) * 0.18);
      blade.scale.set(1, hScale * (0.85 + (b % 3) * 0.12), 1);
      addCartoonOutline(blade, 1.05);
      rootGroup.add(blade);
    }
  }

  // Spinning Twin-Arm Lawn Sprinkler at (18, 0..22, 18)
  const hubGeo = new THREE.CylinderGeometry(11, 13, 14, 16);
  const armGeo = new THREE.CylinderGeometry(2.2, 2.2, 28, 10);
  armGeo.rotateX(Math.PI / 2);
  const sprayGeo = new THREE.ConeGeometry(28, 118, 12, 1, true);
  sprayGeo.rotateX(Math.PI / 2);
  sprayGeo.translate(0, 0, -68);
  const sprayMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  disposables.push(hubGeo, armGeo, sprayGeo, sprayMat);

  const sprinklerHub = new THREE.Mesh(hubGeo, redMat);
  sprinklerHub.position.set(18, 7, 18);
  addCartoonOutline(sprinklerHub, 1.05);
  cameraColliders.push(sprinklerHub);
  rootGroup.add(sprinklerHub);

  const sprinklerRotor = new THREE.Group();
  sprinklerRotor.position.set(18, 20, 18);
  const armMesh = new THREE.Mesh(armGeo, yellowMat);
  addCartoonOutline(armMesh, 1.06);
  const spray1 = new THREE.Mesh(sprayGeo, sprayMat);
  const spray2 = new THREE.Mesh(sprayGeo, sprayMat);
  spray2.rotation.y = Math.PI;
  sprinklerRotor.add(armMesh, spray1, spray2);
  rootGroup.add(sprinklerRotor);

  // Destructible backyard props
  // 1. Sandcastle (-152..-120, 10..48, 84..116)
  const castleGroup = new THREE.Group();
  const cBase = addStaticBox(-152, 10, 84, -120, 32, 116, sandMat, true, false);
  const cTower = addStaticBox(-144, 32, 92, -128, 48, 108, sandMat, true, false);
  const flagPoleGeo = new THREE.CylinderGeometry(0.8, 0.8, 14, 6);
  const flagGeo = new THREE.BoxGeometry(8, 5, 1);
  disposables.push(flagPoleGeo, flagGeo);
  const flagPole = new THREE.Mesh(flagPoleGeo, whiteFenceMat);
  flagPole.position.set(-136, 54, 100);
  const flag = new THREE.Mesh(flagGeo, redMat);
  flag.position.set(-132, 58, 100);
  castleGroup.add(cBase, cTower, flagPole, flag);
  rootGroup.add(castleGroup);
  destructibleGroups.set('sandcastle', castleGroup);

  // 2. Garden Gnome (-36, 0..44, -128)
  const gnomeGroup = new THREE.Group();
  const gnomeCoatGeo = new THREE.CylinderGeometry(9, 12, 22, 12);
  const gnomeHeadGeo = new THREE.SphereGeometry(8, 12, 10);
  const gnomeHatGeo = new THREE.ConeGeometry(9.5, 18, 12);
  const peachMat = createCelMaterial(0xfed7aa);
  disposables.push(gnomeCoatGeo, gnomeHeadGeo, gnomeHatGeo, peachMat);
  const gnomeCoat = new THREE.Mesh(gnomeCoatGeo, blueMat);
  gnomeCoat.position.set(-36, 11, -128);
  addCartoonOutline(gnomeCoat, 1.05);
  const gnomeHead = new THREE.Mesh(gnomeHeadGeo, peachMat);
  gnomeHead.position.set(-36, 26, -128);
  addCartoonOutline(gnomeHead, 1.05);
  const gnomeHat = new THREE.Mesh(gnomeHatGeo, redMat);
  gnomeHat.position.set(-36, 39, -128);
  addCartoonOutline(gnomeHat, 1.05);
  gnomeGroup.add(gnomeCoat, gnomeHead, gnomeHat);
  rootGroup.add(gnomeGroup);
  destructibleGroups.set('garden_gnome', gnomeGroup);

  // 3. Breakable Flower Pot (112, 0..40, 118)
  const breakPotGroup = new THREE.Group();
  const bPotGeo = new THREE.CylinderGeometry(14, 10, 32, 14);
  const bLeafGeo = new THREE.SphereGeometry(12, 10, 8);
  disposables.push(bPotGeo, bLeafGeo);
  const bPot = new THREE.Mesh(bPotGeo, terracottaMat);
  bPot.position.set(112, 16, 118);
  addCartoonOutline(bPot, 1.05);
  const bLeaf = new THREE.Mesh(bLeafGeo, stemMat);
  bLeaf.position.set(112, 36, 118);
  addCartoonOutline(bLeaf, 1.05);
  breakPotGroup.add(bPot, bLeaf);
  rootGroup.add(breakPotGroup);
  destructibleGroups.set('flower_pot_break', breakPotGroup);

  // 4. Picnic Juice Box (-42..-20, 0..34, 116..134)
  const juiceGroup = new THREE.Group();
  const jBody = addStaticBox(-42, 0, 116, -20, 34, 134, orangeMat, true, false);
  const jStripe = addStaticBox(-42.3, 14, 115.7, -19.7, 23, 134.3, yellowMat, false, false);
  juiceGroup.add(jBody, jStripe);
  rootGroup.add(juiceGroup);
  destructibleGroups.set('picnic_juice_box', juiceGroup);

  // Power-up spot rings
  const zoneRingGeo = new THREE.TorusGeometry(9, 0.9, 8, 24);
  zoneRingGeo.rotateX(Math.PI / 2);
  const zoneRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.55,
  });
  disposables.push(zoneRingGeo, zoneRingMat);
  for (const sp of GARDEN_MAP_DESIGN.powerUpSpots) {
    const ring = new THREE.Mesh(zoneRingGeo, zoneRingMat);
    ring.position.set(sp.x, sp.y - 5, sp.z);
    rootGroup.add(ring);
    powerUpZoneRings.push(ring);
  }

  // Lawn grass waving in the wind (kept out of the sandbox, pots, doghouse and stepping stones)
  const roomFx = [
    addGrassField(rootGroup, {
      count: opts.profile?.grassBlades ?? 5000,
      area: { minX: -240, maxX: 240, minZ: -182, maxZ: 182 },
      avoid: [
        ...footprintsOf(GARDEN_MAP_DESIGN.colliders),
        ...[[-48, -22], [-18, -8], [-55, 22], [-75, 44], [62, -40], [98, -12], [122, 26]].map(([x, z]) => ({ x, z, r: 19 })),
      ],
      minHeight: 5,
      maxHeight: 11,
      receiveShadow: opts.profile?.quality === 'high',
    }),
  ];
  disposables.push(...roomFx);

  return {
    cameraColliders,
    destructibleGroups,
    powerUpZoneRings,
    updateAnimations: (elapsedTime: number) => {
      for (const f of roomFx) f.update(elapsedTime);
      const wz = GARDEN_MAP_DESIGN.windZones[0];
      if (wz) {
        sprinklerRotor.rotation.y = getFanYawAtTime(
          wz.baseYaw,
          wz.sweepAmplitude,
          wz.sweepSpeed,
          elapsedTime,
          wz.continuousSpin
        );
      }
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
