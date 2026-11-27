import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { BATHROOM_MAP_DESIGN } from '../../../shared/maps/bathroom';
import type { SceneBuildOptions } from '../sceneSetup';
import { createTileTexture, createWoodGrainTexture } from '../toonMaterials';
import { createRoomKit } from './sceneKit';
import { addCornerShading } from './sunShafts';
import type { MapSceneHandles } from './types';

/**
 * « La salle de bain »: steaming bath with its rubber duck, washbasin under a real mirror, toilets,
 * washing machine and towel warmer. Every solid piece mirrors a collider of BATHROOM_MAP_DESIGN; the
 * steam rises in the updraft column, the whirlpool spins over the toilet hazard.
 */
export function buildBathroomScene(scene: THREE.Scene, maxAniso: number, opts: SceneBuildOptions = {}): MapSceneHandles {
  const kit = createRoomKit(scene);
  const { rootGroup, own, mat, addMesh, addBox, addBeam, addSphere } = kit;

  const floorTex = own(createTileTexture(maxAniso, '#F8FAFC', '#BAE6FD', 12, 9));
  const wallTex = own(createTileTexture(maxAniso, '#FFFFFF', '#E0F2FE', 16, 6));
  const wood = own(createWoodGrainTexture(maxAniso));

  const floorMat = mat(0xffffff, { map: floorTex });
  const wallMat = mat(0xffffff, { map: wallTex });
  const ceilingMat = mat(0xf8fafc);
  const porcelainMat = mat(0xffffff);
  const chromeMat = mat(0xcbd5e1);
  const woodMat = mat(0xffffff, { map: wood });
  const yellowMat = mat(0xfacc15);
  const orangeMat = mat(0xf97316);
  const darkMat = mat(0x1f2937);
  const curtainMat = mat(0x7dd3fc);
  const towelMats = [mat(0xf472b6), mat(0x34d399), mat(0xfbbf24)];

  kit.addShell(floorMat, wallMat, ceilingMat);

  // Bath mat in front of the tub
  const matGeo = new THREE.PlaneGeometry(110, 32);
  matGeo.rotateX(-Math.PI / 2);
  const bathMat = addMesh(matGeo, mat(0xa7f3d0), rootGroup, false, false);
  bathMat.position.set(-145, 0.4, -88);
  bathMat.castShadow = false;

  // Bathtub: water and rims (tub_water + four rims), little feet
  addBox(-245, 0, -116, -45, 52, -108, porcelainMat);
  addBox(-245, 0, -183, -45, 52, -176, porcelainMat);
  addBox(-245, 0, -183, -237, 52, -108, porcelainMat);
  addBox(-53, 0, -183, -45, 52, -108, porcelainMat);
  addBox(-237, 0, -176, -53, 30, -116, porcelainMat, rootGroup, false);
  const waterMat = mat(0x7dd3fc, { transparent: true, opacity: 0.85 });
  const waterGeo = new THREE.PlaneGeometry(184, 60);
  waterGeo.rotateX(-Math.PI / 2);
  const water = addMesh(waterGeo, waterMat, rootGroup, false, false);
  water.position.set(-145, 40, -146);
  water.castShadow = false;
  // Foam bubbles on the water
  const foamMat = mat(0xffffff);
  for (let i = 0; i < 18; i++) {
    const b = addSphere(-225 + ((i * 53) % 165), 40, -170 + ((i * 29) % 50), 3 + (i % 3) * 1.6, foamMat, rootGroup, false);
    b.castShadow = false;
  }
  // Tap at the end of the tub
  addBeam(-240, 62, -146, -228, 62, -146, 2.5, chromeMat, rootGroup, false);

  // Shower pipe and head, curtain rail and curtain
  addBeam(-225, 52, -181, -225, 175, -181, 2.5, chromeMat);
  addBeam(-225, 178, -181, -225, 172, -165, 7, chromeMat);
  addBeam(-245, 200, -106, -45, 200, -106, 1.8, chromeMat);
  for (let i = 0; i < 4; i++) addBox(-245 + i * 5, 110, -112 + (i % 2) * 2, -238 + i * 5, 200, -100 - (i % 2) * 2, curtainMat, rootGroup, i === 0);

  // Washbasin: cabinet with doors, basin, tap, soap, mirror
  addBox(10, 0, -185, 120, 80, -130, woodMat);
  for (const [a, b] of [[14, 63], [67, 116]]) addBox(a, 8, -130.5, b, 74, -129.5, mat(0xe0f2fe), rootGroup, false);
  for (const x of [58, 72]) addSphere(x, 50, -128.5, 2, chromeMat, rootGroup, false);
  addBox(20, 80, -180, 110, 90, -135, porcelainMat);
  const sinkHole = addMesh(new THREE.CircleGeometry(18, 24), mat(0xbae6fd), rootGroup, false, false);
  sinkHole.rotation.x = -Math.PI / 2;
  sinkHole.position.set(65, 90.3, -157);
  addBeam(65, 90, -178, 65, 104, -168, 2.5, chromeMat);
  addBox(28, 90, -165, 42, 95, -155, mat(0xf9a8d4), rootGroup, false, false); // soap
  addBox(13, 103, -185, 117, 197, -182, porcelainMat); // mirror frame
  const mirrorRes = opts.profile?.mirrorResolution ?? 512;
  if (mirrorRes <= 0) {
    addBox(15, 105, -182, 115, 195, -181, mat(0xdbeafe, { emissive: 0xe0f2fe, emissiveIntensity: 0.35 }), rootGroup, false, false);
  } else {
    const mirror = new Reflector(new THREE.PlaneGeometry(100, 90), {
      textureWidth: mirrorRes,
      textureHeight: Math.round(mirrorRes * 0.9),
      color: 0xd9e6ee,
      multisample: 0,
    });
    mirror.position.set(65, 150, -181.4);
    rootGroup.add(mirror);
    own(mirror.geometry);
    own(mirror);
  }

  // Toilets: bowl, seat, raised lid, tank, flush button, whirlpool over the hazard
  const bowl = addMesh(new THREE.CylinderGeometry(21, 15, 38, 24), porcelainMat);
  bowl.position.set(212, 19, 85);
  bowl.scale.set(1, 1, 0.95);
  addBox(226, 0, 70, 234, 38, 100, porcelainMat, rootGroup, false);
  const seat = addMesh(new THREE.TorusGeometry(17, 3.2, 8, 24), porcelainMat, rootGroup, false);
  seat.rotation.x = Math.PI / 2;
  seat.position.set(212, 38.5, 85);
  const toiletWater = addMesh(new THREE.CircleGeometry(15, 24), mat(0x38bdf8), rootGroup, false, false);
  toiletWater.rotation.x = -Math.PI / 2;
  toiletWater.position.set(212, 34, 85);
  const swirl = new THREE.Group();
  swirl.position.set(212, 34.5, 85);
  rootGroup.add(swirl);
  for (let i = 0; i < 3; i++) {
    const arc = addMesh(new THREE.TorusGeometry(4 + i * 4, 0.9, 6, 20, Math.PI * 1.2), mat(0x0369a1), swirl, false, false);
    arc.rotation.x = Math.PI / 2;
    arc.rotation.z = i * 2.1;
  }
  addBox(224, 38, 62, 232, 86, 108, porcelainMat);
  addBox(232, 40, 55, 250, 100, 115, porcelainMat);
  addBeam(231, 92, 85, 228, 92, 85, 4, chromeMat, rootGroup, false);
  // Paper holder on the wall
  addBeam(249, 60, 130, 240, 60, 130, 1.5, chromeMat, rootGroup, false);
  addBeam(244, 60, 122, 244, 60, 138, 6, porcelainMat, rootGroup, false);

  // Wall cabinet above the toilets
  addBox(215, 130, 50, 250, 185, 120, porcelainMat);
  addBox(214.5, 135, 54, 215, 180, 116, mat(0xe0f2fe), rootGroup, false, false);
  addSphere(214, 157, 110, 1.8, chromeMat, rootGroup, false);

  // Towel warmer with towels
  for (let i = 0; i < 5; i++) addBeam(-244, 36 + i * 25, -68, -244, 36 + i * 25, -2, 1.6, chromeMat, rootGroup, false);
  addBeam(-244, 30, -68, -244, 140, -68, 2, chromeMat);
  addBeam(-244, 30, -2, -244, 140, -2, 2, chromeMat);
  towelMats.forEach((m, i) => addBox(-249, 68 + i * 25, -62 + i * 4, -239, 112 + i * 25 - i * 8, -10 - i * 6, m, rootGroup, false, false));

  // Washing machine with its round door and a turning drum
  addBox(-245, 0, 120, -170, 85, 183, porcelainMat);
  addBox(-243, 72, 118.5, -172, 84, 120, mat(0xe2e8f0), rootGroup, false, false);
  for (const x of [-232, -222]) addSphere(x, 78, 118.5, 2.5, darkMat, rootGroup, false);
  const doorRing = addMesh(new THREE.TorusGeometry(19, 3, 8, 28), chromeMat, rootGroup, false, false);
  doorRing.position.set(-207, 40, 119);
  const drum = new THREE.Group();
  drum.position.set(-207, 40, 119.6);
  rootGroup.add(drum);
  const drumGlass = addMesh(new THREE.CircleGeometry(17, 28), mat(0x1e3a8a), drum, false, false);
  drumGlass.rotation.y = Math.PI;
  const sockColors = [0xef4444, 0xfacc15, 0x22c55e];
  sockColors.forEach((c, i) => {
    const sock = addBox(-3, 4, -0.5, 3, 13, 0.5, mat(c), drum, false, false);
    sock.rotation.z = (i * Math.PI * 2) / 3;
    sock.position.set(Math.sin(sock.rotation.z) * -6, Math.cos(sock.rotation.z) * 6, -0.3);
  });

  // Ceiling lamp with its light
  const lamp = addMesh(new THREE.SphereGeometry(14, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xfffbeb, { emissive: 0xfff7d6, emissiveIntensity: 0.6 }));
  lamp.rotation.x = Math.PI;
  lamp.position.set(0, 224, 0);
  const lampLight = new THREE.PointLight(0xfff4e0, 0.8, 420, 1.2);
  lampLight.position.set(0, 200, 0);
  rootGroup.add(lampLight);

  // Door in the front wall (decoration, flush with the wall)
  addBox(110, 0, 184.5, 180, 190, 187, woodMat, rootGroup, false, false);
  addSphere(118, 95, 183.8, 2.5, chromeMat, rootGroup, false);

  // Steam rising over the bath
  const steamCfg = BATHROOM_MAP_DESIGN.updraftZones[0];
  const steamMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
  const steamGeo = own(new THREE.SphereGeometry(1, 10, 8));
  const puffs = Array.from({ length: 24 }, () => {
    const p = new THREE.Mesh(steamGeo, steamMat);
    rootGroup.add(p);
    return p;
  });

  // Destructible props
  const duckGroup = kit.destructible('rubber_duck');
  const duck = new THREE.Group();
  duck.position.set(-150, 44, -146);
  duckGroup.add(duck);
  const duckBody = addSphere(0, 3, 0, 9, yellowMat, duck);
  duckBody.scale.set(1, 0.75, 1.25);
  addSphere(0, 12, -7, 5.5, yellowMat, duck);
  const beak = addMesh(new THREE.ConeGeometry(2.4, 5, 8), orangeMat, duck, false);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 11, -13.5);
  for (const dx of [-2.6, 2.6]) addSphere(dx, 14, -11.2, 1, darkMat, duck, false);
  addBox(-1.5, 5, 8, 1.5, 10, 12, yellowMat, duck, false); // tail

  const cup = kit.destructible('tooth_cup');
  addMesh(new THREE.CylinderGeometry(7, 6, 18, 16), mat(0x60a5fa), cup).position.set(97, 99, -171);
  [[0xef4444, -2], [0x22c55e, 2.5]].forEach(([c, dx]) => {
    const brush = addBeam(97 + dx, 104, -171, 97 + dx * 2, 120, -173, 1, mat(c), cup, false);
    brush.castShadow = false;
  });

  const paper = kit.destructible('toilet_paper');
  const rollGeo = new THREE.CylinderGeometry(7.5, 7.5, 13, 16);
  const rollSpots: Array<[number, number, number]> = [];
  for (const y of [6.5, 19.5]) for (const x of [208, 224]) for (const z of [142, 158]) rollSpots.push([x, y, z]);
  rollSpots.push([216, 32.5, 150]);
  rollSpots.forEach(([x, y, z], i) => {
    const roll = addMesh(i ? rollGeo.clone() : rollGeo, porcelainMat, paper);
    roll.position.set(x, y, z);
  });

  const basket = kit.destructible('laundry_basket');
  addMesh(new THREE.CylinderGeometry(20, 17, 30, 18), mat(0xd6a461), basket).position.set(-140, 15, 160);
  [0xf472b6, 0x60a5fa, 0xfde047].forEach((c, i) => addSphere(-148 + i * 8, 30, 154 + (i % 2) * 10, 8, mat(c), basket, false));

  // Soft shading in the corners (no window here: the steam is the show)
  const roomFx = [kit.own(addCornerShading(rootGroup, { minX: -251, maxX: 251, minZ: -187, maxZ: 187, height: 224, ceiling: true }, 0.24))];

  kit.addPowerUpRings(BATHROOM_MAP_DESIGN.powerUpSpots);

  return kit.finish((t) => {
    for (const f of roomFx) f.update(t);
    // Rubber duck bobbing on the bath water
    duck.position.y = 44 + Math.sin(t * 1.7) * 1.2;
    duck.rotation.z = Math.sin(t * 1.3) * 0.08;
    duck.rotation.y = Math.sin(t * 0.4) * 0.5;
    // Steam: puffs rising in the updraft column, swelling then fading out
    puffs.forEach((p, i) => {
      const k = (t * 0.16 + i / puffs.length) % 1;
      const a = i * 2.4 + t * 0.25;
      const rad = 8 + (i % 4) * 7 + k * 8;
      p.position.set(steamCfg.x + Math.cos(a) * rad, steamCfg.y - 6 + k * (steamCfg.height + 10), Math.max(-176, steamCfg.z + Math.sin(a) * rad));
      p.scale.setScalar((5 + k * 14) * Math.sin(k * Math.PI));
    });
    // Whirlpool in the toilets and the washing machine drum
    swirl.rotation.y = -t * 2.6;
    drum.rotation.z = t * 3.2;
  });
}
