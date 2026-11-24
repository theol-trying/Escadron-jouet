import * as THREE from 'three';
import { PAINT_PALETTES } from '../../shared/planes';
import type { PaintId, PlaneId, StickerId, TeamId } from '../../shared/types';
import {
  addCartoonOutline,
  createCelMaterial,
  createStickerTexture,
} from './toonMaterials';

export interface BuiltPlaneRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  propellers: THREE.Object3D[];
  cockpitHidden: THREE.Object3D[];
  windupKey: THREE.Object3D | null;
  hitFlashMaterials: THREE.Material[];
  stickerMesh: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  /** Spawn protection: golden lattice bubble shown while the plane cannot be damaged. */
  spawnShieldMesh: THREE.Mesh;
  magnetRingMesh: THREE.Mesh;
  glueBlobMesh: THREE.Mesh;
  dispose: () => void;
}

function createExtrudedWing(
  spanHalf: number,
  rootChord: number,
  tipChord: number,
  sweepZ: number,
  thickness: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-spanHalf, -tipChord * 0.5 + sweepZ);
  shape.lineTo(0, -rootChord * 0.5);
  shape.lineTo(spanHalf, -tipChord * 0.5 + sweepZ);
  shape.lineTo(spanHalf, tipChord * 0.5 + sweepZ);
  shape.lineTo(0, rootChord * 0.5);
  shape.lineTo(-spanHalf, tipChord * 0.5 + sweepZ);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.25,
    bevelSize: thickness * 0.2,
    bevelSegments: 1,
  });
  geo.rotateX(Math.PI / 2);
  geo.center();
  return geo;
}

export function buildToyPlane(
  planeId: PlaneId,
  paintId: PaintId,
  stickerId: StickerId,
  team: TeamId = 'none'
): BuiltPlaneRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const palette = PAINT_PALETTES[paintId] ?? PAINT_PALETTES.red;
  const primaryColor =
    team === 'red' ? '#EF4444' : team === 'blue' ? '#2563EB' : palette.primary;
  const secondaryColor =
    team === 'red' ? '#FEE2E2' : team === 'blue' ? '#DBEAFE' : palette.secondary;
  const accentColor = palette.accent;

  const isMetal = planeId === 'diecast_bomber';
  const isTin = planeId === 'windup_biplane';

  const hullMat = isMetal
    ? new THREE.MeshStandardMaterial({
        color: primaryColor,
        metalness: 0.65,
        roughness: 0.28,
      })
    : createCelMaterial(primaryColor);

  const secondaryMat = isTin
    ? new THREE.MeshStandardMaterial({
        color: secondaryColor,
        metalness: 0.35,
        roughness: 0.35,
      })
    : createCelMaterial(secondaryColor);

  const accentMat = createCelMaterial(accentColor);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.12,
    metalness: 0.15,
    transparent: true,
    opacity: 0.85,
  });
  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.5,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.85,
    roughness: 0.2,
  });

  const stickerTex = createStickerTexture(stickerId);
  const stickerMat = new THREE.MeshBasicMaterial({
    map: stickerTex,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const propellers: THREE.Object3D[] = [];
  // Parts hidden in cockpit view (they would block the pilot's eye: canopy bubble, visor)
  const cockpitHidden: THREE.Object3D[] = [];
  let windupKey: THREE.Object3D | null = null;
  const disposables: Array<{ dispose: () => void }> = [
    hullMat,
    secondaryMat,
    accentMat,
    canopyMat,
    darkTrimMat,
    brassMat,
    stickerTex,
    stickerMat,
  ];

  const addPart = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    outlineRatio = 1.08
  ): THREE.Mesh => {
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.castShadow = true;
    addCartoonOutline(mesh, outlineRatio);
    bodyGroup.add(mesh);
    return mesh;
  };

  let stickerY = 0.7;
  let stickerZ = 0.4;

  if (planeId === 'plastic_jet') {
    // 1. Sleek tapered plastic fuselage facing -Z
    const fuseGeo = new THREE.CapsuleGeometry(1.15, 5.2, 6, 12);
    fuseGeo.rotateX(Math.PI / 2);
    addPart(fuseGeo, hullMat, [0, 0, 0], [0, 0, 0], 1.09);

    // 2. Nose cone
    const noseGeo = new THREE.ConeGeometry(1.12, 2.2, 12);
    noseGeo.rotateX(-Math.PI / 2);
    addPart(noseGeo, accentMat, [0, 0, -4.4], [0, 0, 0], 1.1);

    // 3. Swept main wings (~10.5cm wingspan)
    const wingGeo = createExtrudedWing(5.25, 3.0, 1.4, 1.2, 0.36);
    addPart(wingGeo, secondaryMat, [0, -0.1, 0.3]);

    // 4. Cockpit canopy bubble
    const canopyGeo = new THREE.SphereGeometry(0.95, 12, 10);
    canopyGeo.scale(0.8, 0.75, 1.85);
    cockpitHidden.push(addPart(canopyGeo, canopyMat, [0, 0.85, -1.0], [0, 0, 0], 1.07));

    // 5. Twin tail fins
    const finGeo = new THREE.BoxGeometry(0.28, 1.8, 1.5);
    addPart(finGeo, accentMat, [-1.1, 0.9, 3.0], [0.25, 0, 0.2]);
    addPart(finGeo.clone(), accentMat, [1.1, 0.9, 3.0], [0.25, 0, -0.2]);

    // 6. Wingtip toy missiles / caps
    const podGeo = new THREE.CylinderGeometry(0.26, 0.26, 1.9, 8);
    podGeo.rotateX(Math.PI / 2);
    addPart(podGeo, accentMat, [-5.2, -0.1, 1.1]);
    addPart(podGeo.clone(), accentMat, [5.2, -0.1, 1.1]);

    // 7. Rear toy thruster nozzle
    const nozzleGeo = new THREE.CylinderGeometry(0.7, 0.95, 1.1, 10);
    nozzleGeo.rotateX(Math.PI / 2);
    addPart(nozzleGeo, darkTrimMat, [0, 0, 3.8]);

    stickerY = 0.36;
    stickerZ = 0.5;
  } else if (planeId === 'windup_biplane') {
    // 1. Barrel tin fuselage
    const fuseGeo = new THREE.CylinderGeometry(1.05, 0.72, 6.2, 12);
    fuseGeo.rotateX(Math.PI / 2);
    addPart(fuseGeo, hullMat, [0, 0, 0.2]);

    // 2. Lower wing
    const wingLow = createExtrudedWing(4.9, 1.85, 1.65, 0.1, 0.28);
    addPart(wingLow, secondaryMat, [0, -0.65, -0.7]);

    // 3. Upper wing
    const wingHigh = createExtrudedWing(5.1, 1.95, 1.75, 0.1, 0.28);
    addPart(wingHigh, hullMat, [0, 1.45, -0.9]);

    // 4. Interplane struts
    const strutGeo = new THREE.CylinderGeometry(0.14, 0.14, 2.1, 6);
    addPart(strutGeo, brassMat, [-3.1, 0.4, -0.8]);
    addPart(strutGeo.clone(), brassMat, [3.1, 0.4, -0.8]);

    // 5. Tail fin & stabilizer
    const hStab = createExtrudedWing(2.1, 1.1, 0.85, 0.1, 0.22);
    addPart(hStab, secondaryMat, [0, 0.25, 2.9]);
    const vStab = new THREE.BoxGeometry(0.24, 1.4, 1.2);
    addPart(vStab, accentMat, [0, 0.85, 2.9]);

    // 6. Front spinning propeller
    const propGroup = new THREE.Group();
    propGroup.position.set(0, 0, -3.15);
    const hubGeo = new THREE.SphereGeometry(0.45, 8, 8);
    const bladeGeo = new THREE.BoxGeometry(3.1, 0.34, 0.12);
    disposables.push(hubGeo, bladeGeo);
    propGroup.add(new THREE.Mesh(hubGeo, brassMat));
    propGroup.add(new THREE.Mesh(bladeGeo, darkTrimMat));
    bodyGroup.add(propGroup);
    propellers.push(propGroup);

    // 7. Iconic oversized brass wind-up key on top back!
    const keyGroup = new THREE.Group();
    keyGroup.position.set(0, 1.1, 1.5);
    const stemGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.4, 8);
    const loopGeo = new THREE.TorusGeometry(0.55, 0.14, 8, 16);
    disposables.push(stemGeo, loopGeo);
    const stem = new THREE.Mesh(stemGeo, brassMat);
    stem.position.y = 0.4;
    const loopL = new THREE.Mesh(loopGeo, brassMat);
    loopL.position.set(-0.52, 1.25, 0);
    const loopR = new THREE.Mesh(loopGeo, brassMat);
    loopR.position.set(0.52, 1.25, 0);
    keyGroup.add(stem, loopL, loopR);
    bodyGroup.add(keyGroup);
    windupKey = keyGroup;

    stickerY = 1.68;
    stickerZ = -0.85;
  } else if (planeId === 'foam_glider') {
    // 1. Sleek lightweight foam fuselage
    const fuseGeo = new THREE.CapsuleGeometry(0.78, 5.8, 6, 10);
    fuseGeo.rotateX(Math.PI / 2);
    addPart(fuseGeo, hullMat, [0, 0, 0.1]);

    // 2. Rubber nose bumper cap
    const bumperGeo = new THREE.SphereGeometry(0.84, 10, 10);
    bumperGeo.scale(1, 1, 1.2);
    addPart(bumperGeo, accentMat, [0, 0, -3.2]);

    // 3. Wide high-aspect glider wings with dihedral (~11.4cm span)
    const leftWingGeo = createExtrudedWing(2.85, 2.2, 1.1, 0.7, 0.24);
    addPart(leftWingGeo, secondaryMat, [-2.85, 0.25, 0.1], [0, 0, -0.11]);
    const rightWingGeo = createExtrudedWing(2.85, 2.2, 1.1, 0.7, 0.24);
    addPart(rightWingGeo, secondaryMat, [2.85, 0.25, 0.1], [0, 0, 0.11]);

    // 4. Painted cockpit visor stripe
    const visorGeo = new THREE.BoxGeometry(1.1, 0.45, 1.8);
    cockpitHidden.push(addPart(visorGeo, canopyMat, [0, 0.55, -1.2]));

    // 5. Twin V-tail stabilizers
    const vTail = new THREE.BoxGeometry(0.22, 1.6, 1.25);
    addPart(vTail, accentMat, [-0.65, 0.75, 3.0], [0.2, 0, 0.45]);
    addPart(vTail.clone(), accentMat, [0.65, 0.75, 3.0], [0.2, 0, -0.45]);

    stickerY = 0.85;
    stickerZ = -0.3;
  } else {
    // diecast_bomber
    // 1. Heavy broad die-cast metal fuselage
    const fuseGeo = new THREE.BoxGeometry(2.4, 2.0, 6.8);
    addPart(fuseGeo, hullMat, [0, 0, 0.1]);

    // 2. Rounded armored nose dome
    const noseGeo = new THREE.SphereGeometry(1.25, 12, 10);
    addPart(noseGeo, canopyMat, [0, 0.1, -3.3]);

    // 3. Broad heavy straight wings (~11.8cm span)
    const wingGeo = createExtrudedWing(5.9, 2.8, 2.1, 0.25, 0.42);
    addPart(wingGeo, secondaryMat, [0, 0.2, -0.2]);

    // 4. Twin engine nacelles + spinning propellers
    const nacGeo = new THREE.CylinderGeometry(0.55, 0.55, 2.4, 10);
    nacGeo.rotateX(Math.PI / 2);
    addPart(nacGeo, darkTrimMat, [-2.6, -0.15, -0.8]);
    addPart(nacGeo.clone(), darkTrimMat, [2.6, -0.15, -0.8]);

    for (const sx of [-2.6, 2.6]) {
      const pGroup = new THREE.Group();
      pGroup.position.set(sx, -0.15, -2.1);
      const blade = new THREE.BoxGeometry(2.1, 0.28, 0.1);
      disposables.push(blade);
      pGroup.add(new THREE.Mesh(blade, brassMat));
      bodyGroup.add(pGroup);
      propellers.push(pGroup);
    }

    // 5. Twin heavy under-wing cannons
    const barrelGeo = new THREE.CylinderGeometry(0.22, 0.28, 2.2, 8);
    barrelGeo.rotateX(Math.PI / 2);
    addPart(barrelGeo, accentMat, [-3.9, -0.45, -1.2]);
    addPart(barrelGeo.clone(), accentMat, [3.9, -0.45, -1.2]);

    // 6. Broad tail assembly
    const tailH = createExtrudedWing(2.6, 1.3, 1.0, 0.1, 0.3);
    addPart(tailH, secondaryMat, [0, 0.35, 3.2]);
    const tailV = new THREE.BoxGeometry(0.32, 1.85, 1.5);
    addPart(tailV, hullMat, [0, 1.1, 3.1]);

    stickerY = 1.08;
    stickerZ = 0.2;
  }

  // Top sticker decal
  const stickerGeo = new THREE.PlaneGeometry(1.75, 1.75);
  stickerGeo.rotateX(-Math.PI / 2);
  disposables.push(stickerGeo);
  const stickerMesh = new THREE.Mesh(stickerGeo, stickerMat);
  stickerMesh.position.set(0, stickerY, stickerZ);
  bodyGroup.add(stickerMesh);

  // Power-up status aura meshes (pre-allocated, toggled via .visible)
  const shieldGeo = new THREE.SphereGeometry(6.8, 16, 12);
  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0xa855f7,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.34,
    roughness: 0.1,
    metalness: 0.1,
    depthWrite: false,
  });
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.visible = false;
  root.add(shieldMesh);

  // Spawn protection bubble: golden wire lattice, distinct from the purple bubble-shield power-up
  const spawnShieldGeo = new THREE.IcosahedronGeometry(7.4, 1);
  const spawnShieldMat = new THREE.MeshBasicMaterial({
    color: 0xfde047,
    wireframe: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const spawnShieldMesh = new THREE.Mesh(spawnShieldGeo, spawnShieldMat);
  spawnShieldMesh.visible = false;
  root.add(spawnShieldMesh);
  // Soft golden glow inside the lattice (wire lines alone are only 1 px wide)
  const spawnGlowGeo = new THREE.SphereGeometry(7.1, 18, 14);
  const spawnGlowMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
  });
  spawnShieldMesh.add(new THREE.Mesh(spawnGlowGeo, spawnGlowMat));
  disposables.push(spawnShieldGeo, spawnShieldMat, spawnGlowGeo, spawnGlowMat);

  const magnetGeo = new THREE.TorusGeometry(6.4, 0.36, 8, 22);
  magnetGeo.rotateX(Math.PI / 2);
  const magnetMat = new THREE.MeshBasicMaterial({
    color: 0xec4899,
    transparent: true,
    opacity: 0.78,
  });
  const magnetRingMesh = new THREE.Mesh(magnetGeo, magnetMat);
  magnetRingMesh.visible = false;
  root.add(magnetRingMesh);

  const glueGeo = new THREE.DodecahedronGeometry(3.8, 0);
  const glueMat = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    roughness: 0.2,
    transparent: true,
    opacity: 0.55,
  });
  const glueBlobMesh = new THREE.Mesh(glueGeo, glueMat);
  glueBlobMesh.visible = false;
  root.add(glueBlobMesh);

  disposables.push(shieldGeo, shieldMat, magnetGeo, magnetMat, glueGeo, glueMat);

  return {
    root,
    bodyGroup,
    propellers,
    cockpitHidden,
    windupKey,
    hitFlashMaterials: [hullMat, secondaryMat, accentMat],
    stickerMesh,
    shieldMesh,
    spawnShieldMesh,
    magnetRingMesh,
    glueBlobMesh,
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
