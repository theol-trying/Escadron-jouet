import * as THREE from 'three';
import { ARENA_SCALE } from '../../shared/constants';
import { POWERUPS } from '../../shared/powerups';
import type {
  PowerUpId,
  SnapshotPowerUpPickup,
  SnapshotSecondaryProjectile,
  SnapshotVacuum,
} from '../../shared/types';
import { addCartoonOutline, createCelMaterial } from './toonMaterials';

interface PickupVisual {
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshStandardMaterial;
  haloMesh: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
  powerUpId: PowerUpId | null;
}

interface SecondaryProjVisual {
  group: THREE.Group;
  missileBody: THREE.Mesh;
  waterSphere: THREE.Mesh;
  firecrackerBody: THREE.Mesh;
  glueMineBody: THREE.Mesh;
}

const MAX_PICKUPS = 16;
const MAX_SEC_PROJ = 24;

export class MatchExtrasRenderer {
  private pickups: PickupVisual[] = [];
  private secProjs: SecondaryProjVisual[] = [];

  private vacuumGroup: THREE.Group;
  private vacuumNozzleHead: THREE.Group;
  private vacuumHoseSegments: THREE.Mesh[] = [];
  private vacuumRingMesh: THREE.Mesh;
  private disposables: Array<{ dispose: () => void }> = [];

  constructor(scene: THREE.Scene) {
    // 1. Pre-allocated floating Power-Up Pickups pool
    const coreGeo = new THREE.OctahedronGeometry(3.2, 0);
    const haloGeo = new THREE.SphereGeometry(5.6, 12, 10);
    this.disposables.push(coreGeo, haloGeo);

    for (let i = 0; i < MAX_PICKUPS; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xfacc15,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.15,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      addCartoonOutline(coreMesh, 1.09);

      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);

      group.add(coreMesh, haloMesh);
      scene.add(group);
      this.disposables.push(coreMat, haloMat);
      this.pickups.push({
        group,
        coreMesh,
        coreMat,
        haloMesh,
        haloMat,
        powerUpId: null,
      });
    }

    // 2. Pre-allocated Secondary Projectiles pool
    const missileGeo = new THREE.ConeGeometry(1.3, 5.4, 10);
    missileGeo.rotateX(-Math.PI / 2);
    const waterGeo = new THREE.SphereGeometry(2.4, 12, 10);
    const firecrackerGeo = new THREE.CylinderGeometry(0.95, 0.95, 5.0, 10);
    firecrackerGeo.rotateX(Math.PI / 2);
    const mineGeo = new THREE.DodecahedronGeometry(3.1, 0);

    const missileMat = createCelMaterial(0xef4444);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.88,
    });
    const firecrackerMat = createCelMaterial(0xf97316);
    const mineMat = createCelMaterial(0xeab308);

    this.disposables.push(
      missileGeo,
      waterGeo,
      firecrackerGeo,
      mineGeo,
      missileMat,
      waterMat,
      firecrackerMat,
      mineMat
    );

    for (let i = 0; i < MAX_SEC_PROJ; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const missileBody = new THREE.Mesh(missileGeo, missileMat);
      addCartoonOutline(missileBody, 1.1);
      const waterSphere = new THREE.Mesh(waterGeo, waterMat);
      addCartoonOutline(waterSphere, 1.08);
      const firecrackerBody = new THREE.Mesh(firecrackerGeo, firecrackerMat);
      addCartoonOutline(firecrackerBody, 1.1);
      const glueMineBody = new THREE.Mesh(mineGeo, mineMat);
      addCartoonOutline(glueMineBody, 1.08);

      group.add(missileBody, waterSphere, firecrackerBody, glueMineBody);
      scene.add(group);
      this.secProjs.push({
        group,
        missileBody,
        waterSphere,
        firecrackerBody,
        glueMineBody,
      });
    }

    // 3. Giant Cartoon Vacuum Cleaner ("L'aspirateur arrive !") + Shrinking Safe Ring
    this.vacuumGroup = new THREE.Group();
    this.vacuumGroup.visible = false;
    this.vacuumNozzleHead = new THREE.Group();

    const vacRedMat = createCelMaterial(0xdc2626);
    const vacChromeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.78,
      roughness: 0.22,
    });
    const vacDarkMat = createCelMaterial(0x1e293b);
    const vacEyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const vacEyePupil = new THREE.MeshBasicMaterial({ color: 0x09090b });

    // Wide flared suction mouth + neck collar
    const mouthGeo = new THREE.BoxGeometry(36, 15, 18);
    const neckGeo = new THREE.CylinderGeometry(9.5, 11.5, 22, 14);
    const intakeRimGeo = new THREE.BoxGeometry(38, 17, 4);
    const eyeGeo = new THREE.SphereGeometry(3.2, 10, 8);
    const pupilGeo = new THREE.SphereGeometry(1.6, 8, 8);
    const hoseSegGeo = new THREE.CylinderGeometry(8.5, 8.5, 14, 12);

    this.disposables.push(
      vacRedMat,
      vacChromeMat,
      vacDarkMat,
      vacEyeWhite,
      vacEyePupil,
      mouthGeo,
      neckGeo,
      intakeRimGeo,
      eyeGeo,
      pupilGeo,
      hoseSegGeo
    );

    const mouthMesh = new THREE.Mesh(mouthGeo, vacRedMat);
    mouthMesh.castShadow = true;
    addCartoonOutline(mouthMesh, 1.04);

    const rimMesh = new THREE.Mesh(intakeRimGeo, vacChromeMat);
    rimMesh.position.set(0, -1, 8.5);
    addCartoonOutline(rimMesh, 1.04);

    const neckMesh = new THREE.Mesh(neckGeo, vacChromeMat);
    neckMesh.position.set(0, 16, -2);
    addCartoonOutline(neckMesh, 1.05);

    // Cartoon angry/googly eyes on top of the vacuum head
    for (const sx of [-7.5, 7.5]) {
      const eye = new THREE.Mesh(eyeGeo, vacEyeWhite);
      eye.position.set(sx, 8.5, 7);
      const pupil = new THREE.Mesh(pupilGeo, vacEyePupil);
      pupil.position.set(sx, 8.2, 9.6);
      this.vacuumNozzleHead.add(eye, pupil);
    }

    this.vacuumNozzleHead.add(mouthMesh, rimMesh, neckMesh);
    this.vacuumGroup.add(this.vacuumNozzleHead);

    // Flexible dark ribbed vacuum hose curving up toward the ceiling
    for (let s = 0; s < 10; s++) {
      const seg = new THREE.Mesh(hoseSegGeo, s % 2 === 0 ? vacDarkMat : vacChromeMat);
      seg.position.set(0, 28 + s * 13, -4 - s * 5);
      seg.rotation.x = -0.32;
      this.vacuumGroup.add(seg);
      this.vacuumHoseSegments.push(seg);
    }
    // Giant room-scale prop: grows with the arena (its suction radius does too)
    this.vacuumGroup.scale.setScalar(ARENA_SCALE);
    scene.add(this.vacuumGroup);

    // Shrinking safe-zone perimeter danger ring
    const ringGeo = new THREE.TorusGeometry(1, 0.02, 8, 48);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.42,
    });
    this.disposables.push(ringGeo, ringMat);
    this.vacuumRingMesh = new THREE.Mesh(ringGeo, ringMat);
    this.vacuumRingMesh.position.y = 82 * ARENA_SCALE;
    this.vacuumRingMesh.visible = false;
    scene.add(this.vacuumRingMesh);
  }

  public syncAndAnimate(
    elapsedTime: number,
    powerUps: SnapshotPowerUpPickup[],
    secProjectiles: SnapshotSecondaryProjectile[],
    vacuum: SnapshotVacuum | null,
    activeMode: boolean
  ): void {
    // 1. Power-ups
    for (let i = 0; i < MAX_PICKUPS; i++) {
      const slot = this.pickups[i];
      if (!activeMode || i >= powerUps.length) {
        slot.group.visible = false;
        continue;
      }
      const pu = powerUps[i];
      slot.group.visible = true;
      slot.group.position.set(pu.x, pu.y + Math.sin(elapsedTime * 3.4 + i) * 2.2, pu.z);
      slot.coreMesh.rotation.y = elapsedTime * 2.4 + i;
      slot.coreMesh.rotation.x = Math.sin(elapsedTime * 1.8 + i) * 0.35;
      const pulse = 1 + Math.sin(elapsedTime * 4.5 + i) * 0.14;
      slot.haloMesh.scale.setScalar(pulse);

      if (slot.powerUpId !== pu.powerUpId) {
        slot.powerUpId = pu.powerUpId;
        const def = POWERUPS[pu.powerUpId];
        slot.coreMat.color.set(def.colorHex);
        slot.coreMat.emissive.set(def.colorHex);
        slot.haloMat.color.set(def.accentHex);
      }
    }

    // 2. Secondary projectiles
    for (let i = 0; i < MAX_SEC_PROJ; i++) {
      const slot = this.secProjs[i];
      if (!activeMode || i >= secProjectiles.length) {
        slot.group.visible = false;
        continue;
      }
      const sp = secProjectiles[i];
      slot.group.visible = true;
      slot.group.position.set(sp.x, sp.y, sp.z);
      if (Math.hypot(sp.vx, sp.vy, sp.vz) > 0.5) {
        slot.group.lookAt(sp.x + sp.vx, sp.y + sp.vy, sp.z + sp.vz);
      }

      slot.missileBody.visible = sp.kind === 'rubber_missile';
      slot.waterSphere.visible = sp.kind === 'water_bomb';
      slot.firecrackerBody.visible = sp.kind === 'firecracker';
      slot.glueMineBody.visible = sp.kind === 'glue_mine';
      if (sp.kind === 'glue_mine') {
        slot.glueMineBody.rotation.y = elapsedTime * 2.5 + i;
        slot.glueMineBody.rotation.z = elapsedTime * 1.6;
      }
    }

    // 3. Giant Cartoon Vacuum Cleaner
    if (activeMode && vacuum?.active) {
      this.vacuumGroup.visible = true;
      this.vacuumGroup.position.set(vacuum.x, vacuum.y, vacuum.z);
      // Tilt nozzle slightly toward room center while sweeping
      this.vacuumNozzleHead.rotation.y = Math.atan2(-vacuum.x, -vacuum.z);
      this.vacuumNozzleHead.rotation.z = Math.sin(elapsedTime * 4) * 0.08;

      this.vacuumRingMesh.visible = true;
      this.vacuumRingMesh.scale.setScalar(Math.max(12, vacuum.safeRadius));
      this.vacuumRingMesh.position.y = (82 + Math.sin(elapsedTime * 3) * 4) * ARENA_SCALE;
    } else {
      this.vacuumGroup.visible = false;
      this.vacuumRingMesh.visible = false;
    }
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
