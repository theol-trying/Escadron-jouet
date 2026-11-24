import * as THREE from 'three';
import { ARENA_SCALE } from '../../shared/constants';
import type { CatPose } from '../../shared/roomEvents';
import { addCartoonOutline, createCelMaterial } from './toonMaterials';

/**
 * Giant orange tabby cat crossing the room during the « chat » room event. Built in design units
 * (like the rooms) and scaled with ARENA_SCALE; its collider lives in shared/roomEvents.ts.
 */
export class CatVisual {
  private group = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private tail: THREE.Group;
  private disposables: Array<{ dispose: () => void }> = [];

  constructor(scene: THREE.Scene) {
    const fur = createCelMaterial(0xf59e0b);
    const belly = createCelMaterial(0xfde68a);
    const stripe = createCelMaterial(0xb45309);
    const eyeWhite = createCelMaterial(0xffffff);
    const pupil = createCelMaterial(0x111827);
    const nose = createCelMaterial(0xf472b6);
    this.disposables.push(fur, belly, stripe, eyeWhite, pupil, nose);

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], parent: THREE.Object3D = this.group, outline = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.castShadow = true;
      if (outline) addCartoonOutline(m, 1.04);
      parent.add(m);
      this.disposables.push(geo);
      return m;
    };

    // Body along -Z (head forward), standing on y = 0
    const body = add(new THREE.CapsuleGeometry(17, 56, 6, 14), fur, [0, 32, 0]);
    body.rotation.x = Math.PI / 2;
    add(new THREE.CapsuleGeometry(12, 40, 4, 10), belly, [0, 24, 0]).rotation.x = Math.PI / 2;
    for (const z of [-14, 2, 18]) {
      const band = add(new THREE.TorusGeometry(17.3, 2.2, 6, 20, Math.PI), stripe, [0, 32, z], this.group, false);
      band.rotation.y = Math.PI / 2;
    }

    // Head with ears, eyes, nose and whisker pads
    const head = new THREE.Group();
    head.position.set(0, 46, -42);
    this.group.add(head);
    add(new THREE.SphereGeometry(16, 18, 14), fur, [0, 0, 0], head);
    for (const side of [-1, 1]) {
      const ear = add(new THREE.ConeGeometry(6.5, 13, 4), fur, [side * 8, 15, 1], head);
      ear.rotation.z = -side * 0.3;
      add(new THREE.SphereGeometry(3.4, 10, 8), eyeWhite, [side * 6, 4, -13.5], head, false);
      add(new THREE.SphereGeometry(1.8, 8, 6), pupil, [side * 6, 4, -16.2], head, false);
      add(new THREE.SphereGeometry(4.5, 10, 8), belly, [side * 4, -4, -13], head, false);
    }
    add(new THREE.SphereGeometry(2.2, 8, 6), nose, [0, -1, -15.8], head, false);

    // Four legs (animated walk)
    for (const [x, z] of [[-10, -24], [10, -24], [-10, 24], [10, 24]] as const) {
      const leg = add(new THREE.CapsuleGeometry(5, 16, 4, 8), fur, [x, 12, z]);
      this.legs.push(leg);
    }

    // Tail curling up at the back
    this.tail = new THREE.Group();
    this.tail.position.set(0, 40, 36);
    this.group.add(this.tail);
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

  public update(pose: CatPose | null, time: number): void {
    this.group.visible = pose !== null && pose.presence > 0.01;
    if (!pose) return;
    this.group.position.set(pose.x, pose.y, pose.z);
    this.group.rotation.y = pose.yaw;
    this.group.scale.setScalar(ARENA_SCALE * Math.max(0.01, pose.presence));
    // Walk cycle: diagonal legs together, a gentle body bob and a swaying tail
    const step = time * 9;
    this.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(step + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55;
    });
    this.group.position.y += Math.abs(Math.sin(step)) * 2 * ARENA_SCALE;
    this.tail.rotation.z = Math.sin(time * 2.4) * 0.35;
  }

  public dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
