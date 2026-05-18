const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { sweepInactiveRooms } = require('../index');
const { createRoom, getRoom, clearRooms } = require('../rooms');

describe('sweepInactiveRooms', () => {
  beforeEach(() => clearRooms());

  it('deletes a room whose lastActivityAt is before the cutoff', () => {
    const room = createRoom('bucket', null);
    room.lastActivityAt = Date.now() - 1000;
    sweepInactiveRooms(new Map(), 500);
    assert.equal(getRoom(room.id), undefined);
  });

  it('keeps a room whose lastActivityAt is within the TTL', () => {
    const room = createRoom('bucket', null);
    sweepInactiveRooms(new Map(), 60000);
    assert.ok(getRoom(room.id));
  });

  it('closes open WebSocket connections for expired rooms', () => {
    const room = createRoom('bucket', null);
    room.lastActivityAt = Date.now() - 1000;
    const closed = [];
    const fakeWs = { close: (code, reason) => closed.push({ code, reason }) };
    const sockets = new Map([[room.id, new Set([fakeWs])]]);
    sweepInactiveRooms(sockets, 500);
    assert.equal(closed.length, 1);
    assert.equal(closed[0].code, 1001);
    assert.equal(closed[0].reason, 'Room expired');
    assert.equal(sockets.has(room.id), false);
  });

  it('only deletes expired rooms, not active ones', () => {
    const old = createRoom('bucket', null);
    old.lastActivityAt = Date.now() - 10000;
    const fresh = createRoom('bucket', null);
    sweepInactiveRooms(new Map(), 5000);
    assert.equal(getRoom(old.id), undefined);
    assert.ok(getRoom(fresh.id));
  });

  it('handles rooms with no open sockets gracefully', () => {
    const room = createRoom('bucket', null);
    room.lastActivityAt = Date.now() - 1000;
    sweepInactiveRooms(new Map(), 500);
    assert.equal(getRoom(room.id), undefined);
  });
});
