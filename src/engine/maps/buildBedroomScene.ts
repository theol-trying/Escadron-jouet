import * as THREE from 'three';
import { BEDROOM_MAP_DESIGN } from '../../../shared/maps/bedroom';
import { moverPieces, type LoopMover, type OrbitMover } from '../../../shared/maps/movers';
import { createCarpetTexture, createWallpaperTexture, createWoodGrainTexture } from '../toonMaterials';
import type { SceneBuildOptions } from '../sceneSetup';
import { createRoomKit } from './sceneKit';
import { addCornerShading, addSunShafts } from './sunShafts';
import type { MapSceneHandles } from './types';

/**
 * « La chambre d'enfant »: bed and wardrobe at the back, toy chest and teddy bear, a toy train
 * circling the rug and a mobile turning under the ceiling. Every solid piece mirrors a collider of
 * BEDROOM_MAP_DESIGN; the train and the mobile follow shared/maps/movers.ts on the room clock.
 */
export function buildBedroomScene(scene: THREE.Scene, maxAniso: number, opts: SceneBuildOptions = {}): MapSceneHandles {
  const kit = createRoomKit(scene);
  const { rootGroup, own, mat, addMesh, addBox, addBeam, addSphere } = kit;

  const carpet = own(createCarpetTexture(maxAniso));
  carpet.repeat.set(6, 4);
  const wallpaper = own(createWallpaperTexture(maxAniso));
  const wood = own(createWoodGrainTexture(maxAniso));
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;

  const floorMat = mat(0xffffff, { map: carpet });
  const wallMat = mat(0xffffff, { map: wallpaper });
  const ceilingMat = mat(0xfdf4ff);
  const woodMat = mat(0xffffff, { map: wood });
  const sheetMat = mat(0xf8fafc);
  const blanketMat = mat(0x60a5fa);
  const pinkMat = mat(0xf9a8d4);
  const yellowMat = mat(0xfacc15);
  const redMat = mat(0xef4444);
  const greenMat = mat(0x22c55e);
  const blueMat = mat(0x3b82f6);
  const purpleMat = mat(0xa78bfa);
  const darkMat = mat(0x1f2937);
  const furMat = mat(0xb45309);
  const lightFurMat = mat(0xfbbf24);
  const brassMat = mat(0xd4a017);

  kit.addShell(floorMat, wallMat, ceilingMat);

  // Round rug inside the train loop
  const rugGeo = new THREE.CircleGeometry(1, 40);
  rugGeo.rotateX(-Math.PI / 2);
  rugGeo.scale(150, 1, 62);
  const rug = addMesh(rugGeo, mat(0xfde68a), rootGroup, false, false);
  rug.position.set(-10, 0.4, 41);
  rug.castShadow = false;

  // Bed: frame, mattress, blanket, headboard, pillow
  addBox(-245, 0, -183, -95, 34, -70, woodMat);
  addBox(-242, 34, -181, -98, 52, -72, sheetMat);
  addBox(-200, 52, -182, -97, 56, -71, blanketMat, rootGroup, false);
  addBox(-250, 0, -184, -238, 98, -68, woodMat);
  for (let i = 0; i < 5; i++) addSphere(-244, 98, -170 + i * 25, 5, woodMat);
  addBeam(-222, 60, -168, -222, 60, -86, 9, sheetMat);

  // Nightstand, lamp (with its own warm light)
  addBox(-90, 0, -183, -55, 48, -150, woodMat);
  addBeam(-78, 48, -172, -78, 78, -172, 2.5, brassMat);
  const shade = addMesh(new THREE.ConeGeometry(15, 20, 18, 1, true), pinkMat);
  shade.position.set(-78, 88, -172);
  (shade.material as THREE.Material).side = THREE.DoubleSide;
  const lampLight = new THREE.PointLight(0xffd7a8, 0.9, 300, 1.4);
  lampLight.position.set(-78, 84, -172);
  rootGroup.add(lampLight);

  // Wardrobe with two doors and knobs
  addBox(150, 0, -185, 248, 205, -125, woodMat);
  addBox(152, 8, -125.5, 198, 196, -124.5, mat(0xe0c097), rootGroup, false);
  addBox(200, 8, -125.5, 246, 196, -124.5, mat(0xe0c097), rootGroup, false);
  addSphere(194, 100, -123, 2.5, brassMat, rootGroup, false);
  addSphere(204, 100, -123, 2.5, brassMat, rootGroup, false);

  // Toy chest with a painted stripe
  addBox(-245, 0, 125, -175, 42, 183, redMat);
  addBox(-246, 30, 124, -174, 36, 184, yellowMat, rootGroup, false);

  // Wall shelf and its row of toys
  addBox(205, 120, -40, 250, 126, 60, woodMat);
  const toyMats = [redMat, blueMat, yellowMat, greenMat, purpleMat];
  for (let i = 0; i < 6; i++) addBox(214, 126, -33 + i * 14, 244, 138 + (i % 3) * 5, -23 + i * 14, toyMats[i % toyMats.length]);

  // Teddy bear (body, head, ears, muzzle, eyes)
  addSphere(215, 26, 100, 24, furMat);
  addSphere(215, 64, 100, 17, furMat);
  for (const dz of [-11, 11]) addSphere(220, 78, 100 + dz, 6, furMat);
  addSphere(201, 60, 100, 7, lightFurMat, rootGroup, false);
  for (const dz of [-6, 6]) addSphere(202, 69, 100 + dz, 2, darkMat, rootGroup, false);
  addSphere(194, 61, 100, 2.2, darkMat, rootGroup, false);

  // Window in the front wall (the breeze comes in there), with curtains
  const sky = own(new THREE.MeshBasicMaterial({ color: 0xbae6fd }));
  const win = addMesh(new THREE.PlaneGeometry(110, 80), sky, rootGroup, false, false);
  win.position.set(0, 130, 186.4);
  win.rotation.y = Math.PI;
  addBox(-58, 88, 183, 58, 92, 186, mat(0xffffff), rootGroup, false, false);
  const curtains: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const c = addBox(-16, 0, -1.5, 16, 100, 1.5, mat(0x93c5fd), rootGroup, false, false);
    c.position.set(side * 72, 125, 182);
    curtains.push(c);
  }

  // Glow-in-the-dark stars on the ceiling
  const starMat = own(new THREE.MeshBasicMaterial({ color: 0xfef08a }));
  for (let i = 0; i < 24; i++) {
    const s = addMesh(new THREE.CircleGeometry(2.4, 5), starMat, rootGroup, false, false);
    s.position.set(Math.sin(i * 7.3) * 220, 223.6, Math.cos(i * 4.1) * 160);
    s.rotation.x = Math.PI / 2;
  }

  // Ceiling mobile: cord, hub, turning crossbars, four toys on strings
  const orbit = BEDROOM_MAP_DESIGN.movers!.find((m): m is OrbitMover => m.kind === 'orbit')!;
  addBeam(0, 222, 0, 0, 196, 0, 1.5, darkMat);
  addSphere(0, 194, 0, 5, yellowMat);
  const bars = new THREE.Group();
  bars.position.set(0, 194, 0);
  rootGroup.add(bars);
  addBox(-orbit.radius, -1, -1, orbit.radius, 1, 1, woodMat, bars, false, false);
  addBox(-1, -1, -orbit.radius, 1, 1, orbit.radius, woodMat, bars, false, false);
  const toyShapes = [
    new THREE.OctahedronGeometry(10, 0), // star
    new THREE.TorusGeometry(7, 3, 8, 16, Math.PI * 1.4), // moon
    new THREE.ConeGeometry(8, 16, 4), // little rocket
    new THREE.DodecahedronGeometry(9, 0), // cloud / ball
  ];
  const toyColors = [yellowMat, mat(0xe0e7ff), redMat, mat(0xffffff)];
  const mobileToys = toyShapes.map((g, i) => addMesh(g, toyColors[i], rootGroup, true, false));
  const strings = mobileToys.map(() => addBeam(0, 1, 0, 0, 0, 0, 0.35, darkMat, rootGroup, false));

  // Toy train: rails and sleepers on the floor, an engine and three wagons
  const loop = BEDROOM_MAP_DESIGN.movers!.find((m): m is LoopMover => m.kind === 'loop')!;
  const railMat = mat(0x6b7280);
  loop.points.forEach((a, i) => {
    const b = loop.points[(i + 1) % loop.points.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    for (const off of [-5, 5]) {
      addBeam(a.x + nx * off, 1, a.z + nz * off, b.x + nx * off, 1, b.z + nz * off, 0.8, railMat, rootGroup, false);
    }
    for (let d = 6; d < len; d += 12) {
      const sl = addBox(-8, 0, -1.5, 8, 0.8, 1.5, woodMat, rootGroup, false, false);
      sl.position.set(a.x + (dx / len) * d, 0.4, a.z + (dz / len) * d);
      sl.rotation.y = Math.atan2(-dx, -dz);
    }
  });
  const cars: THREE.Group[] = [];
  const carColors = [redMat, blueMat, greenMat, yellowMat];
  for (let c = 0; c < loop.cars; c++) {
    const car = new THREE.Group();
    rootGroup.add(car);
    addBox(-7, 3, -loop.carLength / 2, 7, 15, loop.carLength / 2, carColors[c % carColors.length], car);
    for (const wz of [-loop.carLength / 3, loop.carLength / 3]) {
      for (const wx of [-7.5, 7.5]) {
        const wheel = addBeam(wx - 1, 3.5, wz, wx + 1, 3.5, wz, 3.5, darkMat, car, false);
        wheel.castShadow = false;
      }
    }
    if (c === 0) {
      // Engine: cabin and chimney
      addBox(-6, 15, 2, 6, 24, loop.carLength / 2, darkMat, car);
      addBeam(0, 15, -6, 0, 26, -6, 3, darkMat, car);
    }
    cars.push(car);
  }
  // Puffs of smoke from the engine
  const puffMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
  const puffs = Array.from({ length: 5 }, () => addMesh(new THREE.SphereGeometry(2.5, 8, 6), puffMat, rootGroup, false, false));

  // Destructible props
  const clock = kit.destructible('alarm_clock');
  addBox(-66, 48, -162, -57, 60, -152, redMat, clock);
  for (const dz of [-3, 3]) addSphere(-61.5, 61, -157 + dz, 2.2, brassMat, clock, false);

  const tower = kit.destructible('block_tower');
  const blockMats = [redMat, yellowMat, blueMat, greenMat, purpleMat, pinkMat];
  for (let i = 0; i < 6; i++) {
    const b = addBox(-40, i * 9, -160, -4, i * 9 + 9, -124, blockMats[i], tower);
    b.rotation.y = (i % 2 ? 1 : -1) * 0.08;
  }

  const books = kit.destructible('storybooks');
  [blueMat, redMat, greenMat].forEach((m, i) => {
    const b = addBox(40 + i, i * 8.6, -112 + i, 80 - i, i * 8.6 + 8.6, -80 - i, m, books);
    b.rotation.y = (i - 1) * 0.12;
  });

  const ball = kit.destructible('toy_ball');
  const ballMesh = addSphere(-60, 16, 40, 16, mat(0xffffff), ball);
  for (const [m, rot] of [[redMat, 0], [blueMat, Math.PI / 2]] as const) {
    const band = addMesh(new THREE.TorusGeometry(16.1, 2.6, 6, 24), m, ball, false, false);
    band.position.copy(ballMesh.position);
    band.rotation.y = rot;
  }

  // Sun shafts through the window (with dust in the light) and soft shading in the corners
  const roomFx = [
    kit.own(
      addSunShafts(
        rootGroup,
        [{ center: [0, 130, 185], right: [1, 0, 0], up: [0, 1, 0], width: 110, height: 80, panes: [2, 2], dir: [0.12, -0.55, -0.83], length: 280, floorY: 0, strength: 0.16 }],
        opts.profile
      )
    ),
    kit.own(addCornerShading(rootGroup, { minX: -251, maxX: 251, minZ: -187, maxZ: 187, height: 224, ceiling: true })),
  ];

  kit.addPowerUpRings(BEDROOM_MAP_DESIGN.powerUpSpots);

  const tmp = new THREE.Vector3();
  return kit.finish((t) => {
    for (const f of roomFx) f.update(t);
    // Mobile turns with the shared clock (same place as its colliders)
    bars.rotation.y = -orbit.speed * t;
    moverPieces(orbit, t).forEach((p, i) => {
      const toy = mobileToys[i];
      toy.position.set(p.x, p.y + Math.sin(t * 1.3 + i) * 1.5, p.z);
      toy.rotation.y = t * 0.8 + i;
      const s = strings[i];
      const top = tmp.set(p.x, 194, p.z);
      s.position.set(p.x, (top.y + p.y + 8) / 2, p.z);
      s.scale.y = top.y - (p.y + 8);
    });
    // Train on its track
    const pieces = moverPieces(loop, t);
    pieces.forEach((p, i) => {
      cars[i].position.set(p.x, 0, p.z);
      cars[i].rotation.y = p.yaw;
    });
    // Smoke puffs rising from the chimney and fading
    const engine = pieces[0];
    const fx = -Math.sin(engine.yaw);
    const fz = -Math.cos(engine.yaw);
    puffs.forEach((puff, i) => {
      const k = (t * 0.8 + i / puffs.length) % 1;
      puff.position.set(engine.x + fx * 6 - fx * k * 20, 28 + k * 22, engine.z + fz * 6 - fz * k * 20);
      puff.scale.setScalar(0.6 + k * 1.6);
    });
    puffMat.opacity = 0.55;
    // Curtains sway in the breeze
    curtains.forEach((c, i) => (c.rotation.x = Math.sin(t * 0.9 + i) * 0.06));
  });
}
