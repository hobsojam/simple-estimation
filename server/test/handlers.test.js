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

  describe('select_item', () => {
    it('errors when called by a non-facilitator', async () => {
      const room = createRoom('planning-poker', null);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice' });
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(facilitator, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(other, room, { type: 'select_item', itemId: room.items[0].id });
      assert.ok(other.messages.some(m => m.type === 'error'));
      assert.equal(room.items[0].status, 'pending');
    });

    it('errors when itemId is missing', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'select_item' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('errors when item is not found', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'select_item', itemId: 'no-such-id' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('errors when selecting a done item', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      room.items[0].status = 'done';
      await handleMessage(ws, room, { type: 'select_item', itemId: room.items[0].id });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('facilitator can select a pending item', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'select_item', itemId: room.items[0].id });
      assert.equal(room.items[0].status, 'active');
    });

    it('selecting resets votes and revealed', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story B' });
      await handleMessage(ws, room, { type: 'select_item', itemId: room.items[0].id });
      await handleMessage(ws, room, { type: 'vote', vote: '5' });
      await handleMessage(ws, room, { type: 'reveal' });
      assert.equal(room.revealed, true);
      await handleMessage(ws, room, { type: 'select_item', itemId: room.items[1].id });
      assert.equal(room.revealed, false);
      assert.equal(room.participants[0].vote, null);
    });

    it('only one item is active at a time', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story B' });
      await handleMessage(ws, room, { type: 'select_item', itemId: room.items[0].id });
      await handleMessage(ws, room, { type: 'select_item', itemId: room.items[1].id });
      assert.equal(room.items.filter(i => i.status === 'active').length, 1);
      assert.equal(room.items[1].status, 'active');
      assert.equal(room.items[0].status, 'pending');
    });
  });

  describe('finalise_item', () => {
    it('errors when called by a non-facilitator', async () => {
      const room = createRoom('planning-poker', null);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice' });
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(facilitator, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(facilitator, room, { type: 'select_item', itemId: room.items[0].id });
      await handleMessage(other, room, { type: 'finalise_item', itemId: room.items[0].id, estimate: '5' });
      assert.ok(other.messages.some(m => m.type === 'error'));
      assert.equal(room.items[0].status, 'active');
    });

    it('errors when itemId is missing', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'finalise_item', estimate: '5' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('errors when estimate is missing', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'select_item', itemId: room.items[0].id });
      await handleMessage(ws, room, { type: 'finalise_item', itemId: room.items[0].id });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('errors when estimate is not a valid vote value', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'select_item', itemId: room.items[0].id });
      await handleMessage(ws, room, { type: 'finalise_item', itemId: room.items[0].id, estimate: '99' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
      assert.equal(room.items[0].status, 'active');
    });

    it('errors when item is not found', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'finalise_item', itemId: 'no-such-id', estimate: '5' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('errors when item is not active', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'finalise_item', itemId: room.items[0].id, estimate: '5' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('facilitator can finalise the active item', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'select_item', itemId: room.items[0].id });
      await handleMessage(ws, room, { type: 'finalise_item', itemId: room.items[0].id, estimate: '8' });
      assert.equal(room.items[0].status, 'done');
      assert.equal(room.items[0].estimate, '8');
    });

    it('accepts all valid vote values as estimate', async () => {
      const valid = ['1', '2', '3', '5', '8', '13', '21', '?', '∞', '☕'];
      for (const v of valid) {
        clearRooms();
        const room = createRoom('planning-poker', null);
        const ws = mockWs('f1');
        await handleMessage(ws, room, { type: 'join', name: 'Alice' });
        await handleMessage(ws, room, { type: 'add_item', label: 'Story' });
        await handleMessage(ws, room, { type: 'select_item', itemId: room.items[0].id });
        ws.messages.length = 0;
        await handleMessage(ws, room, { type: 'finalise_item', itemId: room.items[0].id, estimate: v });
        assert.ok(!ws.messages.some(m => m.type === 'error'), `"${v}" should be a valid estimate`);
        assert.equal(room.items[0].estimate, v);
      }
    });
  });

  describe('remove_item', () => {
    it('errors when called by a non-facilitator', async () => {
      const room = createRoom('planning-poker', null);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice' });
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(facilitator, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(other, room, { type: 'remove_item', itemId: room.items[0].id });
      assert.ok(other.messages.some(m => m.type === 'error'));
      assert.equal(room.items.length, 1);
    });

    it('errors when itemId is missing', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'remove_item' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('errors when item is not found', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'remove_item', itemId: 'no-such-id' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('errors when removing a done item', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'select_item', itemId: room.items[0].id });
      await handleMessage(ws, room, { type: 'finalise_item', itemId: room.items[0].id, estimate: '5' });
      ws.messages.length = 0;
      await handleMessage(ws, room, { type: 'remove_item', itemId: room.items[0].id });
      assert.ok(ws.messages.some(m => m.type === 'error'));
      assert.equal(room.items.length, 1);
    });

    it('errors when removing an active item', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'select_item', itemId: room.items[0].id });
      ws.messages.length = 0;
      await handleMessage(ws, room, { type: 'remove_item', itemId: room.items[0].id });
      assert.ok(ws.messages.some(m => m.type === 'error'));
      assert.equal(room.items.length, 1);
    });

    it('facilitator can remove a pending item', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'remove_item', itemId: room.items[0].id });
      assert.equal(room.items.length, 0);
    });
  });

  describe('add_item (planning-poker shape)', () => {
    it('creates item with status and estimate fields for planning-poker rooms', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      assert.equal(room.items[0].status, 'pending');
      assert.equal(room.items[0].estimate, null);
      assert.equal(room.items[0].position, undefined);
    });
  });

  describe('start_timer', () => {
    it('errors when called by a non-facilitator', async () => {
      const room = createRoom('planning-poker', null);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice' });
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(other, room, { type: 'start_timer', seconds: 30 });
      assert.ok(other.messages.some(m => m.type === 'error'));
      assert.equal(room.timer.endsAt, null);
    });

    it('errors in non-planning-poker rooms', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'start_timer', seconds: 30 });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('errors when duration is out of range', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'start_timer', seconds: 4 });
      assert.ok(ws.messages.some(m => m.type === 'error'));
      ws.messages.length = 0;
      await handleMessage(ws, room, { type: 'start_timer', seconds: 301 });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('errors when seconds is not an integer', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'start_timer', seconds: 30.5 });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('facilitator can start a valid timer', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      const before = Date.now();
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'start_timer', seconds: 60 });
      assert.ok(!ws.messages.some(m => m.type === 'error'));
      assert.ok(room.timer.endsAt >= before + 60000);
      assert.equal(room.timer.durationSeconds, 60);
    });
  });

  describe('cancel_timer', () => {
    it('errors when called by a non-facilitator', async () => {
      const room = createRoom('planning-poker', null);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice' });
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(facilitator, room, { type: 'start_timer', seconds: 60 });
      const endsAt = room.timer.endsAt;
      await handleMessage(other, room, { type: 'cancel_timer' });
      assert.ok(other.messages.some(m => m.type === 'error'));
      assert.equal(room.timer.endsAt, endsAt);
    });

    it('facilitator can cancel an active timer', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'start_timer', seconds: 60 });
      await handleMessage(ws, room, { type: 'cancel_timer' });
      assert.equal(room.timer.endsAt, null);
      assert.equal(room.timer.durationSeconds, null);
    });
  });

  describe('reveal (timer cleared)', () => {
    it('clears the timer when reveal is called', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'start_timer', seconds: 60 });
      assert.ok(room.timer.endsAt !== null);
      await handleMessage(ws, room, { type: 'reveal' });
      assert.equal(room.timer.endsAt, null);
      assert.equal(room.revealed, true);
    });
  });

  describe('reset (timer cleared)', () => {
    it('clears the timer when reset is called', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'start_timer', seconds: 60 });
      await handleMessage(ws, room, { type: 'reveal' });
      await handleMessage(ws, room, { type: 'reset' });
      assert.equal(room.timer.endsAt, null);
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
