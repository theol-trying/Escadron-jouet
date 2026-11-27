import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../../shared/maps/index';
import { inSprinklerSpray, roomContact } from './roomContact';

test('sparks: a plane touching the desk top or a wall gets the contact point and the surface normal', () => {
  const desk = MAPS.desk;
  const s = desk.arenaScale ?? 1;
  // Just above the middle of the tabletop (design y 76)
  const top = roomContact(desk, -20 * s, 76 * s + 1, -40 * s, 2, 0);
  assert.ok(top, 'touching the tabletop');
  assert.equal(top.ny, 1);
  assert.ok(Math.abs(top.y - 76 * s) < 0.01);
  // Against the left wall
  const wall = roomContact(desk, desk.hardBounds.minX + 1, 150 * s, 0, 2, 0);
  assert.ok(wall && wall.nx === 1 && wall.x === desk.hardBounds.minX);
  // In the open air
  assert.equal(roomContact(desk, 0, 190 * s, 60 * s, 2, 0), null);
});

test('water drops: only inside the sprinkler jets, which turn with time', () => {
  const garden = MAPS.garden;
  const wz = garden.windZones[0];
  const jetTip = { x: wz.originX, y: wz.originY, z: wz.originZ - 60 }; // yaw 0 blows toward -Z
  assert.equal(inSprinklerSpray(garden, jetTip.x, jetTip.y, jetTip.z, 0), true);
  assert.equal(inSprinklerSpray(garden, wz.originX + 60, wz.originY, wz.originZ, 0), false, 'beside the jets');
  // A quarter turn later, the jets point along X
  const quarter = Math.PI / 2 / wz.sweepSpeed;
  assert.equal(inSprinklerSpray(garden, jetTip.x, jetTip.y, jetTip.z, quarter), false);
  assert.equal(inSprinklerSpray(MAPS.desk, 0, 100, 0, 0), false, 'no sprinkler in the desk room');
});
