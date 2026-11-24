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
    capsule("floor_mug", -22, 0, 118, -22, 24, 118, 14),
    // Interactive/destructible piggy bank on wall shelf & cereal/biscuit box on desk
    sphere("piggy_bank", -32, 166, -158, 12, "small"),
    box("snack_box", 108, 76, 4, 134, 108, 24, "small")
  ],
  destructibles: [
    {
      id: "lego_desk_tower_top",
      colliderId: "lego_desk_tower_top",
      nameFr: "Sommet Lego",
      kind: "lego",
      x: 105,
      y: 129,
      z: -51,
      radius: 16,
      maxHp: 35,
      dropsPowerUp: true
    },
    {
      id: "lego_desk_tower_base",
      colliderId: "lego_desk_tower_base",
      nameFr: "Tour Lego",
      kind: "lego",
      x: 105,
      y: 96,
      z: -51,
      radius: 22,
      maxHp: 55,
      dropsPowerUp: true
    },
    {
      id: "lego_arch_bridge",
      colliderId: "lego_arch_bridge",
      nameFr: "Arche Lego",
      kind: "lego",
      x: 173,
      y: 72,
      z: 92,
      radius: 28,
      maxHp: 45,
      dropsPowerUp: true
    },
    {
      id: "desk_books_3",
      colliderId: "desk_books_3",
      nameFr: "Livre du haut",
      kind: "book",
      x: -151,
      y: 112,
      z: -52,
      radius: 16,
      maxHp: 60,
      dropsPowerUp: true
    },
    {
      id: "piggy_bank",
      colliderId: "piggy_bank",
      nameFr: "Tirelire cochon",
      kind: "piggy_bank",
      x: -32,
      y: 166,
      z: -158,
      radius: 13,
      maxHp: 30,
      dropsPowerUp: true,
      rewardPool: ["bubble_shield", "rubber_missile", "magnet", "repair_tape"]
    },
    {
      id: "snack_box",
      colliderId: "snack_box",
      nameFr: "Bo\xEEte de biscuits",
      kind: "snack_box",
      x: 121,
      y: 92,
      z: 14,
      radius: 17,
      maxHp: 28,
      dropsPowerUp: true,
      rewardPool: ["firecracker", "water_bomb", "turbo_battery", "glue_mine"]
    }
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
  updraftZones: [],
  hazardZones: [],
  powerUpSpots: [
    { id: "pu_under_monitor", x: -45, y: 85, z: -87 },
    { id: "pu_drawer_tunnel", x: 92, y: 58, z: 62 },
    { id: "pu_lego_arch", x: 173, y: 34, z: 92 },
    { id: "pu_wall_shelf", x: -15, y: 168, z: -156 },
    { id: "pu_keyboard_canyon", x: -55, y: 102, z: -28 }
  ]
};

// shared/maps/kitchen.ts
function box2(id, minX, minY, minZ, maxX, maxY, maxZ, tier = "static", hinge) {
  return { id, kind: "box", tier, minX, minY, minZ, maxX, maxY, maxZ, hinge };
}
function sphere2(id, x, y, z, radius, tier = "static") {
  return { id, kind: "sphere", tier, x, y, z, radius };
}
function capsule2(id, ax, ay, az, bx, by, bz, radius, tier = "static") {
  return { id, kind: "capsule", tier, ax, ay, az, bx, by, bz, radius };
}
var KITCHEN_MAP = {
  id: "kitchen",
  nameFr: "La cuisine",
  subtitleFr: "\xCElot tunnel, frigo anim\xE9, courant chaud des plaques et mixeur g\xE9ant mortel.",
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
  skyColor: "#FFF3D6",
  fogColor: "#FFF7E5",
  colliders: [
    // Main back counter along -Z wall (Y: 0..88)
    box2("counter_back", -225, 0, -182, 110, 88, -102),
    // Central island with open fly-through tunnel underneath (X: -56..56, Y: 0..74)
    box2("island_top", -94, 74, 10, 94, 84, 78),
    box2("island_leg_left", -90, 0, 14, -56, 74, 74),
    box2("island_leg_right", 56, 0, 14, 90, 74, 74),
    // Dish rack on left back counter
    box2("dish_rack", -185, 88, -162, -135, 118, -118, "medium"),
    // Tall arched chrome sink faucet
    capsule2("faucet_post", -95, 88, -158, -95, 142, -158, 3.5),
    capsule2("faucet_arch", -95, 142, -158, -95, 142, -128, 3.2),
    capsule2("faucet_nozzle", -95, 142, -128, -95, 128, -128, 2.8),
    // Stove burner base (updraft sits directly above)
    box2("stove_base", -24, 88, -168, 40, 95, -116),
    // Giant fridge + animated swinging door
    box2("fridge_body", 158, 0, -178, 244, 202, -92),
    box2("fridge_door", 158, 4, -92, 240, 198, -84, "static", {
      pivotX: 158,
      pivotZ: -90,
      lengthX: 82,
      thicknessZ: 8,
      maxAngle: -1.18,
      cycleSeconds: 10
    }),
    // Overhead hanging pan rack & 3 giant hanging pans
    box2("pan_rack_bar", -130, 194, -48, 45, 200, -40),
    capsule2("pan_1", -105, 194, -44, -105, 162, -44, 14, "medium"),
    capsule2("pan_2", -42, 194, -44, -42, 158, -44, 16, "medium"),
    capsule2("pan_3", 20, 194, -44, 20, 164, -44, 14, "medium"),
    // Blender base & jar on island (deadly spinning blades inside hazardZone)
    capsule2("blender_body", 44, 84, 44, 44, 108, 44, 14),
    // Left window sill
    box2("kitchen_window_sill", -248, 84, -70, -214, 94, 95),
    // Destructible props
    box2("cereal_box_1", -74, 84, 28, -46, 124, 52, "small"),
    box2("cereal_box_2", -212, 88, -158, -184, 128, -132, "small"),
    box2("toaster", 68, 88, -156, 96, 112, -130, "small"),
    box2("milk_carton", -240, 94, 15, -218, 124, 37, "small"),
    sphere2("spice_jar", -118, 98, 44, 11, "small")
  ],
  destructibles: [
    {
      id: "cereal_box_1",
      colliderId: "cereal_box_1",
      nameFr: "Bo\xEEte de c\xE9r\xE9ales",
      kind: "cereal_box",
      x: -60,
      y: 104,
      z: 40,
      radius: 19,
      maxHp: 32,
      dropsPowerUp: true,
      rewardPool: ["rubber_missile", "firecracker", "turbo_battery"]
    },
    {
      id: "cereal_box_2",
      colliderId: "cereal_box_2",
      nameFr: "Paquet de flocons",
      kind: "cereal_box",
      x: -198,
      y: 108,
      z: -145,
      radius: 19,
      maxHp: 32,
      dropsPowerUp: true,
      rewardPool: ["water_bomb", "bubble_shield", "repair_tape"]
    },
    {
      id: "toaster",
      colliderId: "toaster",
      nameFr: "Grille-pain",
      kind: "toaster",
      x: 82,
      y: 100,
      z: -143,
      radius: 16,
      maxHp: 40,
      dropsPowerUp: true,
      rewardPool: ["firecracker", "magnet", "turbo_battery"]
    },
    {
      id: "milk_carton",
      colliderId: "milk_carton",
      nameFr: "Brique de lait",
      kind: "snack_box",
      x: -229,
      y: 109,
      z: 26,
      radius: 16,
      maxHp: 28,
      dropsPowerUp: true,
      rewardPool: ["glue_mine", "repair_tape", "bubble_shield"]
    },
    {
      id: "spice_jar",
      colliderId: "spice_jar",
      nameFr: "Pot d\u2019\xE9pices",
      kind: "piggy_bank",
      x: -118,
      y: 98,
      z: 44,
      radius: 13,
      maxHp: 26,
      dropsPowerUp: true
    }
  ],
  spawns: [
    // Unobstructed south, center-corridor, and high airspace lanes
    { x: -185, y: 136, z: 128, yaw: -Math.PI * 0.48 },
    { x: 185, y: 140, z: 122, yaw: Math.PI * 0.48 },
    { x: -175, y: 108, z: 140, yaw: -Math.PI * 0.46 },
    { x: 175, y: 110, z: 140, yaw: Math.PI * 0.46 },
    { x: -175, y: 122, z: -16, yaw: -Math.PI * 0.5 },
    { x: 115, y: 124, z: -18, yaw: Math.PI * 0.5 },
    { x: -180, y: 178, z: 118, yaw: -Math.PI * 0.48 },
    { x: 180, y: 180, z: 112, yaw: Math.PI * 0.48 },
    { x: -185, y: 186, z: -84, yaw: -Math.PI * 0.5 },
    { x: 120, y: 186, z: -84, yaw: Math.PI * 0.5 },
    { x: -190, y: 54, z: 126, yaw: -Math.PI * 0.47 },
    { x: 190, y: 56, z: 126, yaw: Math.PI * 0.47 },
    { x: -180, y: 52, z: -32, yaw: -Math.PI * 0.5 },
    { x: 135, y: 52, z: -36, yaw: Math.PI * 0.5 },
    { x: -115, y: 182, z: 134, yaw: -Math.PI * 0.45 },
    { x: 115, y: 182, z: 134, yaw: Math.PI * 0.45 }
  ],
  windZones: [],
  updraftZones: [
    {
      id: "stove_updraft",
      x: 8,
      y: 92,
      z: -142,
      radius: 36,
      height: 120,
      liftStrength: 135
    }
  ],
  hazardZones: [
    {
      id: "blender_hazard",
      nameFr: "le mixeur g\xE9ant",
      x: 44,
      y: 112,
      z: 44,
      radius: 17,
      height: 36,
      damage: 9999
    }
  ],
  powerUpSpots: [
    { id: "pu_island_tunnel", x: 0, y: 38, z: 44 },
    { id: "pu_sink_arch", x: -95, y: 116, z: -136 },
    { id: "pu_stove_thermal", x: 8, y: 158, z: -142 },
    { id: "pu_hanging_pans", x: -74, y: 168, z: -44 },
    { id: "pu_fridge_corner", x: 128, y: 115, z: -65 }
  ]
};

// shared/maps/garden.ts
function box3(id, minX, minY, minZ, maxX, maxY, maxZ, tier = "static") {
  return { id, kind: "box", tier, minX, minY, minZ, maxX, maxY, maxZ };
}
function sphere3(id, x, y, z, radius, tier = "static") {
  return { id, kind: "sphere", tier, x, y, z, radius };
}
function capsule3(id, ax, ay, az, bx, by, bz, radius, tier = "static") {
  return { id, kind: "capsule", tier, ax, ay, az, bx, by, bz, radius };
}
var GARDEN_MAP = {
  id: "garden",
  nameFr: "Le jardin",
  subtitleFr: "Plein air : niche tunnel, balan\xE7oire g\xE9ante, pots de fleurs, bac \xE0 sable et arroseur rotatif.",
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
  skyColor: "#9ED8FF",
  fogColor: "#CDEEFF",
  colliders: [
    // Dog house with fly-through tunnel along Z (open doorway X: -146..-114, Y: 0..56)
    box3("doghouse_left", -164, 0, -138, -146, 56, -72),
    box3("doghouse_right", -114, 0, -138, -96, 56, -72),
    box3("doghouse_roof", -170, 56, -142, -90, 82, -68),
    // Giant A-frame Swing Set
    capsule3("swing_post_left", 10, 0, -110, 18, 168, -110, 4.5),
    capsule3("swing_post_right", 110, 0, -110, 102, 168, -110, 4.5),
    capsule3("swing_top_bar", 8, 168, -110, 112, 168, -110, 5),
    box3("swing_seat_1", 34, 34, -120, 54, 42, -100, "medium"),
    box3("swing_seat_2", 66, 34, -120, 86, 42, -100, "medium"),
    // Sandbox frame & sand floor + plastic bucket
    box3("sandbox_wall_n", -185, 0, 55, -85, 18, 63),
    box3("sandbox_wall_s", -185, 0, 137, -85, 18, 145),
    box3("sandbox_wall_w", -185, 0, 63, -177, 18, 137),
    box3("sandbox_wall_e", -93, 0, 63, -85, 18, 137),
    box3("sandbox_floor", -177, 0, 63, -93, 10, 137),
    capsule3("toy_bucket", -105, 10, 122, -105, 42, 122, 11, "medium"),
    // Giant Terracotta Flower Pots & Blooming Stalks
    capsule3("pot_big_1", 165, 0, -118, 165, 46, -118, 24),
    capsule3("flower_stalk_1", 165, 46, -118, 165, 148, -118, 4.5),
    sphere3("flower_head_1", 165, 152, -118, 18),
    capsule3("pot_big_2", 176, 0, 82, 176, 42, 82, 22),
    capsule3("flower_stalk_2", 176, 42, 82, 176, 122, 82, 4),
    sphere3("flower_head_2", 176, 126, 82, 15),
    // Giant grass blade clusters in backyard corners
    capsule3("grass_cluster_nw", -208, 0, -142, -208, 96, -142, 16, "medium"),
    capsule3("grass_cluster_sw", -210, 0, 148, -210, 86, 148, 15, "medium"),
    capsule3("grass_cluster_se", 212, 0, 142, 212, 90, 142, 15, "medium"),
    // Lawn sprinkler hub
    capsule3("sprinkler_hub", 18, 0, 18, 18, 22, 18, 12),
    // Destructible backyard props
    box3("sandcastle", -152, 10, 84, -120, 48, 116, "small"),
    capsule3("garden_gnome", -36, 0, -128, -36, 44, -128, 12, "small"),
    capsule3("flower_pot_break", 112, 0, 118, 112, 40, 118, 15, "small"),
    box3("picnic_juice_box", -42, 0, 116, -20, 34, 134, "small")
  ],
  destructibles: [
    {
      id: "sandcastle",
      colliderId: "sandcastle",
      nameFr: "Ch\xE2teau de sable",
      kind: "sandcastle",
      x: -136,
      y: 29,
      z: 100,
      radius: 20,
      maxHp: 35,
      dropsPowerUp: true,
      rewardPool: ["water_bomb", "bubble_shield", "turbo_battery"]
    },
    {
      id: "garden_gnome",
      colliderId: "garden_gnome",
      nameFr: "Nain de jardin",
      kind: "gnome",
      x: -36,
      y: 22,
      z: -128,
      radius: 15,
      maxHp: 30,
      dropsPowerUp: true,
      rewardPool: ["rubber_missile", "firecracker", "magnet"]
    },
    {
      id: "flower_pot_break",
      colliderId: "flower_pot_break",
      nameFr: "Pot de fleurs",
      kind: "flower_pot",
      x: 112,
      y: 20,
      z: 118,
      radius: 17,
      maxHp: 35,
      dropsPowerUp: true,
      rewardPool: ["repair_tape", "glue_mine", "bubble_shield"]
    },
    {
      id: "picnic_juice_box",
      colliderId: "picnic_juice_box",
      nameFr: "Brique de jus",
      kind: "snack_box",
      x: -31,
      y: 17,
      z: 125,
      radius: 15,
      maxHp: 28,
      dropsPowerUp: true,
      rewardPool: ["turbo_battery", "firecracker", "repair_tape"]
    }
  ],
  spawns: [
    // Clear sky corridors above & between lawn landmarks
    { x: -165, y: 128, z: -15, yaw: -Math.PI * 0.5 },
    { x: 165, y: 132, z: -15, yaw: Math.PI * 0.5 },
    { x: -175, y: 148, z: 32, yaw: -Math.PI * 0.48 },
    { x: 175, y: 152, z: 28, yaw: Math.PI * 0.48 },
    { x: -160, y: 116, z: -42, yaw: -Math.PI * 0.5 },
    { x: 145, y: 118, z: -44, yaw: Math.PI * 0.5 },
    { x: -175, y: 184, z: -102, yaw: -Math.PI * 0.48 },
    { x: 140, y: 184, z: -96, yaw: Math.PI * 0.48 },
    { x: -170, y: 176, z: 118, yaw: -Math.PI * 0.46 },
    { x: 165, y: 178, z: 118, yaw: Math.PI * 0.46 },
    { x: -165, y: 74, z: 12, yaw: -Math.PI * 0.5 },
    { x: 145, y: 76, z: 12, yaw: Math.PI * 0.5 },
    { x: -155, y: 78, z: -28, yaw: -Math.PI * 0.5 },
    { x: 135, y: 80, z: -28, yaw: Math.PI * 0.5 },
    { x: -75, y: 188, z: 128, yaw: -Math.PI * 0.42 },
    { x: 75, y: 188, z: 128, yaw: Math.PI * 0.42 }
  ],
  windZones: [
    // Twin spinning water-jet sprinkler arms at center lawn
    {
      originX: 18,
      originY: 22,
      originZ: 18,
      range: 135,
      coneHalfAngle: 0.34,
      baseYaw: 0,
      sweepAmplitude: 0,
      sweepSpeed: 1.15,
      pushStrength: 80,
      continuousSpin: true
    },
    {
      originX: 18,
      originY: 22,
      originZ: 18,
      range: 135,
      coneHalfAngle: 0.34,
      baseYaw: Math.PI,
      sweepAmplitude: 0,
      sweepSpeed: 1.15,
      pushStrength: 80,
      continuousSpin: true
    }
  ],
  updraftZones: [],
  hazardZones: [],
  powerUpSpots: [
    { id: "pu_doghouse_tunnel", x: -130, y: 28, z: -105 },
    { id: "pu_swing_arch", x: 60, y: 94, z: -110 },
    { id: "pu_sprinkler_top", x: 18, y: 58, z: 18 },
    { id: "pu_sandbox", x: -135, y: 68, z: 100 },
    { id: "pu_flower_corridor", x: 142, y: 88, z: -18 }
  ]
};

// shared/maps/index.ts
var MAPS = {
  desk: DESK_MAP,
  kitchen: KITCHEN_MAP,
  garden: GARDEN_MAP
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
function checkRoundWinner(mode, players, roundTimerRemaining, suddenDeathElapsed = 0) {
  const activeContenders = players.filter((p) => p.alive || p.lives > 0);
  const suddenDeathTimedOut = roundTimerRemaining <= 0 && suddenDeathElapsed >= 65;
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
    if (suddenDeathTimedOut) {
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
  if (suddenDeathTimedOut) {
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
    return { eliminated: false, lostRound: false, shieldBlocked: false };
  }
  if (sim.shieldTimer > 0 && sim.shieldHp > 0 && damage < 9e3) {
    sim.shieldHp = Math.max(0, sim.shieldHp - damage);
    sim.hitFlashTimer = 0.12;
    if (sim.shieldHp <= 0) {
      sim.shieldTimer = 0;
    }
    return { eliminated: false, lostRound: false, shieldBlocked: true };
  }
  sim.hp = Math.max(0, sim.hp - damage);
  sim.hitFlashTimer = 0.14;
  if (sim.hp > 0) {
    return { eliminated: false, lostRound: false, shieldBlocked: false };
  }
  sim.alive = false;
  sim.lives = Math.max(0, sim.lives - 1);
  sim.secondaryPowerUp = null;
  sim.secondaryUses = 0;
  sim.shieldTimer = 0;
  sim.shieldHp = 0;
  sim.turboTimer = 0;
  sim.glueTimer = 0;
  sim.magnetTimer = 0;
  if (sim.lives > 0) {
    sim.respawnTimer = 2.6;
    return { eliminated: true, lostRound: false, shieldBlocked: false };
  }
  sim.respawnTimer = 0;
  return { eliminated: true, lostRound: true, shieldBlocked: false };
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
function getFanYawAtTime(baseYaw, sweepAmplitude, sweepSpeed, elapsedTime, continuousSpin = false) {
  if (continuousSpin) {
    return baseYaw + elapsedTime * sweepSpeed;
  }
  return baseYaw + Math.sin(elapsedTime * sweepSpeed) * sweepAmplitude;
}
function getHingeDoorAngleAtTime(maxAngle, cycleSeconds, elapsedTime) {
  const openRatio = 0.5 - 0.5 * Math.cos(elapsedTime * Math.PI * 2 / Math.max(1, cycleSeconds));
  const angle = maxAngle * openRatio;
  return angle === 0 ? 0 : angle;
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
function resolveSphereVsCollider(sx, sy, sz, radius, collider, elapsedTime = 0) {
  if (collider.kind === "box") {
    if (collider.hinge) {
      const { pivotX, pivotZ, lengthX, thicknessZ, maxAngle, cycleSeconds } = collider.hinge;
      const angle = getHingeDoorAngleAtTime(maxAngle, cycleSeconds, elapsedTime);
      const cosA = Math.cos(-angle);
      const sinA = Math.sin(-angle);
      const dxp = sx - pivotX;
      const dzp = sz - pivotZ;
      const lx = dxp * cosA + dzp * sinA;
      const lz = -dxp * sinA + dzp * cosA;
      const halfT = thicknessZ * 0.5;
      const cx2 = clamp(lx, 0, lengthX);
      const cy2 = clamp(sy, collider.minY, collider.maxY);
      const cz2 = clamp(lz, -halfT, halfT);
      const ddx = lx - cx2;
      const ddy = sy - cy2;
      const ddz = lz - cz2;
      const distSq3 = ddx * ddx + ddy * ddy + ddz * ddz;
      if (distSq3 >= radius * radius) return null;
      const dist2 = Math.sqrt(distSq3) || 1e-3;
      const lnx = distSq3 > 1e-6 ? ddx / dist2 : 0;
      const lny = distSq3 > 1e-6 ? ddy / dist2 : 0;
      const lnz = distSq3 > 1e-6 ? ddz / dist2 : 1;
      const cosFwd = Math.cos(angle);
      const sinFwd = Math.sin(angle);
      return {
        nx: lnx * cosFwd + lnz * sinFwd,
        ny: lny,
        nz: -lnx * sinFwd + lnz * cosFwd,
        depth: radius - dist2
      };
    }
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
function stepPlanePhysics(state, input, archetype, map, elapsedTime, destroyedColliderIds) {
  const dt = clamp(input.dt, 1e-3, 0.05);
  const result = {
    collided: false,
    collisionDamage: 0,
    hitNormal: null,
    collidedColliderId: null,
    triggeredHazard: null
  };
  if (!state.alive) return result;
  if (state.invulnTimer > 0) state.invulnTimer = Math.max(0, state.invulnTimer - dt);
  if (state.hitFlashTimer > 0) state.hitFlashTimer = Math.max(0, state.hitFlashTimer - dt);
  if (state.collideCooldown > 0) state.collideCooldown = Math.max(0, state.collideCooldown - dt);
  if (state.fireCooldown > 0) state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  if (state.secondaryCooldown > 0) {
    state.secondaryCooldown = Math.max(0, state.secondaryCooldown - dt);
  }
  if (state.barrelRollCooldown > 0) {
    state.barrelRollCooldown = Math.max(0, state.barrelRollCooldown - dt);
  }
  if (state.shieldTimer > 0) {
    state.shieldTimer = Math.max(0, state.shieldTimer - dt);
    if (state.shieldTimer <= 0) state.shieldHp = 0;
  }
  if (state.turboTimer > 0) state.turboTimer = Math.max(0, state.turboTimer - dt);
  if (state.glueTimer > 0) state.glueTimer = Math.max(0, state.glueTimer - dt);
  if (state.magnetTimer > 0) state.magnetTimer = Math.max(0, state.magnetTimer - dt);
  if (input.barrelRollDir !== 0 && state.barrelRollTimer <= 0 && state.barrelRollCooldown <= 0) {
    state.barrelRollTimer = 0.34;
    state.barrelRollCooldown = 1.15;
    state.barrelRollDir = input.barrelRollDir;
  }
  const turboActive = state.turboTimer > 0;
  const glued = state.glueTimer > 0;
  const isBoosting = turboActive || input.boost && state.boost > 1;
  if (turboActive) {
    state.boost = 100;
  } else if (isBoosting) {
    state.boost = Math.max(0, state.boost - 34 * dt);
  } else {
    state.boost = Math.min(100, state.boost + 18 * dt);
  }
  const throttle = clamp(input.throttle, -1, 1);
  let targetSpeed = archetype.cruiseSpeed;
  if (turboActive) {
    targetSpeed = archetype.boostSpeed * 1.15;
  } else if (isBoosting) {
    targetSpeed = archetype.boostSpeed;
  } else if (throttle > 0.05) {
    targetSpeed = archetype.cruiseSpeed + (archetype.maxSpeed - archetype.cruiseSpeed) * throttle;
  } else if (throttle < -0.05) {
    targetSpeed = archetype.cruiseSpeed + (archetype.cruiseSpeed - archetype.minSpeed) * throttle;
  }
  if (glued) {
    targetSpeed *= 0.56;
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
  const effectiveTurnRate = glued ? archetype.turnRate * 0.65 : archetype.turnRate;
  const yawDelta = -aimX * effectiveTurnRate * dt;
  const pitchDelta = aimY * effectiveTurnRate * 0.9 * dt;
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
      const fanYaw = getFanYawAtTime(
        wz.baseYaw,
        wz.sweepAmplitude,
        wz.sweepSpeed,
        elapsedTime,
        wz.continuousSpin
      );
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
  for (const uz of map.updraftZones) {
    const horiz = Math.hypot(nx - uz.x, nz - uz.z);
    if (horiz <= uz.radius && ny >= uz.y - 4 && ny <= uz.y + uz.height) {
      const radialFalloff = 1 - horiz / uz.radius * 0.45;
      ny += uz.liftStrength * radialFalloff * dt;
    }
  }
  const r = archetype.hitboxRadius;
  for (const col of map.colliders) {
    if (destroyedColliderIds?.has(col.id)) continue;
    const hit = resolveSphereVsCollider(nx, ny, nz, r, col, elapsedTime);
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
      result.collidedColliderId = col.id;
      if (state.collideCooldown <= 0 && state.invulnTimer <= 0) {
        const dmg = col.damageOnHit ?? Math.round(clamp(state.speed / archetype.maxSpeed * 14, 6, 16));
        result.collisionDamage = dmg;
        state.collideCooldown = 0.55;
      }
      break;
    }
  }
  if (state.invulnTimer <= 0) {
    for (const hz of map.hazardZones) {
      const horiz = Math.hypot(nx - hz.x, nz - hz.z);
      if (horiz <= hz.radius + r * 0.6 && ny >= hz.y - 4 && ny <= hz.y + hz.height) {
        result.triggeredHazard = hz;
        break;
      }
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
function pointInsideExpandedCollider(x, y, z, margin, col, elapsedTime) {
  if (col.kind === "box") {
    if (col.hinge) {
      return resolveSphereVsCollider(x, y, z, margin, col, elapsedTime) !== null;
    }
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
function computeBotInput(bot, allPlayers, settings, map, dt, elapsedTime, powerUps = []) {
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
  let wantsSecondary = false;
  let wantsBoost = false;
  let barrelRollDir = 0;
  let soughtPickup = null;
  if (!sim.secondaryPowerUp && powerUps.length > 0) {
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
      if (pointInsideExpandedCollider(px, py, pz, 12, col, elapsedTime)) {
        obstacleAhead = true;
        avoidY += 1;
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
  if (elapsedTime > 4 && sim.secondaryPowerUp && sim.secondaryCooldown <= 0) {
    if (sim.secondaryPowerUp === "repair_tape" && sim.hp < sim.maxHp * 0.7) {
      wantsSecondary = true;
    } else if (sim.secondaryPowerUp === "bubble_shield" && enemyDist < 120) {
      wantsSecondary = true;
    } else if (sim.secondaryPowerUp === "turbo_battery" && enemyDist > 110) {
      wantsSecondary = true;
    } else if (sim.secondaryPowerUp === "magnet" && enemyDist < 90) {
      wantsSecondary = true;
    } else if (sim.secondaryPowerUp === "glue_mine" && enemyDist < 65) {
      wantsSecondary = true;
    } else if ((sim.secondaryPowerUp === "rubber_missile" || sim.secondaryPowerUp === "firecracker" || sim.secondaryPowerUp === "water_bomb") && nearestEnemy && !obstacleAhead && enemyDist < 185 && dotFwd > 0.86) {
      wantsSecondary = true;
    }
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
    useSecondary: wantsSecondary,
    barrelRollDir
  };
}

// shared/powerups.ts
var POWERUP_ORDER = [
  "rubber_missile",
  "water_bomb",
  "firecracker",
  "glue_mine",
  "turbo_battery",
  "bubble_shield",
  "repair_tape",
  "magnet"
];
var POWERUPS = {
  rubber_missile: {
    id: "rubber_missile",
    nameFr: "Missiles \xE9lastiques",
    shortDescFr: "Missile \xE0 t\xEAte chercheuse (x2)",
    uses: 2,
    colorHex: "#EF4444",
    accentHex: "#FEF08A",
    kind: "offensive"
  },
  water_bomb: {
    id: "water_bomb",
    nameFr: "Bombe \xE0 eau",
    shortDescFr: "Explosion de zone \xE9claboussante",
    uses: 1,
    colorHex: "#0EA5E9",
    accentHex: "#E0F2FE",
    kind: "offensive"
  },
  firecracker: {
    id: "firecracker",
    nameFr: "P\xE9tard-fus\xE9e",
    shortDescFr: "Roquette ultra-rapide (x2)",
    uses: 2,
    colorHex: "#F97316",
    accentHex: "#FACC15",
    kind: "offensive"
  },
  glue_mine: {
    id: "glue_mine",
    nameFr: "Mine de colle",
    shortDescFr: "Pi\xE8ge collant qui ralentit (x2)",
    uses: 2,
    colorHex: "#EAB308",
    accentHex: "#FEF9C3",
    kind: "utility"
  },
  turbo_battery: {
    id: "turbo_battery",
    nameFr: "Pile turbo",
    shortDescFr: "Vitesse maximale pendant 5,5 s",
    uses: 1,
    colorHex: "#22C55E",
    accentHex: "#BBF7D0",
    kind: "mobility"
  },
  bubble_shield: {
    id: "bubble_shield",
    nameFr: "Bulle bouclier",
    shortDescFr: "Bulle de savon protectrice (7 s)",
    uses: 1,
    colorHex: "#A855F7",
    accentHex: "#F3E8FF",
    kind: "defensive"
  },
  repair_tape: {
    id: "repair_tape",
    nameFr: "Scotch r\xE9parateur",
    shortDescFr: "R\xE9pare +45 pts de coque",
    uses: 1,
    colorHex: "#10B981",
    accentHex: "#ECFDF5",
    kind: "defensive"
  },
  magnet: {
    id: "magnet",
    nameFr: "Aimant",
    shortDescFr: "D\xE9vie les ennemis proches (6 s)",
    uses: 1,
    colorHex: "#EC4899",
    accentHex: "#CBD5E1",
    kind: "utility"
  }
};
function pickRandomPowerUp(rng = Math.random, preferPool) {
  const list = preferPool && preferPool.length > 0 ? preferPool : POWERUP_ORDER;
  return list[Math.floor(rng() * list.length) % list.length];
}
function computeVacuumState(suddenDeathElapsed, map) {
  if (suddenDeathElapsed <= 0) {
    return {
      active: false,
      elapsed: 0,
      nozzleX: map.hardBounds.maxX + 60,
      nozzleY: 120,
      nozzleZ: 0,
      safeRadius: 340,
      suctionRadius: 42
    };
  }
  const progress = Math.min(1, suddenDeathElapsed / 48);
  const startRadius = 235;
  const minRadius = 26;
  const safeRadius = startRadius - (startRadius - minRadius) * progress;
  const angle = suddenDeathElapsed * 0.72;
  const nozzleX = Math.cos(angle) * safeRadius * 0.85;
  const nozzleZ = Math.sin(angle) * safeRadius * 0.7;
  const nozzleY = 108 + Math.sin(suddenDeathElapsed * 1.3) * 32;
  return {
    active: true,
    elapsed: suddenDeathElapsed,
    nozzleX,
    nozzleY,
    nozzleZ,
    safeRadius,
    suctionRadius: 40
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
function pointInsideCollider(x, y, z, col, elapsedTime = 0) {
  if (col.kind === "box") {
    if (col.hinge) {
      return resolveSphereVsCollider(x, y, z, 0.5, col, elapsedTime) !== null;
    }
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
function initRoundEntities(room) {
  const map = MAPS[room.settings.mapId] ?? MAPS.desk;
  room.projectiles.length = 0;
  room.secondaryProjectiles.length = 0;
  room.powerUps.length = 0;
  room.destroyedColliderIds.clear();
  room.suddenDeath = false;
  room.suddenDeathElapsed = 0;
  room.destructibles = map.destructibles.map((d) => ({
    id: d.id,
    colliderId: d.colliderId,
    kind: d.kind,
    x: d.x,
    y: d.y,
    z: d.z,
    radius: d.radius,
    hp: d.maxHp,
    maxHp: d.maxHp,
    destroyed: false,
    dropsPowerUp: d.dropsPowerUp,
    rewardPool: d.rewardPool
  }));
  room.powerUpSpots = map.powerUpSpots.map((sp, i) => ({
    id: sp.id,
    x: sp.x,
    y: sp.y,
    z: sp.z,
    // Spawn initial glowing pickups right after takeoff
    respawnTimer: 1.5 + i * 0.4
  }));
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
    secondaryCooldown: 0,
    hitFlashTimer: 0,
    collideCooldown: 0,
    secondaryPowerUp: null,
    secondaryUses: 0,
    shieldTimer: 0,
    shieldHp: 0,
    turboTimer: 0,
    glueTimer: 0,
    magnetTimer: 0
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
function damageDestructible(room, colliderOrDestructibleId, damage, attackerId, callbacks) {
  const d = room.destructibles.find(
    (prop) => !prop.destroyed && (prop.id === colliderOrDestructibleId || prop.colliderId === colliderOrDestructibleId)
  );
  if (!d) return false;
  d.hp = Math.max(0, d.hp - damage);
  if (d.hp > 0) return true;
  d.destroyed = true;
  room.destroyedColliderIds.add(d.colliderId);
  callbacks.emitHit(room, {
    targetId: d.id,
    attackerId,
    damage,
    x: round2(d.x),
    y: round2(d.y),
    z: round2(d.z),
    fatal: true
  });
  if (d.dropsPowerUp) {
    const powerUpId = pickRandomPowerUp(Math.random, d.rewardPool);
    room.powerUps.push({
      id: `pu_${room.nextPowerUpId++}`,
      powerUpId,
      x: d.x,
      y: Math.max(24, d.y + 4),
      z: d.z
    });
  }
  return true;
}
function activateSecondaryPowerUp(room, player, callbacks) {
  const powerUpId = player.sim.secondaryPowerUp;
  if (!powerUpId || player.sim.secondaryUses <= 0 || player.sim.secondaryCooldown > 0) return;
  player.sim.secondaryCooldown = 0.45;
  player.sim.secondaryUses--;
  if (player.sim.secondaryUses <= 0) {
    player.sim.secondaryPowerUp = null;
  }
  const fwd = getPlaneForward(player.sim);
  if (powerUpId === "repair_tape") {
    player.sim.hp = Math.min(player.sim.maxHp, player.sim.hp + 45);
    callbacks.emitHit(room, {
      targetId: player.id,
      attackerId: player.id,
      damage: 0,
      x: round2(player.sim.x),
      y: round2(player.sim.y),
      z: round2(player.sim.z),
      fatal: false
    });
    return;
  }
  if (powerUpId === "bubble_shield") {
    player.sim.shieldTimer = 7;
    player.sim.shieldHp = 60;
    return;
  }
  if (powerUpId === "turbo_battery") {
    player.sim.turboTimer = 5.5;
    player.sim.boost = 100;
    return;
  }
  if (powerUpId === "magnet") {
    player.sim.magnetTimer = 6;
    return;
  }
  if (powerUpId === "rubber_missile") {
    const speed = 250;
    room.secondaryProjectiles.push({
      id: room.nextProjectileId++,
      kind: "rubber_missile",
      ownerId: player.id,
      team: player.team,
      x: player.sim.x + fwd.x * 8,
      y: player.sim.y + fwd.y * 8,
      z: player.sim.z + fwd.z * 8,
      vx: fwd.x * speed,
      vy: fwd.y * speed,
      vz: fwd.z * speed,
      damage: 34,
      radius: 4,
      ttl: 3.2,
      maxTtl: 3.2
    });
    return;
  }
  if (powerUpId === "water_bomb") {
    const speed = 195;
    room.secondaryProjectiles.push({
      id: room.nextProjectileId++,
      kind: "water_bomb",
      ownerId: player.id,
      team: player.team,
      x: player.sim.x + fwd.x * 8,
      y: player.sim.y + fwd.y * 8,
      z: player.sim.z + fwd.z * 8,
      vx: fwd.x * speed,
      vy: fwd.y * speed + 28,
      vz: fwd.z * speed,
      damage: 38,
      radius: 4.5,
      ttl: 1.35,
      maxTtl: 1.35
    });
    return;
  }
  if (powerUpId === "firecracker") {
    const speed = 520;
    room.secondaryProjectiles.push({
      id: room.nextProjectileId++,
      kind: "firecracker",
      ownerId: player.id,
      team: player.team,
      x: player.sim.x + fwd.x * 8,
      y: player.sim.y + fwd.y * 8,
      z: player.sim.z + fwd.z * 8,
      vx: fwd.x * speed,
      vy: fwd.y * speed,
      vz: fwd.z * speed,
      damage: 42,
      radius: 3.5,
      ttl: 1.15,
      maxTtl: 1.15
    });
    return;
  }
  if (powerUpId === "glue_mine") {
    room.secondaryProjectiles.push({
      id: room.nextProjectileId++,
      kind: "glue_mine",
      ownerId: player.id,
      team: player.team,
      x: player.sim.x - fwd.x * 10,
      y: player.sim.y - fwd.y * 10,
      z: player.sim.z - fwd.z * 10,
      vx: -fwd.x * 10,
      vy: 0,
      vz: -fwd.z * 10,
      damage: 14,
      radius: 15,
      ttl: 18,
      maxTtl: 18
    });
  }
}
function applyCombatDamage(room, target, attacker, damage, hx, hy, hz, reason, powerUpId, callbacks) {
  const now = Date.now();
  const res = applyDamageToSim(target.sim, damage);
  if (target.sim.invulnTimer <= 0 && attacker) {
    target.lastHitBy = attacker.id;
    target.lastHitAt = now;
  }
  callbacks.emitHit(room, {
    targetId: target.id,
    attackerId: attacker?.id ?? target.id,
    damage: res.shieldBlocked ? 0 : damage,
    x: round2(hx),
    y: round2(hy),
    z: round2(hz),
    fatal: res.eliminated
  });
  if (res.eliminated) {
    target.deaths++;
    if (attacker && attacker.id !== target.id) {
      attacker.kills++;
      attacker.score += 100;
    }
    callbacks.emitKillFeed(room, {
      id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      killerName: attacker?.nickname ?? "Inconnu",
      killerTeam: attacker?.team ?? "none",
      victimName: target.nickname,
      victimTeam: target.team,
      reason,
      powerUpId,
      timestamp: now
    });
    callbacks.emitRoomState(room);
  }
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
        room.lastRoundWinner = null;
        initRoundEntities(room);
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
  if (room.roundTimer > 0) {
    room.roundTimer = Math.max(0, room.roundTimer - dt);
  } else {
    if (!room.suddenDeath) {
      room.suddenDeath = true;
      room.suddenDeathElapsed = 0;
      callbacks.emitRoomState(room);
    }
    room.suddenDeathElapsed += dt;
  }
  const allPlayers = Array.from(room.players.values());
  for (const spot of room.powerUpSpots) {
    const occupied = room.powerUps.some((p) => p.spotId === spot.id);
    if (!occupied) {
      spot.respawnTimer -= dt;
      if (spot.respawnTimer <= 0) {
        room.powerUps.push({
          id: `pu_${room.nextPowerUpId++}`,
          powerUpId: pickRandomPowerUp(),
          x: spot.x,
          y: spot.y,
          z: spot.z,
          spotId: spot.id
        });
      }
    }
  }
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
        room.elapsedTime,
        room.powerUps
      );
      player.lastProcessedSeq = latestInput.seq;
    } else if (player.inputQueue.length > 0) {
      const steps = player.inputQueue.splice(0, 4);
      for (const inp of steps) {
        const clampedInp = {
          ...inp,
          dt: Math.min(0.05, Math.max(5e-3, inp.dt))
        };
        const res = stepPlanePhysics(
          player.sim,
          clampedInp,
          arch,
          map,
          room.elapsedTime,
          room.destroyedColliderIds
        );
        player.lastProcessedSeq = clampedInp.seq;
        if (res.collidedColliderId) {
          damageDestructible(room, res.collidedColliderId, 22, player.id, callbacks);
        }
        if (res.triggeredHazard) {
          handlePlaneCrashDamage(
            room,
            player,
            res.triggeredHazard.damage,
            "hazard",
            callbacks,
            res.triggeredHazard.nameFr
          );
        } else if (res.collisionDamage > 0) {
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
        useSecondary: false,
        barrelRollDir: 0
      };
      const res = stepPlanePhysics(
        player.sim,
        latestInput,
        arch,
        map,
        room.elapsedTime,
        room.destroyedColliderIds
      );
      if (res.collidedColliderId) {
        damageDestructible(room, res.collidedColliderId, 22, player.id, callbacks);
      }
      if (res.triggeredHazard) {
        handlePlaneCrashDamage(
          room,
          player,
          res.triggeredHazard.damage,
          "hazard",
          callbacks,
          res.triggeredHazard.nameFr
        );
      } else if (res.collisionDamage > 0) {
        handlePlaneCrashDamage(room, player, res.collisionDamage, "crash", callbacks);
      }
    }
    if (player.isBot && latestInput) {
      const res = stepPlanePhysics(
        player.sim,
        latestInput,
        arch,
        map,
        room.elapsedTime,
        room.destroyedColliderIds
      );
      if (res.collidedColliderId) {
        damageDestructible(room, res.collidedColliderId, 22, player.id, callbacks);
      }
      if (res.triggeredHazard) {
        handlePlaneCrashDamage(
          room,
          player,
          res.triggeredHazard.damage,
          "hazard",
          callbacks,
          res.triggeredHazard.nameFr
        );
      } else if (res.collisionDamage > 0) {
        handlePlaneCrashDamage(room, player, res.collisionDamage, "crash", callbacks);
      }
    }
    if (player.sim.alive && player.sim.magnetTimer > 0) {
      for (const other of allPlayers) {
        if (!other.sim.alive) continue;
        if (!canDamageTarget(
          room.settings.mode,
          room.settings.friendlyFire,
          player.id,
          player.team,
          other.id,
          other.team
        )) {
          continue;
        }
        const dx = player.sim.x - other.sim.x;
        const dy = player.sim.y - other.sim.y;
        const dz = player.sim.z - other.sim.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 6 && dist < 95) {
          const pull = (1 - dist / 95) * 44 * dt / dist;
          other.sim.x += dx * pull;
          other.sim.y += dy * pull;
          other.sim.z += dz * pull;
        }
      }
      for (const pu of room.powerUps) {
        const dx = player.sim.x - pu.x;
        const dy = player.sim.y - pu.y;
        const dz = player.sim.z - pu.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 2 && dist < 80) {
          const pull = 75 * dt / dist;
          pu.x += dx * pull;
          pu.y += dy * pull;
          pu.z += dz * pull;
        }
      }
    }
    if (player.sim.alive) {
      for (let i = room.powerUps.length - 1; i >= 0; i--) {
        const pu = room.powerUps[i];
        const dist = Math.hypot(pu.x - player.sim.x, pu.y - player.sim.y, pu.z - player.sim.z);
        if (dist < 13) {
          player.sim.secondaryPowerUp = pu.powerUpId;
          player.sim.secondaryUses = POWERUPS[pu.powerUpId].uses;
          if (pu.spotId) {
            const spot = room.powerUpSpots.find((s) => s.id === pu.spotId);
            if (spot) spot.respawnTimer = 14;
          }
          room.powerUps.splice(i, 1);
          break;
        }
      }
    }
    if (player.sim.alive && player.sim.outOfBoundsTimer >= 4) {
      handlePlaneCrashDamage(room, player, 9999, "oob", callbacks);
    }
    if (player.sim.alive && latestInput?.useSecondary) {
      activateSecondaryPowerUp(room, player, callbacks);
    }
    if (player.sim.alive && latestInput?.fire && !player.sim.overheated && player.sim.fireCooldown <= 0) {
      player.sim.fireCooldown = 1 / arch.fireRate;
      player.sim.heat = Math.min(100, player.sim.heat + arch.overheatPerShot);
      if (player.sim.heat >= 100) {
        player.sim.overheated = true;
      }
      const fwd = getPlaneForward(player.sim);
      room.projectiles.push({
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
      });
    }
  }
  if (room.suddenDeath) {
    const vac = computeVacuumState(room.suddenDeathElapsed, map);
    for (const player of allPlayers) {
      if (!player.sim.alive) continue;
      const distCenter = Math.hypot(player.sim.x, player.sim.z);
      if (distCenter > vac.safeRadius && distCenter > 1) {
        const pull = 55 * dt;
        player.sim.x -= player.sim.x / distCenter * pull;
        player.sim.z -= player.sim.z / distCenter * pull;
        if (distCenter > vac.safeRadius + 24) {
          const res = applyDamageToSim(player.sim, 22 * dt);
          if (res.eliminated) {
            handlePlaneCrashDamage(room, player, 9999, "vacuum", callbacks);
            continue;
          }
        }
      }
      const distNozzle = Math.hypot(
        player.sim.x - vac.nozzleX,
        player.sim.y - vac.nozzleY,
        player.sim.z - vac.nozzleZ
      );
      if (distNozzle < vac.suctionRadius) {
        handlePlaneCrashDamage(room, player, 9999, "vacuum", callbacks);
      }
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
    let hitDestructible = false;
    for (const d of room.destructibles) {
      if (d.destroyed) continue;
      if (segmentIntersectsSphere(prevX, prevY, prevZ, proj.x, proj.y, proj.z, d.x, d.y, d.z, d.radius + 1.5)) {
        damageDestructible(room, d.id, proj.damage, proj.ownerId, callbacks);
        hitDestructible = true;
        break;
      }
    }
    if (hitDestructible) {
      room.projectiles.splice(i, 1);
      continue;
    }
    const hb = map.hardBounds;
    if (proj.x < hb.minX || proj.x > hb.maxX || proj.y < hb.minY || proj.y > hb.maxY || proj.z < hb.minZ || proj.z > hb.maxZ || map.colliders.some(
      (c) => !room.destroyedColliderIds.has(c.id) && pointInsideCollider(proj.x, proj.y, proj.z, c, room.elapsedTime)
    )) {
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
      applyCombatDamage(
        room,
        hitPlayer,
        owner,
        proj.damage,
        proj.x,
        proj.y,
        proj.z,
        "gun",
        void 0,
        callbacks
      );
      room.projectiles.splice(i, 1);
    }
  }
  for (let i = room.secondaryProjectiles.length - 1; i >= 0; i--) {
    const sp = room.secondaryProjectiles[i];
    const owner = room.players.get(sp.ownerId);
    const prevX = sp.x;
    const prevY = sp.y;
    const prevZ = sp.z;
    if (sp.kind === "rubber_missile") {
      let bestTarget = null;
      let bestDist = 240;
      for (const cand of allPlayers) {
        if (!cand.sim.alive) continue;
        if (!canDamageTarget(
          room.settings.mode,
          room.settings.friendlyFire,
          sp.ownerId,
          sp.team,
          cand.id,
          cand.team
        )) {
          continue;
        }
        const d = Math.hypot(cand.sim.x - sp.x, cand.sim.y - sp.y, cand.sim.z - sp.z);
        if (d < bestDist) {
          bestDist = d;
          bestTarget = cand;
        }
      }
      if (bestTarget) {
        const curSpeed = Math.hypot(sp.vx, sp.vy, sp.vz) || 250;
        const tx = bestTarget.sim.x - sp.x;
        const ty = bestTarget.sim.y - sp.y;
        const tz = bestTarget.sim.z - sp.z;
        const tLen = Math.hypot(tx, ty, tz) || 1;
        const steer = 4.2 * dt;
        sp.vx += (tx / tLen * curSpeed - sp.vx) * steer;
        sp.vy += (ty / tLen * curSpeed - sp.vy) * steer;
        sp.vz += (tz / tLen * curSpeed - sp.vz) * steer;
        const nLen = Math.hypot(sp.vx, sp.vy, sp.vz) || 1;
        sp.vx = sp.vx / nLen * curSpeed;
        sp.vy = sp.vy / nLen * curSpeed;
        sp.vz = sp.vz / nLen * curSpeed;
      }
    } else if (sp.kind === "water_bomb") {
      sp.vy -= 85 * dt;
    } else if (sp.kind === "glue_mine") {
      sp.vx *= 0.94;
      sp.vy *= 0.94;
      sp.vz *= 0.94;
    }
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.z += sp.vz * dt;
    sp.ttl -= dt;
    const hb = map.hardBounds;
    const hitWallOrFloor = sp.x < hb.minX || sp.x > hb.maxX || sp.y < hb.minY || sp.y > hb.maxY || sp.z < hb.minZ || sp.z > hb.maxZ || map.colliders.some(
      (c) => !room.destroyedColliderIds.has(c.id) && pointInsideCollider(sp.x, sp.y, sp.z, c, room.elapsedTime)
    );
    let hitProp = false;
    if (sp.kind !== "glue_mine") {
      for (const d of room.destructibles) {
        if (d.destroyed) continue;
        if (segmentIntersectsSphere(prevX, prevY, prevZ, sp.x, sp.y, sp.z, d.x, d.y, d.z, d.radius + 2)) {
          damageDestructible(room, d.id, sp.damage, sp.ownerId, callbacks);
          hitProp = true;
          break;
        }
      }
    }
    let directTarget = null;
    const mineArmed = sp.kind !== "glue_mine" || sp.maxTtl - sp.ttl > 0.35;
    if (mineArmed) {
      for (const target of allPlayers) {
        if (!target.sim.alive) continue;
        if (!canDamageTarget(
          room.settings.mode,
          room.settings.friendlyFire,
          sp.ownerId,
          sp.team,
          target.id,
          target.team
        )) {
          continue;
        }
        const hitR = PLANE_ARCHETYPES[target.cosmetics.planeId].hitboxRadius + sp.radius;
        if (segmentIntersectsSphere(
          prevX,
          prevY,
          prevZ,
          sp.x,
          sp.y,
          sp.z,
          target.sim.x,
          target.sim.y,
          target.sim.z,
          hitR
        )) {
          directTarget = target;
          break;
        }
      }
    }
    const shouldDetonate = sp.kind === "water_bomb" ? sp.ttl <= 0 || hitWallOrFloor || hitProp || directTarget !== null : sp.kind === "glue_mine" ? directTarget !== null : hitWallOrFloor || hitProp || directTarget !== null || sp.ttl <= 0;
    if (!shouldDetonate) continue;
    if (sp.kind === "water_bomb" && (sp.ttl <= 0 || hitWallOrFloor || hitProp || directTarget)) {
      const splashRadius = 42;
      for (const target of allPlayers) {
        if (!target.sim.alive) continue;
        if (!canDamageTarget(
          room.settings.mode,
          room.settings.friendlyFire,
          sp.ownerId,
          sp.team,
          target.id,
          target.team
        )) {
          continue;
        }
        const d = Math.hypot(target.sim.x - sp.x, target.sim.y - sp.y, target.sim.z - sp.z);
        if (d <= splashRadius) {
          const dmg = Math.round(sp.damage * (1 - 0.55 * (d / splashRadius)));
          applyCombatDamage(
            room,
            target,
            owner,
            dmg,
            sp.x,
            sp.y,
            sp.z,
            "secondary",
            "water_bomb",
            callbacks
          );
        }
      }
      callbacks.emitHit(room, {
        targetId: directTarget?.id ?? "splash",
        attackerId: sp.ownerId,
        damage: sp.damage,
        x: round2(sp.x),
        y: round2(sp.y),
        z: round2(sp.z),
        fatal: true
      });
    } else if (directTarget) {
      if (sp.kind === "glue_mine") {
        directTarget.sim.glueTimer = 3.5;
      }
      applyCombatDamage(
        room,
        directTarget,
        owner,
        sp.damage,
        sp.x,
        sp.y,
        sp.z,
        "secondary",
        sp.kind,
        callbacks
      );
    }
    room.secondaryProjectiles.splice(i, 1);
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
    room.roundTimer,
    room.suddenDeathElapsed
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
function handlePlaneCrashDamage(room, player, damage, reason, callbacks, hazardNameFr) {
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
      hazardNameFr,
      timestamp: now
    });
    callbacks.emitRoomState(room);
  }
}
function buildCompactSnapshot(room) {
  const map = MAPS[room.settings.mapId] ?? MAPS.desk;
  const wz = map.windZones[0];
  const fanAngle = wz ? round3(
    getFanYawAtTime(
      wz.baseYaw,
      wz.sweepAmplitude,
      wz.sweepSpeed,
      room.elapsedTime,
      wz.continuousSpin
    )
  ) : 0;
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
      secondaryPowerUp: p.sim.secondaryPowerUp,
      secondaryUses: p.sim.secondaryUses,
      shielded: p.sim.shieldTimer > 0 && p.sim.shieldHp > 0,
      turboActive: p.sim.turboTimer > 0,
      glued: p.sim.glueTimer > 0,
      magnetActive: p.sim.magnetTimer > 0,
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
  const secondaryProjectiles = room.secondaryProjectiles.map((sp) => ({
    id: sp.id,
    kind: sp.kind,
    ownerId: sp.ownerId,
    team: sp.team,
    x: round2(sp.x),
    y: round2(sp.y),
    z: round2(sp.z),
    vx: round2(sp.vx),
    vy: round2(sp.vy),
    vz: round2(sp.vz)
  }));
  const powerUps = room.powerUps.map((pu) => ({
    id: pu.id,
    powerUpId: pu.powerUpId,
    x: round2(pu.x),
    y: round2(pu.y),
    z: round2(pu.z)
  }));
  const destructibles = room.destructibles.map((d) => ({
    id: d.id,
    hp: Math.round(d.hp),
    maxHp: d.maxHp,
    destroyed: d.destroyed
  }));
  const vac = room.suddenDeath ? computeVacuumState(room.suddenDeathElapsed, map) : null;
  return {
    tick: room.tick,
    serverTime: Date.now(),
    roundTimer: round2(room.roundTimer),
    suddenDeath: room.suddenDeath,
    fanAngle,
    mapEventTime: round2(room.elapsedTime),
    planes,
    projectiles,
    secondaryProjectiles,
    powerUps,
    destructibles,
    vacuum: vac ? {
      active: true,
      x: round2(vac.nozzleX),
      y: round2(vac.nozzleY),
      z: round2(vac.nozzleZ),
      safeRadius: round2(vac.safeRadius)
    } : null
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
          useSecondary: Boolean(input.useSecondary),
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
        secondaryCooldown: 0,
        hitFlashTimer: 0,
        collideCooldown: 0,
        secondaryPowerUp: null,
        secondaryUses: 0,
        shieldTimer: 0,
        shieldHp: 0,
        turboTimer: 0,
        glueTimer: 0,
        magnetTimer: 0
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
      secondaryProjectiles: [],
      powerUps: [],
      powerUpSpots: [],
      destructibles: [],
      destroyedColliderIds: /* @__PURE__ */ new Set(),
      nextProjectileId: 1,
      nextPowerUpId: 1,
      tick: 0,
      elapsedTime: 0,
      roundNumber: 1,
      maxRounds: 3,
      roundTimer: 240,
      countdownTimer: 0,
      roundEndTimer: 0,
      suddenDeath: false,
      suddenDeathElapsed: 0,
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
          secondaryCooldown: 0,
          hitFlashTimer: 0,
          collideCooldown: 0,
          secondaryPowerUp: null,
          secondaryUses: 0,
          shieldTimer: 0,
          shieldHp: 0,
          turboTimer: 0,
          glueTimer: 0,
          magnetTimer: 0
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
    room.rewindHistory.length = 0;
    initRoundEntities(room);
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
      suddenDeath: room.suddenDeath,
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
