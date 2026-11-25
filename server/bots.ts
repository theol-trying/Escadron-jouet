import {
  getPlaneForward,
  getPlaneRight,
  getPlaneUp,
  isOutsideSoftBounds,
  resolveSphereVsCollider,
} from '../shared/flightPhysics';
import { getMoverColliders } from '../shared/maps/movers';
import type { MapCollider, MapDefinition } from '../shared/maps/types';
import { PLANE_ARCHETYPES, PAINT_ORDER, PLANE_ORDER, STICKER_ORDER } from '../shared/planes';
import { RING_RADIUS, getKingZone, getRaceCourse } from '../shared/objectives';
import { canDamageTarget } from '../shared/rules';
import type { BotDifficulty, PlayerCosmetics, PlayerInputState, RoomSettings } from '../shared/types';
import type { BotPersonality, ServerPlayer } from './types';

/**
 * Skill levels chosen by the host. "normal" is the original behaviour.
 * - steer: gain from desired direction to stick input (lower = wider, slower turns)
 * - wobble: aiming sway as a fraction of the distance to the target (0 = steady)
 * - lead: share of the target's travel anticipated (0 = aims where the target is now)
 * - fireCone / fireRange: how well aligned and how close the target must be to shoot
 * - burst: share of the time the trigger may be held (fires in bursts below 1)
 * - grace: seconds after the round start before bots open fire
 */
export const BOT_SKILL: Record<
  BotDifficulty,
  { steer: number; wobble: number; lead: number; fireCone: number; fireRange: number; burst: number; grace: number }
> = {
  easy: { steer: 1.4, wobble: 0.14, lead: 0, fireCone: 0.955, fireRange: 165, burst: 0.5, grace: 5 },
  normal: { steer: 2.2, wobble: 0, lead: 1, fireCone: 0.91, fireRange: 220, burst: 1, grace: 3 },
  expert: { steer: 2.9, wobble: 0, lead: 1.1, fireCone: 0.885, fireRange: 265, burst: 1, grace: 2 },
};

const BOT_NAMES = [
  'Capitaine Brique',
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
  col: MapCollider,
  elapsedTime: number
): boolean {
  if (col.kind === 'box') {
    if (col.hinge) {
      return resolveSphereVsCollider(x, y, z, margin, col, elapsedTime) !== null;
    }
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

import type { ServerPowerUpPickup } from './types';

export function computeBotInput(
  bot: ServerPlayer,
  allPlayers: ServerPlayer[],
  settings: RoomSettings,
  map: MapDefinition,
  dt: number,
  elapsedTime: number,
  powerUps: ServerPowerUpPickup[] = [],
  /** Seconds since the round started (objective modes: zone schedule) */
  roundElapsed = 0
): PlayerInputState {
  const sim = bot.sim;
  const fwd = getPlaneForward(sim);
  const right = getPlaneRight(sim);
  const up = getPlaneUp(sim);
  const personality = bot.botPersonality ?? 'hunter';
  // « Survie » enemies are a notch below the chosen level (there are many of them)
  const level: BotDifficulty = bot.enemyKind
    ? settings.botDifficulty === 'expert'
      ? 'normal'
      : 'easy'
    : settings.botDifficulty;
  const skill = BOT_SKILL[level] ?? BOT_SKILL.normal;
  // Per-bot phase so bots do not sway or burst in sync
  const botPhase = (bot.id.charCodeAt(bot.id.length - 1) % 13) * 0.48;
  const triggerWindow = skill.burst >= 1 || (elapsedTime * 0.8 + botPhase) % 1 < skill.burst;

  // Room-related distances (patrol circle, altitudes, floor/ceiling) follow the arena scale;
  // combat distances (to enemies, power-ups, obstacle probes) stay at plane scale.
  const A = map.arenaScale ?? 1;

  // Default patrol point circling central airspace
  const orbitPhase = elapsedTime * 0.45 + (bot.id.charCodeAt(0) % 7);
  let targetX = Math.cos(orbitPhase) * 115 * A;
  let targetY = (personality === 'ambusher' ? 158 : 122 + Math.sin(orbitPhase * 1.4) * 18) * A;
  let targetZ = Math.sin(orbitPhase) * 90 * A;

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
  // True while the steering target is the enemy (lead point): shots then follow the steering alignment
  let targetIsEnemy = false;
  let wantsSecondary = false;
  let wantsBoost = false;
  let barrelRollDir: -1 | 0 | 1 = 0;

  // Seek nearby power-up if empty
  let soughtPickup: ServerPowerUpPickup | null = null;
  if (!bot.enemyKind && !sim.secondaryPowerUp && powerUps.length > 0) {
    let bestPuDist = 95;
    for (const pu of powerUps) {
      const d = Math.hypot(pu.x - sim.x, pu.y - sim.y, pu.z - sim.z);
      if (d < bestPuDist) {
        bestPuDist = d;
        soughtPickup = pu;
      }
    }
  }

  if (soughtPickup) {
    targetX = soughtPickup.x;
    targetY = soughtPickup.y;
    targetZ = soughtPickup.z;
  } else if (nearestEnemy) {
    const enemyFwd = getPlaneForward(nearestEnemy.sim);
    const arch = PLANE_ARCHETYPES[bot.cosmetics.planeId];
    const leadTime = Math.min(0.45, enemyDist / arch.projectileSpeed) * skill.lead;

    if (personality === 'evader' && enemyDist < 65) {
      // Evader breaks away laterally & climbs
      targetX = sim.x - (nearestEnemy.sim.x - sim.x) + right.x * 55;
      targetY = Math.min(185 * A, sim.y + 30);
      targetZ = sim.z - (nearestEnemy.sim.z - sim.z) + right.z * 55;
      wantsBoost = sim.boost > 30;
      if (sim.barrelRollCooldown <= 0 && enemyDist < 55) {
        barrelRollDir = (Math.floor(elapsedTime) % 2 === 0 ? 1 : -1) as -1 | 1;
      }
    } else if (personality === 'ambusher' && enemyDist > 110) {
      // Ambusher climbs above the enemy first
      targetX = nearestEnemy.sim.x;
      targetY = Math.min(190 * A, nearestEnemy.sim.y + 42);
      targetZ = nearestEnemy.sim.z;
    } else {
      // Lead target slightly
      targetIsEnemy = true;
      targetX = nearestEnemy.sim.x + enemyFwd.x * nearestEnemy.sim.speed * leadTime;
      targetY = nearestEnemy.sim.y + enemyFwd.y * nearestEnemy.sim.speed * leadTime;
      targetZ = nearestEnemy.sim.z + enemyFwd.z * nearestEnemy.sim.speed * leadTime;
      if (skill.wobble > 0) {
        // Unsteady aim for easy bots: the aim point drifts around the target
        const sway = skill.wobble * enemyDist;
        targetX += Math.sin(elapsedTime * 1.3 + botPhase) * sway;
        targetY += Math.cos(elapsedTime * 1.7 + botPhase) * sway * 0.6;
        targetZ += Math.cos(elapsedTime * 1.1 + botPhase * 2) * sway;
      }
      if (enemyDist > 150 && sim.boost > 45) {
        wantsBoost = true;
      }
    }
  }

  // Fly: buzzes around while diving at its target (hard to hit, it stings by flying into you)
  if (bot.enemyKind === 'fly' && targetIsEnemy) {
    const buzz = Math.min(25, enemyDist * 0.25);
    targetX += Math.sin(elapsedTime * 6.1 + botPhase * 3) * buzz;
    targetY += Math.cos(elapsedTime * 4.7 + botPhase) * buzz * 0.6;
    targetZ += Math.cos(elapsedTime * 5.3 + botPhase * 2) * buzz;
  }

  // Objective modes: race through the rings / head for the king zone
  // Race: distance to the next ring when the bot is heading at it (obstacle probes beyond it are ignored)
  let ringAheadDist = Infinity;
  let throttleOverride: number | null = null;
  if (settings.mode === 'ring_race') {
    const course = getRaceCourse(map);
    const ring = course[bot.objective % course.length];
    const ox = sim.x - ring.x;
    const oy = sim.y - ring.y;
    const oz = sim.z - ring.z;
    const dist = Math.hypot(ox, oy, oz) || 1;
    // Which face of the ring the bot is on (passing counts from either side)
    const side = ox * ring.nx + oy * ring.ny + oz * ring.nz < 0 ? -1 : 1;
    // Line up on the ring axis from the bot's own side: aim at a point on the axis that slides to the
    // centre as the bot closes in, so it flies through instead of circling around the ring.
    const back = Math.min(55, dist * 0.45) * side;
    targetX = ring.x + ring.nx * back;
    targetY = ring.y + ring.ny * back;
    targetZ = ring.z + ring.nz * back;
    const facing = -(ox * fwd.x + oy * fwd.y + oz * fwd.z) / dist;
    if (facing > 0.85) ringAheadDist = dist;
    // Brake (tighter turns) when the ring is close but not ahead
    if (dist < 80 && facing < 0.6) throttleOverride = -0.6;
    wantsBoost = sim.boost > 40 && dist > 110 && facing > 0.9;
  } else if (settings.mode === 'king_of_sky') {
    const zone = getKingZone(map, roundElapsed);
    const toZone = Math.hypot(zone.x - sim.x, zone.y - sim.y, zone.z - sim.z);
    // The zone is what scores: a fight only takes over when an enemy is right there
    const enemyClose = nearestEnemy !== null && enemyDist < 40;
    if (toZone > zone.radius * 0.8) {
      // Get into the zone unless a fight is on
      if (!enemyClose) {
        targetIsEnemy = false;
        targetX = zone.x;
        targetY = zone.y;
        targetZ = zone.z;
      }
    } else if (!enemyClose) {
      targetIsEnemy = false;
      // Inside: circle the centre (planes cannot hover), braking to keep the turn tight. The plane
      // closest to the centre scores, so the circle stays well inside the zone.
      const rx = sim.x - zone.x;
      const rz = sim.z - zone.z;
      const rLen = Math.hypot(rx, rz) || 1;
      // Turn the way the plane is already going round
      const spin = rx * fwd.z - rz * fwd.x >= 0 ? 1 : -1;
      const orbit = zone.radius * 0.45;
      const ang = Math.atan2(rz, rx) + spin * 0.9;
      targetX = zone.x + Math.cos(ang) * orbit;
      targetY = zone.y;
      targetZ = zone.z + Math.sin(ang) * orbit;
      if (rLen > orbit * 0.6) throttleOverride = -0.7;
    }
  }

  // Soft boundary priority recovery
  if (isOutsideSoftBounds(sim.x, sim.y, sim.z, map)) {
    targetIsEnemy = false;
    targetX = 0;
    targetY = 128 * A;
    targetZ = 0;
  }

  // Ahead obstacle probe: check 26cm & 48cm ahead (fixed furniture and what moves: mobile, train)
  const movers = getMoverColliders(map, elapsedTime);
  const obstacles = movers.length > 0 ? [...map.colliders, ...movers] : map.colliders;
  let avoidX = 0;
  let avoidY = 0;
  let avoidZ = 0;
  let obstacleAhead = false;

  for (const dist of [26, 48]) {
    // Heading straight through the next ring: what lies beyond it is the next hop's business
    if (dist > ringAheadDist + RING_RADIUS) continue;
    const px = sim.x + fwd.x * dist;
    const py = sim.y + fwd.y * dist;
    const pz = sim.z + fwd.z * dist;
    for (const col of obstacles) {
      if (pointInsideExpandedCollider(px, py, pz, 12, col, elapsedTime)) {
        obstacleAhead = true;
        avoidY += 1.0; // bias climb above obstacles
        avoidX += right.x * 0.6;
        avoidZ += right.z * 0.6;
        break;
      }
    }
    for (const hz of map.hazardZones) {
      const horiz = Math.hypot(px - hz.x, pz - hz.z);
      if (horiz <= hz.radius + 14 && py >= hz.y - 12 && py <= hz.y + hz.height + 12) {
        obstacleAhead = true;
        avoidY += 1.25;
        avoidX += right.x * 0.85;
        avoidZ += right.z * 0.85;
        break;
      }
    }
    if (py < 36 * A) {
      obstacleAhead = true;
      avoidY += 1.2;
    } else if (py > 192 * A) {
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
  // Alignment used to shoot: the steering one when chasing the enemy (lead point), otherwise the
  // direct line to the nearest enemy (no firing at a ring, a zone or a pickup)
  let shotDot = dotFwd;
  if (!targetIsEnemy || obstacleAhead) {
    shotDot = -1;
    if (nearestEnemy) {
      const ex = nearestEnemy.sim.x - sim.x;
      const ey = nearestEnemy.sim.y - sim.y;
      const ez = nearestEnemy.sim.z - sim.z;
      const eLen = Math.hypot(ex, ey, ez) || 1;
      shotDot = (ex * fwd.x + ey * fwd.y + ez * fwd.z) / eLen;
    }
  }

  const aimX = Math.max(-1, Math.min(1, dotRight * skill.steer));
  const aimY = Math.max(-1, Math.min(1, dotUp * skill.steer * 0.91));

  // Shoot when enemy is in front cone and weapon is cool enough (after 3s opening grace)
  if (
    elapsedTime > skill.grace &&
    triggerWindow &&
    nearestEnemy &&
    !obstacleAhead &&
    enemyDist < skill.fireRange &&
    shotDot > skill.fireCone &&
    !sim.overheated &&
    sim.heat < 82
  ) {
    wantsFire = true;
  }

  // Smart secondary power-up usage
  if (elapsedTime > 4.0 && sim.secondaryPowerUp && sim.secondaryCooldown <= 0) {
    if (sim.secondaryPowerUp === 'repair_tape' && sim.hp < sim.maxHp * 0.7) {
      wantsSecondary = true;
    } else if (sim.secondaryPowerUp === 'bubble_shield' && enemyDist < 120) {
      wantsSecondary = true;
    } else if (sim.secondaryPowerUp === 'turbo_battery' && enemyDist > 110) {
      wantsSecondary = true;
    } else if (sim.secondaryPowerUp === 'magnet' && enemyDist < 90) {
      wantsSecondary = true;
    } else if (sim.secondaryPowerUp === 'glue_mine' && enemyDist < 65) {
      wantsSecondary = true;
    } else if (
      (sim.secondaryPowerUp === 'rubber_missile' ||
        sim.secondaryPowerUp === 'firecracker' ||
        sim.secondaryPowerUp === 'water_bomb') &&
      nearestEnemy &&
      !obstacleAhead &&
      enemyDist < 185 &&
      shotDot > 0.86
    ) {
      wantsSecondary = true;
    }
  }

  if (settings.mode === 'ring_race' || bot.enemyKind === 'fly') {
    // No shooting in the race; flies have no gun
    wantsFire = false;
    wantsSecondary = false;
  }
  // Flies never brake (they ram), drones stop in mid-air to shoot when close
  const throttle =
    throttleOverride ??
    (bot.enemyKind === 'fly' ? 0.7 : bot.enemyKind === 'drone' ? (enemyDist < 130 ? -1 : 0.3) : enemyDist < 45 ? -0.4 : 0.4);

  return {
    seq: (bot.lastProcessedSeq ?? 0) + 1,
    dt,
    aimX,
    aimY,
    throttle,
    roll: 0,
    boost: wantsBoost,
    fire: wantsFire,
    useSecondary: wantsSecondary,
    barrelRollDir,
  };
}
