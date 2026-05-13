const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createRoom, clearRooms } = require('../rooms');
const { handleMessage } = require('../handlers');

function mockWs(participantId) {
  const messages = [];
  const ws = {
    participantId,
    readyState: 1,
    OPEN: 1,
    send(raw) { messages.push(JSON.parse(raw)); },
    messages,
  };
  return ws;
}

describe('handlers', () => {
  beforeEach(() => clearRooms());

  describe('join', () => {
    it('errors when name is missing', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join' });
      assert.equal(ws.messages[0].type, 'error');
    });

    it('errors when name is blank', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: '   ' });
      assert.equal(ws.messages[0].type, 'error');
    });

    it('first joiner becomes facilitator with no PIN', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      assert.equal(room.facilitatorId, 'p1');
    });

    it('second joiner does not take facilitator', async () => {
      const room = createRoom('planning-poker', null);
      await handleMessage(mockWs('p1'), room, { type: 'join', name: 'Alice' });
      await handleMessage(mockWs('p2'), room, { type: 'join', name: 'Bob' });
      assert.equal(room.facilitatorId, 'p1');
    });

    it('errors when PIN required but not provided', async () => {
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      assert.equal(ws.messages[0].type, 'error');
      assert.equal(room.facilitatorId, null);
    });

    it('errors on wrong PIN', async () => {
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice', pin: 'wrong' });
      assert.equal(ws.messages[0].type, 'error');
    });

    it('correct PIN grants facilitator role', async () => {
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice', pin: 'secret' });
      assert.equal(room.facilitatorId, 'p1');
      assert.equal(ws.messages.length, 0);
    });
  });

  describe('vote', () => {
    it('errors on invalid vote value', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'vote', vote: '99' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('errors when vote is missing', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'vote' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('accepts all valid Fibonacci and special values', async () => {
      const valid = ['1', '2', '3', '5', '8', '13', '21', '?', '∞', '☕'];
      for (const v of valid) {
        clearRooms();
        const room = createRoom('planning-poker', null);
        const ws = mockWs('p1');
        await handleMessage(ws, room, { type: 'join', name: 'Alice' });
        ws.messages.length = 0;
        await handleMessage(ws, room, { type: 'vote', vote: v });
        assert.ok(!ws.messages.some(m => m.type === 'error'), `"${v}" should be a valid vote`);
      }
    });
  });

  describe('add_item', () => {
    it('errors when called by a non-facilitator', async () => {
      const room = createRoom('bucket', null);
      await handleMessage(mockWs('f1'), room, { type: 'join', name: 'Alice' });
      const other = mockWs('p2');
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(other, room, { type: 'add_item', label: 'Story' });
      assert.ok(other.messages.some(m => m.type === 'error'));
      assert.equal(room.items.length, 0);
    });

    it('errors when label exceeds 200 characters', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'x'.repeat(201) });
      assert.ok(ws.messages.some(m => m.type === 'error'));
      assert.equal(room.items.length, 0);
    });

    it('errors when label is missing', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('facilitator can add an item', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      assert.equal(room.items.length, 1);
      assert.equal(room.items[0].label, 'Story A');
    });

    it('trims whitespace from label', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: '  Story B  ' });
      assert.equal(room.items[0].label, 'Story B');
    });
  });

  describe('reveal', () => {
    it('errors when called by a non-facilitator', async () => {
      const room = createRoom('planning-poker', null);
      await handleMessage(mockWs('f1'), room, { type: 'join', name: 'Alice' });
      const other = mockWs('p2');
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(other, room, { type: 'reveal' });
      assert.ok(other.messages.some(m => m.type === 'error'));
      assert.equal(room.revealed, false);
    });

    it('facilitator can reveal', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'reveal' });
      assert.equal(room.revealed, true);
    });
  });

  describe('reset', () => {
    it('errors when called by a non-facilitator', async () => {
      const room = createRoom('planning-poker', null);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice' });
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(facilitator, room, { type: 'vote', vote: '5' });
      await handleMessage(facilitator, room, { type: 'reveal' });
      await handleMessage(other, room, { type: 'reset' });
      assert.ok(other.messages.some(m => m.type === 'error'));
      assert.equal(room.revealed, true);
    });

    it('facilitator can reset', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'vote', vote: '5' });
      await handleMessage(ws, room, { type: 'reveal' });
      await handleMessage(ws, room, { type: 'reset' });
      assert.equal(room.revealed, false);
      assert.equal(room.participants[0].vote, null);
    });
  });

  describe('claim_facilitator', () => {
    it('transfers facilitator role with correct PIN', async () => {
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      await handleMessage(mockWs('f1'), room, { type: 'join', name: 'Alice', pin: 'secret' });
      const second = mockWs('p2');
      await handleMessage(second, room, { type: 'join', name: 'Bob' });
      await handleMessage(second, room, { type: 'claim_facilitator', pin: 'secret' });
      assert.equal(room.facilitatorId, 'p2');
    });

    it('errors on wrong PIN and does not transfer role', async () => {
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      await handleMessage(mockWs('f1'), room, { type: 'join', name: 'Alice', pin: 'secret' });
      const second = mockWs('p2');
      await handleMessage(second, room, { type: 'join', name: 'Bob' });
      await handleMessage(second, room, { type: 'claim_facilitator', pin: 'wrong' });
      assert.equal(room.facilitatorId, 'f1');
      assert.ok(second.messages.some(m => m.type === 'error'));
    });

    it('errors when room has no PIN', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'claim_facilitator', pin: 'anything' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });
  });

  describe('unknown message type', () => {
    it('errors on unrecognised type', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'teleport' });
      assert.equal(ws.messages[0].type, 'error');
    });
  });
});
