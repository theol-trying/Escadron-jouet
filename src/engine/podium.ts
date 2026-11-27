import * as THREE from 'three';
import type { PaintId, PlaneId, StickerId, TeamId } from '../../shared/types';
import { buildToyPlane, type BuiltPlaneRig } from './planeBuilder';
import { addCartoonOutline, createCelMaterial } from './toonMaterials';

export interface PodiumEntry {
  planeId: PlaneId;
  paintId: PaintId;
  stickerId: StickerId;
  team: TeamId;
}

// Places 1, 2, 3 from left to right: 2nd – 1st – 3rd, like a real podium
const SLOTS = [
  { place: 1, x: 0, height: 15, color: 0xfacc15 },
  { place: 2, x: -17, height: 10.5, color: 0xcbd5e1 },
  { place: 3, x: 17, height: 7, color: 0xfb923c },
];
const BLOCK = 15; // block width/depth (planes span ~11)

function digitTexture(digit: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(64, 64, 54, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = '#18181b';
    g.stroke();
    g.fillStyle = '#18181b';
    g.font = 'bold 84px "Trebuchet MS", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(digit), 64, 70);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * End-of-match 3D podium: toy building blocks (gold, silver, bronze) with the top-3 planes in their
 * own paint, hovering and turning on top. Built in local units around (0,0,0) — the engine places
 * the group in open air in the room and orbits the camera around it.
 */
export class Podium {
  public readonly group = new THREE.Group();
  private planes: Array<{ rig: BuiltPlaneRig; baseY: number; phase: number }> = [];
  private disposables: Array<{ dispose: () => void }> = [];

  constructor(entries: PodiumEntry[]) {
    // Base platform (a big toy tray)
    const baseGeo = new THREE.CylinderGeometry(36, 38, 3, 32);
    const baseMat = createCelMaterial(0x2563eb);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -1.5;
    addCartoonOutline(base, 1.06, undefined, 'prop');
    this.group.add(base);
    this.disposables.push(baseGeo, baseMat);

    entries.slice(0, 3).forEach((entry, i) => {
      const slot = SLOTS[i];
      const geo = new THREE.BoxGeometry(BLOCK, slot.height, BLOCK);
      const mat = createCelMaterial(slot.color);
      const block = new THREE.Mesh(geo, mat);
      block.position.set(slot.x, slot.height / 2, 0);
      addCartoonOutline(block, 1.06, undefined, 'prop');
      this.group.add(block);
      this.disposables.push(geo, mat);

      // Building-block studs on top
      const studGeo = new THREE.CylinderGeometry(1.6, 1.6, 1.2, 14);
      this.disposables.push(studGeo);
      for (const sx of [-3.8, 3.8]) {
        for (const sz of [-3.8, 3.8]) {
          const stud = new THREE.Mesh(studGeo, mat);
          stud.position.set(slot.x + sx, slot.height + 0.6, sz);
          this.group.add(stud);
        }
      }

      // Place number on the front face
      const tex = digitTexture(slot.place);
      const numMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      const numGeo = new THREE.PlaneGeometry(7, 7);
      // Place number on the front and back faces (the camera orbits all around)
      for (const side of [1, -1]) {
        const num = new THREE.Mesh(numGeo, numMat);
        num.position.set(slot.x, slot.height * 0.5, side * (BLOCK / 2 + 0.05));
        if (side < 0) num.rotation.y = Math.PI;
        this.group.add(num);
      }
      this.disposables.push(tex, numMat, numGeo);

      // The pilot's plane, hovering above its block and turning slowly
      const rig = buildToyPlane(entry.planeId, entry.paintId, entry.stickerId, entry.team);
      const baseY = slot.height + 6;
      rig.root.position.set(slot.x, baseY, 0);
      rig.root.rotation.y = Math.PI; // nose toward the camera side
      this.group.add(rig.root);
      this.planes.push({ rig, baseY, phase: i * 1.3 });
    });
  }

  public update(time: number, dt: number): void {
    for (const p of this.planes) {
      p.rig.root.position.y = p.baseY + Math.sin(time * 2 + p.phase) * 0.9;
      p.rig.root.rotation.y += dt * 0.5;
      p.rig.root.rotation.z = Math.sin(time * 1.4 + p.phase) * 0.12;
      for (const prop of p.rig.propellers) prop.rotation.z += dt * 20;
      if (p.rig.windupKey) p.rig.windupKey.rotation.y += dt * 4;
    }
  }

  public dispose(): void {
    for (const p of this.planes) p.rig.dispose();
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
