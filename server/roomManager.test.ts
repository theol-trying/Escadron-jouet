import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Server, Socket } from 'socket.io';
import { PLANE_ARCHETYPES } from '../shared/planes';
import type {
  ClientToServerEvents,
  RoomState,
  ServerToClientEvents,
} from '../shared/types';
import { RoomManager } from './roomManager';

class FakeSocket extends EventEmitter {
  public id: string;
  public rooms = new Set<string>();
  public emittedToSocket: Array<{ event: string; args: unknown[] }> = [];

  constructor(id: string) {
    super();
    this.id = id;
  }

  public join(roomCode: string): void {
    this.rooms.add(roomCode);
  }

  public leave(roomCode: string): void {
    this.rooms.delete(roomCode);
  }

  public override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (typeof event === 'string') {
      this.emittedToSocket.push({ event, args });
    }
    return super.emit(event, ...args);
  }

  public timeout(_ms: number) {
    return {
      emit: (_event: string, cb?: (err: unknown) => void) => {
        if (typeof cb === 'function') cb(null);
      },
    };
  }

  public trigger(event: keyof ClientToServerEvents | 'disconnect', ...args: unknown[]): void {
    super.emit(event, ...args);
  }
}

class FakeIO {
  public sockets = { sockets: new Map<string, FakeSocket>() };
  public broadcasts: Array<{ room: string; event: string; payload: unknown }> = [];

  public to(room: string) {
    return {
      emit: (event: string, payload: unknown) => {
        this.broadcasts.push({ room, event, payload });
      },
    };
  }
}

function createHarness() {
  const io = new FakeIO();
  const rm = new RoomManager(io as unknown as Server<ClientToServerEvents, ServerToClientEvents>);
  const connect = (id: string) => {
    const sock = new FakeSocket(id);
    io.sockets.sockets.set(id, sock);
    rm.handleConnection(sock as unknown as Socket<ClientToServerEvents, ServerToClientEvents>);
    return sock;
  };
  return { io, rm, connect };
}

test('RoomManager handles malformed room:join payloads without crashing', () => {
  const { rm, connect } = createHarness();
  try {
    const sock = connect('s1');
    // 1. Missing ack callback
    assert.doesNotThrow(() => {
      sock.trigger('room:join', {
        mode: 'create',
        nickname: 'Pilote1',
        cosmetics: { planeId: 'plastic_jet', paintId: 'red', stickerId: 'star' },
        sessionToken: 'tok1',
      });
    });

    // 2. Numeric nickname
    let ackRes: { ok: boolean; room?: RoomState } | null = null;
    assert.doesNotThrow(() => {
      sock.trigger(
        'room:join',
        {
          mode: 'create',
          nickname: 12345 as unknown as string,
          cosmetics: { planeId: 'plastic_jet', paintId: 'red', stickerId: 'star' },
          sessionToken: 'tok2',
        },
        (res: { ok: boolean; room?: RoomState }) => {
          ackRes = res;
        }
      );
    });
    assert.ok(ackRes && (ackRes as { ok: boolean }).ok);
    const joinedRoom = (ackRes as unknown as { room: RoomState }).room;
    assert.equal(joinedRoom.players.find((p) => !p.isBot)?.nickname, 'Pilote');

    // 3. Null / non-object payload
    let errRes: { ok: boolean; error?: string } | null = null;
    assert.doesNotThrow(() => {
      sock.trigger('room:join', null, (res: { ok: boolean; error?: string }) => {
        errRes = res;
      });
    });
    assert.equal((errRes as { ok: boolean } | null)?.ok, false);
  } finally {
    rm.dispose();
  }
});

test('RoomManager rejects __proto__ injection and locks plane switching mid-match', () => {
  const { rm, connect } = createHarness();
  try {
    const sock = connect('s1');
    let joined: { ok: boolean; room?: RoomState; playerId?: string } = { ok: false };
    sock.trigger(
      'room:join',
      {
        mode: 'create',
        nickname: 'As',
        cosmetics: { planeId: 'foam_glider', paintId: 'blue', stickerId: 'star' },
        sessionToken: 'tok_proto',
      },
      (res: { ok: boolean; room?: RoomState; playerId?: string }) => {
        joined = res;
      }
    );
    assert.ok(joined.ok && joined.room && joined.playerId);

    // Attempt __proto__ planeId & mapId
    sock.trigger('room:updateCosmetics', {
      planeId: '__proto__',
      paintId: 'constructor',
      stickerId: 'toString',
    });
    sock.trigger('room:updateSettings', { mapId: '__proto__' });

    const lastRoomBroadcast = (rm as unknown as { rooms: Map<string, { settings: { mapId: string }; players: Map<string, { cosmetics: { planeId: string }; sim: { maxHp: number } }> }> }).rooms.get(joined.room.code)!;
    assert.equal(lastRoomBroadcast.settings.mapId, 'desk');
    const me = lastRoomBroadcast.players.get(joined.playerId)!;
    assert.equal(me.cosmetics.planeId, 'plastic_jet'); // sanitized fallback, never '__proto__'

    // Set valid plane in lobby, start match, then attempt mid-match switch
    sock.trigger('room:updateCosmetics', {
      planeId: 'foam_glider',
      paintId: 'green',
      stickerId: 'flame',
    });
    assert.equal(me.cosmetics.planeId, 'foam_glider');
    assert.equal(me.sim.maxHp, PLANE_ARCHETYPES.foam_glider.maxHp);

    sock.trigger('room:startMatch');
    sock.trigger('room:updateCosmetics', {
      planeId: 'diecast_bomber',
      paintId: 'red',
      stickerId: 'star',
    });

    // Must remain foam_glider with foam_glider HP during match
    assert.equal(me.cosmetics.planeId, 'foam_glider');
    assert.equal(me.sim.maxHp, PLANE_ARCHETYPES.foam_glider.maxHp);
  } finally {
    rm.dispose();
  }
});

test('RoomManager keeps Teams mode balanced when humans join or switch teams', () => {
  const { rm, connect } = createHarness();
  try {
    const s1 = connect('s1');
    let res1: { ok: boolean; room?: RoomState; playerId?: string } = { ok: false };
    s1.trigger(
      'room:join',
      {
        mode: 'create',
        nickname: 'Hote',
        cosmetics: { planeId: 'plastic_jet', paintId: 'red', stickerId: 'star' },
        sessionToken: 't1',
      },
      (res: { ok: boolean; room?: RoomState; playerId?: string }) => {
        res1 = res;
      }
    );
    const code = res1.room!.code;
    s1.trigger('room:updateSettings', { mode: 'last_plane_teams', botsEnabled: true });

    // Join 2nd and 3rd humans and verify 3v3 team parity
    const s2 = connect('s2');
    s2.trigger('room:join', {
      mode: 'join',
      roomCode: code,
      nickname: 'Deux',
      cosmetics: { planeId: 'plastic_jet', paintId: 'blue', stickerId: 'star' },
      sessionToken: 't2',
    });
    const s3 = connect('s3');
    s3.trigger('room:join', {
      mode: 'join',
      roomCode: code,
      nickname: 'Trois',
      cosmetics: { planeId: 'plastic_jet', paintId: 'yellow', stickerId: 'star' },
      sessionToken: 't3',
    });

    // Switch s2 to red as well -> bots must rebalance to keep 3v3
    s2.trigger('room:switchTeam', 'red');

    const internalRoom = (rm as unknown as { rooms: Map<string, { players: Map<string, { team: string }> }> }).rooms.get(code)!;
    const players = Array.from(internalRoom.players.values());
    const red = players.filter((p) => p.team === 'red').length;
    const blue = players.filter((p) => p.team === 'blue').length;
    assert.equal(red, 3);
    assert.equal(blue, 3);
  } finally {
    rm.dispose();
  }
});

test('RoomManager reconnects player by sessionToken and updates socket binding', () => {
  const { rm, connect } = createHarness();
  try {
    const s1 = connect('s1');
    let res1: { ok: boolean; room?: RoomState; playerId?: string } = { ok: false };
    s1.trigger(
      'room:join',
      {
        mode: 'create',
        nickname: 'Revenant',
        cosmetics: { planeId: 'windup_biplane', paintId: 'orange', stickerId: 'star' },
        sessionToken: 'persist_tok',
      },
      (res: { ok: boolean; room?: RoomState; playerId?: string }) => {
        res1 = res;
      }
    );
    const code = res1.room!.code;
    const pid = res1.playerId!;
    s1.trigger('room:startMatch');
    s1.trigger('disconnect');

    const s2 = connect('s2');
    let res2: { ok: boolean; room?: RoomState; playerId?: string } = { ok: false };
    s2.trigger(
      'room:join',
      {
        mode: 'join',
        roomCode: code,
        nickname: 'Revenant',
        // Attempted plane swap on reconnect during active match should be ignored
        cosmetics: { planeId: 'diecast_bomber', paintId: 'red', stickerId: 'star' },
        sessionToken: 'persist_tok',
      },
      (res: { ok: boolean; room?: RoomState; playerId?: string }) => {
        res2 = res;
      }
    );
    assert.equal(res2.ok, true);
    assert.equal(res2.playerId, pid);
    const me = res2.room!.players.find((p) => p.id === pid)!;
    assert.equal(me.connected, true);
    assert.equal(me.cosmetics.planeId, 'windup_biplane');
  } finally {
    rm.dispose();
  }
});

test('RoomManager with 2 humans in Red and bots disabled rebalances on launch so round does not end immediately', () => {
  const { io, rm, connect } = createHarness();
  try {
    const s1 = connect('s1');
    let res1: { ok: boolean; room?: RoomState } = { ok: false };
    s1.trigger(
      'room:join',
      {
        mode: 'create',
        nickname: 'Rouge1',
        cosmetics: { planeId: 'plastic_jet', paintId: 'red', stickerId: 'star' },
        sessionToken: 'red1',
      },
      (res: { ok: boolean; room?: RoomState }) => {
        res1 = res;
      }
    );
    const code = res1.room!.code;
    s1.trigger('room:updateSettings', { mode: 'last_plane_teams', botsEnabled: false });

    // Solo player in teams mode with bots off cannot start
    s1.trigger('room:startMatch');
    const errBroadcast = io.broadcasts.find((b) => b.room === code && b.event === 'room:error');
    assert.ok(errBroadcast, 'solo teams launch must emit room:error');

    const s2 = connect('s2');
    s2.trigger('room:join', {
      mode: 'join',
      roomCode: code,
      nickname: 'Rouge2',
      cosmetics: { planeId: 'plastic_jet', paintId: 'red', stickerId: 'star' },
      sessionToken: 'red2',
    });
    s1.trigger('room:switchTeam', 'red');
    s2.trigger('room:switchTeam', 'red');
    s1.trigger('room:startMatch');

    const internalRoom = (
      rm as unknown as {
        rooms: Map<
          string,
          {
            phase: string;
            players: Map<string, { team: string }>;
          }
        >;
      }
    ).rooms.get(code)!;
    assert.equal(internalRoom.phase, 'countdown');
    const teams = Array.from(internalRoom.players.values()).map((p) => p.team);
    assert.equal(teams.filter((t) => t === 'red').length, 1);
    assert.equal(teams.filter((t) => t === 'blue').length, 1);
  } finally {
    rm.dispose();
  }
});


test('quick play: a single shared public room, newcomers mid-match wait for the next round', () => {
  const { rm, connect } = createHarness();
  const cos = { planeId: 'plastic_jet', paintId: 'red', stickerId: 'star' };
  const a = connect('sock_a');
  let first: { room?: RoomState; playerId?: string } = {};
  a.trigger('room:join', { mode: 'quick', nickname: 'Alice', cosmetics: cos, sessionToken: 'ta' }, (res: typeof first) => {
    first = res;
  });
  assert.ok(first.room);
  a.trigger('room:startMatch');

  const b = connect('sock_b');
  let second: { room?: RoomState; playerId?: string } = {};
  b.trigger('room:join', { mode: 'quick', nickname: 'Bruno', cosmetics: cos, sessionToken: 'tb' }, (res: typeof second) => {
    second = res;
  });
  assert.equal(second.room?.code, first.room?.code, 'same room for everyone');
  assert.notEqual(second.room?.phase, 'lobby', 'joined while the match runs');

  // Bruno spectates this round (no plane yet in an elimination mode)
  const room = (rm as unknown as { rooms: Map<string, { players: Map<string, { sim: { alive: boolean; lives: number } }> }> }).rooms.get(
    first.room!.code
  )!;
  const bruno = room.players.get(second.playerId!)!;
  assert.equal(bruno.sim.alive, false);
  assert.equal(bruno.sim.lives, 0);
  rm.dispose();
});
