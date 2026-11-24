import type { Server, Socket } from 'socket.io';
import { MAPS } from '../shared/maps/index';
import { PLANE_ARCHETYPES } from '../shared/planes';
import {
  assignBalancedTeam,
  autoBalanceTeams,
  generateRoomCode,
  sanitizeNickname,
} from '../shared/rules';
import type {
  ClientToServerEvents,
  JoinRoomPayload,
  MatchScoreEntry,
  PlayerCosmetics,
  PlayerLobbyInfo,
  RoomSettings,
  RoomState,
  ServerToClientEvents,
  TeamId,
} from '../shared/types';
import { pickBotCosmetics, pickBotName, pickBotPersonality } from './bots';
import {
  buildCompactSnapshot,
  initRoundEntities,
  spawnPlayerAtIndex,
  stepRoomTick,
} from './gameLoop';
import { DEFAULT_ROOM_SETTINGS, type ServerPlayer, type ServerRoom } from './types';

type TypedIO = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const TARGET_BOT_FILL = 6; // Fill up to 6 planes by default when bots enabled (or up to maxPlayers)

export class RoomManager {
  private rooms = new Map<string, ServerRoom>();
  private socketToRoom = new Map<string, { roomCode: string; playerId: string }>();
  private io: TypedIO;
  private tickInterval: NodeJS.Timeout | null = null;
  private snapshotCounter = 0;

  constructor(io: TypedIO) {
    this.io = io;
    this.startLoop();
  }

  public getRoomCount(): number {
    return this.rooms.size;
  }

  private startLoop(): void {
    const TICK_MS = 1000 / 30; // 30 Hz authoritative tick
    let lastTime = Date.now();
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      this.snapshotCounter++;
      const shouldSendSnapshot = this.snapshotCounter % 3 !== 0; // ~20 Hz (2 of every 3 30Hz ticks)

      for (const room of this.rooms.values()) {
        // Clean up disconnected humans after 30s grace window
        for (const player of Array.from(room.players.values())) {
          if (
            !player.isBot &&
            !player.connected &&
            player.disconnectedAt &&
            now - player.disconnectedAt > 30000
          ) {
            this.removePlayerFromRoom(room, player.id);
          }
        }

        if (room.players.size === 0 || !Array.from(room.players.values()).some((p) => !p.isBot && p.connected)) {
          // If no connected humans remain for 30s, prune room
          const anyRecentHuman = Array.from(room.players.values()).some(
            (p) => !p.isBot && (p.connected || (p.disconnectedAt && now - p.disconnectedAt < 30000))
          );
          if (!anyRecentHuman) {
            this.rooms.delete(room.code);
            continue;
          }
        }

        if (room.phase === 'countdown' || room.phase === 'playing' || room.phase === 'round_end') {
          stepRoomTick(room, dt, {
            emitRoomState: (r) => this.broadcastRoomState(r),
            emitSnapshot: (r, snap) => this.io.to(r.code).emit('game:snapshot', snap),
            emitHit: (r, ev) => this.io.to(r.code).emit('game:hit', ev),
            emitKillFeed: (r, kf) => this.io.to(r.code).emit('game:killfeed', kf),
          });

          if (shouldSendSnapshot && (room.phase === 'playing' || room.phase === 'countdown')) {
            const snap = buildCompactSnapshot(room);
            this.io.to(room.code).emit('game:snapshot', snap);
          }
        }
      }
    }, TICK_MS);
  }

  public dispose(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  public handleConnection(socket: TypedSocket): void {
    socket.on('net:ping', (clientSentAt, ack) => {
      if (typeof ack === 'function') ack(clientSentAt);
    });

    socket.on('room:join', (payload, ack) => {
      this.handleJoin(socket, payload, ack);
    });

    socket.on('room:leave', () => {
      this.handleLeaveSocket(socket);
    });

    socket.on('room:updateSettings', (partial) => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room) return;
      const player = room.players.get(binding.playerId);
      if (!player || !player.isHost || room.phase !== 'lobby') return;

      this.applySettings(room, partial);
      this.syncBots(room);
      this.broadcastRoomState(room);
    });

    socket.on('room:setReady', (ready) => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room) return;
      const player = room.players.get(binding.playerId);
      if (!player) return;
      player.ready = Boolean(ready);
      this.broadcastRoomState(room);
    });

    socket.on('room:switchTeam', (team) => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room || room.phase !== 'lobby' || room.settings.mode !== 'last_plane_teams') return;
      const player = room.players.get(binding.playerId);
      if (!player) return;
      if (team === 'red' || team === 'blue') {
        player.team = team;
        this.broadcastRoomState(room);
      }
    });

    socket.on('room:updateCosmetics', (cosmetics) => {
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

    socket.on('room:startMatch', () => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room) return;
      const player = room.players.get(binding.playerId);
      if (!player || !player.isHost || room.phase !== 'lobby') return;

      this.startMatch(room);
    });

    socket.on('room:playAgain', () => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room) return;
      const player = room.players.get(binding.playerId);
      if (!player || !player.isHost) return;
      this.startMatch(room);
    });

    socket.on('game:input', (input) => {
      const binding = this.socketToRoom.get(socket.id);
      if (!binding) return;
      const room = this.rooms.get(binding.roomCode);
      if (!room || (room.phase !== 'playing' && room.phase !== 'countdown')) return;
      const player = room.players.get(binding.playerId);
      if (!player || player.isBot) return;

      // Update approximate RTT if client reports ping or track queue
      if (player.inputQueue.length < 16) {
        player.inputQueue.push({
          seq: Number(input.seq) || 0,
          dt: Math.min(0.05, Math.max(0.005, Number(input.dt) || 1 / 60)),
          aimX: Math.max(-1, Math.min(1, Number(input.aimX) || 0)),
          aimY: Math.max(-1, Math.min(1, Number(input.aimY) || 0)),
          throttle: Math.max(-1, Math.min(1, Number(input.throttle) || 0)),
          roll: Math.max(-1, Math.min(1, Number(input.roll) || 0)),
          boost: Boolean(input.boost),
          fire: Boolean(input.fire),
          useSecondary: Boolean(input.useSecondary),
          barrelRollDir:
            input.barrelRollDir === -1 ? -1 : input.barrelRollDir === 1 ? 1 : 0,
        });
      }
    });

    socket.on('disconnect', () => {
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

  private handleJoin(
    socket: TypedSocket,
    payload: JoinRoomPayload,
    ack: (res: { ok: boolean; room?: RoomState; playerId?: string; error?: string }) => void
  ): void {
    // Leave previous room if any
    this.handleLeaveSocket(socket);

    const nickname = sanitizeNickname(payload.nickname || 'Pilote');
    const cosmetics = this.sanitizeCosmetics(payload.cosmetics);
    const sessionToken = payload.sessionToken || socket.id;

    let room: ServerRoom | undefined;

    if (payload.mode === 'join') {
      const code = (payload.roomCode || '').trim().toUpperCase();
      if (!/^[A-Z]{5}$/.test(code)) {
        ack({ ok: false, error: 'Entre un code valide à 5 lettres.' });
        return;
      }
      room = this.rooms.get(code);
      if (!room) {
        ack({ ok: false, error: 'Salon introuvable. Vérifie le code à 5 lettres.' });
        return;
      }
    } else if (payload.mode === 'quick') {
      // Find an open public room in lobby with available human capacity
      for (const candidate of this.rooms.values()) {
        if (!candidate.settings.isPrivate && candidate.phase === 'lobby') {
          const humanCount = Array.from(candidate.players.values()).filter((p) => !p.isBot).length;
          if (humanCount < candidate.settings.maxPlayers) {
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

    // Check reconnect by sessionToken
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

    // Remove a bot if room is full of bots + humans
    const humanCount = Array.from(room.players.values()).filter((p) => !p.isBot).length;
    if (humanCount >= room.settings.maxPlayers) {
      ack({ ok: false, error: 'Ce salon est complet.' });
      return;
    }

    const playerId = `p_${Math.random().toString(36).slice(2, 10)}`;
    const hasHumanHost = Array.from(room.players.values()).some((p) => !p.isBot && p.isHost && p.connected);

    const team: TeamId =
      room.settings.mode === 'last_plane_teams'
        ? assignBalancedTeam(Array.from(room.players.values()))
        : 'none';

    const newPlayer: ServerPlayer = {
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
        magnetTimer: 0,
      },
      inputQueue: [],
      lastProcessedSeq: 0,
      kills: 0,
      deaths: 0,
      roundWins: 0,
      score: 0,
      lastHitBy: null,
      lastHitAt: 0,
    };

    room.players.set(playerId, newPlayer);
    this.syncBots(room);

    // If joining mid-match, spawn as spectator or active if lobby
    if (room.phase === 'playing' || room.phase === 'countdown') {
      spawnPlayerAtIndex(newPlayer, room.players.size, room.settings.mapId, room.settings.livesPerRound);
    }

    this.socketToRoom.set(socket.id, { roomCode: room.code, playerId });
    socket.join(room.code);
    this.broadcastRoomState(room);
    ack({ ok: true, room: this.serializeRoomState(room), playerId });
  }

  private handleLeaveSocket(socket: TypedSocket): void {
    const binding = this.socketToRoom.get(socket.id);
    if (!binding) return;
    this.socketToRoom.delete(socket.id);
    socket.leave(binding.roomCode);
    const room = this.rooms.get(binding.roomCode);
    if (!room) return;
    this.removePlayerFromRoom(room, binding.playerId);
  }

  private removePlayerFromRoom(room: ServerRoom, playerId: string): void {
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

  private reassignHostIfNeeded(room: ServerRoom): void {
    const hasActiveHost = Array.from(room.players.values()).some(
      (p) => !p.isBot && p.isHost && p.connected
    );
    if (hasActiveHost) return;
    for (const p of room.players.values()) {
      p.isHost = false;
    }
    const nextHost =
      Array.from(room.players.values()).find((p) => !p.isBot && p.connected) ??
      Array.from(room.players.values()).find((p) => !p.isBot);
    if (nextHost) nextHost.isHost = true;
  }

  private createRoom(isPrivate: boolean): ServerRoom {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }
    const room: ServerRoom = {
      code,
      phase: 'lobby',
      settings: {
        ...DEFAULT_ROOM_SETTINGS,
        isPrivate,
      },
      players: new Map(),
      projectiles: [],
      secondaryProjectiles: [],
      powerUps: [],
      powerUpSpots: [],
      destructibles: [],
      destroyedColliderIds: new Set(),
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
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  private applySettings(room: ServerRoom, partial: Partial<RoomSettings>): void {
    const prevMode = room.settings.mode;
    if (partial.mode === 'last_plane_ffa' || partial.mode === 'last_plane_teams') {
      room.settings.mode = partial.mode;
    }
    if (partial.mapId && MAPS[partial.mapId]?.available) {
      room.settings.mapId = partial.mapId;
    }
    if (typeof partial.livesPerRound === 'number') {
      room.settings.livesPerRound = Math.max(1, Math.min(5, Math.round(partial.livesPerRound)));
    }
    if (typeof partial.botsEnabled === 'boolean') {
      room.settings.botsEnabled = partial.botsEnabled;
    }
    if (typeof partial.maxPlayers === 'number') {
      room.settings.maxPlayers = Math.max(4, Math.min(16, Math.round(partial.maxPlayers)));
    }
    if (typeof partial.friendlyFire === 'boolean') {
      room.settings.friendlyFire = partial.friendlyFire;
    }

    if (prevMode !== room.settings.mode) {
      if (room.settings.mode === 'last_plane_teams') {
        autoBalanceTeams(Array.from(room.players.values()));
      } else {
        for (const p of room.players.values()) p.team = 'none';
      }
    }
  }

  private syncBots(room: ServerRoom): void {
    if (room.phase !== 'lobby') return;
    // Remove excess or all bots if disabled
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
      const team: TeamId =
        room.settings.mode === 'last_plane_teams'
          ? assignBalancedTeam(Array.from(room.players.values()))
          : 'none';
      const arch = PLANE_ARCHETYPES[cosmetics.planeId];

      const botPlayer: ServerPlayer = {
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
          magnetTimer: 0,
        },
        inputQueue: [],
        lastProcessedSeq: 0,
        kills: 0,
        deaths: 0,
        roundWins: 0,
        score: 0,
        lastHitBy: null,
        lastHitAt: 0,
      };
      room.players.set(botId, botPlayer);
      botIndex++;
    }
  }

  private startMatch(room: ServerRoom): void {
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

    room.phase = 'countdown';
    room.countdownTimer = 2.2;
    this.broadcastRoomState(room);
    // Immediately send initial snapshot so 3D engine positions planes during countdown
    this.io.to(room.code).emit('game:snapshot', buildCompactSnapshot(room));
  }

  private sanitizeCosmetics(raw?: Partial<PlayerCosmetics>): PlayerCosmetics {
    const planeId =
      raw?.planeId && PLANE_ARCHETYPES[raw.planeId] ? raw.planeId : 'plastic_jet';
    const validPaints = new Set(['red', 'blue', 'yellow', 'green', 'orange', 'white']);
    const validStickers = new Set(['star', 'lightning', 'target', 'flame']);
    const paintId = raw?.paintId && validPaints.has(raw.paintId) ? raw.paintId : 'red';
    const stickerId = raw?.stickerId && validStickers.has(raw.stickerId) ? raw.stickerId : 'star';
    return { planeId, paintId, stickerId };
  }

  private serializeRoomState(room: ServerRoom): RoomState {
    const players: PlayerLobbyInfo[] = [];
    const scoreboard: MatchScoreEntry[] = [];

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
        ping: p.ping,
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
        livesRemaining: p.sim.lives,
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
      scoreboard,
    };
  }

  private broadcastRoomState(room: ServerRoom): void {
    this.io.to(room.code).emit('room:state', this.serializeRoomState(room));
  }
}
