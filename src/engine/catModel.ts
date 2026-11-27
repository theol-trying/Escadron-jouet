import * as THREE from 'three';
import { ARENA_SCALE } from '../../shared/constants';
import { CAT_PAW_RADIUS, type CatPaw, type CatPose } from '../../shared/roomEvents';
import { addCartoonOutline, createCelMaterial } from './toonMaterials';

const SHOULDER_Y = 30;
const SHOULDER_Z = -24;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Giant orange tabby cat crossing the room during the « chat » room event. Built in design units
 * (like the rooms) and scaled with ARENA_SCALE; its colliders (body and swatting paw) live in
 * shared/roomEvents.ts. Alive: it watches the nearest plane, blinks, twitches its ears, lashes its
 * tail, and swats with a front paw (the paw follows the shared swat exactly).
 */
export class CatVisual {
  private group = new THREE.Group();
  private body = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private head = new THREE.Group();
  private eyes: THREE.Object3D[] = [];
  private ears: THREE.Mesh[] = [];
  private tail: THREE.Group;
  private arm = new THREE.Group();
  private armTube: THREE.Mesh;
  private paw = new THREE.Group();
  private disposables: Array<{ dispose: () => void }> = [];
  private headYaw = 0;
  private headPitch = 0;
  private readonly _local = new THREE.Vector3();
  private readonly _shoulder = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const fur = createCelMaterial(0xf59e0b);
    const belly = createCelMaterial(0xfde68a);
    const stripe = createCelMaterial(0xb45309);
    const eyeWhite = createCelMaterial(0xffffff);
    const pupil = createCelMaterial(0x111827);
    const nose = createCelMaterial(0xf472b6);
    this.disposables.push(fur, belly, stripe, eyeWhite, pupil, nose);

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], parent: THREE.Object3D = this.body, outline = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.castShadow = true;
      if (outline) addCartoonOutline(m, 1.06, undefined, 'prop');
      parent.add(m);
      this.disposables.push(geo);
      return m;
    };
    this.group.add(this.body);

    // Body along -Z (head forward), standing on y = 0
    const body = add(new THREE.CapsuleGeometry(17, 56, 6, 14), fur, [0, 32, 0]);
    body.rotation.x = Math.PI / 2;
    add(new THREE.CapsuleGeometry(12, 40, 4, 10), belly, [0, 24, 0]).rotation.x = Math.PI / 2;
    for (const z of [-14, 2, 18]) {
      const band = add(new THREE.TorusGeometry(17.3, 2.2, 6, 20, Math.PI), stripe, [0, 32, z], this.body, false);
      band.rotation.y = Math.PI / 2;
    }

    // Head with ears, eyes, nose and whisker pads (turns toward the planes)
    this.head.position.set(0, 46, -42);
    this.body.add(this.head);
    add(new THREE.SphereGeometry(16, 18, 14), fur, [0, 0, 0], this.head);
    for (const side of [-1, 1]) {
      const ear = add(new THREE.ConeGeometry(6.5, 13, 4), fur, [side * 8, 15, 1], this.head);
      ear.rotation.z = -side * 0.3;
      this.ears.push(ear);
      const eye = new THREE.Group();
      eye.position.set(side * 6, 4, -13.5);
      this.head.add(eye);
      add(new THREE.SphereGeometry(3.4, 10, 8), eyeWhite, [0, 0, 0], eye, false);
      add(new THREE.SphereGeometry(1.8, 8, 6), pupil, [0, 0, -2.7], eye, false);
      this.eyes.push(eye);
      add(new THREE.SphereGeometry(4.5, 10, 8), belly, [side * 4, -4, -13], this.head, false);
    }
    add(new THREE.SphereGeometry(2.2, 8, 6), nose, [0, -1, -15.8], this.head, false);

    // Four legs (animated walk)
    for (const [x, z] of [[-10, -24], [10, -24], [-10, 24], [10, 24]] as const) {
      this.legs.push(add(new THREE.CapsuleGeometry(5, 16, 4, 8), fur, [x, 12, z]));
    }

    // Swatting arm: a stretchable foreleg from the shoulder to a round paw with pink toe beans
    this.armTube = add(new THREE.CylinderGeometry(5, 5.5, 1, 10), fur, [0, 0, 0], this.arm);
    add(new THREE.SphereGeometry(CAT_PAW_RADIUS, 14, 10), belly, [0, 0, 0], this.paw);
    for (const [px, py] of [[-3.6, 3], [0, 4.2], [3.6, 3], [0, -1.5]]) {
      add(new THREE.SphereGeometry(py < 0 ? 3 : 1.8, 8, 6), nose, [px, py, -CAT_PAW_RADIUS + 1], this.paw, false);
    }
    this.arm.add(this.paw);
    this.arm.visible = false;
    this.body.add(this.arm);

    // Tail curling up at the back
    this.tail = new THREE.Group();
    this.tail.position.set(0, 40, 36);
    this.body.add(this.tail);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 10, 12),
      new THREE.Vector3(0, 30, 16),
      new THREE.Vector3(0, 42, 8),
    ]);
    add(new THREE.TubeGeometry(curve, 16, 3.6, 8, false), fur, [0, 0, 0], this.tail);

    this.group.visible = false;
    scene.add(this.group);
  }

  /**
   * `paw`: the shared swat (or null), `targets`: where the planes are (the head follows the nearest).
   */
  public update(pose: CatPose | null, time: number, paw: CatPaw | null = null, targets: Iterable<THREE.Vector3> = []): void {
    this.group.visible = pose !== null && pose.presence > 0.01;
    if (!pose) return;
    this.group.position.set(pose.x, pose.y, pose.z);
    this.group.rotation.y = pose.yaw;
    this.group.scale.setScalar(ARENA_SCALE * Math.max(0.01, pose.presence));
    this.group.updateMatrixWorld();

    // Walk cycle: diagonal legs together, a gentle body bob
    const step = time * 9;
    this.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(step + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55;
    });
    this.body.position.y = Math.abs(Math.sin(step)) * 2;

    // Swat: the paw follows the shared position, the foreleg stretches from the shoulder to it
    const swatting = paw !== null;
    this.arm.visible = swatting;
    this.legs[0].visible = !(swatting && paw!.side === -1);
    this.legs[1].visible = !(swatting && paw!.side === 1);
    if (swatting) {
      const p = paw!;
      this._shoulder.set(p.side * 10, SHOULDER_Y - this.body.position.y, SHOULDER_Z);
      this._local.set(p.local.x, p.local.y - this.body.position.y, p.local.z);
      this._dir.copy(this._local).sub(this._shoulder);
      const len = this._dir.length();
      this.armTube.position.copy(this._shoulder).addScaledVector(this._dir, 0.5);
      this.armTube.quaternion.setFromUnitVectors(UP, this._dir.normalize());
      this.armTube.scale.set(1, Math.max(1, len), 1);
      this.paw.position.copy(this._local);
      // Toe beans (on the paw's -Z side) face away from the arm
      this.paw.lookAt(this._shoulder.clone().applyMatrix4(this.body.matrixWorld));
      // The body leans into the swat
      this.body.rotation.z = -p.side * Math.sin(p.phase * Math.PI) * 0.08;
    } else {
      this.body.rotation.z *= 0.9;
    }

    // Head: toward the nearest plane (or the paw while swatting), within what a neck allows
    let target: THREE.Vector3 | null = null;
    let best = (260 * ARENA_SCALE) ** 2;
    for (const t of targets) {
      const d = t.distanceToSquared(this.group.position);
      if (d < best) {
        best = d;
        target = t;
      }
    }
    let wantYaw = Math.sin(time * 0.7) * 0.25;
    let wantPitch = 0.1;
    if (swatting) {
      wantYaw = -paw!.side * 0.35;
      wantPitch = 0.35;
    } else if (target) {
      this._local.copy(target);
      this.body.worldToLocal(this._local);
      const dx = this._local.x - this.head.position.x;
      const dy = this._local.y - this.head.position.y;
      const dz = this._local.z - this.head.position.z;
      wantYaw = Math.max(-0.9, Math.min(0.9, Math.atan2(-dx, -dz)));
      wantPitch = Math.max(-0.3, Math.min(0.55, Math.atan2(dy, Math.hypot(dx, dz))));
    }
    this.headYaw += (wantYaw - this.headYaw) * 0.12;
    this.headPitch += (wantPitch - this.headPitch) * 0.12;
    this.head.rotation.set(this.headPitch, this.headYaw, 0, 'YXZ');

    // Blinks every few seconds, ears twitch now and then
    const blink = (time % 3.3) < 0.13;
    for (const eye of this.eyes) eye.scale.y = blink ? 0.12 : 1;
    this.ears.forEach((ear, i) => {
      const twitch = Math.max(0, Math.sin(time * 1.3 + i * 2.1)) ** 24;
      ear.rotation.z = (i === 0 ? 0.3 : -0.3) + (i === 0 ? 1 : -1) * twitch * 0.5;
    });

    // Tail: slow sway, lashing faster while swatting
    const lash = swatting ? 3 : 1;
    this.tail.rotation.z = Math.sin(time * 2.4 * lash) * 0.35;
    this.tail.rotation.x = Math.sin(time * 1.7 * lash + 1) * 0.18;
  }

  public dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
