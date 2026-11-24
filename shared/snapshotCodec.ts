import { POWERUPS } from './powerups';
import type {
  PowerUpId,
  SecondaryProjectileKind,
  SnapshotPayload,
  SnapshotPlane,
  SnapshotProjectile,
  TeamId,
} from './types';

/**
 * Compact wire format of the 20 Hz snapshots. Planes and pellets — the bulk of the data — travel as
 * fixed-size binary records (Socket.io sends binary attachments natively); the rare, variable parts
 * stay JSON in short arrays. Every value keeps the precision the server already rounds to
 * (positions 0.01, quaternions 0.001…), except pellet velocities (0.1, display only).
 *
 * Plane record (41 bytes) — little endian:
 *   x,y,z i32 ×100 | qx,qy,qz,qw i16 ×1000 | speed u16 ×100 | hp u16 | boost u8 | heat u8 | lives u8 |
 *   uses u8 | outOfBounds u16 ×100 | barrelRoll u16 ×100 | lastAckSeq u32 | objective u16 ×10 |
 *   team u8 | flags u8 | power-up u8 (0 = none)
 * Pellet record (25 bytes): id u32 | owner u8 (index in ids, 255 = gone) | team u8 | heavy u8 |
 *   x,y,z i32 ×100 | vx,vy,vz i16 ×10
 */
export interface WireSnapshot {
  /** [tick, serverTime, roundTimer, suddenDeath 0/1, fanAngle, mapEventTime] */
  h: number[];
  /** Plane ids, in the order of the plane records (pellet owners point here) */
  ids: string[];
  p: ArrayBuffer | Uint8Array;
  b: ArrayBuffer | Uint8Array;
  /** Secondary projectiles: [id, kind, ownerIndex, team, x, y, z, vx, vy, vz] */
  s: Array<[number, SecondaryProjectileKind, number, number, number, number, number, number, number, number]>;
  /** Power-up pickups: [id, powerUpId, x, y, z] */
  u: Array<[string, PowerUpId, number, number, number]>;
  /** Destructible props: [id, hp, maxHp, destroyed 0/1] */
  d: Array<[string, number, number, number]>;
  /** Sudden-death vacuum: [x, y, z, safeRadius] or null */
  v: [number, number, number, number] | null;
}

const PLANE_BYTES = 41;
const PELLET_BYTES = 25;
const TEAMS: TeamId[] = ['none', 'red', 'blue'];
const POWERUP_IDS = Object.keys(POWERUPS) as PowerUpId[];
const FLAG_KEYS = ['overheated', 'alive', 'invuln', 'shielded', 'turboActive', 'glued', 'magnetActive'] as const;

const teamIndex = (t: TeamId) => Math.max(0, TEAMS.indexOf(t));
const clampU = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));
const clampI16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v)));

export function encodeSnapshot(s: SnapshotPayload): WireSnapshot {
  const ids = s.planes.map((p) => p.id);
  const idIndex = new Map(ids.map((id, i) => [id, i]));

  const p = new ArrayBuffer(s.planes.length * PLANE_BYTES);
  const pv = new DataView(p);
  s.planes.forEach((pl, i) => {
    const o = i * PLANE_BYTES;
    pv.setInt32(o, Math.round(pl.x * 100), true);
    pv.setInt32(o + 4, Math.round(pl.y * 100), true);
    pv.setInt32(o + 8, Math.round(pl.z * 100), true);
    pv.setInt16(o + 12, clampI16(pl.qx * 1000), true);
    pv.setInt16(o + 14, clampI16(pl.qy * 1000), true);
    pv.setInt16(o + 16, clampI16(pl.qz * 1000), true);
    pv.setInt16(o + 18, clampI16(pl.qw * 1000), true);
    pv.setUint16(o + 20, clampU(pl.speed * 100, 65535), true);
    pv.setUint16(o + 22, clampU(pl.hp, 65535), true);
    pv.setUint8(o + 24, clampU(pl.boost, 255));
    pv.setUint8(o + 25, clampU(pl.heat, 255));
    pv.setUint8(o + 26, clampU(pl.lives, 255));
    pv.setUint8(o + 27, clampU(pl.secondaryUses, 255));
    pv.setUint16(o + 28, clampU(pl.outOfBounds * 100, 65535), true);
    pv.setUint16(o + 30, clampU(pl.barrelRoll * 100, 65535), true);
    pv.setUint32(o + 32, clampU(pl.lastAckSeq, 4294967295), true);
    pv.setUint16(o + 36, clampU(pl.objective * 10, 65535), true);
    pv.setUint8(o + 38, teamIndex(pl.team));
    let flags = 0;
    FLAG_KEYS.forEach((k, bit) => {
      if (pl[k]) flags |= 1 << bit;
    });
    pv.setUint8(o + 39, flags);
    pv.setUint8(o + 40, pl.secondaryPowerUp ? POWERUP_IDS.indexOf(pl.secondaryPowerUp) + 1 : 0);
  });

  const b = new ArrayBuffer(s.projectiles.length * PELLET_BYTES);
  const bv = new DataView(b);
  s.projectiles.forEach((pr, i) => {
    const o = i * PELLET_BYTES;
    bv.setUint32(o, pr.id >>> 0, true);
    bv.setUint8(o + 4, idIndex.get(pr.ownerId) ?? 255);
    bv.setUint8(o + 5, teamIndex(pr.team));
    bv.setUint8(o + 6, pr.heavy ? 1 : 0);
    bv.setInt32(o + 7, Math.round(pr.x * 100), true);
    bv.setInt32(o + 11, Math.round(pr.y * 100), true);
    bv.setInt32(o + 15, Math.round(pr.z * 100), true);
    bv.setInt16(o + 19, clampI16(pr.vx * 10), true);
    bv.setInt16(o + 21, clampI16(pr.vy * 10), true);
    bv.setInt16(o + 23, clampI16(pr.vz * 10), true);
  });

  return {
    h: [s.tick, s.serverTime, s.roundTimer, s.suddenDeath ? 1 : 0, s.fanAngle, s.mapEventTime],
    ids,
    p: new Uint8Array(p),
    b: new Uint8Array(b),
    s: s.secondaryProjectiles.map((sp) => [
      sp.id,
      sp.kind,
      idIndex.get(sp.ownerId) ?? 255,
      teamIndex(sp.team),
      sp.x,
      sp.y,
      sp.z,
      sp.vx,
      sp.vy,
      sp.vz,
    ]),
    u: s.powerUps.map((pu) => [pu.id, pu.powerUpId, pu.x, pu.y, pu.z]),
    d: s.destructibles.map((d) => [d.id, d.hp, d.maxHp, d.destroyed ? 1 : 0]),
    v: s.vacuum ? [s.vacuum.x, s.vacuum.y, s.vacuum.z, s.vacuum.safeRadius] : null,
  };
}

function view(data: ArrayBuffer | ArrayBufferView): DataView {
  return ArrayBuffer.isView(data)
    ? new DataView(data.buffer, data.byteOffset, data.byteLength)
    : new DataView(data);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function decodeSnapshot(w: WireSnapshot): SnapshotPayload {
  const pv = view(w.p);
  const planes: SnapshotPlane[] = [];
  const count = Math.floor(pv.byteLength / PLANE_BYTES);
  for (let i = 0; i < count; i++) {
    const o = i * PLANE_BYTES;
    const flags = pv.getUint8(o + 39);
    const pu = pv.getUint8(o + 40);
    const plane = {
      id: w.ids[i] ?? `p${i}`,
      team: TEAMS[pv.getUint8(o + 38)] ?? 'none',
      x: pv.getInt32(o, true) / 100,
      y: pv.getInt32(o + 4, true) / 100,
      z: pv.getInt32(o + 8, true) / 100,
      qx: pv.getInt16(o + 12, true) / 1000,
      qy: pv.getInt16(o + 14, true) / 1000,
      qz: pv.getInt16(o + 16, true) / 1000,
      qw: pv.getInt16(o + 18, true) / 1000,
      speed: pv.getUint16(o + 20, true) / 100,
      hp: pv.getUint16(o + 22, true),
      boost: pv.getUint8(o + 24),
      heat: pv.getUint8(o + 25),
      lives: pv.getUint8(o + 26),
      secondaryUses: pv.getUint8(o + 27),
      outOfBounds: pv.getUint16(o + 28, true) / 100,
      barrelRoll: pv.getUint16(o + 30, true) / 100,
      lastAckSeq: pv.getUint32(o + 32, true),
      objective: pv.getUint16(o + 36, true) / 10,
      secondaryPowerUp: pu > 0 ? (POWERUP_IDS[pu - 1] ?? null) : null,
    } as SnapshotPlane;
    FLAG_KEYS.forEach((k, bit) => {
      plane[k] = (flags & (1 << bit)) !== 0;
    });
    planes.push(plane);
  }

  const bv = view(w.b);
  const projectiles: SnapshotProjectile[] = [];
  const pellets = Math.floor(bv.byteLength / PELLET_BYTES);
  for (let i = 0; i < pellets; i++) {
    const o = i * PELLET_BYTES;
    const owner = bv.getUint8(o + 4);
    projectiles.push({
      id: bv.getUint32(o, true),
      ownerId: w.ids[owner] ?? '',
      team: TEAMS[bv.getUint8(o + 5)] ?? 'none',
      heavy: bv.getUint8(o + 6) === 1,
      x: bv.getInt32(o + 7, true) / 100,
      y: bv.getInt32(o + 11, true) / 100,
      z: bv.getInt32(o + 15, true) / 100,
      vx: bv.getInt16(o + 19, true) / 10,
      vy: bv.getInt16(o + 21, true) / 10,
      vz: bv.getInt16(o + 23, true) / 10,
    });
  }

  const [tick, serverTime, roundTimer, suddenDeath, fanAngle, mapEventTime] = w.h;
  return {
    tick,
    serverTime,
    roundTimer: r2(roundTimer),
    suddenDeath: suddenDeath === 1,
    fanAngle,
    mapEventTime,
    planes,
    projectiles,
    secondaryProjectiles: w.s.map(([id, kind, owner, team, x, y, z, vx, vy, vz]) => ({
      id,
      kind,
      ownerId: w.ids[owner] ?? '',
      team: TEAMS[team] ?? 'none',
      x,
      y,
      z,
      vx,
      vy,
      vz,
    })),
    powerUps: w.u.map(([id, powerUpId, x, y, z]) => ({ id, powerUpId, x, y, z })),
    destructibles: w.d.map(([id, hp, maxHp, destroyed]) => ({ id, hp, maxHp, destroyed: destroyed === 1 })),
    vacuum: w.v ? { active: true, x: w.v[0], y: w.v[1], z: w.v[2], safeRadius: w.v[3] } : null,
  };
}
