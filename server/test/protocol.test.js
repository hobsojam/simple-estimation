const { EventEmitter } = require('node:events');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { WEBSOCKET_ERRORS, WEBSOCKET_MESSAGE_ERRORS } = require('../../shared/errors.json');
const {
  app,
  clearRoomTimer,
  handleConnection,
  roomSockets,
  roomTimers,
  scheduleAutoReveal,
  wsConnectionCountsByIp,
} = require('../index');
const {
  addItem,
  castVote,
  clearRooms,
  createRoom,
  getRoom,
  startTimer,
  upsertParticipant,
} = require('../rooms');

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.OPEN = 1;
    this.CLOSED = 3;
    this.readyState = this.OPEN;
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

function requestFor(path, { remoteAddress = '127.0.0.1' } = {}) {
  return {
    url: path,
    headers: {},
    socket: { remoteAddress },
  };
}

function connect(roomId, participantId = 'p1') {
  const ws = new FakeSocket();
  handleConnection(ws, requestFor(`/ws?roomId=${roomId}&participantId=${participantId}`));
  return ws;
}

function latestState(ws) {
  return ws.sent.filter(msg => msg.type === 'state').at(-1).room;
}

function latestError(ws) {
  return ws.sent.filter(msg => msg.type === 'error').at(-1);
}

async function sendMessage(ws, payload) {
  ws.emit('message', JSON.stringify(payload));
  for (let i = 0; i < 5; i += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

async function waitFor(assertion) {
  let lastError;
  for (let i = 0; i < 20; i += 1) {
    try {
      assertion();
      return;
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  throw lastError;
}

function clearRuntimeState() {
  clearRooms();
  roomSockets.clear();
  wsConnectionCountsByIp.clear();
  for (const roomId of roomTimers.keys()) clearRoomTimer(roomId);
}

beforeEach(clearRuntimeState);
afterEach(clearRuntimeState);

describe('HTTP protocol contract', () => {
  it('GET /api/config exposes only public configuration', async () => {
    const res = await request(app).get('/api/config');

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['demoMode', 'protocolVersion']);
    assert.equal(typeof res.body.demoMode, 'boolean');
    assert.equal(res.body.protocolVersion, 1);
  });

  it('GET /api/rooms lists only public room metadata', async () => {
    await request(app).post('/api/rooms').send({
      type: 'planning-poker',
      name: 'Protected Room',
      pin: 'admin',
      accessPin: 'guest',
    });

    const res = await request(app).get('/api/rooms');

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.deepEqual(Object.keys(res.body[0]).sort(), [
      'accessPinProtected',
      'id',
      'name',
      'participantCount',
      'pinProtected',
      'type',
    ]);
    assert.equal(res.body[0].name, 'Protected Room');
    assert.equal(res.body[0].pinProtected, true);
    assert.equal(res.body[0].accessPinProtected, true);
    assert.ok(!('pinHash' in res.body[0]));
    assert.ok(!('accessPinHash' in res.body[0]));
  });

  it('POST /api/rooms returns only the room id', async () => {
    const res = await request(app).post('/api/rooms').send({
      type: 'bucket',
      name: 'Bucket Session',
      pin: 'admin',
      accessPin: 'guest',
    });

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body), ['id']);
    assert.equal(typeof res.body.id, 'string');
  });

  it('DELETE /api/rooms/:id removes an unprotected room', async () => {
    const createRes = await request(app).post('/api/rooms').send({
      type: 'planning-poker',
      name: 'Disposable Room',
    });

    const deleteRes = await request(app).delete(`/api/rooms/${createRes.body.id}`);

    assert.equal(deleteRes.status, 204);
    assert.equal(getRoom(createRes.body.id), undefined);
  });

  it('DELETE /api/rooms/:id requires the facilitator PIN for protected rooms', async () => {
    const createRes = await request(app).post('/api/rooms').send({
      type: 'planning-poker',
      name: 'Protected Room',
      pin: 'admin',
    });

    const forbidden = await request(app).delete(`/api/rooms/${createRes.body.id}`);
    const deleted = await request(app)
      .delete(`/api/rooms/${createRes.body.id}`)
      .send({ pin: 'admin' });

    assert.equal(forbidden.status, 403);
    assert.deepEqual(forbidden.body, { error: 'PIN required' });
    assert.equal(deleted.status, 204);
    assert.equal(getRoom(createRes.body.id), undefined);
  });
});

describe('WebSocket protocol contract', () => {
  it('uses documented close codes for connection-level failures', () => {
    const missingRoomId = new FakeSocket();
    handleConnection(missingRoomId, requestFor('/ws'));

    const missingRoom = new FakeSocket();
    handleConnection(missingRoom, requestFor('/ws?roomId=missing'));

    assert.deepEqual(missingRoomId.closed, [{
      code: WEBSOCKET_ERRORS.ROOM_ID_REQUIRED.code,
      reason: WEBSOCKET_ERRORS.ROOM_ID_REQUIRED.description,
    }]);
    assert.deepEqual(missingRoom.closed, [{
      code: WEBSOCKET_ERRORS.ROOM_NOT_FOUND.code,
      reason: WEBSOCKET_ERRORS.ROOM_NOT_FOUND.description,
    }]);
  });

  it('sends a sanitized state envelope on connect', () => {
    const room = createRoom('planning-poker', 'facilitator-hash', 'Sprint 42');
    addItem(room.id, { id: 'i1', label: 'Story A', status: 'active', estimate: null });
    upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: '8' });
    startTimer(room.id, 60);
    const before = Date.now();

    const ws = connect(room.id, 'p1');
    const after = Date.now();
    const message = ws.sent[0];

    assert.equal(message.type, 'state');
    assert.deepEqual(Object.keys(message.room).sort(), [
      'facilitatorId',
      'id',
      'items',
      'name',
      'participants',
      'pinProtected',
      'revealed',
      'timer',
      'type',
    ]);
    assert.equal(message.room.id, room.id);
    assert.equal(message.room.type, 'planning-poker');
    assert.equal(message.room.name, 'Sprint 42');
    assert.equal(message.room.pinProtected, true);
    assert.equal(message.room.participants[0].voted, true);
    assert.equal(message.room.participants[0].vote, null);
    assert.deepEqual(message.room.items[0], { id: 'i1', label: 'Story A', status: 'active', estimate: null });
    assert.equal(message.room.timer.durationSeconds, 60);
    assert.equal(typeof message.room.timer.endsAt, 'number');
    assert.ok(message.room.timer.serverNow >= before);
    assert.ok(message.room.timer.serverNow <= after);
    assert.ok(!('pinHash' in message.room));
    assert.ok(!('accessPinHash' in message.room));
  });

  it('redacts access-protected rooms until join supplies the access PIN', async () => {
    const accessPinHash = await bcrypt.hash('guest', 10);
    const room = createRoom('planning-poker', null, 'Private Room', accessPinHash);
    upsertParticipant(room.id, { id: 'existing', name: 'Alice', vote: '5' });

    const ws = connect(room.id, 'p1');

    assert.equal(ws.isAuthorized, false);
    assert.deepEqual(ws.sent[0], {
      type: 'state',
      room: {
        id: room.id,
        type: 'planning-poker',
        name: 'Private Room',
        accessRequired: true,
        pinProtected: false,
        facilitatorId: null,
        revealed: false,
        participants: [],
        items: [],
      },
    });

    await sendMessage(ws, { type: 'join', name: 'Bob', accessPin: 'guest' });
    await waitFor(() => assert.equal(ws.isAuthorized, true));

    const state = latestState(ws);
    assert.equal(state.accessRequired, undefined);
    assert.deepEqual(state.participants.map(p => p.name), ['Alice', 'Bob']);
    assert.ok(!('accessPinHash' in state));
  });

  it('preserves participant identity when reconnecting with the same participantId', async () => {
    const room = createRoom('planning-poker', null, 'Sprint 42');
    const firstSocket = connect(room.id, 'alice');
    await sendMessage(firstSocket, { type: 'join', name: 'Alice' });
    firstSocket.emit('close');

    const reconnect = connect(room.id, 'alice');
    await sendMessage(reconnect, { type: 'join', name: 'Alice Reconnected' });

    const state = latestState(reconnect);
    assert.deepEqual(state.participants, [{
      id: 'alice',
      name: 'Alice Reconnected',
      voted: false,
      vote: null,
    }]);
    assert.equal(state.facilitatorId, 'alice');
  });

  it('clears vote when a participant disconnects and reconnects', async () => {
    const room = createRoom('planning-poker', null, 'Sprint 42');
    const firstSocket = connect(room.id, 'alice');
    await sendMessage(firstSocket, { type: 'join', name: 'Alice' });
    await sendMessage(firstSocket, { type: 'vote', vote: '5' });
    assert.equal(latestState(firstSocket).participants[0].voted, true);

    firstSocket.emit('close');

    const reconnect = connect(room.id, 'alice');
    await sendMessage(reconnect, { type: 'join', name: 'Alice' });

    const state = latestState(reconnect);
    assert.equal(state.participants[0].voted, false);
    assert.equal(state.participants[0].vote, null);
  });

  it('clears facilitator on disconnect in a PIN-protected room; reclaim requires claim_facilitator', async () => {
    const pinHash = await bcrypt.hash('admin', 10);
    const room = createRoom('planning-poker', pinHash, 'Sprint 42');
    const firstSocket = connect(room.id, 'alice');
    await sendMessage(firstSocket, { type: 'join', name: 'Alice', pin: 'admin' });
    assert.equal(latestState(firstSocket).facilitatorId, 'alice');

    firstSocket.emit('close');

    const reconnect = connect(room.id, 'alice');
    await sendMessage(reconnect, { type: 'join', name: 'Alice' });
    assert.equal(latestState(reconnect).facilitatorId, null);

    await sendMessage(reconnect, { type: 'claim_facilitator', pin: 'admin' });
    assert.equal(latestState(reconnect).facilitatorId, 'alice');
  });

  it('transfers facilitator ownership after a valid claim', async () => {
    const pinHash = await bcrypt.hash('admin', 10);
    const room = createRoom('planning-poker', pinHash, 'Sprint 42');
    const alice = connect(room.id, 'alice');
    const bob = connect(room.id, 'bob');

    await sendMessage(alice, { type: 'join', name: 'Alice', pin: 'admin' });
    await sendMessage(bob, { type: 'join', name: 'Bob' });
    bob.sent = [];

    await sendMessage(bob, { type: 'claim_facilitator', pin: 'admin' });

    assert.equal(latestState(bob).facilitatorId, 'bob');
  });

  it('rejects messages other than join before access authorization', async () => {
    const accessPinHash = await bcrypt.hash('guest', 10);
    const room = createRoom('bucket', null, 'Private Room', accessPinHash);
    const ws = connect(room.id, 'p1');
    ws.sent = [];

    await sendMessage(ws, { type: 'add_item', label: 'Story A' });

    assert.deepEqual(ws.sent, [{
      type: 'error',
      code: WEBSOCKET_MESSAGE_ERRORS.ACCESS_PIN_REQUIRED,
      message: 'Access PIN required',
    }]);
    assert.deepEqual(getRoom(room.id).items, []);
  });

  it('hides votes until reveal and exposes them after reveal', async () => {
    const room = createRoom('planning-poker', null, 'Sprint 42');
    const alice = connect(room.id, 'alice');
    const bob = connect(room.id, 'bob');
    alice.sent = [];
    bob.sent = [];

    await sendMessage(alice, { type: 'join', name: 'Alice' });
    await sendMessage(bob, { type: 'join', name: 'Bob' });
    await sendMessage(alice, { type: 'vote', vote: '5' });
    await sendMessage(bob, { type: 'vote', vote: '8' });

    const hidden = latestState(alice);
    assert.deepEqual(hidden.participants.map(p => ({ name: p.name, voted: p.voted, vote: p.vote })), [
      { name: 'Alice', voted: true, vote: null },
      { name: 'Bob', voted: true, vote: null },
    ]);

    await sendMessage(alice, { type: 'reveal' });

    const revealed = latestState(bob);
    assert.equal(revealed.revealed, true);
    assert.deepEqual(revealed.participants.map(p => ({ name: p.name, vote: p.vote })), [
      { name: 'Alice', vote: '5' },
      { name: 'Bob', vote: '8' },
    ]);
  });

  it('broadcasts Planning Poker item lifecycle state with stable item shapes', async () => {
    const room = createRoom('planning-poker', null, 'Sprint 42');
    const ws = connect(room.id, 'facilitator');
    await sendMessage(ws, { type: 'join', name: 'Facilitator' });
    ws.sent = [];

    await sendMessage(ws, { type: 'add_item', label: 'Story A' });
    let state = latestState(ws);
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].label, 'Story A');
    assert.equal(state.items[0].status, 'pending');
    assert.equal(state.items[0].estimate, null);
    assert.equal(typeof state.items[0].id, 'string');

    const itemId = state.items[0].id;
    await sendMessage(ws, { type: 'select_item', itemId });
    state = latestState(ws);
    assert.deepEqual(state.items[0], { id: itemId, label: 'Story A', status: 'active', estimate: null });

    await sendMessage(ws, { type: 'finalise_item', itemId, estimate: '5' });
    state = latestState(ws);
    assert.deepEqual(state.items[0], { id: itemId, label: 'Story A', status: 'done', estimate: '5' });
  });

  it('broadcasts Bucket and Relative item state with position-based item shapes', async () => {
    for (const type of ['bucket', 'relative']) {
      const room = createRoom(type, null, `${type} room`);
      const ws = connect(room.id, 'p1');
      await sendMessage(ws, { type: 'join', name: 'Alice' });
      ws.sent = [];

      await sendMessage(ws, { type: 'add_item', label: 'Story A' });
      let state = latestState(ws);
      assert.deepEqual(Object.keys(state.items[0]).sort(), ['id', 'label', 'position']);
      assert.equal(state.items[0].position, null);

      const position = type === 'bucket' ? 'M' : '8';
      await sendMessage(ws, { type: 'move_item', itemId: state.items[0].id, position });
      state = latestState(ws);
      assert.equal(state.items[0].position, position);
    }
  });

  it('rejects move_item positions outside the room-type contract', async () => {
    const room = createRoom('bucket', null, 'Bucket room');
    const ws = connect(room.id, 'p1');
    await sendMessage(ws, { type: 'join', name: 'Alice' });
    await sendMessage(ws, { type: 'add_item', label: 'Story A' });
    const itemId = latestState(ws).items[0].id;
    ws.sent = [];

    await sendMessage(ws, { type: 'move_item', itemId, position: 'XXL' });

    assert.deepEqual(latestError(ws), {
      type: 'error',
      code: WEBSOCKET_MESSAGE_ERRORS.ITEM_POSITION_INVALID,
      message: 'Invalid position for bucket room: XXL',
    });
    assert.equal(getRoom(room.id).items[0].position, null);
  });

  it('broadcasts timer state with server time and clears it on reveal', async () => {
    const room = createRoom('planning-poker', null, 'Sprint 42');
    const ws = connect(room.id, 'p1');
    await sendMessage(ws, { type: 'join', name: 'Alice' });
    ws.sent = [];
    const before = Date.now();

    await sendMessage(ws, { type: 'start_timer', seconds: 30 });

    let state = latestState(ws);
    const after = Date.now();
    assert.equal(state.timer.durationSeconds, 30);
    assert.equal(typeof state.timer.endsAt, 'number');
    assert.ok(state.timer.serverNow >= before);
    assert.ok(state.timer.serverNow <= after);

    await sendMessage(ws, { type: 'reveal' });

    state = latestState(ws);
    assert.equal(state.revealed, true);
    assert.equal(state.timer.endsAt, null);
    assert.equal(state.timer.durationSeconds, null);
    assert.equal(typeof state.timer.serverNow, 'number');
  });

  it('broadcasts cleared timer state after cancellation', async () => {
    const room = createRoom('planning-poker', null, 'Sprint 42');
    const ws = connect(room.id, 'p1');
    await sendMessage(ws, { type: 'join', name: 'Alice' });
    await sendMessage(ws, { type: 'start_timer', seconds: 30 });
    ws.sent = [];

    await sendMessage(ws, { type: 'cancel_timer' });

    const state = latestState(ws);
    assert.equal(state.timer.endsAt, null);
    assert.equal(state.timer.durationSeconds, null);
  });

  it('broadcasts revealed state when the timer expires', async () => {
    const room = createRoom('planning-poker', null, 'Sprint 42');
    const ws = connect(room.id, 'p1');
    await sendMessage(ws, { type: 'join', name: 'Alice' });
    startTimer(room.id, 30);
    ws.sent = [];

    scheduleAutoReveal(room.id, Date.now() + 10);
    await new Promise(resolve => setTimeout(resolve, 30));

    const state = latestState(ws);
    assert.equal(state.revealed, true);
    assert.equal(state.timer.endsAt, null);
    assert.equal(state.timer.durationSeconds, null);
  });

  it('closes active sockets when the room is deleted over HTTP', async () => {
    const room = createRoom('planning-poker', null, 'Disposable Room');
    const ws = connect(room.id, 'p1');

    const res = await request(app).delete(`/api/rooms/${room.id}`);

    assert.equal(res.status, 204);
    assert.deepEqual(ws.closed, [{ code: 1000, reason: 'Room deleted' }]);
    assert.equal(roomSockets.has(room.id), false);
    assert.equal(getRoom(room.id), undefined);
  });

  it('returns stable error envelopes for malformed JSON and unknown messages', async () => {
    const room = createRoom('planning-poker', null, 'Sprint 42');
    const ws = connect(room.id, 'p1');
    ws.sent = [];

    ws.emit('message', '{not-json');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(ws.sent, [{
      type: 'error',
      code: WEBSOCKET_MESSAGE_ERRORS.INVALID_JSON,
      message: 'Invalid JSON',
    }]);

    ws.sent = [];
    await sendMessage(ws, { type: 'teleport' });
    assert.deepEqual(latestError(ws), {
      type: 'error',
      code: WEBSOCKET_MESSAGE_ERRORS.UNKNOWN_MESSAGE_TYPE,
      message: 'Unknown message type: teleport',
    });
  });
});
