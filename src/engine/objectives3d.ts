import * as THREE from 'three';
import type { MapDefinition } from '../../shared/maps/types';
import { KING_ZONE_RADIUS, RING_RADIUS, getRaceCourse, type KingZone } from '../../shared/objectives';
import type { GameModeId } from '../../shared/types';

export type ZoneState = 'free' | 'mine' | 'theirs' | 'contested';

const ZONE_COLORS: Record<ZoneState, number> = {
  free: 0xfacc15,
  mine: 0x22c55e,
  theirs: 0xef4444,
  contested: 0xf97316,
};

/**
 * 3D markers of the objective modes: the ring circuit (next ring gold and pulsing, the one after
 * white, the rest faint) and the king-of-the-sky zone (sphere + light column coloured by who holds it).
 */
export class ObjectiveRenderer {
  private group = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private ringMats = {
    next: new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.95 }),
    after: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }),
    rest: new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.22, depthWrite: false }),
  };
  private ringGeo = new THREE.TorusGeometry(RING_RADIUS, 1.5, 10, 40);
  private zone: THREE.Group | null = null;
  private zoneShellMat = new THREE.MeshBasicMaterial({
    color: ZONE_COLORS.free,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private zoneWireMat = new THREE.MeshBasicMaterial({ color: ZONE_COLORS.free, wireframe: true, transparent: true, opacity: 0.35 });
  private beamMat = new THREE.MeshBasicMaterial({ color: ZONE_COLORS.free, transparent: true, opacity: 0.13, depthWrite: false });
  private disposables: Array<{ dispose: () => void }> = [];
  private mode: GameModeId | null = null;
  private mapKey = '';

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.disposables.push(this.ringGeo, this.ringMats.next, this.ringMats.after, this.ringMats.rest, this.zoneShellMat, this.zoneWireMat, this.beamMat);
  }

  /** (Re)builds the markers when the mode or the map changes. */
  public configure(mode: GameModeId, map: MapDefinition): void {
    const key = `${mode}:${map.id}`;
    if (key === this.mapKey) return;
    this.mapKey = key;
    this.mode = mode;
    this.clearMarkers();

    if (mode === 'ring_race') {
      for (const r of getRaceCourse(map)) {
        const mesh = new THREE.Mesh(this.ringGeo, this.ringMats.rest);
        mesh.position.set(r.x, r.y, r.z);
        // Torus axis is +Z: turn it to face the direction of travel
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(r.nx, r.ny, r.nz));
        this.group.add(mesh);
        this.rings.push(mesh);
      }
    } else if (mode === 'king_of_sky') {
      const zone = new THREE.Group();
      const shellGeo = new THREE.SphereGeometry(KING_ZONE_RADIUS, 28, 18);
      const wireGeo = new THREE.SphereGeometry(KING_ZONE_RADIUS * 1.01, 14, 8);
      const hb = map.hardBounds;
      const beamGeo = new THREE.CylinderGeometry(KING_ZONE_RADIUS * 0.35, KING_ZONE_RADIUS * 0.35, hb.maxY - hb.minY, 20, 1, true);
      zone.add(new THREE.Mesh(shellGeo, this.zoneShellMat));
      zone.add(new THREE.Mesh(wireGeo, this.zoneWireMat));
      const beam = new THREE.Mesh(beamGeo, this.beamMat);
      beam.name = 'beam';
      zone.add(beam);
      this.disposables.push(shellGeo, wireGeo, beamGeo);
      this.group.add(zone);
      this.zone = zone;
    }
  }

  private clearMarkers(): void {
    for (const r of this.rings) this.group.remove(r);
    this.rings = [];
    if (this.zone) {
      this.group.remove(this.zone);
      this.zone = null;
    }
  }

  /** Race: highlight the next ring of the local pilot. */
  public updateRace(ringsPassed: number, finished: boolean, time: number): void {
    const n = this.rings.length;
    if (n === 0) return;
    const next = ringsPassed % n;
    for (let i = 0; i < n; i++) {
      const ring = this.rings[i];
      ring.visible = !finished;
      ring.material = i === next ? this.ringMats.next : i === (next + 1) % n ? this.ringMats.after : this.ringMats.rest;
      ring.scale.setScalar(i === next ? 1 + Math.sin(time * 5) * 0.06 : 1);
    }
  }

  /** King of the sky: move the zone and colour it by who holds it. */
  public updateZone(zone: KingZone, state: ZoneState, hardMinY: number, hardMaxY: number, time: number): void {
    if (!this.zone) return;
    this.zone.position.set(zone.x, zone.y, zone.z);
    const color = ZONE_COLORS[state];
    this.zoneShellMat.color.setHex(color);
    this.zoneWireMat.color.setHex(color);
    this.beamMat.color.setHex(color);
    this.zoneShellMat.opacity = 0.1 + 0.05 * Math.sin(time * 3);
    this.zone.rotation.y = time * 0.3;
    const beam = this.zone.getObjectByName('beam');
    if (beam) beam.position.y = (hardMinY + hardMaxY) / 2 - zone.y;
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible && this.mode !== null && (this.rings.length > 0 || this.zone !== null);
  }

  public dispose(): void {
    this.clearMarkers();
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
