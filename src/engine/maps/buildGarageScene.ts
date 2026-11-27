import * as THREE from 'three';
import { GARAGE_BIKE, GARAGE_MAP_DESIGN } from '../../../shared/maps/garage';
import { createWoodGrainTexture } from '../toonMaterials';
import { createRoomKit } from './sceneKit';
import type { MapSceneHandles } from './types';

/** Canvas texture helper (drawn once, repeated). */
function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  maxAniso: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAniso;
  return tex;
}

/**
 * « Le garage »: workbench and pegboard, metal shelves, a bicycle hung from the ceiling, lawnmower,
 * scooter, tyres and oil drum, and the overhead door half open on a sunny street (the wind zone
 * blows leaves in). Every solid piece mirrors a collider of GARAGE_MAP_DESIGN.
 */
export function buildGarageScene(scene: THREE.Scene, maxAniso: number): MapSceneHandles {
  const kit = createRoomKit(scene);
  const { rootGroup, own, mat, addMesh, addBox, addBeam, addSphere } = kit;

  // Concrete floor with a few oil stains
  const concrete = own(
    canvasTexture(
      256,
      256,
      (ctx) => {
        ctx.fillStyle = '#B8BCC2';
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 900; i++) {
          const v = 150 + ((i * 97) % 70);
          ctx.fillStyle = `rgba(${v}, ${v + 2}, ${v + 6}, 0.5)`;
          ctx.fillRect((i * 53) % 256, (i * 131) % 256, 2, 2);
        }
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, 256, 256);
      },
      maxAniso,
      5,
      4
    )
  );
  // Painted cinder blocks (running bond)
  const blocks = own(
    canvasTexture(
      256,
      128,
      (ctx) => {
        ctx.fillStyle = '#E7E5E4';
        ctx.fillRect(0, 0, 256, 128);
        ctx.strokeStyle = 'rgba(120, 113, 108, 0.45)';
        ctx.lineWidth = 3;
        for (let row = 0; row < 2; row++) {
          const y = row * 64;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(256, y);
          ctx.stroke();
          for (let x = row ? 64 : 0; x < 256; x += 128) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + 64);
            ctx.stroke();
          }
        }
      },
      maxAniso,
      8,
      5
    )
  );
  // Pegboard: brown with holes
  const pegTex = own(
    canvasTexture(
      64,
      64,
      (ctx) => {
        ctx.fillStyle = '#B7895B';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#5B3A1E';
        for (const x of [16, 48]) for (const y of [16, 48]) {
          ctx.beginPath();
          ctx.arc(x, y, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      maxAniso,
      14,
      8
    )
  );
  // Sunny street seen through the open door
  const street = own(
    canvasTexture(
      512,
      200,
      (ctx) => {
        const sky = ctx.createLinearGradient(0, 0, 0, 110);
        sky.addColorStop(0, '#7DD3FC');
        sky.addColorStop(1, '#E0F2FE');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, 512, 110);
        ctx.fillStyle = '#FDE68A';
        ctx.beginPath();
        ctx.arc(420, 34, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F8FAFC';
        for (const [x, y, r] of [[90, 40, 16], [112, 34, 20], [136, 42, 14], [260, 26, 12], [280, 22, 15]]) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        // House across the street
        ctx.fillStyle = '#FCA5A5';
        ctx.fillRect(300, 62, 120, 56);
        ctx.fillStyle = '#B91C1C';
        ctx.beginPath();
        ctx.moveTo(290, 64);
        ctx.lineTo(360, 30);
        ctx.lineTo(430, 64);
        ctx.fill();
        ctx.fillStyle = '#E0F2FE';
        ctx.fillRect(318, 78, 22, 18);
        ctx.fillRect(380, 78, 22, 18);
        // Hedge, pavement, driveway
        ctx.fillStyle = '#16A34A';
        ctx.fillRect(0, 104, 512, 22);
        ctx.fillStyle = '#CBD5E1';
        ctx.fillRect(0, 126, 512, 14);
        ctx.fillStyle = '#64748B';
        ctx.fillRect(0, 140, 512, 60);
        ctx.fillStyle = '#F8FAFC';
        for (let x = 10; x < 512; x += 80) ctx.fillRect(x, 166, 40, 5);
      },
      maxAniso
    )
  );
  const wood = own(createWoodGrainTexture(maxAniso));

  const floorMat = mat(0xffffff, { map: concrete });
  const wallMat = mat(0xffffff, { map: blocks });
  const ceilingMat = mat(0xe5e7eb);
  const woodMat = mat(0xffffff, { map: wood });
  const steelMat = mat(0x94a3b8);
  const darkSteelMat = mat(0x475569);
  const darkMat = mat(0x1f2937);
  const redMat = mat(0xdc2626);
  const whiteMat = mat(0xf8fafc);
  const yellowMat = mat(0xfacc15);
  const greenMat = mat(0x16a34a);
  const blueMat = mat(0x2563eb);
  const orangeMat = mat(0xf97316);
  const cardboardMat = mat(0xc8a165);

  kit.addShell(floorMat, wallMat, ceilingMat);

  // Oil stains on the floor
  const stainMat = own(new THREE.MeshBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.35, depthWrite: false }));
  for (const [x, z, r] of [[-20, 60, 22], [40, 90, 14], [-60, -40, 10]]) {
    const s = addMesh(new THREE.CircleGeometry(r, 20), stainMat, rootGroup, false, false);
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, 0.3, z);
    s.castShadow = false;
  }

  // Workbench: top, legs, lower shelf, vice
  addBox(-200, 78, -185, -40, 86, -130, woodMat);
  for (const [x0, z0] of [[-198, -136], [-48, -136], [-198, -183], [-48, -183]]) addBox(x0, 0, z0, x0 + 6, 78, z0 + 6, darkSteelMat);
  addBox(-198, 20, -183, -42, 25, -132, woodMat);
  addBox(-80, 86, -140, -60, 96, -126, blueMat);
  addBox(-78, 96, -138, -62, 104, -128, darkSteelMat);
  addBeam(-70, 92, -126, -70, 92, -116, 1.2, steelMat, rootGroup, false);
  // Pegboard and its tools (flat, within the pegboard collider)
  addBox(-205, 100, -185, -35, 190, -182, mat(0xffffff, { map: pegTex }));
  addBeam(-190, 120, -180, -190, 160, -180, 2, woodMat, rootGroup, false); // hammer handle
  addBox(-197, 158, -182, -183, 166, -176, darkSteelMat, rootGroup, false);
  addBox(-165, 115, -181, -160, 170, -179, steelMat, rootGroup, false); // wrench
  addSphere(-162.5, 172, -180, 5, steelMat, rootGroup, false);
  addBox(-140, 120, -181, -95, 150, -180, steelMat, rootGroup, false); // saw
  addBox(-95, 128, -182, -82, 146, -178, redMat, rootGroup, false);
  for (let i = 0; i < 4; i++) {
    addBeam(-70 + i * 8, 130, -180, -70 + i * 8, 150, -180, 1, steelMat, rootGroup, false); // screwdrivers
    addBeam(-70 + i * 8, 150, -180, -70 + i * 8, 165, -180, 2.2, [yellowMat, redMat, blueMat, greenMat][i], rootGroup, false);
  }

  // Chest freezer
  addBox(10, 0, -183, 110, 85, -128, whiteMat);
  addBox(9, 78, -184, 111, 80, -127, mat(0xcbd5e1), rootGroup, false, false);
  addBox(45, 70, -127.5, 75, 74, -126, darkSteelMat, rootGroup, false, false);

  // Metal shelves: posts, boards, bucket
  for (const [x, z] of [[152, -183], [243, -183], [152, -142], [243, -142]]) addBeam(x, 0, z, x, 200, z, 2, darkSteelMat);
  for (const y of [38, 88, 138, 188]) addBox(150, y, -185, 245, y + 4, -140, steelMat);
  addMesh(new THREE.CylinderGeometry(15, 12, 23, 18), orangeMat).position.set(175, 153.5, -164);

  // Bicycle hung upside down from the ceiling
  const b = GARAGE_BIKE;
  const frameMat = mat(0x0ea5e9);
  const tyreGeo = own(new THREE.TorusGeometry(b.wheelRadius, b.tyreRadius, 8, 32));
  const wheels: THREE.Group[] = [];
  for (const hubX of [b.rearHubX, b.frontHubX]) {
    const wheel = new THREE.Group();
    wheel.position.set(hubX, b.hubY, b.z);
    rootGroup.add(wheel);
    const tyre = new THREE.Mesh(tyreGeo, darkMat);
    tyre.castShadow = true;
    wheel.add(tyre);
    kit.addMesh(new THREE.TorusGeometry(b.wheelRadius - 3, 0.8, 6, 32), steelMat, wheel, false, false);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI;
      addBeam(-Math.cos(a) * 25, -Math.sin(a) * 25, 0, Math.cos(a) * 25, Math.sin(a) * 25, 0, 0.35, steelMat, wheel, false).castShadow = false;
    }
    addSphere(0, 0, 0, 3, darkSteelMat, wheel, false);
    wheels.push(wheel);
    addBeam(hubX, b.hubY + b.wheelRadius, b.z, hubX, 222, b.z, 1.2, steelMat, rootGroup, false);
  }
  const joint = (p: { x: number; y: number }) => [p.x, p.y, b.z] as const;
  const tube = (p: { x: number; y: number }, q: { x: number; y: number }, r = 2.2) =>
    addBeam(...joint(p), ...joint(q), r, frameMat);
  const rear = { x: b.rearHubX, y: b.hubY };
  const front = { x: b.frontHubX, y: b.hubY };
  tube(b.bottomBracket, rear);
  tube(b.seatTop, rear);
  tube(b.bottomBracket, b.seatTop);
  tube(b.seatTop, b.headTop);
  tube(b.bottomBracket, b.headBottom);
  tube(b.headTop, b.headBottom, 2.6);
  tube(b.headBottom, front);
  addBeam(b.seatTop.x - 9, b.saddleY, b.z, b.seatTop.x + 7, b.saddleY, b.z, 4, darkMat);
  addBeam(b.headTop.x - 2, b.handlebarY, b.z - b.handlebarHalfWidth, b.headTop.x - 2, b.handlebarY, b.z + b.handlebarHalfWidth, 2, darkSteelMat);
  addSphere(b.bottomBracket.x, b.bottomBracket.y, b.z, 5, darkSteelMat, rootGroup, false);

  // Fluorescent tubes with their housings and light
  const neonMat = mat(0xffffff, { emissive: 0xf0f9ff, emissiveIntensity: 1 });
  for (const x0 of [-160, 40]) {
    addBox(x0 - 4, 218, -88, x0 + 124, 224, -72, steelMat, rootGroup, false, false);
    addBeam(x0, 214, -80, x0 + 120, 214, -80, 4, neonMat, rootGroup, false);
    const l = new THREE.PointLight(0xf0f9ff, 0.55, 380, 1.2);
    l.position.set(x0 + 60, 200, -80);
    rootGroup.add(l);
  }

  // Overhead door: street through the opening, the panel lowered half way, rails under the ceiling
  const streetMat = own(new THREE.MeshBasicMaterial({ map: street }));
  const opening = addMesh(new THREE.PlaneGeometry(300, 110), streetMat, rootGroup, false, false);
  opening.position.set(0, 55, 186.3);
  opening.rotation.y = Math.PI;
  const doorMat = mat(0xf1f5f9);
  addBox(-155, 110, 183.5, 155, 224, 186, doorMat, rootGroup, true, false);
  for (let y = 130; y < 222; y += 22) addBox(-153, y, 183.2, 153, y + 1.5, 183.6, mat(0xcbd5e1), rootGroup, false, false);
  addBox(-136, 116, 183, -116, 122, 183.5, darkSteelMat, rootGroup, false, false);
  for (const x of [-152, 152]) {
    addBeam(x, 214, 185, x, 214, 60, 2, darkSteelMat);
    addBox(x - 4, 0, 182, x + 4, 110, 186, darkSteelMat, rootGroup, false, false);
  }
  // Sunlight coming in through the door
  const sun = new THREE.SpotLight(0xfff1c1, 1.2, 520, 0.7, 0.6, 1);
  sun.position.set(0, 120, 230);
  sun.target.position.set(0, 0, 20);
  rootGroup.add(sun, sun.target);

  // Lawnmower: body, wheels, grass bag, handle
  addBox(-235, 0, 100, -175, 40, 150, redMat);
  addBox(-230, 40, 108, -180, 44, 142, darkMat, rootGroup, false);
  for (const x of [-236, -174]) for (const z of [108, 142]) addBeam(x - 2, 8, z, x + 2, 8, z, 8, darkMat, rootGroup, false);
  addBox(-228, 8, 150, -182, 42, 168, mat(0x65a30d));
  addBeam(-205, 40, 150, -205, 92, 178, 2.5, darkSteelMat);
  addBeam(-225, 92, 178, -185, 92, 178, 2.5, darkMat);

  // Kick scooter
  addBox(222, 4, 105, 238, 11, 175, greenMat);
  for (const z of [110, 172]) addBeam(226, 6, z, 234, 6, z, 6, darkMat, rootGroup, false);
  addBeam(230, 11, 170, 230, 95, 176, 2.2, steelMat);
  addBeam(230, 95, 158, 230, 95, 182, 2, darkMat);

  // Leaves blown in by the gusts
  const leafGeo = own(new THREE.PlaneGeometry(5, 3));
  const leafMats = [mat(0xf59e0b, { side: THREE.DoubleSide }), mat(0x84cc16, { side: THREE.DoubleSide }), mat(0xea580c, { side: THREE.DoubleSide })];
  const leaves = Array.from({ length: 12 }, (_, i) => {
    const leaf = new THREE.Mesh(leafGeo, leafMats[i % leafMats.length]);
    rootGroup.add(leaf);
    return leaf;
  });

  // Destructible props
  const toolbox = kit.destructible('toolbox');
  addBox(-180, 86, -170, -140, 106, -145, redMat, toolbox);
  addBeam(-170, 110, -157.5, -150, 110, -157.5, 1.6, darkMat, toolbox, false);
  addBox(-181, 98, -171, -139, 100, -144, darkMat, toolbox, false, false);

  const paint = kit.destructible('paint_cans');
  const cans: Array<[number, number, THREE.Material]> = [
    [174, -163, blueMat],
    [188, -168, yellowMat],
    [198, -157, greenMat],
  ];
  for (const [x, z, m] of cans) {
    addMesh(new THREE.CylinderGeometry(6.5, 6.5, 18, 16), m, paint).position.set(x, 51, z);
    addMesh(new THREE.CylinderGeometry(6.8, 6.8, 1.5, 16), steelMat, paint, false).position.set(x, 60.5, z);
  }

  const carton = kit.destructible('carton');
  addBox(200, 92, -180, 240, 128, -145, cardboardMat, carton);
  addBox(218, 127.6, -181, 222, 128.6, -144, mat(0xd6b98c), carton, false, false);

  const tyres = kit.destructible('tyre_stack');
  const tyreStackGeo = new THREE.TorusGeometry(21, 8, 10, 24);
  tyreStackGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const t = addMesh(i ? tyreStackGeo.clone() : tyreStackGeo, darkMat, tyres);
    t.position.set(130, 8 + i * 16, 150);
    t.rotation.y = i * 0.6;
  }

  const drum = kit.destructible('oil_drum');
  addMesh(new THREE.CylinderGeometry(20, 20, 60, 22), blueMat, drum).position.set(-130, 30, 160);
  for (const y of [15, 45]) {
    const ring = addMesh(new THREE.TorusGeometry(20.3, 1.2, 6, 24), darkSteelMat, drum, false, false);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-130, y, 160);
  }
  addMesh(new THREE.CylinderGeometry(4, 4, 2, 10), yellowMat, drum, false).position.set(-122, 61, 154);

  kit.addPowerUpRings(GARAGE_MAP_DESIGN.powerUpSpots);

  const wind = GARAGE_MAP_DESIGN.windZones[0];
  return kit.finish((t) => {
    // Front wheel of the bike turning slowly (someone gave it a push)
    wheels[1].rotation.z = -t * 0.9;
    // Neon flicker now and then
    neonMat.emissiveIntensity = Math.sin(t * 0.7) > 0.97 && Math.sin(t * 40) > 0 ? 0.3 : 1;
    // Leaves swept from the door toward the back, following the gust direction
    const gustYaw = wind.baseYaw + Math.sin(t * wind.sweepSpeed) * wind.sweepAmplitude;
    leaves.forEach((leaf, i) => {
      const k = (t * 0.22 + i / leaves.length) % 1;
      const spread = ((i * 37) % 100) / 100 - 0.5;
      const d = k * wind.range;
      leaf.position.set(
        wind.originX - Math.sin(gustYaw) * d + spread * 160 * (0.3 + k),
        12 + ((i * 23) % 80) + Math.sin(t * 3 + i) * 6 - k * 8,
        wind.originZ - Math.cos(gustYaw) * d
      );
      leaf.rotation.set(t * 3 + i, t * 2 + i * 0.7, t * 1.3);
      leaf.scale.setScalar(Math.sin(k * Math.PI) * 1.2);
    });
  });
}
