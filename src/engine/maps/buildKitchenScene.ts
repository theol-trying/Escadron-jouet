import * as THREE from 'three';
import { getHingeDoorAngleAtTime } from '../../../shared/flightPhysics';
import { ARENA_SCALE } from '../../../shared/constants';
import { KITCHEN_MAP_DESIGN } from '../../../shared/maps/kitchen';
import type { MapSceneHandles } from './types';
import { createTileMaps } from '../richTextures';
import type { SceneBuildOptions } from '../sceneSetup';
import { addCornerShading, addSunShafts } from './sunShafts';
import {
  addCartoonOutline,
  createCelMaterial,
  createGraniteTexture,
  createWoodGrainTexture,
} from '../toonMaterials';

export function buildKitchenScene(scene: THREE.Scene, maxAniso: number, opts: SceneBuildOptions = {}): MapSceneHandles {
  const disposables: Array<{ dispose: () => void }> = [];
  const cameraColliders: THREE.Object3D[] = [];
  const destructibleGroups = new Map<string, THREE.Object3D>();
  const powerUpZoneRings: THREE.Mesh[] = [];
  const rootGroup = new THREE.Group();
  // Built in design units; the whole room is enlarged by ARENA_SCALE (planes keep their size)
  rootGroup.scale.setScalar(ARENA_SCALE);
  scene.add(rootGroup);

  // Glazed tiles on the floor and the backsplash (grout in relief in high quality)
  const detailed = opts.profile?.detailedMaterials ?? false;
  const floorMaps = createTileMaps(maxAniso, '#FFFBEB', '#FDBA74', 10, 8, detailed);
  const backsplashMaps = createTileMaps(maxAniso, '#FFFFFF', '#BAE6FD', 14, 4, detailed);
  const floorTex = floorMaps.map;
  const backsplashTex = backsplashMaps.map;
  for (const b of [floorMaps.bump, backsplashMaps.bump]) if (b) disposables.push(b);
  const graniteTex = createGraniteTexture(maxAniso);
  const woodTex = createWoodGrainTexture(maxAniso);
  disposables.push(floorTex, backsplashTex, graniteTex, woodTex);

  const floorMat = createCelMaterial(0xffffff, { map: floorTex });
  const wallMat = createCelMaterial(0xfff7e6);
  const backsplashMat = createCelMaterial(0xffffff, { map: backsplashTex });
  if (floorMaps.bump && backsplashMaps.bump) {
    floorMat.bumpMap = floorMaps.bump;
    floorMat.bumpScale = 1.5;
    backsplashMat.bumpMap = backsplashMaps.bump;
    backsplashMat.bumpScale = 1.5;
  }
  const graniteMat = createCelMaterial(0xffffff, { map: graniteTex });
  const cabinetMat = createCelMaterial(0x38bdf8);
  const cabinetCreamMat = createCelMaterial(0xfef3c7);
  const woodMat = createCelMaterial(0xd99b58, { map: woodTex });
  const chromeMat = createCelMaterial(0xe2e8f0);
  const darkMetalMat = createCelMaterial(0x1e293b);
  const copperMat = createCelMaterial(0xd97706);
  const whiteMat = createCelMaterial(0xf8fafc);
  const redMat = createCelMaterial(0xef4444);
  const yellowMat = createCelMaterial(0xfacc15);
  const greenMat = createCelMaterial(0x22c55e);

  disposables.push(
    floorMat,
    wallMat,
    backsplashMat,
    graniteMat,
    cabinetMat,
    cabinetCreamMat,
    woodMat,
    chromeMat,
    darkMetalMat,
    copperMat,
    whiteMat,
    redMat,
    yellowMat,
    greenMat
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

  // Floor
  const floorGeo = new THREE.PlaneGeometry(540, 420);
  floorGeo.rotateX(-Math.PI / 2);
  disposables.push(floorGeo);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  rootGroup.add(floor);

  // Walls + tiled backsplash behind counter
  const backWallGeo = new THREE.PlaneGeometry(520, 250);
  const sideWallGeo = new THREE.PlaneGeometry(400, 250);
  sideWallGeo.rotateY(-Math.PI / 2);
  const ceilingGeo = new THREE.PlaneGeometry(540, 420);
  ceilingGeo.rotateX(Math.PI / 2);
  disposables.push(backWallGeo, sideWallGeo, ceilingGeo);

  const backWall = new THREE.Mesh(backWallGeo, wallMat);
  backWall.position.set(0, 125, -186);
  rootGroup.add(backWall);

  const backsplashGeo = new THREE.PlaneGeometry(345, 76);
  disposables.push(backsplashGeo);
  const backsplash = new THREE.Mesh(backsplashGeo, backsplashMat);
  backsplash.position.set(-55, 126, -184.5);
  rootGroup.add(backsplash);

  const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
  rightWall.position.set(252, 125, 0);
  rootGroup.add(rightWall);

  const frontWall = new THREE.Mesh(backWallGeo, wallMat);
  frontWall.rotation.y = Math.PI;
  frontWall.position.set(0, 125, 186);
  rootGroup.add(frontWall);

  const ceiling = new THREE.Mesh(ceilingGeo, whiteMat);
  ceiling.position.set(0, 236, 0);
  rootGroup.add(ceiling);

  // Decorative sky-blue wainscoting & upper cabinets on walls
  addStaticBox(249, 0, -184, 252, 86, 184, cabinetCreamMat, false, false);
  addStaticBox(248.5, 86, -184, 252, 91, 184, woodMat, false, false);
  addStaticBox(-250, 0, 183, 250, 86, 186, cabinetCreamMat, false, false);
  addStaticBox(-250, 86, 182.5, 250, 91, 186, woodMat, false, false);
  // Wall clock on right wall (+X) & upper cabinets on back wall (-Z)
  addStaticBox(-215, 165, -185, -110, 225, -155, cabinetCreamMat, true, false);
  addStaticBox(5, 165, -185, 105, 225, -155, cabinetCreamMat, true, false);
  const clockGeo = new THREE.CylinderGeometry(18, 18, 4, 20);
  clockGeo.rotateZ(Math.PI / 2);
  disposables.push(clockGeo);
  const clockMesh = new THREE.Mesh(clockGeo, redMat);
  clockMesh.position.set(250, 155, 0);
  addCartoonOutline(clockMesh, 1.04);
  rootGroup.add(clockMesh);

  // Left wall with sunny window
  addStaticBox(-256, 0, -186, -248, 84, 186, wallMat, false, false);
  addStaticBox(-256, 188, -186, -248, 240, 186, wallMat, false, false);
  addStaticBox(-256, 84, -186, -248, 188, -70, wallMat, false, false);
  addStaticBox(-256, 84, 95, -248, 188, 186, wallMat, false, false);
  addStaticBox(-248, 84, -70, -214, 94, 95, whiteMat);

  const skyGeo = new THREE.PlaneGeometry(165, 104);
  skyGeo.rotateY(Math.PI / 2);
  const skyMat = new THREE.MeshBasicMaterial({ color: 0xbfe9ff });
  disposables.push(skyGeo, skyMat);
  const skyPane = new THREE.Mesh(skyGeo, skyMat);
  skyPane.position.set(-257, 136, 12.5);
  rootGroup.add(skyPane);

  // Main back counter + granite top + cabinet doors
  addStaticBox(-225, 0, -182, 110, 81, -104, cabinetMat);
  addStaticBox(-227, 81, -184, 112, 88, -100, graniteMat);
  for (let x = -210; x <= 75; x += 48) {
    addStaticBox(x, 8, -104.5, x + 38, 72, -101.5, cabinetCreamMat, true, false);
  }

  // Central Kitchen Island with fly-through tunnel (X: -56..56, Y: 0..74)
  addStaticBox(-90, 0, 14, -56, 74, 74, cabinetMat);
  addStaticBox(56, 0, 14, 90, 74, 74, cabinetMat);
  addStaticBox(-94, 74, 10, 94, 84, 78, graniteMat);

  // Sink basin recess visual & tall arched chrome faucet
  addStaticBox(-122, 87.5, -162, -68, 89, -114, chromeMat, true, false);
  const faucetVertGeo = new THREE.CylinderGeometry(3.2, 3.5, 56, 12);
  const faucetHorizGeo = new THREE.CylinderGeometry(3.0, 3.0, 32, 12);
  faucetHorizGeo.rotateX(Math.PI / 2);
  const faucetTipGeo = new THREE.CylinderGeometry(2.6, 2.8, 16, 12);
  disposables.push(faucetVertGeo, faucetHorizGeo, faucetTipGeo);

  const fPost = new THREE.Mesh(faucetVertGeo, chromeMat);
  fPost.position.set(-95, 115, -158);
  addCartoonOutline(fPost, 1.07);
  cameraColliders.push(fPost);
  rootGroup.add(fPost);

  const fArch = new THREE.Mesh(faucetHorizGeo, chromeMat);
  fArch.position.set(-95, 142, -143);
  addCartoonOutline(fArch, 1.07);
  cameraColliders.push(fArch);
  rootGroup.add(fArch);

  const fNozzle = new THREE.Mesh(faucetTipGeo, chromeMat);
  fNozzle.position.set(-95, 135, -128);
  addCartoonOutline(fNozzle, 1.07);
  rootGroup.add(fNozzle);

  // Dish rack + colorful plates (-185..-135, 88..118, -162..-118)
  addStaticBox(-185, 88, -162, -135, 93, -118, whiteMat);
  const plateGeo = new THREE.CylinderGeometry(11, 11, 2.2, 16);
  plateGeo.rotateZ(Math.PI / 2);
  disposables.push(plateGeo);
  const plateMats = [whiteMat, yellowMat, cabinetMat, greenMat, redMat];
  for (let i = 0; i < 5; i++) {
    const plate = new THREE.Mesh(plateGeo, plateMats[i % plateMats.length]);
    plate.position.set(-178 + i * 9, 104, -140);
    addCartoonOutline(plate, 1.05);
    cameraColliders.push(plate);
    rootGroup.add(plate);
  }

  // Stove burner base (-24..40, 88..95, -168..-116) + glowing coils + thermal updraft
  addStaticBox(-24, 88, -168, 40, 95, -116, darkMetalMat);
  const coilGeo = new THREE.TorusGeometry(9, 1.4, 8, 20);
  coilGeo.rotateX(Math.PI / 2);
  const coilMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
  disposables.push(coilGeo, coilMat);
  for (const [bx, bz] of [
    [-6, -152],
    [22, -152],
    [-6, -130],
    [22, -130],
  ]) {
    const coil = new THREE.Mesh(coilGeo, coilMat);
    coil.position.set(bx, 95.4, bz);
    rootGroup.add(coil);
  }

  // Updraft translucent shimmer column + rising thermal particles
  const updraftGeo = new THREE.CylinderGeometry(28, 34, 116, 16, 1, true);
  const updraftMat = new THREE.MeshBasicMaterial({
    color: 0xfdba74,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  disposables.push(updraftGeo, updraftMat);
  const updraftCol = new THREE.Mesh(updraftGeo, updraftMat);
  updraftCol.position.set(8, 152, -142);
  rootGroup.add(updraftCol);

  const heatCount = 60;
  const heatPos = new Float32Array(heatCount * 3);
  for (let i = 0; i < heatCount; i++) {
    const angle = i * 1.3;
    const rad = (i % 5) * 6;
    heatPos[i * 3] = 8 + Math.cos(angle) * rad;
    heatPos[i * 3 + 1] = 96 + (i / heatCount) * 116;
    heatPos[i * 3 + 2] = -142 + Math.sin(angle) * rad;
  }
  const heatGeo = new THREE.BufferGeometry();
  heatGeo.setAttribute('position', new THREE.BufferAttribute(heatPos, 3));
  const heatMat = new THREE.PointsMaterial({
    color: 0xfb923c,
    size: 3.0,
    transparent: true,
    opacity: 0.75,
  });
  disposables.push(heatGeo, heatMat);
  const heatParticles = new THREE.Points(heatGeo, heatMat);
  rootGroup.add(heatParticles);

  // Giant Fridge + animated hinged door
  const fridgeMat = createCelMaterial(0xe0f2fe);
  const fridgeInsideMat = createCelMaterial(0xbae6fd);
  disposables.push(fridgeMat, fridgeInsideMat);
  addStaticBox(158, 0, -178, 244, 202, -92, fridgeMat);
  // Cold blue interior backing visible when door opens
  addStaticBox(166, 16, -93, 234, 188, -90.5, fridgeInsideMat, false, false);

  const fridgeDoorPivot = new THREE.Group();
  fridgeDoorPivot.position.set(158, 0, -90);
  rootGroup.add(fridgeDoorPivot);

  const doorGeo = new THREE.BoxGeometry(82, 194, 8);
  const handleGeo = new THREE.BoxGeometry(4, 48, 6);
  disposables.push(doorGeo, handleGeo);
  const doorMesh = new THREE.Mesh(doorGeo, whiteMat);
  doorMesh.position.set(41, 101, 0);
  doorMesh.castShadow = true;
  doorMesh.receiveShadow = true;
  addCartoonOutline(doorMesh, 1.02);
  cameraColliders.push(doorMesh);
  fridgeDoorPivot.add(doorMesh);

  const doorHandle = new THREE.Mesh(handleGeo, chromeMat);
  doorHandle.position.set(74, 118, 6.5);
  addCartoonOutline(doorHandle, 1.05);
  fridgeDoorPivot.add(doorHandle);

  // Overhead hanging pan rack (-130..45, 194..200, -48..-40) + 3 pans
  addStaticBox(-130, 194, -48, 45, 200, -40, darkMetalMat);
  const panHandleGeo = new THREE.CylinderGeometry(2.0, 2.0, 22, 8);
  const panDiscGeo = new THREE.CylinderGeometry(14, 13, 4.5, 18);
  panDiscGeo.rotateX(Math.PI / 2);
  disposables.push(panHandleGeo, panDiscGeo);
  const panPositions: Array<[number, number, THREE.Material]> = [
    [-105, 174, copperMat],
    [-42, 170, darkMetalMat],
    [20, 176, copperMat],
  ];
  for (const [px, py, pMat] of panPositions) {
    const stem = new THREE.Mesh(panHandleGeo, darkMetalMat);
    stem.position.set(px, py + 14, -44);
    addCartoonOutline(stem, 1.06);
    rootGroup.add(stem);

    const disc = new THREE.Mesh(panDiscGeo, pMat);
    disc.position.set(px, py - 2, -44);
    disc.castShadow = true;
    addCartoonOutline(disc, 1.04);
    cameraColliders.push(disc);
    rootGroup.add(disc);
  }

  // Deadly Spinning Blender on Island at (44, 84, 44)
  const blenderBaseGeo = new THREE.CylinderGeometry(13, 15, 24, 16);
  const blenderJarGeo = new THREE.CylinderGeometry(15, 12, 38, 16, 1, true);
  const blenderLidGeo = new THREE.CylinderGeometry(15.5, 15.5, 4, 16);
  const bladeGeo = new THREE.BoxGeometry(24, 2.5, 4.5);
  const dangerRingGeo = new THREE.TorusGeometry(17, 1.2, 8, 24);
  dangerRingGeo.rotateX(Math.PI / 2);

  const glassMat = new THREE.MeshBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const dangerMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  disposables.push(
    blenderBaseGeo,
    blenderJarGeo,
    blenderLidGeo,
    bladeGeo,
    dangerRingGeo,
    glassMat,
    dangerMat
  );

  const blenderBase = new THREE.Mesh(blenderBaseGeo, redMat);
  blenderBase.position.set(44, 96, 44);
  addCartoonOutline(blenderBase, 1.04);
  cameraColliders.push(blenderBase);
  rootGroup.add(blenderBase);

  const blenderJar = new THREE.Mesh(blenderJarGeo, glassMat);
  blenderJar.position.set(44, 126, 44);
  rootGroup.add(blenderJar);

  const blenderLid = new THREE.Mesh(blenderLidGeo, darkMetalMat);
  blenderLid.position.set(44, 146, 44);
  addCartoonOutline(blenderLid, 1.05);
  rootGroup.add(blenderLid);

  const blenderBlades = new THREE.Group();
  blenderBlades.position.set(44, 114, 44);
  const bladeA = new THREE.Mesh(bladeGeo, chromeMat);
  const bladeB = new THREE.Mesh(bladeGeo, chromeMat);
  bladeB.rotation.y = Math.PI / 2;
  blenderBlades.add(bladeA, bladeB);
  rootGroup.add(blenderBlades);

  const dangerRing = new THREE.Mesh(dangerRingGeo, dangerMat);
  dangerRing.position.set(44, 112, 44);
  rootGroup.add(dangerRing);

  // Destructible props
  const addBoxProp = (
    id: string,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    bodyMat: THREE.Material,
    bandMat: THREE.Material
  ) => {
    const grp = new THREE.Group();
    const m = addStaticBox(minX, minY, minZ, maxX, maxY, maxZ, bodyMat, true, false);
    const band = addStaticBox(
      minX - 0.3,
      minY + (maxY - minY) * 0.45,
      minZ - 0.3,
      maxX + 0.3,
      minY + (maxY - minY) * 0.72,
      maxZ + 0.3,
      bandMat,
      false,
      false
    );
    grp.add(m, band);
    rootGroup.add(grp);
    destructibleGroups.set(id, grp);
  };

  addBoxProp('cereal_box_1', -74, 84, 28, -46, 124, 52, yellowMat, redMat);
  addBoxProp('cereal_box_2', -212, 88, -158, -184, 128, -132, cabinetMat, yellowMat);
  addBoxProp('milk_carton', -240, 94, 15, -218, 124, 37, whiteMat, greenMat);

  // Interactive Toaster destructible (68..96, 88..112, -156..-130) with toast sticking out
  const toasterGroup = new THREE.Group();
  const toasterBody = addStaticBox(68, 88, -156, 96, 108, -130, chromeMat, true, false);
  const toastMat = createCelMaterial(0xd97706);
  disposables.push(toastMat);
  const toast1 = addStaticBox(73, 108, -148, 91, 114, -144, toastMat, true, false);
  const toast2 = addStaticBox(73, 108, -140, 91, 114, -136, toastMat, true, false);
  toasterGroup.add(toasterBody, toast1, toast2);
  rootGroup.add(toasterGroup);
  destructibleGroups.set('toaster', toasterGroup);

  // Spice Jar destructible (-118, 98, 44)
  const jarGroup = new THREE.Group();
  const jarGeo = new THREE.CylinderGeometry(10, 10, 22, 14);
  const jarCapGeo = new THREE.CylinderGeometry(9, 9, 4, 14);
  disposables.push(jarGeo, jarCapGeo);
  const jarMesh = new THREE.Mesh(jarGeo, redMat);
  jarMesh.position.set(-118, 95, 44);
  addCartoonOutline(jarMesh, 1.05);
  const jarCap = new THREE.Mesh(jarCapGeo, woodMat);
  jarCap.position.set(-118, 108, 44);
  jarGroup.add(jarMesh, jarCap);
  rootGroup.add(jarGroup);
  destructibleGroups.set('spice_jar', jarGroup);

  // Power-up spot rings
  const zoneRingGeo = new THREE.TorusGeometry(9, 0.9, 8, 24);
  zoneRingGeo.rotateX(Math.PI / 2);
  const zoneRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.55,
  });
  disposables.push(zoneRingGeo, zoneRingMat);
  for (const sp of KITCHEN_MAP_DESIGN.powerUpSpots) {
    const ring = new THREE.Mesh(zoneRingGeo, zoneRingMat);
    ring.position.set(sp.x, sp.y - 5, sp.z);
    rootGroup.add(ring);
    powerUpZoneRings.push(ring);
  }

  // Sun shafts through the window (with dust in the light) and soft shading in the corners
  const roomFx = [
    addSunShafts(
      rootGroup,
      [{ center: [-247, 141, 12.5], right: [0, 0, 1], up: [0, 1, 0], width: 165, height: 94, panes: [2, 1], dir: [0.66, -0.72, -0.18], length: 290, floorY: 0, strength: 0.15 }],
      opts.profile
    ),
    addCornerShading(rootGroup, { minX: -248, maxX: 249, minZ: -184, maxZ: 183, height: 236, ceiling: true }),
  ];
  disposables.push(...roomFx);

  return {
    cameraColliders,
    destructibleGroups,
    powerUpZoneRings,
    updateAnimations: (elapsedTime: number, dt: number) => {
      for (const f of roomFx) f.update(elapsedTime);
      // Animated swinging fridge door synced with server elapsedTime
      fridgeDoorPivot.rotation.y = getHingeDoorAngleAtTime(-1.18, 10, elapsedTime);

      // Spinning blender danger blades
      blenderBlades.rotation.y += dt * 22;
      const dangerPulse = 1 + Math.sin(elapsedTime * 8) * 0.1;
      dangerRing.scale.set(dangerPulse, 1, dangerPulse);

      // Rising heat particles over the stove burner
      const posAttr = heatGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < heatCount; i++) {
        let y = posAttr.getY(i) + dt * 48;
        if (y > 212) y = 96;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;

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
