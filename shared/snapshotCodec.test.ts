import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSnapshot, encodeSnapshot, type WireSnapshot } from './snapshotCodec';
import type { SnapshotPayload, SnapshotPlane } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Same rounding as the server (buildCompactSnapshot) */
function plane(i: number, o: Partial<SnapshotPlane> = {}): SnapshotPlane {
  return {
    id: i === 0 ? 'Jx8Kq2mZpLr0AbCdEfGh' : `bot_${'abcdefg'.slice(0, 7 - (i % 3))}${i}`,
    team: (['none', 'red', 'blue'] as const)[i % 3],
    x: r2(-231.47 + i * 37.13),
    y: r2(207.2 - i * 11.05),
    z: r2(175.01 - i * 50.5),
    qx: 0.012,
    qy: -0.707,
    qz: 0.031,
    qw: 0.706,
    speed: r2(57.8 + i),
    hp: 100 - i * 7,
    boost: 100 - i * 9,
    heat: i * 11,
    overheated: i === 3,
    alive: i !== 4,
    lives: 3 - (i % 3),
    invuln: i === 1,
    outOfBounds: i === 2 ? 1.27 : 0,
    barrelRoll: i === 5 ? 0.21 : 0,
    secondaryPowerUp: i === 2 ? 'magnet' : null,
    secondaryUses: i === 2 ? 1 : 0,
    shielded: i === 5,
    turboActive: false,
    glued: i === 3,
    magnetActive: false,
    lastAckSeq: 12345 + i,
    objective: i === 1 ? 12.3 : 0,
    ...o,
  };
}

function sample(): SnapshotPayload {
  const planes = Array.from({ length: 6 }, (_, i) => plane(i));
  return {
    tick: 4567,
    serverTime: 1795563000123,
    roundTimer: 187.43,
    suddenDeath: false,
    fanAngle: 1.234,
    mapEventTime: 421.17,
    planes,
    projectiles: Array.from({ length: 12 }, (_, i) => ({
      id: 9000 + i,
      ownerId: planes[i % 6].id,
      team: planes[i % 6].team,
      x: r2(12.34 * i),
      y: 150.5,
      z: -88.88,
      vx: 401.37,
      vy: -12.04,
      vz: 33.33,
      heavy: i % 4 === 0,
    })),
    secondaryProjectiles: [
      { id: 3, kind: 'rubber_missile', ownerId: planes[1].id, team: 'red', x: 1, y: 2, z: 3, vx: 4, vy: 5, vz: 6 },
    ],
    powerUps: [{ id: 'pu_7', powerUpId: 'turbo_battery', x: 10.5, y: 120.25, z: -40 }],
    destructibles: [
      { id: 'snack_box', hp: 12, maxHp: 30, destroyed: false },
      { id: 'lego_desk_tower_top', hp: 0, maxHp: 40, destroyed: true },
    ],
    vacuum: null,
  };
}

test('snapshot codec: binary round trip keeps every value the client uses', () => {
  const snap = sample();
  const back = decodeSnapshot(encodeSnapshot(snap));
  assert.deepEqual(back.planes, snap.planes);
  assert.deepEqual(back.secondaryProjectiles, snap.secondaryProjectiles);
  assert.deepEqual(back.powerUps, snap.powerUps);
  assert.deepEqual(back.destructibles, snap.destructibles);
  assert.equal(back.roundTimer, snap.roundTimer);
  assert.equal(back.mapEventTime, snap.mapEventTime);
  for (let i = 0; i < snap.projectiles.length; i++) {
    const a = snap.projectiles[i];
    const b = back.projectiles[i];
    assert.equal(b.ownerId, a.ownerId);
    assert.equal(b.heavy, a.heavy);
    assert.deepEqual([b.x, b.y, b.z], [a.x, a.y, a.z]);
    assert.ok(Math.abs(b.vx - a.vx) <= 0.05 && Math.abs(b.vz - a.vz) <= 0.05, 'velocity within 0.05');
  }
});

test('snapshot codec: an update is several times smaller than the JSON it replaces', () => {
  const snap = sample();
  const wire: WireSnapshot = encodeSnapshot(snap);
  const binaryBytes = (wire.p as Uint8Array).byteLength + (wire.b as Uint8Array).byteLength;
  const jsonPart = JSON.stringify({ ...wire, p: null, b: null }).length;
  const wireBytes = binaryBytes + jsonPart;
  const jsonBytes = JSON.stringify(snap).length;
  assert.ok(wireBytes < jsonBytes * 0.4, `wire ${wireBytes} B vs JSON ${jsonBytes} B`);
});
