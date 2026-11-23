// server.ts
import "dotenv/config";
import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server as SocketIOServer } from "socket.io";

// shared/maps/desk.ts
function box(id, minX, minY, minZ, maxX, maxY, maxZ, tier = "static") {
  return { id, kind: "box", tier, minX, minY, minZ, maxX, maxY, maxZ };
}
function sphere(id, x, y, z, radius, tier = "static") {
  return { id, kind: "sphere", tier, x, y, z, radius };
}
function capsule(id, ax, ay, az, bx, by, bz, radius, tier = "static") {
  return { id, kind: "capsule", tier, ax, ay, az, bx, by, bz, radius };
}
var DESK_MAP = {
  id: "desk",
  nameFr: "Le bureau",
  subtitleFr: "Coin bureau g\xE9ant : clavier canyon, tiroir tunnel, tours Lego et ventilateur oscillant.",
  available: true,
  hardBounds: {
    minX: -250,
    maxX: 250,
    minY: 6,
    maxY: 222,
    minZ: -185,
    maxZ: 185
  },
  softBounds: {
    minX: -236,
    maxX: 236,
    minY: 8,
    maxY: 210,
    minZ: -174,
    maxZ: 174
  },
  skyColor: "#D6EEFF",
  fogColor: "#E5F2FF",
  colliders: [
    // Desk main tabletop (Y: 70..76)
    box("desk_top", -195, 70, -120, 145, 76, 35),
    // Desk left pedestal cabinet
    box("desk_left_leg", -190, 0, -115, -135, 70, 28),
    // Desk right drawer cabinet frame (under tabletop, leaving upper drawer tunnel open)
    box("desk_right_lower", 45, 0, -115, 140, 40, 28),
    box("desk_right_side_l", 45, 40, -115, 53, 70, 28),
    box("desk_right_side_r", 132, 40, -115, 140, 70, 28),
    // Open drawer pulled out in front (+Z), forming a fly-through canyon/tunnel
    box("open_drawer_bottom", 54, 42, 28, 130, 46, 98),
    box("open_drawer_left", 54, 46, 28, 59, 64, 98),
    box("open_drawer_right", 125, 46, 28, 130, 64, 98),
    box("open_drawer_front", 54, 46, 93, 130, 66, 98),
    // Giant Monitor Wall (gap underneath Y: 76..92 to fly under!)
    box("monitor_base", -65, 76, -98, -25, 80, -76),
    box("monitor_neck", -51, 80, -94, -39, 94, -84),
    box("monitor_screen", -108, 92, -92, 18, 160, -82),
    // Keyboard Canyon on desk
    box("keyboard_body", -105, 76, -46, -5, 83, -10),
    // Pencil cup (cylinder approximated with capsule) + protruding giant pencils
    capsule("pencil_cup", 62, 78, -58, 62, 100, -58, 10),
    capsule("giant_pencil_1", 59, 100, -56, 54, 126, -52, 2.2),
    capsule("giant_pencil_2", 66, 100, -61, 72, 124, -64, 2.2),
    // Book stacks on left desk
    box("desk_books_1", -172, 76, -72, -130, 92, -32, "medium"),
    box("desk_books_2", -168, 92, -68, -134, 106, -36, "medium"),
    box("desk_books_3", -164, 106, -64, -138, 118, -40, "medium"),
    // Floor book stack (under-desk / bedside side)
    box("floor_books_1", -170, 0, 88, -120, 20, 132, "medium"),
    box("floor_books_2", -164, 20, 92, -124, 38, 128, "medium"),
    box("floor_books_3", -158, 38, 95, -128, 52, 125, "medium"),
    // Lego tower on right side of desk (tall landmark)
    box("lego_desk_tower_base", 86, 76, -68, 124, 116, -34, "small"),
    box("lego_desk_tower_top", 92, 116, -62, 118, 142, -40, "small"),
    // Floor Lego Archway on right side (fly through the arch!)
    box("lego_arch_left", 162, 0, 48, 184, 62, 76, "small"),
    box("lego_arch_right", 162, 0, 108, 184, 62, 136, "small"),
    box("lego_arch_bridge", 162, 62, 48, 184, 82, 136, "small"),
    // Wall Shelf high on back wall (-Z)
    box("wall_shelf", -175, 146, -182, 145, 154, -138),
    // Globe & trophy on wall shelf
    sphere("shelf_globe", -120, 168, -158, 14),
    box("shelf_books", 70, 154, -176, 125, 182, -144, "medium"),
    // Window Sill on left wall (-X)
    box("window_sill", -248, 66, -110, -220, 74, 110),
    // Desk Fan on left-front corner of desk
    box("fan_base", -178, 76, -8, -150, 82, 20),
    capsule("fan_stem", -164, 82, 6, -164, 108, 6, 3.5),
    sphere("fan_cage", -164, 112, 6, 16),
    // Bedside lamp / mug near front-left floor/corner
    capsule("floor_mug", -22, 0, 118, -22, 24, 118, 14)
  ],
  spawns: [
    // Open upper-mid airspace along clear perimeter/desk lanes (5s+ unobstructed)
    { x: -165, y: 148, z: 125, yaw: -Math.PI * 0.44 },
    { x: 175, y: 152, z: 118, yaw: Math.PI * 0.44 },
    { x: -175, y: 172, z: -20, yaw: -Math.PI * 0.52 },
    { x: 185, y: 172, z: -30, yaw: Math.PI * 0.52 },
    { x: -185, y: 132, z: 72, yaw: -Math.PI * 0.48 },
    { x: 190, y: 132, z: 65, yaw: Math.PI * 0.48 },
    { x: 165, y: 126, z: -115, yaw: Math.PI * 0.58 },
    { x: -165, y: 126, z: -115, yaw: -Math.PI * 0.58 },
    { x: -75, y: 176, z: 115, yaw: -Math.PI * 0.35 },
    { x: 75, y: 176, z: 115, yaw: Math.PI * 0.35 },
    { x: -190, y: 98, z: 130, yaw: -Math.PI * 0.46 },
    { x: 195, y: 98, z: 125, yaw: Math.PI * 0.46 },
    { x: -135, y: 174, z: -105, yaw: -Math.PI * 0.55 },
    { x: 140, y: 174, z: -105, yaw: Math.PI * 0.55 },
    { x: -40, y: 182, z: 128, yaw: -Math.PI * 0.42 },
    { x: 40, y: 182, z: 128, yaw: Math.PI * 0.42 }
  ],
  windZones: [
    {
      originX: -164,
      originY: 112,
      originZ: 6,
      range: 135,
      coneHalfAngle: 0.42,
      baseYaw: -Math.PI * 0.42,
      // blows +X / slightly -Z across the desk
      sweepAmplitude: 0.55,
      sweepSpeed: 0.65,
      pushStrength: 68
    }
  ],
  powerUpSpots: [
    { id: "pu_under_monitor", x: -45, y: 86, z: -87 },
    { id: "pu_drawer_tunnel", x: 92, y: 58, z: 62 },
    { id: "pu_lego_arch", x: 173, y: 34, z: 92 },
    { id: "pu_wall_shelf", x: -15, y: 168, z: -156 }
  ]
};

// shared/maps/index.ts
var MAPS = {
  desk: DESK_MAP,
  kitchen: {
    id: "kitchen",
    nameFr: "La cuisine",
    subtitleFr: "Comptoir, grille-pain, \xE9vier et mixeur g\xE9ant (Jalons 3\u20134).",
    available: false,
    hardBounds: DESK_MAP.hardBounds,
    softBounds: DESK_MAP.softBounds,
    skyColor: "#FFF3D6",
    fogColor: "#FFF7E5",
    colliders: [],
    spawns: DESK_MAP.spawns,
    windZones: [],
    powerUpSpots: []
  },
  garden: {
    id: "garden",
    nameFr: "Le jardin",
    subtitleFr: "Brins d\u2019herbe g\xE9ants, pots de fleurs et arroseur (Jalons 3\u20134).",
    available: false,
    hardBounds: DESK_MAP.hardBounds,
    softBounds: DESK_MAP.softBounds,
    skyColor: "#BEE9FF",
    fogColor: "#D6F2FF",
    colliders: [],
    spawns: DESK_MAP.spawns,
    windZones: [],
    powerUpSpots: []
  }
};

// shared/planes.ts
var PLANE_ARCHETYPES = {
  plastic_jet: {
    id: "plastic_jet",
    nameFr: "Jet en plastique",
    taglineFr: "Polyvalent, vif et \xE9quilibr\xE9 pour toutes les man\u0153uvres.",
    materialFeelFr: "Plastique ABS brillant",
    maxHp: 100,
    minSpeed: 40,
    cruiseSpeed: 68,
    maxSpeed: 92,
    boostSpeed: 130,
    turnRate: 2.35,
    rollRate: 3.8,
    fireRate: 7.5,
    damage: 14,
    projectileSpeed: 360,
    overheatPerShot: 7.5,
    coolRate: 28,
    hitboxRadius: 5.5,
    wingspan: 10.5,
    heavyGun: false,
    statsDisplay: { speed: 4, agility: 4, armor: 3, firepower: 3 }
  },
  windup_biplane: {
    id: "windup_biplane",
    nameFr: "Biplan \xE0 remontoir",
    taglineFr: "Ultra maniable avec cl\xE9 dorsale, id\xE9al dans les virages serr\xE9s.",
    materialFeelFr: "Fer-blanc peint",
    maxHp: 110,
    minSpeed: 34,
    cruiseSpeed: 58,
    maxSpeed: 80,
    boostSpeed: 115,
    turnRate: 3.15,
    rollRate: 4.5,
    fireRate: 8.5,
    damage: 13,
    projectileSpeed: 340,
    overheatPerShot: 6.5,
    coolRate: 32,
    hitboxRadius: 5.6,
    wingspan: 10.2,
    heavyGun: false,
    statsDisplay: { speed: 2, agility: 5, armor: 3, firepower: 3 }
  },
  foam_glider: {
    id: "foam_glider",
    nameFr: "Planeur en mousse",
    taglineFr: "Le plus rapide de la chambre, mais fragile aux chocs.",
    materialFeelFr: "Mousse PPE l\xE9g\xE8re",
    maxHp: 78,
    minSpeed: 48,
    cruiseSpeed: 82,
    maxSpeed: 110,
    boostSpeed: 152,
    turnRate: 2.55,
    rollRate: 4.1,
    fireRate: 9,
    damage: 11,
    projectileSpeed: 380,
    overheatPerShot: 6,
    coolRate: 30,
    hitboxRadius: 5.2,
    wingspan: 11.4,
    heavyGun: false,
    statsDisplay: { speed: 5, agility: 4, armor: 1, firepower: 2 }
  },
  diecast_bomber: {
    id: "diecast_bomber",
    nameFr: "Bombardier en m\xE9tal",
    taglineFr: "Lourd et blind\xE9, \xE9quip\xE9 de canons lourds \xE0 billes.",
    materialFeelFr: "M\xE9tal moul\xE9 lourd",
    maxHp: 145,
    minSpeed: 36,
    cruiseSpeed: 60,
    maxSpeed: 82,
    boostSpeed: 118,
    turnRate: 1.85,
    rollRate: 3,
    fireRate: 4.6,
    damage: 25,
    projectileSpeed: 350,
    overheatPerShot: 11.5,
    coolRate: 26,
    hitboxRadius: 6.3,
    wingspan: 11.8,
    heavyGun: true,
    statsDisplay: { speed: 2, agility: 2, armor: 5, firepower: 5 }
  }
};
var PLANE_ORDER = [
  "plastic_jet",
  "windup_biplane",
  "foam_glider",
  "diecast_bomber"
];
var PAINT_ORDER = [
  "red",
  "blue",
  "yellow",
  "green",
  "orange",
  "white"
];
var STICKER_ORDER = ["star", "lightning", "target", "flame"];

// shared/rules.ts
var ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
function generateRoomCode(rng = Math.random) {
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
function sanitizeNickname(raw) {
  const cleaned = raw.replace(/[^\p{L}\p{N}_\-\s]/gu, "").trim().slice(0, 16);
  return cleaned.length >= 2 ? cleaned : "Pilote";
}
function assignBalancedTeam(players) {
  let redCount = 0;
  let blueCount = 0;
  for (const p of players) {
    if (p.team === "red") redCount++;
    else if (p.team === "blue") blueCount++;
  }
  return redCount <= blueCount ? "red" : "blue";
}
function autoBalanceTeams(players) {
  let toggle = 0;
  for (const p of players) {
    p.team = toggle % 2 === 0 ? "red" : "blue";
    toggle++;
  }
}
function checkRoundWinner(mode, players, roundTimerRemaining) {
  const activeContenders = players.filter((p) => p.alive || p.lives > 0);
  if (mode === "last_plane_ffa") {
    if (players.length > 1 && activeContenders.length <= 1) {
      const winner = activeContenders[0] ?? null;
      return {
        finished: true,
        winnerId: winner?.id ?? null,
        winnerTeam: "none",
        winnerName: winner?.nickname ?? "\xC9galit\xE9"
      };
    }
    if (roundTimerRemaining <= 0) {
      const sorted = [...players].sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        return b.lives - a.lives;
      });
      const top = sorted[0];
      return {
        finished: true,
        winnerId: top?.id ?? null,
        winnerTeam: "none",
        winnerName: top?.nickname ?? "\xC9galit\xE9"
      };
    }
    return { finished: false, winnerId: null, winnerTeam: "none", winnerName: "" };
  }
  const redAlive = activeContenders.some((p) => p.team === "red");
  const blueAlive = activeContenders.some((p) => p.team === "blue");
  const hasRed = players.some((p) => p.team === "red");
  const hasBlue = players.some((p) => p.team === "blue");
  if (hasRed && hasBlue && (!redAlive || !blueAlive)) {
    const winningTeam = redAlive ? "red" : blueAlive ? "blue" : "none";
    return {
      finished: true,
      winnerId: null,
      winnerTeam: winningTeam,
      winnerName: winningTeam === "red" ? "\xC9quipe Rouge" : winningTeam === "blue" ? "\xC9quipe Bleue" : "\xC9galit\xE9"
    };
  }
  if (roundTimerRemaining <= 0) {
    const redLives = players.filter((p) => p.team === "red").reduce((acc, p) => acc + p.lives + (p.alive ? 1 : 0), 0);
    const blueLives = players.filter((p) => p.team === "blue").reduce((acc, p) => acc + p.lives + (p.alive ? 1 : 0), 0);
    const winningTeam = redLives > blueLives ? "red" : blueLives > redLives ? "blue" : "none";
    return {
      finished: true,
      winnerId: null,
      winnerTeam: winningTeam,
      winnerName: winningTeam === "red" ? "\xC9quipe Rouge" : winningTeam === "blue" ? "\xC9quipe Bleue" : "\xC9galit\xE9"
    };
  }
  return { finished: false, winnerId: null, winnerTeam: "none", winnerName: "" };
}
function canDamageTarget(mode, friendlyFire, attackerId, attackerTeam, targetId, targetTeam) {
  if (attackerId === targetId) return false;
  if (mode === "last_plane_teams" && !friendlyFire && attackerTeam !== "none" && attackerTeam === targetTeam) {
    return false;
  }
  return true;
}
function applyDamageToSim(sim, damage) {
  if (!sim.alive || sim.invulnTimer > 0) {
    return { eliminated: false, lostRound: false };
  }
  sim.hp = Math.max(0, sim.hp - damage);
  sim.hitFlashTimer = 0.14;
  if (sim.hp > 0) {
    return { eliminated: false, lostRound: false };
  }
  sim.alive = false;
  sim.lives = Math.max(0, sim.lives - 1);
  if (sim.lives > 0) {
    sim.respawnTimer = 2.6;
    return { eliminated: true, lostRound: false };
  }
  sim.respawnTimer = 0;
  return { eliminated: true, lostRound: true };
}
function isMatchOver(mode, roundNumber, maxRounds, teamRoundWins, scoreboard) {
  const winsNeeded = Math.ceil(maxRounds / 2);
  if (mode === "last_plane_teams") {
    if (teamRoundWins.red >= winsNeeded || teamRoundWins.blue >= winsNeeded) {
      return true;
    }
  } else {
    if (scoreboard.some((entry) => entry.roundWins >= winsNeeded)) {
      return true;
    }
  }
  return roundNumber >= maxRounds;
}

// shared/flightPhysics.ts
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
function rotateVecByQuat(vx, vy, vz, qx, qy, qz, qw) {
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx
  };
}
function mulQuat(ax, ay, az, aw, bx, by, bz, bw) {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}
function quatFromAxisAngle(ax, ay, az, angle) {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return [ax * s, ay * s, az * s, Math.cos(half)];
}
function normalizeQuat(qx, qy, qz, qw) {
  const len = Math.hypot(qx, qy, qz, qw) || 1;
  return [qx / len, qy / len, qz / len, qw / len];
}
function quatFromYaw(yaw) {
  return quatFromAxisAngle(0, 1, 0, yaw);
}
function getPlaneForward(state) {
  return rotateVecByQuat(0, 0, -1, state.qx, state.qy, state.qz, state.qw);
}
function getPlaneUp(state) {
  return rotateVecByQuat(0, 1, 0, state.qx, state.qy, state.qz, state.qw);
}
function getPlaneRight(state) {
  return rotateVecByQuat(1, 0, 0, state.qx, state.qy, state.qz, state.qw);
}
function isOutsideSoftBounds(x, y, z, map) {
  const sb = map.softBounds;
  return x < sb.minX || x > sb.maxX || y < sb.minY || y > sb.maxY || z < sb.minZ || z > sb.maxZ;
}
function getFanYawAtTime(baseYaw, sweepAmplitude, sweepSpeed, elapsedTime) {
  return baseYaw + Math.sin(elapsedTime * sweepSpeed) * sweepAmplitude;
}
function closestPointOnSegment(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq <= 1e-6) return { x: ax, y: ay, z: az };
  const t = clamp(((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lenSq, 0, 1);
  return {
    x: ax + abx * t,
    y: ay + aby * t,
    z: az + abz * t
  };
}
function resolveSphereVsCollider(sx, sy, sz, radius, collider) {
  if (collider.kind === "box") {
    const cx = clamp(sx, collider.minX, collider.maxX);
    const cy = clamp(sy, collider.minY, collider.maxY);
    const cz = clamp(sz, collider.minZ, collider.maxZ);
    const dx2 = sx - cx;
    const dy2 = sy - cy;
    const dz2 = sz - cz;
    const distSq2 = dx2 * dx2 + dy2 * dy2 + dz2 * dz2;
    if (distSq2 >= radius * radius) return null;
    if (distSq2 > 1e-6) {
      const dist2 = Math.sqrt(distSq2);
      return {
        nx: dx2 / dist2,
        ny: dy2 / dist2,
        nz: dz2 / dist2,
        depth: radius - dist2
      };
    }
    const dMinX = Math.abs(sx - collider.minX);
    const dMaxX = Math.abs(collider.maxX - sx);
    const dMinY = Math.abs(sy - collider.minY);
    const dMaxY = Math.abs(collider.maxY - sy);
    const dMinZ = Math.abs(sz - collider.minZ);
    const dMaxZ = Math.abs(collider.maxZ - sz);
    const minDist = Math.min(dMinX, dMaxX, dMinY, dMaxY, dMinZ, dMaxZ);
    if (minDist === dMinX) return { nx: -1, ny: 0, nz: 0, depth: radius + dMinX };
    if (minDist === dMaxX) return { nx: 1, ny: 0, nz: 0, depth: radius + dMaxX };
    if (minDist === dMinY) return { nx: 0, ny: -1, nz: 0, depth: radius + dMinY };
    if (minDist === dMaxY) return { nx: 0, ny: 1, nz: 0, depth: radius + dMaxY };
    if (minDist === dMinZ) return { nx: 0, ny: 0, nz: -1, depth: radius + dMinZ };
    return { nx: 0, ny: 0, nz: 1, depth: radius + dMaxZ };
  }
  if (collider.kind === "sphere") {
    const dx2 = sx - collider.x;
    const dy2 = sy - collider.y;
    const dz2 = sz - collider.z;
    const minR2 = radius + collider.radius;
    const distSq2 = dx2 * dx2 + dy2 * dy2 + dz2 * dz2;
    if (distSq2 >= minR2 * minR2) return null;
    const dist2 = Math.sqrt(distSq2) || 1e-3;
    return {
      nx: dx2 / dist2,
      ny: dy2 / dist2,
      nz: dz2 / dist2,
      depth: minR2 - dist2
    };
  }
  const cp = closestPointOnSegment(
    sx,
    sy,
    sz,
    collider.ax,
    collider.ay,
    collider.az,
    collider.bx,
    collider.by,
    collider.bz
  );
  const dx = sx - cp.x;
  const dy = sy - cp.y;
  const dz = sz - cp.z;
  const minR = radius + collider.radius;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq >= minR * minR) return null;
  const dist = Math.sqrt(distSq) || 1e-3;
  return {
    nx: dx / dist,
    ny: dy / dist,
    nz: dz / dist,
    depth: minR - dist
  };
}
function stepPlanePhysics(state, input, archetype, map, elapsedTime) {
  const dt = clamp(input.dt, 1e-3, 0.05);
  const result = {
    collided: false,
    collisionDamage: 0,
    hitNormal: null
  };
  if (!state.alive) return result;
  if (state.invulnTimer > 0) state.invulnTimer = Math.max(0, state.invulnTimer - dt);
  if (state.hitFlashTimer > 0) state.hitFlashTimer = Math.max(0, state.hitFlashTimer - dt);
  if (state.collideCooldown > 0) state.collideCooldown = Math.max(0, state.collideCooldown - dt);
  if (state.fireCooldown > 0) state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  if (state.barrelRollCooldown > 0) {
    state.barrelRollCooldown = Math.max(0, state.barrelRollCooldown - dt);
  }
  if (input.barrelRollDir !== 0 && state.barrelRollTimer <= 0 && state.barrelRollCooldown <= 0) {
    state.barrelRollTimer = 0.34;
    state.barrelRollCooldown = 1.15;
    state.barrelRollDir = input.barrelRollDir;
  }
  const isBoosting = input.boost && state.boost > 1;
  if (isBoosting) {
    state.boost = Math.max(0, state.boost - 34 * dt);
  } else {
    state.boost = Math.min(100, state.boost + 18 * dt);
  }
  const throttle = clamp(input.throttle, -1, 1);
  let targetSpeed = archetype.cruiseSpeed;
  if (isBoosting) {
    targetSpeed = archetype.boostSpeed;
  } else if (throttle > 0.05) {
    targetSpeed = archetype.cruiseSpeed + (archetype.maxSpeed - archetype.cruiseSpeed) * throttle;
  } else if (throttle < -0.05) {
    targetSpeed = archetype.cruiseSpeed + (archetype.cruiseSpeed - archetype.minSpeed) * throttle;
  }
  const speedLerp = 1 - Math.exp(-6.5 * dt);
  state.speed += (targetSpeed - state.speed) * speedLerp;
  state.heat = Math.max(0, state.heat - archetype.coolRate * dt);
  if (state.overheated && state.heat <= 22) {
    state.overheated = false;
  }
  const aimX = clamp(input.aimX, -1, 1);
  const aimY = clamp(input.aimY, -1, 1);
  const rollInput = clamp(input.roll, -1, 1);
  const yawDelta = -aimX * archetype.turnRate * dt;
  const pitchDelta = aimY * archetype.turnRate * 0.9 * dt;
  let [qx, qy, qz, qw] = [state.qx, state.qy, state.qz, state.qw];
  const [wyx, wyy, wyz, wyw] = quatFromAxisAngle(0, 1, 0, yawDelta);
  [qx, qy, qz, qw] = mulQuat(wyx, wyy, wyz, wyw, qx, qy, qz, qw);
  const [px, py, pz, pw] = quatFromAxisAngle(1, 0, 0, pitchDelta);
  [qx, qy, qz, qw] = mulQuat(qx, qy, qz, qw, px, py, pz, pw);
  const forwardCheck = rotateVecByQuat(0, 0, -1, qx, qy, qz, qw);
  if (Math.abs(forwardCheck.y) > 0.9) {
    const fixPitch = (forwardCheck.y > 0 ? -1 : 1) * (Math.abs(forwardCheck.y) - 0.9) * 1.4;
    const [fx, fy, fz, fw] = quatFromAxisAngle(1, 0, 0, fixPitch);
    [qx, qy, qz, qw] = mulQuat(qx, qy, qz, qw, fx, fy, fz, fw);
  }
  if (state.barrelRollTimer > 0) {
    state.barrelRollTimer = Math.max(0, state.barrelRollTimer - dt);
    const spinRate = Math.PI * 2 / 0.34;
    const [rx, ry, rz, rw] = quatFromAxisAngle(0, 0, -1, state.barrelRollDir * spinRate * dt);
    [qx, qy, qz, qw] = mulQuat(qx, qy, qz, qw, rx, ry, rz, rw);
  } else if (Math.abs(rollInput) > 0.05) {
    const [rx, ry, rz, rw] = quatFromAxisAngle(0, 0, -1, rollInput * archetype.rollRate * dt);
    [qx, qy, qz, qw] = mulQuat(qx, qy, qz, qw, rx, ry, rz, rw);
  } else {
    const up = rotateVecByQuat(0, 1, 0, qx, qy, qz, qw);
    const right = rotateVecByQuat(1, 0, 0, qx, qy, qz, qw);
    const currentBank = Math.atan2(right.y, up.y);
    const targetBank = -aimX * 0.58;
    const bankError = targetBank - currentBank;
    const autoRoll = clamp(bankError, -1, 1) * 2.8 * dt;
    const [rx, ry, rz, rw] = quatFromAxisAngle(0, 0, -1, -autoRoll);
    [qx, qy, qz, qw] = mulQuat(qx, qy, qz, qw, rx, ry, rz, rw);
  }
  [qx, qy, qz, qw] = normalizeQuat(qx, qy, qz, qw);
  state.qx = qx;
  state.qy = qy;
  state.qz = qz;
  state.qw = qw;
  const fwd = rotateVecByQuat(0, 0, -1, qx, qy, qz, qw);
  let nx = state.x + fwd.x * state.speed * dt;
  let ny = state.y + fwd.y * state.speed * dt;
  let nz = state.z + fwd.z * state.speed * dt;
  if (state.barrelRollTimer > 0) {
    const right = rotateVecByQuat(1, 0, 0, qx, qy, qz, qw);
    const dodgeSpeed = 48;
    nx += right.x * state.barrelRollDir * dodgeSpeed * dt;
    ny += right.y * state.barrelRollDir * dodgeSpeed * dt;
    nz += right.z * state.barrelRollDir * dodgeSpeed * dt;
  }
  for (const wz of map.windZones) {
    const dx = nx - wz.originX;
    const dy = ny - wz.originY;
    const dz = nz - wz.originZ;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 2 && dist < wz.range) {
      const fanYaw = getFanYawAtTime(wz.baseYaw, wz.sweepAmplitude, wz.sweepSpeed, elapsedTime);
      const dirX = -Math.sin(fanYaw);
      const dirZ = -Math.cos(fanYaw);
      const dot = (dx * dirX + dz * dirZ) / dist;
      if (dot > Math.cos(wz.coneHalfAngle) && Math.abs(dy) < 35) {
        const falloff = 1 - dist / wz.range;
        nx += dirX * wz.pushStrength * falloff * dt;
        nz += dirZ * wz.pushStrength * falloff * dt;
      }
    }
  }
  const r = archetype.hitboxRadius;
  for (const col of map.colliders) {
    const hit = resolveSphereVsCollider(nx, ny, nz, r, col);
    if (hit) {
      nx += hit.nx * (hit.depth + 0.3);
      ny += hit.ny * (hit.depth + 0.3);
      nz += hit.nz * (hit.depth + 0.3);
      const dot = fwd.x * hit.nx + fwd.y * hit.ny + fwd.z * hit.nz;
      if (dot < -0.1) {
        const reflX = fwd.x - 1.45 * dot * hit.nx;
        const reflY = fwd.y - 1.45 * dot * hit.ny;
        const reflZ = fwd.z - 1.45 * dot * hit.nz;
        const rLen = Math.hypot(reflX, reflY, reflZ) || 1;
        const targetYaw = Math.atan2(-reflX / rLen, -reflZ / rLen);
        const targetPitch = Math.asin(clamp(reflY / rLen, -0.75, 0.75));
        const [yq0, yq1, yq2, yq3] = quatFromAxisAngle(0, 1, 0, targetYaw);
        const [pq0, pq1, pq2, pq3] = quatFromAxisAngle(1, 0, 0, targetPitch);
        const [nq0, nq1, nq2, nq3] = normalizeQuat(
          ...mulQuat(yq0, yq1, yq2, yq3, pq0, pq1, pq2, pq3)
        );
        state.qx = nq0;
        state.qy = nq1;
        state.qz = nq2;
        state.qw = nq3;
        state.speed = Math.max(archetype.minSpeed, state.speed * 0.72);
      }
      result.collided = true;
      result.hitNormal = { x: hit.nx, y: hit.ny, z: hit.nz };
      if (state.collideCooldown <= 0 && state.invulnTimer <= 0) {
        const dmg = col.damageOnHit ?? Math.round(clamp(state.speed / archetype.maxSpeed * 14, 6, 16));
        result.collisionDamage = dmg;
        state.collideCooldown = 0.55;
      }
      break;
    }
  }
  const hb = map.hardBounds;
  if (nx < hb.minX + r) {
    nx = hb.minX + r;
    result.collided = true;
  } else if (nx > hb.maxX - r) {
    nx = hb.maxX - r;
    result.collided = true;
  }
  if (ny < hb.minY + r) {
    ny = hb.minY + r;
    if (fwd.y < -0.05) {
      const [fx, fy, fz, fw] = quatFromAxisAngle(1, 0, 0, 0.15);
      const [nq0, nq1, nq2, nq3] = normalizeQuat(
        ...mulQuat(state.qx, state.qy, state.qz, state.qw, fx, fy, fz, fw)
      );
      state.qx = nq0;
      state.qy = nq1;
      state.qz = nq2;
      state.qw = nq3;
    }
    result.collided = true;
  } else if (ny > hb.maxY - r) {
    ny = hb.maxY - r;
    if (fwd.y > 0.05) {
      const [fx, fy, fz, fw] = quatFromAxisAngle(1, 0, 0, -0.15);
      const [nq0, nq1, nq2, nq3] = normalizeQuat(
        ...mulQuat(state.qx, state.qy, state.qz, state.qw, fx, fy, fz, fw)
      );
      state.qx = nq0;
      state.qy = nq1;
      state.qz = nq2;
      state.qw = nq3;
    }
    result.collided = true;
  }
  if (nz < hb.minZ + r) {
    nz = hb.minZ + r;
    result.collided = true;
  } else if (nz > hb.maxZ - r) {
    nz = hb.maxZ - r;
    result.collided = true;
  }
  state.x = nx;
  state.y = ny;
  state.z = nz;
  if (isOutsideSoftBounds(nx, ny, nz, map)) {
    state.outOfBoundsTimer += dt;
  } else {
    state.outOfBoundsTimer = 0;
  }
  return result;
}

// server/bots.ts
var BOT_NAMES = [
  "Capitaine L\xE9go",
  "As en Carton",
  "Moustique",
  "Baroudeur",
  "Trombone",
  "Fus\xE9e Rouge",
  "Gomme Rapide",
  "Crayon Bleu",
  "Punaise",
  "Bille d\u2019Acier",
  "Ressort Fou",
  "Papier Pli\xE9",
  "Scotch",
  "\xC9lastique",
  "Turbotin"
];
var PERSONALITIES = ["hunter", "evader", "ambusher"];
function pickBotCosmetics(index) {
  return {
    planeId: PLANE_ORDER[index % PLANE_ORDER.length],
    paintId: PAINT_ORDER[(index * 2 + 1) % PAINT_ORDER.length],
    stickerId: STICKER_ORDER[index % STICKER_ORDER.length]
  };
}
function pickBotName(existingNames, index) {
  for (let i = 0; i < BOT_NAMES.length; i++) {
    const candidate = BOT_NAMES[(index + i) % BOT_NAMES.length];
    if (!existingNames.has(candidate)) return candidate;
  }
  return `Pilote Bot ${index + 1}`;
}
function pickBotPersonality(index) {
  return PERSONALITIES[index % PERSONALITIES.length];
}
function pointInsideExpandedCollider(x, y, z, margin, col) {
  if (col.kind === "box") {
    return x >= col.minX - margin && x <= col.maxX + margin && y >= col.minY - margin && y <= col.maxY + margin && z >= col.minZ - margin && z <= col.maxZ + margin;
  }
  if (col.kind === "sphere") {
    const dx = x - col.x;
    const dy = y - col.y;
    const dz = z - col.z;
    const r = col.radius + margin;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }
  const minX = Math.min(col.ax, col.bx) - col.radius - margin;
  const maxX = Math.max(col.ax, col.bx) + col.radius + margin;
  const minY = Math.min(col.ay, col.by) - col.radius - margin;
  const maxY = Math.max(col.ay, col.by) + col.radius + margin;
  const minZ = Math.min(col.az, col.bz) - col.radius - margin;
  const maxZ = Math.max(col.az, col.bz) + col.radius + margin;
  return x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ;
}
function computeBotInput(bot, allPlayers, settings, map, dt, elapsedTime) {
  const sim = bot.sim;
  const fwd = getPlaneForward(sim);
  const right = getPlaneRight(sim);
  const up = getPlaneUp(sim);
  const personality = bot.botPersonality ?? "hunter";
  const orbitPhase = elapsedTime * 0.45 + bot.id.charCodeAt(0) % 7;
  let targetX = Math.cos(orbitPhase) * 115;
  let targetY = personality === "ambusher" ? 158 : 122 + Math.sin(orbitPhase * 1.4) * 18;
  let targetZ = Math.sin(orbitPhase) * 90;
  let enemyDist = Infinity;
  let nearestEnemy = null;
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
  let barrelRollDir = 0;
  if (nearestEnemy) {
    const enemyFwd = getPlaneForward(nearestEnemy.sim);
    const arch = PLANE_ARCHETYPES[bot.cosmetics.planeId];
    const leadTime = Math.min(0.45, enemyDist / arch.projectileSpeed);
    if (personality === "evader" && enemyDist < 65) {
      targetX = sim.x - (nearestEnemy.sim.x - sim.x) + right.x * 55;
      targetY = Math.min(185, sim.y + 30);
      targetZ = sim.z - (nearestEnemy.sim.z - sim.z) + right.z * 55;
      wantsBoost = sim.boost > 30;
      if (sim.barrelRollCooldown <= 0 && enemyDist < 55) {
        barrelRollDir = Math.floor(elapsedTime) % 2 === 0 ? 1 : -1;
      }
    } else if (personality === "ambusher" && enemyDist > 110) {
      targetX = nearestEnemy.sim.x;
      targetY = Math.min(190, nearestEnemy.sim.y + 42);
      targetZ = nearestEnemy.sim.z;
    } else {
      targetX = nearestEnemy.sim.x + enemyFwd.x * nearestEnemy.sim.speed * leadTime;
      targetY = nearestEnemy.sim.y + enemyFwd.y * nearestEnemy.sim.speed * leadTime;
      targetZ = nearestEnemy.sim.z + enemyFwd.z * nearestEnemy.sim.speed * leadTime;
      if (enemyDist > 150 && sim.boost > 45) {
        wantsBoost = true;
      }
    }
  }
  if (isOutsideSoftBounds(sim.x, sim.y, sim.z, map)) {
    targetX = 0;
    targetY = 128;
    targetZ = 0;
  }
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
        avoidY += 1;
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
  const dotRight = dirX * right.x + dirY * right.y + dirZ * right.z;
  const dotUp = dirX * up.x + dirY * up.y + dirZ * up.z;
  const dotFwd = dirX * fwd.x + dirY * fwd.y + dirZ * fwd.z;
  const aimX = Math.max(-1, Math.min(1, dotRight * 2.2));
  const aimY = Math.max(-1, Math.min(1, dotUp * 2));
  if (elapsedTime > 3 && nearestEnemy && !obstacleAhead && enemyDist < 220 && dotFwd > 0.91 && !sim.overheated && sim.heat < 82) {
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
    barrelRollDir
  };
}

// server/gameLoop.ts
function round2(n) {
  return Math.round(n * 100) / 100;
}
function round3(n) {
  return Math.round(n * 1e3) / 1e3;
}
function segmentIntersectsSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (lenSq > 1e-6) {
    t = Math.max(0, Math.min(1, ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / lenSq));
  }
  const px = ax + abx * t;
  const py = ay + aby * t;
  const pz = az + abz * t;
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  return dx * dx + dy * dy + dz * dz <= r * r;
}
function pointInsideCollider(x, y, z, col) {
  if (col.kind === "box") {
    return x >= col.minX && x <= col.maxX && y >= col.minY && y <= col.maxY && z >= col.minZ && z <= col.maxZ;
  }
  if (col.kind === "sphere") {
    const dx2 = x - col.x;
    const dy2 = y - col.y;
    const dz2 = z - col.z;
    return dx2 * dx2 + dy2 * dy2 + dz2 * dz2 <= col.radius * col.radius;
  }
  const abx = col.bx - col.ax;
  const aby = col.by - col.ay;
  const abz = col.bz - col.az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  const t = lenSq > 1e-6 ? Math.max(0, Math.min(1, ((x - col.ax) * abx + (y - col.ay) * aby + (z - col.az) * abz) / lenSq)) : 0;
  const dx = x - (col.ax + abx * t);
  const dy = y - (col.ay + aby * t);
  const dz = z - (col.az + abz * t);
  return dx * dx + dy * dy + dz * dz <= col.radius * col.radius;
}
function spawnPlayerAtIndex(player, spawnIndex, mapId, resetLives) {
  const map = MAPS[mapId] ?? MAPS.desk;
  const sp = map.spawns[spawnIndex % map.spawns.length];
  const arch = PLANE_ARCHETYPES[player.cosmetics.planeId];
  const [qx, qy, qz, qw] = quatFromYaw(sp.yaw);
  const lives = resetLives !== null ? resetLives : player.sim.lives;
  const sim = {
    x: sp.x,
    y: sp.y,
    z: sp.z,
    qx,
    qy,
    qz,
    qw,
    speed: arch.cruiseSpeed,
    hp: arch.maxHp,
    maxHp: arch.maxHp,
    boost: 100,
    heat: 0,
    overheated: false,
    barrelRollTimer: 0,
    barrelRollCooldown: 0,
    barrelRollDir: 0,
    invulnTimer: 3,
    outOfBoundsTimer: 0,
    alive: lives > 0,
    lives,
    respawnTimer: 0,
    fireCooldown: 0,
    hitFlashTimer: 0,
    collideCooldown: 0
  };
  player.sim = sim;
  player.inputQueue.length = 0;
}
function getRewindSnapshot(room, rewindMs) {
  if (room.rewindHistory.length === 0) return null;
  const clampedMs = Math.min(200, Math.max(0, rewindMs));
  const targetTime = Date.now() - clampedMs;
  let best = room.rewindHistory[room.rewindHistory.length - 1];
  let bestDiff = Math.abs(best.time - targetTime);
  for (let i = room.rewindHistory.length - 1; i >= 0; i--) {
    const frame = room.rewindHistory[i];
    const diff = Math.abs(frame.time - targetTime);
    if (diff <= bestDiff) {
      best = frame;
      bestDiff = diff;
    } else {
      break;
    }
  }
  return best;
}
function stepRoomTick(room, dt, callbacks) {
  const map = MAPS[room.settings.mapId] ?? MAPS.desk;
  const now = Date.now();
  room.tick++;
  room.elapsedTime += dt;
  if (room.phase === "countdown") {
    room.countdownTimer -= dt;
    if (room.countdownTimer <= 0) {
      room.phase = "playing";
      room.countdownTimer = 0;
      callbacks.emitRoomState(room);
    }
    return;
  }
  if (room.phase === "round_end") {
    room.roundEndTimer -= dt;
    if (room.roundEndTimer <= 0) {
      const sb = Array.from(room.players.values()).map((p) => ({ roundWins: p.roundWins }));
      if (isMatchOver(room.settings.mode, room.roundNumber, room.maxRounds, room.teamRoundWins, sb)) {
        room.phase = "match_end";
      } else {
        room.roundNumber++;
        room.roundTimer = 240;
        room.projectiles.length = 0;
        room.lastRoundWinner = null;
        let idx = 0;
        for (const player of room.players.values()) {
          spawnPlayerAtIndex(player, idx++, room.settings.mapId, room.settings.livesPerRound);
        }
        room.phase = "countdown";
        room.countdownTimer = 2.4;
      }
      callbacks.emitRoomState(room);
    }
    return;
  }
  if (room.phase !== "playing") {
    return;
  }
  room.roundTimer = Math.max(0, room.roundTimer - dt);
  const allPlayers = Array.from(room.players.values());
  let spawnCounter = 0;
  for (const player of allPlayers) {
    spawnCounter++;
    const arch = PLANE_ARCHETYPES[player.cosmetics.planeId];
    if (!player.sim.alive) {
      if (player.sim.lives > 0 && player.sim.respawnTimer > 0) {
        player.sim.respawnTimer -= dt;
        if (player.sim.respawnTimer <= 0) {
          spawnPlayerAtIndex(
            player,
            spawnCounter + room.tick,
            room.settings.mapId,
            null
          );
        }
      }
      continue;
    }
    let latestInput = null;
    if (player.isBot) {
      latestInput = computeBotInput(
        player,
        allPlayers,
        room.settings,
        map,
        dt,
        room.elapsedTime
      );
      player.lastProcessedSeq = latestInput.seq;
    } else if (player.inputQueue.length > 0) {
      const steps = player.inputQueue.splice(0, 4);
      for (const inp of steps) {
        const clampedInp = {
          ...inp,
          dt: Math.min(0.05, Math.max(5e-3, inp.dt))
        };
        const res = stepPlanePhysics(player.sim, clampedInp, arch, map, room.elapsedTime);
        player.lastProcessedSeq = clampedInp.seq;
        if (res.collisionDamage > 0) {
          handlePlaneCrashDamage(room, player, res.collisionDamage, "crash", callbacks);
        }
        latestInput = clampedInp;
      }
    } else {
      latestInput = {
        seq: player.lastProcessedSeq,
        dt,
        aimX: 0,
        aimY: 0,
        throttle: 0,
        roll: 0,
        boost: false,
        fire: false,
        barrelRollDir: 0
      };
      const res = stepPlanePhysics(player.sim, latestInput, arch, map, room.elapsedTime);
      if (res.collisionDamage > 0) {
        handlePlaneCrashDamage(room, player, res.collisionDamage, "crash", callbacks);
      }
    }
    if (player.isBot && latestInput) {
      const res = stepPlanePhysics(player.sim, latestInput, arch, map, room.elapsedTime);
      if (res.collisionDamage > 0) {
        handlePlaneCrashDamage(room, player, res.collisionDamage, "crash", callbacks);
      }
    }
    if (player.sim.alive && player.sim.outOfBoundsTimer >= 4) {
      handlePlaneCrashDamage(room, player, 9999, "oob", callbacks);
    }
    if (player.sim.alive && latestInput?.fire && !player.sim.overheated && player.sim.fireCooldown <= 0) {
      player.sim.fireCooldown = 1 / arch.fireRate;
      player.sim.heat = Math.min(100, player.sim.heat + arch.overheatPerShot);
      if (player.sim.heat >= 100) {
        player.sim.overheated = true;
      }
      const fwd = getPlaneForward(player.sim);
      const proj = {
        id: room.nextProjectileId++,
        ownerId: player.id,
        team: player.team,
        x: player.sim.x + fwd.x * 7,
        y: player.sim.y + fwd.y * 7,
        z: player.sim.z + fwd.z * 7,
        vx: fwd.x * (arch.projectileSpeed + player.sim.speed * 0.35),
        vy: fwd.y * (arch.projectileSpeed + player.sim.speed * 0.35),
        vz: fwd.z * (arch.projectileSpeed + player.sim.speed * 0.35),
        damage: arch.damage,
        heavy: arch.heavyGun,
        ttl: 1.4
      };
      room.projectiles.push(proj);
    }
  }
  const planePositions = /* @__PURE__ */ new Map();
  for (const p of allPlayers) {
    planePositions.set(p.id, {
      x: p.sim.x,
      y: p.sim.y,
      z: p.sim.z,
      radius: PLANE_ARCHETYPES[p.cosmetics.planeId].hitboxRadius + 1.4,
      alive: p.sim.alive
    });
  }
  room.rewindHistory.push({ time: now, planes: planePositions });
  while (room.rewindHistory.length > 0 && now - room.rewindHistory[0].time > 260) {
    room.rewindHistory.shift();
  }
  for (let i = room.projectiles.length - 1; i >= 0; i--) {
    const proj = room.projectiles[i];
    const prevX = proj.x;
    const prevY = proj.y;
    const prevZ = proj.z;
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    proj.z += proj.vz * dt;
    proj.ttl -= dt;
    if (proj.ttl <= 0) {
      room.projectiles.splice(i, 1);
      continue;
    }
    const hb = map.hardBounds;
    if (proj.x < hb.minX || proj.x > hb.maxX || proj.y < hb.minY || proj.y > hb.maxY || proj.z < hb.minZ || proj.z > hb.maxZ || map.colliders.some((c) => pointInsideCollider(proj.x, proj.y, proj.z, c))) {
      room.projectiles.splice(i, 1);
      continue;
    }
    const owner = room.players.get(proj.ownerId);
    const rewind = owner && !owner.isBot ? getRewindSnapshot(room, owner.ping * 0.5) : null;
    let hitPlayer = null;
    for (const target of allPlayers) {
      if (!target.sim.alive) continue;
      if (!canDamageTarget(
        room.settings.mode,
        room.settings.friendlyFire,
        proj.ownerId,
        proj.team,
        target.id,
        target.team
      )) {
        continue;
      }
      const rewoundPos = rewind?.planes.get(target.id);
      const tx = rewoundPos && rewoundPos.alive ? rewoundPos.x : target.sim.x;
      const ty = rewoundPos && rewoundPos.alive ? rewoundPos.y : target.sim.y;
      const tz = rewoundPos && rewoundPos.alive ? rewoundPos.z : target.sim.z;
      const radius = PLANE_ARCHETYPES[target.cosmetics.planeId].hitboxRadius + (proj.heavy ? 2.1 : 1.5);
      if (segmentIntersectsSphere(prevX, prevY, prevZ, proj.x, proj.y, proj.z, tx, ty, tz, radius)) {
        hitPlayer = target;
        break;
      }
    }
    if (hitPlayer) {
      const res = applyDamageToSim(hitPlayer.sim, proj.damage);
      if (hitPlayer.sim.invulnTimer <= 0) {
        hitPlayer.lastHitBy = proj.ownerId;
        hitPlayer.lastHitAt = now;
      }
      callbacks.emitHit(room, {
        targetId: hitPlayer.id,
        attackerId: proj.ownerId,
        damage: proj.damage,
        x: round2(proj.x),
        y: round2(proj.y),
        z: round2(proj.z),
        fatal: res.eliminated
      });
      if (res.eliminated) {
        hitPlayer.deaths++;
        if (owner && owner.id !== hitPlayer.id) {
          owner.kills++;
          owner.score += 100;
        }
        callbacks.emitKillFeed(room, {
          id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
          killerName: owner?.nickname ?? "Inconnu",
          killerTeam: owner?.team ?? "none",
          victimName: hitPlayer.nickname,
          victimTeam: hitPlayer.team,
          reason: "gun",
          timestamp: now
        });
        callbacks.emitRoomState(room);
      }
      room.projectiles.splice(i, 1);
    }
  }
  const outcome = checkRoundWinner(
    room.settings.mode,
    allPlayers.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      team: p.team,
      alive: p.sim.alive,
      lives: p.sim.lives
    })),
    room.roundTimer
  );
  if (outcome.finished) {
    room.phase = "round_end";
    room.roundEndTimer = 3.6;
    room.lastRoundWinner = {
      winnerId: outcome.winnerId,
      winnerTeam: outcome.winnerTeam,
      winnerName: outcome.winnerName
    };
    if (room.settings.mode === "last_plane_teams") {
      if (outcome.winnerTeam === "red") room.teamRoundWins.red++;
      else if (outcome.winnerTeam === "blue") room.teamRoundWins.blue++;
      for (const p of allPlayers) {
        if (p.team === outcome.winnerTeam) {
          p.roundWins++;
          p.score += 200;
        }
      }
    } else if (outcome.winnerId) {
      const winner = room.players.get(outcome.winnerId);
      if (winner) {
        winner.roundWins++;
        winner.score += 250;
      }
    }
    callbacks.emitRoomState(room);
  }
}
function handlePlaneCrashDamage(room, player, damage, reason, callbacks) {
  const res = applyDamageToSim(player.sim, damage);
  if (res.eliminated) {
    const now = Date.now();
    player.deaths++;
    const recentAttacker = player.lastHitBy && now - player.lastHitAt < 5e3 ? room.players.get(player.lastHitBy) : null;
    if (recentAttacker && recentAttacker.id !== player.id) {
      recentAttacker.kills++;
      recentAttacker.score += 100;
    }
    callbacks.emitHit(room, {
      targetId: player.id,
      attackerId: recentAttacker?.id ?? player.id,
      damage,
      x: round2(player.sim.x),
      y: round2(player.sim.y),
      z: round2(player.sim.z),
      fatal: true
    });
    callbacks.emitKillFeed(room, {
      id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      killerName: recentAttacker?.nickname ?? "",
      killerTeam: recentAttacker?.team ?? "none",
      victimName: player.nickname,
      victimTeam: player.team,
      reason,
      timestamp: now
    });
    callbacks.emitRoomState(room);
  }
}
function buildCompactSnapshot(room) {
  const map = MAPS[room.settings.mapId] ?? MAPS.desk;
  const wz = map.windZones[0];
  const fanAngle = wz ? round3(getFanYawAtTime(wz.baseYaw, wz.sweepAmplitude, wz.sweepSpeed, room.elapsedTime)) : 0;
  const planes = [];
  for (const p of room.players.values()) {
    planes.push({
      id: p.id,
      nickname: p.nickname,
      isBot: p.isBot,
      team: p.team,
      planeId: p.cosmetics.planeId,
      paintId: p.cosmetics.paintId,
      stickerId: p.cosmetics.stickerId,
      x: round2(p.sim.x),
      y: round2(p.sim.y),
      z: round2(p.sim.z),
      qx: round3(p.sim.qx),
      qy: round3(p.sim.qy),
      qz: round3(p.sim.qz),
      qw: round3(p.sim.qw),
      speed: round2(p.sim.speed),
      hp: Math.round(p.sim.hp),
      maxHp: p.sim.maxHp,
      boost: Math.round(p.sim.boost),
      heat: Math.round(p.sim.heat),
      overheated: p.sim.overheated,
      alive: p.sim.alive,
      lives: p.sim.lives,
      invuln: p.sim.invulnTimer > 0,
      outOfBounds: round2(p.sim.outOfBoundsTimer),
      barrelRoll: round2(p.sim.barrelRollTimer),
      lastAckSeq: p.lastProcessedSeq
    });
  }
  const projectiles = room.projectiles.map((pr) => ({
    id: pr.id,
    ownerId: pr.ownerId,
    team: pr.team,
    x: round2(pr.x),
    y: round2(pr.y),
    z: round2(pr.z),
    vx: round2(pr.vx),
    vy: round2(pr.vy),
    vz: round2(pr.vz),
    heavy: pr.heavy
  }));
  return {
    tick: room.tick,
    serverTime: Date.now(),
    roundTimer: round2(room.roundTimer),
    fanAngle,
    planes,
    projectiles
  };
}

// server/types.ts
var DEFAULT_ROOM_SETTINGS = {
  mode: "last_plane_ffa",
  mapId: "desk",
  livesPerRound: 3,
  botsEnabled: true,
  maxPlayers: 12,
  friendlyFire: false,
  isPrivate: false
};

// server/roomManager.ts
var TARGET_BOT_FILL = 6;
var RoomManager = class {
  constructor(io) {
    this.rooms = /* @__PURE__ */ new Map();
    this.socketToRoom = /* @__PURE__ */ new Map();
    this.tickInterval = null;
    this.snapshotCounter = 0;
    this.io = io;
    this.startLoop();
  }
  getRoomCount() {
    return this.rooms.size;
  }
  startLoop() {
    const TICK_MS = 1e3 / 30;
    let lastTime = Date.now();
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - lastTime) / 1e3);
      lastTime = now;
      this.snapshotCounter++;
      const shouldSendSnapshot = this.snapshotCounter % 3 !== 0;
      for (const room of this.rooms.values()) {
        for (const player of Array.from(room.players.values())) {
          if (!player.isBot && !player.connected && player.disconnectedAt && now - player.disconnectedAt > 3e4) {
            this.removePlayerFromRoom(room, player.id);
          }
        }
        if (room.players.size === 0 || !Array.from(room.players.values()).some((p) => !p.isBot && p.connected)) {
          const anyRecentHuman = Array.from(room.players.values()).some(
            (p) => !p.isBot && (p.connected || p.disconnectedAt && now - p.disconnectedAt < 3e4)
          );
          if (!anyRecentHuman) {
            this.rooms.delete(room.code);
            continue;
          }
        }
        if (room.phase === "countdown" || room.phase === "playing" || room.phase === "round_end") {
          stepRoomTick(room, dt, {
            emitRoomState: (r) => this.broadcastRoomState(r),
            emitSnapshot: (r, snap) => this.io.to(r.code).emit("game:snapshot", snap),
            emitHit: (r, ev) => this.io.to(r.code).emit("game:hit", ev),
            emitKillFeed: (r, kf) => this.io.to(r.code).emit("game:killfeed", kf)
          });
          if (shouldSendSnapshot && (room.phase === "playing" || room.phase === "countdown")) {
            const snap = buildCompactSnapshot(room);
            this.io.to(room.code).emit("game:snapshot", snap);
          }
        }
      }
    }, TICK_MS);
  }
  dispose() {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }
  handleConnection(socket) {
    socket.on("net:ping", (clientSentAt, ack) => {
      if (typeof ack === "function") ack(clientSentAt);
    });
    socket.on("room:join", (payload, ack) => {
      this.handleJoin(socket, payload, ack);
    });
    socket.on("room:leave", () => {
      this.handleLeaveSocket(socket);
    });
    socket.on("room:updateSettings", (partial) => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room) return;
      const player = room.players.get(binding.playerId);
      if (!player || !player.isHost || room.phase !== "lobby") return;
      this.applySettings(room, partial);
      this.syncBots(room);
      this.broadcastRoomState(room);
    });
    socket.on("room:setReady", (ready) => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room) return;
      const player = room.players.get(binding.playerId);
      if (!player) return;
      player.ready = Boolean(ready);
      this.broadcastRoomState(room);
    });
    socket.on("room:switchTeam", (team) => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room || room.phase !== "lobby" || room.settings.mode !== "last_plane_teams") return;
      const player = room.players.get(binding.playerId);
      if (!player) return;
      if (team === "red" || team === "blue") {
        player.team = team;
        this.broadcastRoomState(room);
      }
    });
    socket.on("room:updateCosmetics", (cosmetics) => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room) return;
      const player = room.players.get(binding.playerId);
      if (!player) return;
      player.cosmetics = this.sanitizeCosmetics(cosmetics);
      player.sim.maxHp = PLANE_ARCHETYPES[player.cosmetics.planeId].maxHp;
      this.broadcastRoomState(room);
    });
    socket.on("room:startMatch", () => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room) return;
      const player = room.players.get(binding.playerId);
      if (!player || !player.isHost || room.phase !== "lobby") return;
      this.startMatch(room);
    });
    socket.on("room:playAgain", () => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room) return;
      const player = room.players.get(binding.playerId);
      if (!player || !player.isHost) return;
      this.startMatch(room);
    });
    socket.on("game:input", (input) => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room || room.phase !== "playing" && room.phase !== "countdown") return;
      const player = room.players.get(binding.playerId);
      if (!player || player.isBot) return;
      if (player.inputQueue.length < 16) {
        player.inputQueue.push({
          seq: Number(input.seq) || 0,
          dt: Math.min(0.05, Math.max(5e-3, Number(input.dt) || 1 / 60)),
          aimX: Math.max(-1, Math.min(1, Number(input.aimX) || 0)),
          aimY: Math.max(-1, Math.min(1, Number(input.aimY) || 0)),
          throttle: Math.max(-1, Math.min(1, Number(input.throttle) || 0)),
          roll: Math.max(-1, Math.min(1, Number(input.roll) || 0)),
          boost: Boolean(input.boost),
          fire: Boolean(input.fire),
          barrelRollDir: input.barrelRollDir === -1 ? -1 : input.barrelRollDir === 1 ? 1 : 0
        });
      }
    });
    socket.on("disconnect", () => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      this.socketToRoom.delete(socket.id);
      const room = this.rooms.get(binding.roomCode);
      if (!room) return;
      const player = room.players.get(binding.playerId);
      if (!player) return;
      player.connected = false;
      player.socketId = null;
      player.disconnectedAt = Date.now();
      this.reassignHostIfNeeded(room);
      this.broadcastRoomState(room);
    });
  }
  handleJoin(socket, payload, ack) {
    this.handleLeaveSocket(socket);
    const nickname = sanitizeNickname(payload.nickname || "Pilote");
    const cosmetics = this.sanitizeCosmetics(payload.cosmetics);
    const sessionToken = payload.sessionToken || socket.id;
    let room;
    if (payload.mode === "join") {
      const code = (payload.roomCode || "").trim().toUpperCase();
      if (!/^[A-Z]{5}$/.test(code)) {
        ack({ ok: false, error: "Entre un code valide \xE0 5 lettres." });
        return;
      }
      room = this.rooms.get(code);
      if (!room) {
        ack({ ok: false, error: "Salon introuvable. V\xE9rifie le code \xE0 5 lettres." });
        return;
      }
    } else if (payload.mode === "quick") {
      for (const candidate of this.rooms.values()) {
        if (!candidate.settings.isPrivate && candidate.phase === "lobby") {
          const humanCount2 = Array.from(candidate.players.values()).filter((p) => !p.isBot).length;
          if (humanCount2 < candidate.settings.maxPlayers) {
            room = candidate;
            break;
          }
        }
      }
      if (!room) {
        room = this.createRoom(false);
      }
    } else {
      room = this.createRoom(true);
    }
    for (const existing of room.players.values()) {
      if (!existing.isBot && existing.sessionToken === sessionToken) {
        existing.connected = true;
        existing.socketId = socket.id;
        existing.disconnectedAt = null;
        existing.nickname = nickname;
        existing.cosmetics = cosmetics;
        this.socketToRoom.set(socket.id, { roomCode: room.code, playerId: existing.id });
        socket.join(room.code);
        this.broadcastRoomState(room);
        ack({ ok: true, room: this.serializeRoomState(room), playerId: existing.id });
        return;
      }
    }
    const humanCount = Array.from(room.players.values()).filter((p) => !p.isBot).length;
    if (humanCount >= room.settings.maxPlayers) {
      ack({ ok: false, error: "Ce salon est complet." });
      return;
    }
    const playerId = `p_${Math.random().toString(36).slice(2, 10)}`;
    const hasHumanHost = Array.from(room.players.values()).some((p) => !p.isBot && p.isHost && p.connected);
    const team = room.settings.mode === "last_plane_teams" ? assignBalancedTeam(Array.from(room.players.values())) : "none";
    const newPlayer = {
      id: playerId,
      sessionToken,
      socketId: socket.id,
      nickname,
      isHost: !hasHumanHost,
      isBot: false,
      ready: !hasHumanHost,
      connected: true,
      disconnectedAt: null,
      team,
      cosmetics,
      ping: 24,
      sim: {
        x: 0,
        y: 120,
        z: 100,
        qx: 0,
        qy: 0,
        qz: 0,
        qw: 1,
        speed: PLANE_ARCHETYPES[cosmetics.planeId].cruiseSpeed,
        hp: PLANE_ARCHETYPES[cosmetics.planeId].maxHp,
        maxHp: PLANE_ARCHETYPES[cosmetics.planeId].maxHp,
        boost: 100,
        heat: 0,
        overheated: false,
        barrelRollTimer: 0,
        barrelRollCooldown: 0,
        barrelRollDir: 0,
        invulnTimer: 2,
        outOfBoundsTimer: 0,
        alive: true,
        lives: room.settings.livesPerRound,
        respawnTimer: 0,
        fireCooldown: 0,
        hitFlashTimer: 0,
        collideCooldown: 0
      },
      inputQueue: [],
      lastProcessedSeq: 0,
      kills: 0,
      deaths: 0,
      roundWins: 0,
      score: 0,
      lastHitBy: null,
      lastHitAt: 0
    };
    room.players.set(playerId, newPlayer);
    this.syncBots(room);
    if (room.phase === "playing" || room.phase === "countdown") {
      spawnPlayerAtIndex(newPlayer, room.players.size, room.settings.mapId, room.settings.livesPerRound);
    }
    this.socketToRoom.set(socket.id, { roomCode: room.code, playerId });
    socket.join(room.code);
    this.broadcastRoomState(room);
    ack({ ok: true, room: this.serializeRoomState(room), playerId });
  }
  handleLeaveSocket(socket) {
    const binding = this.socketToRoom.get(socket.id);
    if (!binding) return;
    this.socketToRoom.delete(socket.id);
    socket.leave(binding.roomCode);
    const room = this.rooms.get(binding.roomCode);
    if (!room) return;
    this.removePlayerFromRoom(room, binding.playerId);
  }
  removePlayerFromRoom(room, playerId) {
    room.players.delete(playerId);
    const humansLeft = Array.from(room.players.values()).filter((p) => !p.isBot);
    if (humansLeft.length === 0) {
      this.rooms.delete(room.code);
      return;
    }
    this.reassignHostIfNeeded(room);
    this.syncBots(room);
    this.broadcastRoomState(room);
  }
  reassignHostIfNeeded(room) {
    const hasActiveHost = Array.from(room.players.values()).some(
      (p) => !p.isBot && p.isHost && p.connected
    );
    if (hasActiveHost) return;
    for (const p of room.players.values()) {
      p.isHost = false;
    }
    const nextHost = Array.from(room.players.values()).find((p) => !p.isBot && p.connected) ?? Array.from(room.players.values()).find((p) => !p.isBot);
    if (nextHost) nextHost.isHost = true;
  }
  createRoom(isPrivate) {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }
    const room = {
      code,
      phase: "lobby",
      settings: {
        ...DEFAULT_ROOM_SETTINGS,
        isPrivate
      },
      players: /* @__PURE__ */ new Map(),
      projectiles: [],
      nextProjectileId: 1,
      tick: 0,
      elapsedTime: 0,
      roundNumber: 1,
      maxRounds: 3,
      roundTimer: 240,
      countdownTimer: 0,
      roundEndTimer: 0,
      teamRoundWins: { red: 0, blue: 0 },
      lastRoundWinner: null,
      rewindHistory: [],
      createdAt: Date.now()
    };
    this.rooms.set(code, room);
    return room;
  }
  applySettings(room, partial) {
    const prevMode = room.settings.mode;
    if (partial.mode === "last_plane_ffa" || partial.mode === "last_plane_teams") {
      room.settings.mode = partial.mode;
    }
    if (partial.mapId && MAPS[partial.mapId]?.available) {
      room.settings.mapId = partial.mapId;
    }
    if (typeof partial.livesPerRound === "number") {
      room.settings.livesPerRound = Math.max(1, Math.min(5, Math.round(partial.livesPerRound)));
    }
    if (typeof partial.botsEnabled === "boolean") {
      room.settings.botsEnabled = partial.botsEnabled;
    }
    if (typeof partial.maxPlayers === "number") {
      room.settings.maxPlayers = Math.max(4, Math.min(16, Math.round(partial.maxPlayers)));
    }
    if (typeof partial.friendlyFire === "boolean") {
      room.settings.friendlyFire = partial.friendlyFire;
    }
    if (prevMode !== room.settings.mode) {
      if (room.settings.mode === "last_plane_teams") {
        autoBalanceTeams(Array.from(room.players.values()));
      } else {
        for (const p of room.players.values()) p.team = "none";
      }
    }
  }
  syncBots(room) {
    if (room.phase !== "lobby") return;
    if (!room.settings.botsEnabled) {
      for (const [id, p] of room.players.entries()) {
        if (p.isBot) room.players.delete(id);
      }
      return;
    }
    const desiredTotal = Math.min(room.settings.maxPlayers, TARGET_BOT_FILL);
    const humans = Array.from(room.players.values()).filter((p) => !p.isBot);
    const bots = Array.from(room.players.values()).filter((p) => p.isBot);
    const targetBotCount = Math.max(0, desiredTotal - humans.length);
    while (bots.length > targetBotCount) {
      const removed = bots.pop();
      if (removed) room.players.delete(removed.id);
    }
    const usedNames = new Set(Array.from(room.players.values()).map((p) => p.nickname));
    let botIndex = bots.length;
    while (room.players.size < desiredTotal) {
      const botId = `bot_${Math.random().toString(36).slice(2, 9)}`;
      const name = pickBotName(usedNames, botIndex);
      usedNames.add(name);
      const cosmetics = pickBotCosmetics(botIndex);
      const team = room.settings.mode === "last_plane_teams" ? assignBalancedTeam(Array.from(room.players.values())) : "none";
      const arch = PLANE_ARCHETYPES[cosmetics.planeId];
      const botPlayer = {
        id: botId,
        sessionToken: botId,
        socketId: null,
        nickname: name,
        isHost: false,
        isBot: true,
        botPersonality: pickBotPersonality(botIndex),
        ready: true,
        connected: true,
        disconnectedAt: null,
        team,
        cosmetics,
        ping: 0,
        sim: {
          x: 0,
          y: 120,
          z: 0,
          qx: 0,
          qy: 0,
          qz: 0,
          qw: 1,
          speed: arch.cruiseSpeed,
          hp: arch.maxHp,
          maxHp: arch.maxHp,
          boost: 100,
          heat: 0,
          overheated: false,
          barrelRollTimer: 0,
          barrelRollCooldown: 0,
          barrelRollDir: 0,
          invulnTimer: 2,
          outOfBoundsTimer: 0,
          alive: true,
          lives: room.settings.livesPerRound,
          respawnTimer: 0,
          fireCooldown: 0,
          hitFlashTimer: 0,
          collideCooldown: 0
        },
        inputQueue: [],
        lastProcessedSeq: 0,
        kills: 0,
        deaths: 0,
        roundWins: 0,
        score: 0,
        lastHitBy: null,
        lastHitAt: 0
      };
      room.players.set(botId, botPlayer);
      botIndex++;
    }
  }
  startMatch(room) {
    this.syncBots(room);
    room.roundNumber = 1;
    room.maxRounds = 3;
    room.roundTimer = 240;
    room.teamRoundWins = { red: 0, blue: 0 };
    room.lastRoundWinner = null;
    room.projectiles.length = 0;
    room.rewindHistory.length = 0;
    let idx = 0;
    for (const player of room.players.values()) {
      player.kills = 0;
      player.deaths = 0;
      player.roundWins = 0;
      player.score = 0;
      player.lastHitBy = null;
      spawnPlayerAtIndex(player, idx++, room.settings.mapId, room.settings.livesPerRound);
    }
    room.phase = "countdown";
    room.countdownTimer = 2.2;
    this.broadcastRoomState(room);
    this.io.to(room.code).emit("game:snapshot", buildCompactSnapshot(room));
  }
  sanitizeCosmetics(raw) {
    const planeId = raw?.planeId && PLANE_ARCHETYPES[raw.planeId] ? raw.planeId : "plastic_jet";
    const validPaints = /* @__PURE__ */ new Set(["red", "blue", "yellow", "green", "orange", "white"]);
    const validStickers = /* @__PURE__ */ new Set(["star", "lightning", "target", "flame"]);
    const paintId = raw?.paintId && validPaints.has(raw.paintId) ? raw.paintId : "red";
    const stickerId = raw?.stickerId && validStickers.has(raw.stickerId) ? raw.stickerId : "star";
    return { planeId, paintId, stickerId };
  }
  serializeRoomState(room) {
    const players = [];
    const scoreboard = [];
    for (const p of room.players.values()) {
      players.push({
        id: p.id,
        nickname: p.nickname,
        isHost: p.isHost,
        isBot: p.isBot,
        ready: p.ready,
        connected: p.connected,
        team: p.team,
        cosmetics: p.cosmetics,
        ping: p.ping
      });
      scoreboard.push({
        playerId: p.id,
        nickname: p.nickname,
        isBot: p.isBot,
        team: p.team,
        planeId: p.cosmetics.planeId,
        paintId: p.cosmetics.paintId,
        kills: p.kills,
        deaths: p.deaths,
        roundWins: p.roundWins,
        score: p.score,
        alive: p.sim.alive,
        livesRemaining: p.sim.lives
      });
    }
    scoreboard.sort((a, b) => b.roundWins - a.roundWins || b.score - a.score || b.kills - a.kills);
    return {
      code: room.code,
      phase: room.phase,
      settings: { ...room.settings },
      players,
      roundNumber: room.roundNumber,
      maxRounds: room.maxRounds,
      roundTimer: room.roundTimer,
      countdownTimer: room.countdownTimer,
      teamRoundWins: { ...room.teamRoundWins },
      lastRoundWinner: room.lastRoundWinner,
      scoreboard
    };
  }
  broadcastRoomState(room) {
    this.io.to(room.code).emit("room:state", this.serializeRoomState(room));
  }
};

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
async function bootstrap() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ["websocket", "polling"]
  });
  const roomManager = new RoomManager(io);
  io.on("connection", (socket) => {
    roomManager.handleConnection(socket);
  });
  app.get("/healthz", (_req, res) => {
    res.status(200).json({
      ok: true,
      rooms: roomManager.getRoomCount(),
      uptime: Math.round(process.uptime())
    });
  });
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const candidateDist = path.resolve(__dirname, "dist");
    const parentDist = path.resolve(__dirname, "../dist");
    const distPath = (await import("node:fs")).existsSync(candidateDist) ? candidateDist : parentDist;
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  const port = Number(process.env.PORT) || 3e3;
  server.listen(port, "0.0.0.0", () => {
    console.log(`[Escadrille Jouet] Serveur pr\xEAt sur http://0.0.0.0:${port}`);
  });
}
bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
