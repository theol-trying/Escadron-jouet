import {
  getPlaneForward,
  getPlaneRight,
  getPlaneUp,
  isOutsideSoftBounds,
} from '../shared/flightPhysics';
import type { MapCollider, MapDefinition } from '../shared/maps/types';
import { PLANE_ARCHETYPES, PAINT_ORDER, PLANE_ORDER, STICKER_ORDER } from '../shared/planes';
import { canDamageTarget } from '../shared/rules';
import type { PlayerCosmetics, PlayerInputState, RoomSettings } from '../shared/types';
import type { BotPersonality, ServerPlayer } from './types';

const BOT_NAMES = [
  'Capitaine Légo',
  'As en Carton',
  'Moustique',
  'Baroudeur',
  'Trombone',
  'Fusée Rouge',
  'Gomme Rapide',
  'Crayon Bleu',
  'Punaise',
  'Bille d’Acier',
  'Ressort Fou',
  'Papier Plié',
  'Scotch',
  'Élastique',
  'Turbotin',
];

const PERSONALITIES: BotPersonality[] = ['hunter', 'evader', 'ambusher'];

export function pickBotCosmetics(index: number): PlayerCosmetics {
  return {
    planeId: PLANE_ORDER[index % PLANE_ORDER.length],
    paintId: PAINT_ORDER[(index * 2 + 1) % PAINT_ORDER.length],
    stickerId: STICKER_ORDER[index % STICKER_ORDER.length],
  };
}

export function pickBotName(existingNames: Set<string>, index: number): string {
  for (let i = 0; i < BOT_NAMES.length; i++) {
    const candidate = BOT_NAMES[(index + i) % BOT_NAMES.length];
    if (!existingNames.has(candidate)) return candidate;
  }
  return `Pilote Bot ${index + 1}`;
}

export function pickBotPersonality(index: number): BotPersonality {
  return PERSONALITIES[index % PERSONALITIES.length];
}

function pointInsideExpandedCollider(
  x: number,
  y: number,
  z: number,
  margin: number,
  col: MapCollider
): boolean {
  if (col.kind === 'box') {
    return (
      x >= col.minX - margin &&
      x <= col.maxX + margin &&
      y >= col.minY - margin &&
      y <= col.maxY + margin &&
      z >= col.minZ - margin &&
      z <= col.maxZ + margin
    );
  }
  if (col.kind === 'sphere') {
    const dx = x - col.x;
    const dy = y - col.y;
    const dz = z - col.z;
    const r = col.radius + margin;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }
  // Capsule bounding approximation
  const minX = Math.min(col.ax, col.bx) - col.radius - margin;
  const maxX = Math.max(col.ax, col.bx) + col.radius + margin;
  const minY = Math.min(col.ay, col.by) - col.radius - margin;
  const maxY = Math.max(col.ay, col.by) + col.radius + margin;
  const minZ = Math.min(col.az, col.bz) - col.radius - margin;
  const maxZ = Math.max(col.az, col.bz) + col.radius + margin;
  return x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ;
}

export function computeBotInput(
  bot: ServerPlayer,
  allPlayers: ServerPlayer[],
  settings: RoomSettings,
  map: MapDefinition,
  dt: number,
  elapsedTime: number
): PlayerInputState {
  const sim = bot.sim;
  const fwd = getPlaneForward(sim);
  const right = getPlaneRight(sim);
  const up = getPlaneUp(sim);
  const personality = bot.botPersonality ?? 'hunter';

  // Default patrol point circling central airspace
  const orbitPhase = elapsedTime * 0.45 + (bot.id.charCodeAt(0) % 7);
  let targetX = Math.cos(orbitPhase) * 115;
  let targetY = personality === 'ambusher' ? 158 : 122 + Math.sin(orbitPhase * 1.4) * 18;
  let targetZ = Math.sin(orbitPhase) * 90;

  let enemyDist = Infinity;
  let nearestEnemy: ServerPlayer | null = null;

  for (const other of allPlayers) {
    if (!other.sim.alive) continue;
    if (!canDamageTarget(settings.mode, settings.friendlyFire, bot.id, bot.team, other.id, other.team)) {
      continue;
    }
    const d = Math.hypot(other.sim.x - sim.x, other.sim.y - sim.y, other.sim.z - sim.z);
    if (d < enemyDist) {
      enemyDist = d;
      nearestEnemy = other;
    }
  }

  let wantsFire = false;
  let wantsBoost = false;
  let barrelRollDir: -1 | 0 | 1 = 0;

  if (nearestEnemy) {
    const enemyFwd = getPlaneForward(nearestEnemy.sim);
    const arch = PLANE_ARCHETYPES[bot.cosmetics.planeId];
    const leadTime = Math.min(0.45, enemyDist / arch.projectileSpeed);

    if (personality === 'evader' && enemyDist < 65) {
      // Evader breaks away laterally & climbs
      targetX = sim.x - (nearestEnemy.sim.x - sim.x) + right.x * 55;
      targetY = Math.min(185, sim.y + 30);
      targetZ = sim.z - (nearestEnemy.sim.z - sim.z) + right.z * 55;
      wantsBoost = sim.boost > 30;
      if (sim.barrelRollCooldown <= 0 && enemyDist < 55) {
        barrelRollDir = (Math.floor(elapsedTime) % 2 === 0 ? 1 : -1) as -1 | 1;
      }
    } else if (personality === 'ambusher' && enemyDist > 110) {
      // Ambusher climbs above the enemy first
      targetX = nearestEnemy.sim.x;
      targetY = Math.min(190, nearestEnemy.sim.y + 42);
      targetZ = nearestEnemy.sim.z;
    } else {
      // Lead target slightly
      targetX = nearestEnemy.sim.x + enemyFwd.x * nearestEnemy.sim.speed * leadTime;
      targetY = nearestEnemy.sim.y + enemyFwd.y * nearestEnemy.sim.speed * leadTime;
      targetZ = nearestEnemy.sim.z + enemyFwd.z * nearestEnemy.sim.speed * leadTime;
      if (enemyDist > 150 && sim.boost > 45) {
        wantsBoost = true;
      }
    }
  }

  // Soft boundary priority recovery
  if (isOutsideSoftBounds(sim.x, sim.y, sim.z, map)) {
    targetX = 0;
    targetY = 128;
    targetZ = 0;
  }

  // Ahead obstacle probe: check 30cm & 55cm ahead
  let avoidX = 0;
  let avoidY = 0;
  let avoidZ = 0;
  let obstacleAhead = false;

  for (const dist of [26, 48]) {
    const px = sim.x + fwd.x * dist;
    const py = sim.y + fwd.y * dist;
    const pz = sim.z + fwd.z * dist;
    for (const col of map.colliders) {
      if (pointInsideExpandedCollider(px, py, pz, 12, col)) {
        obstacleAhead = true;
        avoidY += 1.0; // bias climb above obstacles
        avoidX += right.x * 0.6;
        avoidZ += right.z * 0.6;
        break;
      }
    }
    if (py < 36) {
      obstacleAhead = true;
      avoidY += 1.2;
    } else if (py > 192) {
      obstacleAhead = true;
      avoidY -= 1.2;
    }
  }

  let dirX = targetX - sim.x;
  let dirY = targetY - sim.y;
  let dirZ = targetZ - sim.z;
  const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
  dirX /= dirLen;
  dirY /= dirLen;
  dirZ /= dirLen;

  if (obstacleAhead) {
    dirX += avoidX * 1.4;
    dirY += avoidY * 1.4;
    dirZ += avoidZ * 1.4;
    const nLen = Math.hypot(dirX, dirY, dirZ) || 1;
    dirX /= nLen;
    dirY /= nLen;
    dirZ /= nLen;
  }

  // Project desired direction onto plane's right & up vectors
  const dotRight = dirX * right.x + dirY * right.y + dirZ * right.z;
  const dotUp = dirX * up.x + dirY * up.y + dirZ * up.z;
  const dotFwd = dirX * fwd.x + dirY * fwd.y + dirZ * fwd.z;

  const aimX = Math.max(-1, Math.min(1, dotRight * 2.2));
  const aimY = Math.max(-1, Math.min(1, dotUp * 2.0));

  // Shoot when enemy is in front cone and weapon is cool enough (after 3s opening grace)
  if (
    elapsedTime > 3.0 &&
    nearestEnemy &&
    !obstacleAhead &&
    enemyDist < 220 &&
    dotFwd > 0.91 &&
    !sim.overheated &&
    sim.heat < 82
  ) {
    wantsFire = true;
  }

  return {
    seq: (bot.lastProcessedSeq ?? 0) + 1,
    dt,
    aimX,
    aimY,
    throttle: enemyDist < 45 ? -0.4 : 0.4,
    roll: 0,
    boost: wantsBoost,
    fire: wantsFire,
    barrelRollDir,
  };
}
