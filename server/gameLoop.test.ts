import test from 'node:test';
import assert from 'node:assert/strict';
import { quatFromYaw } from '../shared/flightPhysics';
import { PLANE_ARCHETYPES } from '../shared/planes';
import type { KillFeedEntry, PlayerInputState } from '../shared/types';
import { initRoundEntities, stepRoomTick, type LoopCallbacks } from './gameLoop';
import { DEFAULT_ROOM_SETTINGS, type ServerPlayer, type ServerRoom } from './types';

function makePlayer(id: string, overrides: Partial<ServerPlayer> = {}): ServerPlayer {
  const [qx, qy, qz, qw] = quatFromYaw(0);
  const arch = PLANE_ARCHETYPES.plastic_jet;
  return {
    id,
    sessionToken: id,
    socketId: id,
    nickname: id,
    isHost: false,
    isBot: false,
    ready: true,
    connected: true,
    disconnectedAt: null,
    team: 'none',
    cosmetics: { planeId: 'plastic_jet', paintId: 'red', stickerId: 'star' },
    ping: 24,
    sim: {
      x: 0,
      y: 120,
      z: 60,
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
      invulnTimer: 0,
      outOfBoundsTimer: 0,
      alive: true,
      lives: 3,
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
      magnetTimer: 0,
    },
    inputQueue: [],
    lastInput: null,
    idleRepeatTime: 0,
    dtBudget: 0,
    lastProcessedSeq: 0,
    kills: 0,
    deaths: 0,
    roundWins: 0,
    score: 0,
    lastHitBy: null,
    lastHitAt: 0,
    ...overrides,
  };
}

function makeRoom(players: ServerPlayer[]): ServerRoom {
  const room: ServerRoom = {
    code: 'ABCDE',
    phase: 'playing',
    settings: { ...DEFAULT_ROOM_SETTINGS, botsEnabled: false },
    players: new Map(players.map((p) => [p.id, p])),
    projectiles: [],
    secondaryProjectiles: [],
    powerUps: [],
    powerUpSpots: [],
    destructibles: [],
    destroyedColliderIds: new Set(),
    nextProjectileId: 1,
    nextPowerUpId: 1,
    tick: 0,
    elapsedTime: 5,
    roundNumber: 1,
    maxRounds: 3,
    roundTimer: 180,
    countdownTimer: 0,
    roundEndTimer: 0,
    suddenDeath: false,
    suddenDeathElapsed: 0,
    roundHadBothTeams: false,
    teamRoundWins: { red: 0, blue: 0 },
    lastRoundWinner: null,
    rewindHistory: [],
    createdAt: Date.now(),
  };
  initRoundEntities(room);
  return room;
}

function makeCallbacks(killFeed: KillFeedEntry[] = []): LoopCallbacks {
  return {
    emitRoomState: () => {},
    emitSnapshot: () => {},
    emitHit: () => {},
    emitKillFeed: (_room, entry) => {
      killFeed.push(entry);
    },
  };
}

function makeInput(seq: number, dt: number, overrides: Partial<PlayerInputState> = {}): PlayerInputState {
  return {
    seq,
    dt,
    aimX: 0,
    aimY: 0,
    throttle: 0,
    roll: 0,
    boost: false,
    fire: false,
    useSecondary: false,
    barrelRollDir: 0,
    ...overrides,
  };
}

test('stepRoomTick prevents dt-cheat speed acceleration when client floods large dt inputs', () => {
  const legit = makePlayer('legit');
  const cheater = makePlayer('cheater');
  const room = makeRoom([legit, cheater]);
  const cb = makeCallbacks();

  const dt = 1 / 30;
  for (let tick = 1; tick <= 30; tick++) {
    legit.inputQueue.push(makeInput(tick, dt, { throttle: 1 }));
    // Cheater spams 4 inputs per tick each claiming dt=0.05 (6x real time!)
    for (let k = 0; k < 4; k++) {
      cheater.inputQueue.push(makeInput(tick * 4 + k, 0.05, { throttle: 1 }));
    }
    stepRoomTick(room, dt, cb);
  }

  const legitDist = 60 - legit.sim.z;
  const cheaterDist = 60 - cheater.sim.z;
  assert.ok(legitDist > 50, 'legit plane should travel ~70-85cm in 1s');
  assert.ok(
    Math.abs(cheaterDist - legitDist) < 8,
    `cheater distance (${cheaterDist.toFixed(1)}) must match legit distance (${legitDist.toFixed(1)})`
  );
});

test('stepRoomTick smooths single dropped packet without snapping steering to zero', () => {
  const p = makePlayer('smooth');
  const room = makeRoom([p]);
  const cb = makeCallbacks();

  const dt = 1 / 30;
  p.inputQueue.push(makeInput(1, dt, { aimX: 1 }));
  stepRoomTick(room, dt, cb);
  const yawAfterInput = Math.hypot(p.sim.qx, p.sim.qy, p.sim.qz);

  // Next tick has empty inputQueue (transient drop) -> should hold last aimX for <=220ms
  stepRoomTick(room, dt, cb);
  const yawAfterDrop = Math.hypot(p.sim.qx, p.sim.qy, p.sim.qz);
  assert.ok(yawAfterDrop > yawAfterInput, 'steering should continue smoothly across 1 dropped packet');
});

test('glue_mine expires cleanly when ttl reaches zero', () => {
  const owner = makePlayer('owner');
  const room = makeRoom([owner]);
  const cb = makeCallbacks();

  room.secondaryProjectiles.push({
    id: 1,
    kind: 'glue_mine',
    ownerId: owner.id,
    team: 'none',
    x: 0,
    y: 120,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    damage: 14,
    radius: 15,
    ttl: 0.02,
    maxTtl: 18,
  });

  stepRoomTick(room, 1 / 30, cb);
  assert.equal(room.secondaryProjectiles.length, 0, 'expired glue mine must be removed');
});

test('slow sudden-death vacuum kills emit killfeed and credit death', () => {
  const victim = makePlayer('victim');
  const survivor = makePlayer('survivor');
  victim.sim.hp = 1;
  victim.sim.x = 230; // far outside shrinking vacuum safe radius
  victim.sim.z = 0;

  const room = makeRoom([victim, survivor]);
  room.roundTimer = 0;
  room.suddenDeath = true;
  room.suddenDeathElapsed = 30;

  const killFeed: KillFeedEntry[] = [];
  stepRoomTick(room, 0.1, makeCallbacks(killFeed));

  assert.equal(victim.sim.alive, false);
  assert.equal(victim.deaths, 1);
  assert.equal(killFeed.length, 1);
  assert.equal(killFeed[0].reason, 'vacuum');
  assert.equal(killFeed[0].victimName, 'victim');
});

test('teams round transition: an emptied team is refilled, a lone pilot ends the match', () => {
  // 3 pilots left, all red after a departure: the next round starts with both teams populated
  const a = makePlayer('a', { team: 'red' });
  const b = makePlayer('b', { team: 'red' });
  const c = makePlayer('c', { team: 'red' });
  const room = makeRoom([a, b, c]);
  room.settings.mode = 'last_plane_teams';
  room.phase = 'round_end';
  room.roundEndTimer = 0.01;
  room.teamRoundWins = { red: 1, blue: 0 };
  stepRoomTick(room, 1 / 30, makeCallbacks());
  assert.equal(room.phase, 'countdown');
  assert.equal(room.roundNumber, 2);
  assert.equal(room.roundHadBothTeams, true);
  const teams = [a, b, c].map((p) => p.team);
  assert.ok(teams.includes('red') && teams.includes('blue'));

  // A single pilot left: the match ends instead of running an unwinnable round
  const solo = makePlayer('solo', { team: 'red' });
  const room2 = makeRoom([solo]);
  room2.settings.mode = 'last_plane_teams';
  room2.phase = 'round_end';
  room2.roundEndTimer = 0.01;
  room2.teamRoundWins = { red: 1, blue: 0 };
  stepRoomTick(room2, 1 / 30, makeCallbacks());
  assert.equal(room2.phase, 'match_end');
});

test('2 humans in red with bots off in teams mode do not end round immediately in stepRoomTick', () => {
  const p1 = makePlayer('p1', { team: 'red' });
  const p2 = makePlayer('p2', { team: 'red' });
  const room = makeRoom([p1, p2]);
  room.settings.mode = 'last_plane_teams';
  room.settings.botsEnabled = false;

  for (let i = 0; i < 30; i++) {
    stepRoomTick(room, 1 / 30, makeCallbacks());
  }

  assert.equal(room.phase, 'playing');
  assert.equal(room.lastRoundWinner, null);
});

test('lag compensation rewinds by ping/2 + REMOTE_INTERP_DELAY_MS (95ms)', () => {
  const shooter = makePlayer('shooter', { ping: 80, team: 'none' });
  const target = makePlayer('target', { team: 'none' });
  // Target has moved far right now, but 135ms ago (80/2 + 95) was at (0, 120, 0)
  target.sim.x = 120;
  target.sim.y = 120;
  target.sim.z = 0;

  const room = makeRoom([shooter, target]);
  const now = Date.now();
  room.rewindHistory.push(
    {
      time: now - 135,
      planes: new Map([
        ['shooter', { x: 0, y: 120, z: 60, radius: 5, alive: true }],
        ['target', { x: 0, y: 120, z: 0, radius: 5, alive: true }],
      ]),
    },
    {
      time: now,
      planes: new Map([
        ['shooter', { x: 0, y: 120, z: 60, radius: 5, alive: true }],
        ['target', { x: 120, y: 120, z: 0, radius: 5, alive: true }],
      ]),
    }
  );

  // Fire projectile passing straight through (0, 120, 0)
  room.projectiles.push({
    id: 99,
    ownerId: shooter.id,
    team: 'none',
    x: 0,
    y: 120,
    z: 5,
    vx: 0,
    vy: 0,
    vz: -300,
    damage: 25,
    heavy: false,
    ttl: 1.0,
  });

  const initialHp = target.sim.hp;
  stepRoomTick(room, 1 / 30, makeCallbacks());
  assert.ok(target.sim.hp < initialHp, 'shot aimed at 135ms rewound position must hit target');
});

