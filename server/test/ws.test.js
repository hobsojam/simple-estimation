const { EventEmitter } = require('node:events');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { WEBSOCKET_ERRORS } = require('../../shared/errors.json');
const {
  broadcastState,
  clearRoomTimer,
  handleConnection,
  roomSockets,
  roomTimers,
  scheduleAutoReveal,
  wsConnectionCountsByIp,
} = require('../index');
const {
  castVote,
  clearRooms,
  createRoom,
  getRoom,
  revealVotes,
  upsertParticipant,
} = require('../rooms');

class FakeSocket extends EventEmitter {
  constructor({ readyState = 1 } = {}) {
    super();
    this.OPEN = 1;
    this.CLOSED = 3;
    this.readyState = readyState;
    this.sent = [];
    this.closed = [];
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  close(code, reason) {
    this.closed.push({ code, reason });
    this.readyState = this.CLOSED;
  }
}

function requestFor(path, { remoteAddress = '127.0.0.1', headers = {} } = {}) {
  return {
    url: path,
    headers,
    socket: { remoteAddress },
  };
}

function latestState(ws) {
  return ws.sent.filter(msg => msg.type === 'state').at(-1).room;
}

function flushMessageChain() {
  return new Promise(resolve => setImmediate(resolve));
}

beforeEach(() => {
  clearRooms();
  roomSockets.clear();
  wsConnectionCountsByIp.clear();
  for (const roomId of roomTimers.keys()) clearRoomTimer(roomId);
});

afterEach(() => {
  clearRooms();
  roomSockets.clear();
  wsConnectionCountsByIp.clear();
  for (const roomId of roomTimers.keys()) clearRoomTimer(roomId);
});

describe('broadcastState', () => {
  it('sends sanitized state to every open socket', () => {
    const room = createRoom('planning-poker', null, 'Sprint 42');
    upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
    const first = new FakeSocket();
    const second = new FakeSocket();

    broadcastState(room, new Set([first, second]));

    assert.equal(first.sent.length, 1);
    assert.equal(second.sent.length, 1);
    assert.equal(first.sent[0].type, 'state');
    assert.equal(first.sent[0].room.id, room.id);
    assert.ok(!('pinHash' in first.sent[0].room));
  });

  it('skips sockets that are not open', () => {
    const room = createRoom('bucket', null);
    const open = new FakeSocket();
    const closed = new FakeSocket({ readyState: 3 });

    broadcastState(room, new Set([open, closed]));

    assert.equal(open.sent.length, 1);
    assert.equal(closed.sent.length, 0);
  });

  it('uses socket authorization when sanitizing state', () => {
    const room = createRoom('planning-poker', null, 'Protected', 'access-hash');
    upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: '5' });
    revealVotes(room.id);
    const authorized = new FakeSocket();
    authorized.isAuthorized = true;
    const unauthorized = new FakeSocket();
    unauthorized.isAuthorized = false;

    broadcastState(room, new Set([authorized, unauthorized]));

    assert.equal(authorized.sent[0].room.participants.length, 1);
    assert.equal(authorized.sent[0].room.participants[0].vote, '5');
    assert.equal(unauthorized.sent[0].room.accessRequired, true);
    assert.deepEqual(unauthorized.sent[0].room.participants, []);
  });
});

describe('handleConnection', () => {
  it('closes with a shared error code when roomId is missing', () => {
    const ws = new FakeSocket();

    handleConnection(ws, requestFor('/ws'));

    assert.deepEqual(ws.closed, [{
      code: WEBSOCKET_ERRORS.ROOM_ID_REQUIRED.code,
      reason: WEBSOCKET_ERRORS.ROOM_ID_REQUIRED.description,
    }]);
  });

  it('closes with a shared error code when the room is not found', () => {
    const ws = new FakeSocket();

    handleConnection(ws, requestFor('/ws?roomId=missing'));

    assert.deepEqual(ws.closed, [{
      code: WEBSOCKET_ERRORS.ROOM_NOT_FOUND.code,
      reason: WEBSOCKET_ERRORS.ROOM_NOT_FOUND.description,
    }]);
  });

  it('closes with a shared error code when the room is full', () => {
    const room = createRoom('bucket', null);
    for (let i = 0; i < 100; i += 1) {
      upsertParticipant(room.id, { id: `p${i}`, name: `User ${i}`, vote: null });
    }
    const ws = new FakeSocket();

    handleConnection(ws, requestFor(`/ws?roomId=${room.id}`));

    assert.deepEqual(ws.closed, [{
      code: WEBSOCKET_ERRORS.ROOM_FULL.code,
      reason: WEBSOCKET_ERRORS.ROOM_FULL.description,
    }]);
  });

  it('sets participantId from the query param and authorizes rooms without access pins', () => {
    const room = createRoom('bucket', null);
    const ws = new FakeSocket();

    handleConnection(ws, requestFor(`/ws?roomId=${room.id}&participantId=p1`));

    assert.equal(ws.participantId, 'p1');
    assert.equal(ws.roomId, room.id);
    assert.equal(ws.isAuthorized, true);
    assert.equal(roomSockets.get(room.id).has(ws), true);
  });

  it('falls back to a generated participantId', () => {
    const room = createRoom('bucket', null);
    const ws = new FakeSocket();

    handleConnection(ws, requestFor(`/ws?roomId=${room.id}`));

    assert.equal(typeof ws.participantId, 'string');
    assert.ok(ws.participantId.length > 0);
  });

  it('marks sockets unauthorized when the room has an access pin', () => {
    const room = createRoom('bucket', null, null, 'access-hash');
    const ws = new FakeSocket();

    handleConnection(ws, requestFor(`/ws?roomId=${room.id}&participantId=p1`));

    assert.equal(ws.isAuthorized, false);
    assert.equal(ws.sent[0].room.accessRequired, true);
    assert.deepEqual(ws.sent[0].room.participants, []);
  });

  it('sends initial state on connect', () => {
    const room = createRoom('planning-poker', null, 'Sprint 42');
    upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: '8' });
    const ws = new FakeSocket();

    handleConnection(ws, requestFor(`/ws?roomId=${room.id}&participantId=p1`));

    assert.equal(ws.sent.length, 1);
    assert.equal(ws.sent[0].type, 'state');
    assert.equal(ws.sent[0].room.id, room.id);
    assert.equal(ws.sent[0].room.name, 'Sprint 42');
    assert.equal(ws.sent[0].room.participants[0].vote, null);
  });

  it('closes with a shared rate-limit error when one IP has too many open sockets', () => {
    const room = createRoom('bucket', null);
    const sockets = [];
    for (let i = 0; i < 10; i += 1) {
      const ws = new FakeSocket();
      handleConnection(ws, requestFor(`/ws?roomId=${room.id}&participantId=p${i}`, {
        remoteAddress: '203.0.113.10',
      }));
      sockets.push(ws);
    }
    const rejected = new FakeSocket();

    handleConnection(rejected, requestFor(`/ws?roomId=${room.id}&participantId=blocked`, {
      remoteAddress: '203.0.113.10',
    }));

    assert.deepEqual(rejected.closed, [{
      code: WEBSOCKET_ERRORS.RATE_LIMIT_EXCEEDED.code,
      reason: WEBSOCKET_ERRORS.RATE_LIMIT_EXCEEDED.description,
    }]);
    assert.equal(rejected.sent.length, 0);
    assert.equal(roomSockets.get(room.id).has(rejected), false);
    assert.equal(wsConnectionCountsByIp.get('203.0.113.10'), 10);
  });

  it('allows a new socket from an IP after another socket from that IP closes', () => {
    const room = createRoom('bucket', null);
    const sockets = [];
    for (let i = 0; i < 10; i += 1) {
      const ws = new FakeSocket();
      handleConnection(ws, requestFor(`/ws?roomId=${room.id}&participantId=p${i}`, {
        remoteAddress: '203.0.113.20',
      }));
      sockets.push(ws);
    }
    sockets[0].emit('close');
    const replacement = new FakeSocket();

    handleConnection(replacement, requestFor(`/ws?roomId=${room.id}&participantId=replacement`, {
      remoteAddress: '203.0.113.20',
    }));

    assert.deepEqual(replacement.closed, []);
    assert.equal(roomSockets.get(room.id).has(replacement), true);
    assert.equal(wsConnectionCountsByIp.get('203.0.113.20'), 10);
  });

  it('does not broadcast state after an invalid message', async () => {
    const room = createRoom('planning-poker', null);
    const sender = new FakeSocket();
    const observer = new FakeSocket();
    handleConnection(sender, requestFor(`/ws?roomId=${room.id}&participantId=p1`));
    handleConnection(observer, requestFor(`/ws?roomId=${room.id}&participantId=p2`));
    sender.sent = [];
    observer.sent = [];

    sender.emit('message', JSON.stringify({ type: 'teleport' }));
    await flushMessageChain();

    assert.deepEqual(sender.sent, [{ type: 'error', message: 'Unknown message type: teleport' }]);
    assert.equal(observer.sent.length, 0);
  });

  it('broadcasts state after a valid state-changing message', async () => {
    const room = createRoom('planning-poker', null);
    const sender = new FakeSocket();
    const observer = new FakeSocket();
    handleConnection(sender, requestFor(`/ws?roomId=${room.id}&participantId=p1`));
    handleConnection(observer, requestFor(`/ws?roomId=${room.id}&participantId=p2`));
    sender.sent = [];
    observer.sent = [];

    sender.emit('message', JSON.stringify({ type: 'join', name: 'Alice' }));
    await flushMessageChain();

    assert.equal(sender.sent.length, 1);
    assert.equal(observer.sent.length, 1);
    assert.equal(sender.sent[0].type, 'state');
    assert.deepEqual(latestState(observer).participants.map(p => p.name), ['Alice']);
  });
});

describe('disconnect handling', () => {
  it('removes the socket and participant, then broadcasts to remaining sockets', () => {
    const room = createRoom('planning-poker', null);
    upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
    upsertParticipant(room.id, { id: 'p2', name: 'Bob', vote: null });
    const leaving = new FakeSocket();
    const remaining = new FakeSocket();
    handleConnection(leaving, requestFor(`/ws?roomId=${room.id}&participantId=p1`));
    handleConnection(remaining, requestFor(`/ws?roomId=${room.id}&participantId=p2`));
    remaining.sent = [];

    leaving.emit('close');

    assert.equal(roomSockets.get(room.id).has(leaving), false);
    assert.deepEqual(getRoom(room.id).participants.map(p => p.id), ['p2']);
    assert.equal(remaining.sent.length, 1);
    assert.deepEqual(latestState(remaining).participants.map(p => p.id), ['p2']);
  });

  it('does not broadcast after the last socket disconnects', () => {
    const room = createRoom('bucket', null);
    upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
    const ws = new FakeSocket();
    handleConnection(ws, requestFor(`/ws?roomId=${room.id}&participantId=p1`));
    ws.sent = [];

    ws.emit('close');

    assert.equal(roomSockets.has(room.id), false);
    assert.deepEqual(getRoom(room.id).participants, []);
    assert.equal(ws.sent.length, 0);
  });
});

describe('scheduleAutoReveal', () => {
  it('reveals votes and broadcasts state after the specified delay', async () => {
    const room = createRoom('planning-poker', null);
    upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
    castVote(room.id, 'p1', '5');
    const ws = new FakeSocket();
    ws.isAuthorized = true;
    roomSockets.set(room.id, new Set([ws]));

    scheduleAutoReveal(room.id, Date.now() + 10);
    await new Promise(resolve => setTimeout(resolve, 30));

    assert.equal(getRoom(room.id).revealed, true);
    assert.deepEqual(getRoom(room.id).timer, { endsAt: null, durationSeconds: null });
    assert.equal(ws.sent.length, 1);
    assert.equal(ws.sent[0].room.revealed, true);
    assert.equal(ws.sent[0].room.participants[0].vote, '5');
  });

  it('does not reveal or broadcast when the room is already revealed', async () => {
    const room = createRoom('planning-poker', null);
    upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
    castVote(room.id, 'p1', '8');
    revealVotes(room.id);
    const ws = new FakeSocket();
    roomSockets.set(room.id, new Set([ws]));

    scheduleAutoReveal(room.id, Date.now() + 10);
    await new Promise(resolve => setTimeout(resolve, 30));

    assert.equal(getRoom(room.id).revealed, true);
    assert.equal(ws.sent.length, 0);
  });
});
