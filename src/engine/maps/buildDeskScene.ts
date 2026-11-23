import * as THREE from 'three';
import { DESK_MAP } from '../../../shared/maps/desk';
import {
  addCartoonOutline,
  createCarpetTexture,
  createCelMaterial,
  createMonitorScreenTexture,
  createWallpaperTexture,
  createWoodGrainTexture,
} from '../toonMaterials';

export interface DeskSceneHandles {
  fanHead: THREE.Group;
  fanBlades: THREE.Group;
  dustMotes: THREE.Points;
  cameraColliders: THREE.Object3D[];
  dispose: () => void;
}

export function buildDeskScene(scene: THREE.Scene, maxAniso: number): DeskSceneHandles {
  const disposables: Array<{ dispose: () => void }> = [];
  const cameraColliders: THREE.Object3D[] = [];

  const woodTex = createWoodGrainTexture(maxAniso);
  const carpetTex = createCarpetTexture(maxAniso);
  const wallTex = createWallpaperTexture(maxAniso);
  const monitorTex = createMonitorScreenTexture(maxAniso);
  disposables.push(woodTex, carpetTex, wallTex, monitorTex);

  const woodMat = createCelMaterial(0xd99b58, { map: woodTex });
  const darkWoodMat = createCelMaterial(0xa4662c);
  const carpetMat = createCelMaterial(0x3b82f6, { map: carpetTex });
  const wallMat = createCelMaterial(0xfff5d6, { map: wallTex });
  const drawerInsideMat = createCelMaterial(0xe7b97e);
  const plasticDarkMat = createCelMaterial(0x1e293b);
  const keycapWhiteMat = createCelMaterial(0xf8fafc);
  const monitorFrameMat = createCelMaterial(0x334155);
  const monitorScreenMat = new THREE.MeshBasicMaterial({ map: monitorTex });
  disposables.push(
    woodMat,
    darkWoodMat,
    carpetMat,
    wallMat,
    drawerInsideMat,
    plasticDarkMat,
    keycapWhiteMat,
    monitorFrameMat,
    monitorScreenMat
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
    const w = maxX - minX;
    const h = maxY - minY;
    const d = maxZ - minZ;
    const geo = new THREE.BoxGeometry(w, h, d);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (outline) addCartoonOutline(mesh, 1.025);
    if (blocksCam) cameraColliders.push(mesh);
    scene.add(mesh);
    return mesh;
  };

  // Room floor (hardwood perimeter + giant central woven rug)
  const floorGeo = new THREE.PlaneGeometry(540, 420);
  floorGeo.rotateX(-Math.PI / 2);
  disposables.push(floorGeo);
  const floorMesh = new THREE.Mesh(floorGeo, darkWoodMat);
  floorMesh.position.y = 0;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const rugGeo = new THREE.BoxGeometry(360, 1.2, 270);
  disposables.push(rugGeo);
  const rugMesh = new THREE.Mesh(rugGeo, carpetMat);
  rugMesh.position.set(10, 0.6, 25);
  rugMesh.receiveShadow = true;
  addCartoonOutline(rugMesh, 1.01);
  scene.add(rugMesh);

  // Room walls (back wall -Z, left window wall -X, right wall +X, front wall +Z)
  const backWallGeo = new THREE.PlaneGeometry(520, 250);
  disposables.push(backWallGeo);
  const backWall = new THREE.Mesh(backWallGeo, wallMat);
  backWall.position.set(0, 125, -186);
  backWall.receiveShadow = true;
  scene.add(backWall);

  const rightWallGeo = new THREE.PlaneGeometry(400, 250);
  rightWallGeo.rotateY(-Math.PI / 2);
  disposables.push(rightWallGeo);
  const rightWall = new THREE.Mesh(rightWallGeo, wallMat);
  rightWall.position.set(252, 125, 0);
  scene.add(rightWall);

  const frontWall = new THREE.Mesh(backWallGeo, wallMat);
  frontWall.rotation.y = Math.PI;
  frontWall.position.set(0, 125, 186);
  scene.add(frontWall);

  // Warm bedroom ceiling + central cartoon ceiling lamp
  const ceilingGeo = new THREE.PlaneGeometry(540, 420);
  ceilingGeo.rotateX(Math.PI / 2);
  const ceilingMat = createCelMaterial(0xfef9e7);
  const lampShadeMat = createCelMaterial(0xfbbf24, { side: THREE.DoubleSide });
  const lampShadeGeo = new THREE.ConeGeometry(22, 12, 18, 1, true);
  const lampCordGeo = new THREE.CylinderGeometry(0.9, 0.9, 10, 8);
  const lampCordMat = createCelMaterial(0x1e293b);
  const lampBulbGeo = new THREE.SphereGeometry(5, 12, 10);
  const lampBulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  disposables.push(
    ceilingGeo,
    ceilingMat,
    lampShadeMat,
    lampShadeGeo,
    lampCordGeo,
    lampCordMat,
    lampBulbGeo,
    lampBulbMat
  );

  const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
  ceiling.position.set(0, 236, 0);
  scene.add(ceiling);

  const lampCord = new THREE.Mesh(lampCordGeo, lampCordMat);
  lampCord.position.set(0, 231, 0);
  scene.add(lampCord);

  const lampShade = new THREE.Mesh(lampShadeGeo, lampShadeMat);
  lampShade.position.set(0, 224, 0);
  scene.add(lampShade);

  const lampBulb = new THREE.Mesh(lampBulbGeo, lampBulbMat);
  lampBulb.position.set(0, 221, 0);
  scene.add(lampBulb);

  // Left wall (-X) with sunlit window opening
  const leftWallMat = wallMat;
  addStaticBox(-256, 0, -186, -248, 66, 186, leftWallMat, false, false);
  addStaticBox(-256, 186, -186, -248, 240, 186, leftWallMat, false, false);
  addStaticBox(-256, 66, -186, -248, 186, -108, leftWallMat, false, false);
  addStaticBox(-256, 66, 108, -248, 186, 186, leftWallMat, false, false);

  // Sunny window backdrop & sill
  const skyPaneGeo = new THREE.PlaneGeometry(216, 120);
  skyPaneGeo.rotateY(Math.PI / 2);
  const skyPaneMat = new THREE.MeshBasicMaterial({ color: 0xbfe9ff });
  disposables.push(skyPaneGeo, skyPaneMat);
  const skyPane = new THREE.Mesh(skyPaneGeo, skyPaneMat);
  skyPane.position.set(-258, 126, 0);
  scene.add(skyPane);

  // Window frame crossbars & sill
  const whiteTrimMat = createCelMaterial(0xffffff);
  disposables.push(whiteTrimMat);
  addStaticBox(-248, 66, -110, -220, 74, 110, whiteTrimMat);
  addStaticBox(-252, 124, -108, -246, 128, 108, whiteTrimMat, false, false);
  addStaticBox(-252, 68, -2, -246, 186, 2, whiteTrimMat, false, false);

  // Desk tabletop & pedestals (exact DESK_MAP colliders!)
  addStaticBox(-195, 70, -120, 145, 76, 35, woodMat);
  addStaticBox(-190, 0, -115, -135, 70, 28, darkWoodMat);
  addStaticBox(45, 0, -115, 140, 40, 28, darkWoodMat);
  addStaticBox(45, 40, -115, 53, 70, 28, darkWoodMat);
  addStaticBox(132, 40, -115, 140, 70, 28, darkWoodMat);

  // Open Drawer Tunnel (+Z side of desk)
  addStaticBox(54, 42, 28, 130, 46, 98, drawerInsideMat);
  addStaticBox(54, 46, 28, 59, 64, 98, woodMat);
  addStaticBox(125, 46, 28, 130, 64, 98, woodMat);
  addStaticBox(54, 46, 93, 130, 66, 98, woodMat);
  // Brass drawer handle
  const handleMat = createCelMaterial(0xfbbf24);
  disposables.push(handleMat);
  addStaticBox(80, 54, 98, 104, 59, 102, handleMat, true, false);

  // Giant Monitor Wall (gap underneath Y=76..92!)
  addStaticBox(-65, 76, -98, -25, 80, -76, monitorFrameMat);
  addStaticBox(-51, 80, -94, -39, 94, -84, monitorFrameMat);
  addStaticBox(-108, 92, -92, 18, 160, -82, monitorFrameMat);
  const screenGeo = new THREE.PlaneGeometry(118, 60);
  disposables.push(screenGeo);
  const screenMesh = new THREE.Mesh(screenGeo, monitorScreenMat);
  screenMesh.position.set(-45, 126, -81.6);
  scene.add(screenMesh);

  // Giant Mechanical Keyboard Canyon + instanced colorful keycaps!
  addStaticBox(-105, 76, -46, -5, 83, -10, plasticDarkMat);
  const keyGeo = new THREE.BoxGeometry(5.8, 2.8, 5.8);
  const keyMat = createCelMaterial(0xffffff);
  disposables.push(keyGeo, keyMat);
  const keyRows = 4;
  const keyCols = 13;
  const keycaps = new THREE.InstancedMesh(keyGeo, keyMat, keyRows * keyCols);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let kIdx = 0;
  for (let r = 0; r < keyRows; r++) {
    for (let c = 0; c < keyCols; c++) {
      dummy.position.set(-100 + c * 7.4, 84.4, -41 + r * 8.2);
      dummy.updateMatrix();
      keycaps.setMatrixAt(kIdx, dummy.matrix);
      // Highlight WASD/ZQSD & Space & Esc in playful toy colors!
      if (r === 0 && c === 0) color.setHex(0xef4444);
      else if ((r === 1 && c === 2) || (r === 2 && c >= 1 && c <= 3)) color.setHex(0x38bdf8);
      else if (r === 3 && c >= 4 && c <= 8) color.setHex(0xfacc15);
      else color.setHex(0xf8fafc);
      keycaps.setColorAt(kIdx, color);
      kIdx++;
    }
  }
  keycaps.instanceMatrix.needsUpdate = true;
  if (keycaps.instanceColor) keycaps.instanceColor.needsUpdate = true;
  keycaps.computeBoundingSphere();
  scene.add(keycaps);

  // Giant Pencil Cup + Oversized Pencils
  const cupMat = createCelMaterial(0x0ea5e9);
  const pencilYellowMat = createCelMaterial(0xfacc15);
  const pencilPinkMat = createCelMaterial(0xf472b6);
  const woodTipMat = createCelMaterial(0xfde68a);
  disposables.push(cupMat, pencilYellowMat, pencilPinkMat, woodTipMat);

  const cupGeo = new THREE.CylinderGeometry(10, 9.2, 26, 16);
  disposables.push(cupGeo);
  const cupMesh = new THREE.Mesh(cupGeo, cupMat);
  cupMesh.position.set(62, 89, -58);
  cupMesh.castShadow = true;
  addCartoonOutline(cupMesh, 1.04);
  cameraColliders.push(cupMesh);
  scene.add(cupMesh);

  const pencilShaftGeo = new THREE.CylinderGeometry(2.1, 2.1, 34, 8);
  const pencilTipGeo = new THREE.ConeGeometry(2.1, 5.5, 8);
  disposables.push(pencilShaftGeo, pencilTipGeo);

  const p1 = new THREE.Group();
  p1.position.set(57, 110, -55);
  p1.rotation.set(0.18, 0, 0.2);
  const p1Shaft = new THREE.Mesh(pencilShaftGeo, pencilYellowMat);
  addCartoonOutline(p1Shaft, 1.08);
  const p1Tip = new THREE.Mesh(pencilTipGeo, woodTipMat);
  p1Tip.position.y = 19.7;
  p1.add(p1Shaft, p1Tip);
  scene.add(p1);

  const p2 = new THREE.Group();
  p2.position.set(67, 109, -61);
  p2.rotation.set(-0.15, 0, -0.22);
  const p2Shaft = new THREE.Mesh(pencilShaftGeo, pencilPinkMat);
  addCartoonOutline(p2Shaft, 1.08);
  const p2Tip = new THREE.Mesh(pencilTipGeo, woodTipMat);
  p2Tip.position.y = 19.7;
  p2.add(p2Shaft, p2Tip);
  scene.add(p2);

  // Hardcover Book Stacks (desk + floor + shelf)
  const bookColors = [0xef4444, 0x22c55e, 0x3b82f6, 0xf59e0b, 0xa855f7, 0x14b8a6];
  const bookMats = bookColors.map((c) => createCelMaterial(c));
  const pagesMat = createCelMaterial(0xfef9c3);
  disposables.push(...bookMats, pagesMat);

  const addBook = (
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    matIdx: number
  ) => {
    addStaticBox(minX, minY, minZ, maxX, maxY, maxZ, bookMats[matIdx % bookMats.length]);
    // White page edge inset on +X face
    addStaticBox(
      maxX - 1.5,
      minY + 1.5,
      minZ + 1.5,
      maxX + 0.2,
      maxY - 1.5,
      maxZ - 1.5,
      pagesMat,
      false,
      false
    );
  };

  addBook(-172, 76, -72, -130, 92, -32, 0);
  addBook(-168, 92, -68, -134, 106, -36, 1);
  addBook(-164, 106, -64, -138, 118, -40, 2);

  addBook(-170, 0, 88, -120, 20, 132, 3);
  addBook(-164, 20, 92, -124, 38, 128, 4);
  addBook(-158, 38, 95, -128, 52, 125, 0);

  // Lego Towers & Archway with studs
  const legoRedMat = createCelMaterial(0xef4444);
  const legoYellowMat = createCelMaterial(0xfacc15);
  const legoBlueMat = createCelMaterial(0x2563eb);
  const legoGreenMat = createCelMaterial(0x16a34a);
  disposables.push(legoRedMat, legoYellowMat, legoBlueMat, legoGreenMat);

  // Desk Lego tower
  addStaticBox(86, 76, -68, 124, 96, -34, legoRedMat);
  addStaticBox(86, 96, -68, 124, 116, -34, legoYellowMat);
  addStaticBox(92, 116, -62, 118, 142, -40, legoBlueMat);

  // Floor Lego Archway (fly-through landmark!)
  addStaticBox(162, 0, 48, 184, 31, 76, legoGreenMat);
  addStaticBox(162, 31, 48, 184, 62, 76, legoYellowMat);
  addStaticBox(162, 0, 108, 184, 31, 136, legoBlueMat);
  addStaticBox(162, 31, 108, 184, 62, 136, legoRedMat);
  addStaticBox(162, 62, 48, 184, 82, 136, legoYellowMat);

  // Studs on Lego tops via InstancedMesh
  const studGeo = new THREE.CylinderGeometry(2.6, 2.6, 2.2, 10);
  disposables.push(studGeo);
  const studPositions: Array<[number, number, number, number]> = [
    [99, 143.1, -55, 0x2563eb],
    [111, 143.1, -55, 0x2563eb],
    [99, 143.1, -47, 0x2563eb],
    [111, 143.1, -47, 0x2563eb],
  ];
  for (let z = 55; z <= 130; z += 15) {
    studPositions.push([168, 83.1, z, 0xfacc15]);
    studPositions.push([178, 83.1, z, 0xfacc15]);
  }
  const studs = new THREE.InstancedMesh(studGeo, keyMat, studPositions.length);
  studPositions.forEach(([sx, sy, sz, hex], i) => {
    dummy.position.set(sx, sy, sz);
    dummy.updateMatrix();
    studs.setMatrixAt(i, dummy.matrix);
    studs.setColorAt(i, color.setHex(hex));
  });
  studs.instanceMatrix.needsUpdate = true;
  if (studs.instanceColor) studs.instanceColor.needsUpdate = true;
  studs.computeBoundingSphere();
  scene.add(studs);

  // Wall Shelf & Globe & Shelf Books
  addStaticBox(-175, 146, -182, 145, 154, -138, woodMat);
  addBook(70, 154, -176, 125, 182, -144, 5);

  const globeGeo = new THREE.SphereGeometry(14, 16, 12);
  const globeMat = createCelMaterial(0x38bdf8);
  disposables.push(globeGeo, globeMat);
  const globe = new THREE.Mesh(globeGeo, globeMat);
  globe.position.set(-120, 168, -158);
  globe.castShadow = true;
  addCartoonOutline(globe, 1.04);
  cameraColliders.push(globe);
  scene.add(globe);

  // Fairy-light string along the back wall above the shelf
  const stringCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-210, 198, -180),
    new THREE.Vector3(-110, 178, -178),
    new THREE.Vector3(0, 192, -178),
    new THREE.Vector3(110, 175, -178),
    new THREE.Vector3(210, 196, -180),
  ]);
  const wireGeo = new THREE.TubeGeometry(stringCurve, 32, 0.45, 5, false);
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
  const bulbGeo = new THREE.SphereGeometry(2.1, 8, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  disposables.push(wireGeo, wireMat, bulbGeo, bulbMat);
  scene.add(new THREE.Mesh(wireGeo, wireMat));
  const bulbPoints = stringCurve.getPoints(14);
  const bulbInst = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbPoints.length);
  bulbPoints.forEach((pt, i) => {
    dummy.position.copy(pt).add(new THREE.Vector3(0, -1.8, 0));
    dummy.updateMatrix();
    bulbInst.setMatrixAt(i, dummy.matrix);
  });
  bulbInst.instanceMatrix.needsUpdate = true;
  bulbInst.computeBoundingSphere();
  scene.add(bulbInst);

  // Floor Mug
  const mugGeo = new THREE.CylinderGeometry(14, 13, 24, 16);
  const mugMat = createCelMaterial(0xf97316);
  disposables.push(mugGeo, mugMat);
  const mug = new THREE.Mesh(mugGeo, mugMat);
  mug.position.set(-22, 12, 118);
  mug.castShadow = true;
  addCartoonOutline(mug, 1.04);
  cameraColliders.push(mug);
  scene.add(mug);

  // Oscillating Desk Fan (at -164, 76..132, 6)
  const fanBaseMat = createCelMaterial(0x0d9488);
  const fanBladeMat = createCelMaterial(0x99f6e4);
  const fanCageMat = new THREE.MeshBasicMaterial({
    color: 0x1e293b,
    wireframe: true,
  });
  disposables.push(fanBaseMat, fanBladeMat, fanCageMat);

  addStaticBox(-178, 76, -8, -150, 82, 20, fanBaseMat);
  const stemGeo = new THREE.CylinderGeometry(3.2, 3.8, 28, 10);
  disposables.push(stemGeo);
  const stem = new THREE.Mesh(stemGeo, fanBaseMat);
  stem.position.set(-164, 95, 6);
  addCartoonOutline(stem, 1.06);
  scene.add(stem);

  const fanHead = new THREE.Group();
  fanHead.position.set(-164, 112, 6);
  scene.add(fanHead);

  const motorGeo = new THREE.CylinderGeometry(5, 5, 10, 12);
  motorGeo.rotateX(Math.PI / 2);
  const cageGeo = new THREE.SphereGeometry(16, 12, 8);
  cageGeo.scale(1, 1, 0.45);
  disposables.push(motorGeo, cageGeo);
  fanHead.add(new THREE.Mesh(motorGeo, fanBaseMat));
  fanHead.add(new THREE.Mesh(cageGeo, fanCageMat));

  const fanBlades = new THREE.Group();
  fanBlades.position.z = -3;
  const bladeGeo = new THREE.BoxGeometry(3.6, 13, 0.5);
  disposables.push(bladeGeo);
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(bladeGeo, fanBladeMat);
    blade.rotation.z = (b * Math.PI) / 2;
    blade.position.set(
      Math.cos((b * Math.PI) / 2 + Math.PI / 2) * 6.5,
      Math.sin((b * Math.PI) / 2 + Math.PI / 2) * 6.5,
      0
    );
    fanBlades.add(blade);
  }
  fanHead.add(fanBlades);

  // Soft translucent wind cone indicator attached to fan head
  const windZoneCfg = DESK_MAP.windZones[0];
  const windGeo = new THREE.ConeGeometry(34, windZoneCfg.range * 0.75, 12, 1, true);
  windGeo.rotateX(Math.PI / 2);
  windGeo.translate(0, 0, -windZoneCfg.range * 0.375 - 10);
  const windMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  disposables.push(windGeo, windMat);
  fanHead.add(new THREE.Mesh(windGeo, windMat));

  // Floating dust motes in afternoon sunbeams
  const moteCount = 160;
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 440;
    motePos[i * 3 + 1] = 16 + Math.random() * 190;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 320;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xfffbeb,
    size: 1.9,
    transparent: true,
    opacity: 0.65,
  });
  disposables.push(moteGeo, moteMat);
  const dustMotes = new THREE.Points(moteGeo, moteMat);
  scene.add(dustMotes);

  return {
    fanHead,
    fanBlades,
    dustMotes,
    cameraColliders,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
