const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { WEBSOCKET_MESSAGE_ERRORS } = require('../../shared/errors.json');
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
      assert.equal(ws.messages[0].message, 'Name is required');
    });

    it('errors when name is blank', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: '   ' });
      assert.equal(ws.messages[0].type, 'error');
      assert.equal(ws.messages[0].message, 'Name is required');
    });

    it('trims whitespace from participant name', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: '  Alice  ' });
      assert.equal(room.participants[0].name, 'Alice');
    });

    it('sets initial participant vote to null', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      assert.equal(room.participants[0].vote, null);
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

    it('joining without admin PIN succeeds but does not grant facilitator role', async () => {
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      assert.equal(ws.messages.length, 0);
      assert.equal(room.facilitatorId, null);
      assert.equal(room.participants.length, 1);
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

    it('errors when access PIN required but not provided', async () => {
      const accessPinHash = await bcrypt.hash('guest', 10);
      const room = createRoom('planning-poker', null, null, accessPinHash);
      const ws = mockWs('p1');
      ws.isAuthorized = false;
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      assert.equal(ws.messages[0].type, 'error');
      assert.equal(ws.messages[0].message, 'Access PIN required');
      assert.equal(ws.isAuthorized, false);
    });

    it('errors on wrong access PIN', async () => {
      const accessPinHash = await bcrypt.hash('guest', 10);
      const room = createRoom('planning-poker', null, null, accessPinHash);
      const ws = mockWs('p1');
      ws.isAuthorized = false;
      await handleMessage(ws, room, { type: 'join', name: 'Alice', accessPin: 'wrong' });
      assert.equal(ws.messages[0].type, 'error');
      assert.equal(ws.messages[0].message, 'Invalid access PIN');
      assert.equal(ws.isAuthorized, false);
    });

    it('correct access PIN grants authorization', async () => {
      const accessPinHash = await bcrypt.hash('guest', 10);
      const room = createRoom('planning-poker', null, null, accessPinHash);
      const ws = mockWs('p1');
      ws.isAuthorized = false;
      await handleMessage(ws, room, { type: 'join', name: 'Alice', accessPin: 'guest' });
      assert.equal(ws.isAuthorized, true);
      assert.equal(ws.messages.length, 0);
    });

    it('handles both access PIN and facilitator PIN', async () => {
      const pinHash = await bcrypt.hash('admin', 10);
      const accessPinHash = await bcrypt.hash('guest', 10);
      const room = createRoom('planning-poker', pinHash, null, accessPinHash);
      const ws = mockWs('p1');
      ws.isAuthorized = false;
      await handleMessage(ws, room, { type: 'join', name: 'Alice', accessPin: 'guest', pin: 'admin' });
      assert.equal(ws.isAuthorized, true);
      assert.equal(room.facilitatorId, 'p1');
    });

    it('strips HTML tags from participant name', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: '<script>alert(1)</script>Alice' });
      assert.equal(room.participants[0].name, 'alert(1)Alice');
    });

    it('errors when name is only empty HTML tags', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: '<b></b>' });
      assert.equal(ws.messages[0].type, 'error');
      assert.equal(room.participants.length, 0);
    });

    it('errors when name exceeds 200 characters', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: 'a'.repeat(201) });
      assert.deepEqual(ws.messages[0], {
        type: 'error',
        code: WEBSOCKET_MESSAGE_ERRORS.NAME_TOO_LONG,
        message: 'Name must be 200 characters or fewer',
      });
      assert.equal(room.participants.length, 0);
    });

    it('deduplicates when the same participant joins again', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'vote', vote: '5' });
      await handleMessage(ws, room, { type: 'join', name: 'Alice Updated' });
      assert.equal(room.participants.length, 1);
      assert.equal(room.participants[0].id, 'p1');
      assert.equal(room.participants[0].name, 'Alice Updated');
      assert.equal(room.participants[0].vote, '5');
      assert.equal(room.facilitatorId, 'p1');
      assert.ok(!ws.messages.some(m => m.type === 'error'));
    });
  });

  describe('vote', () => {
    it('records votes from two participants in sequence without errors', async () => {
      const room = createRoom('planning-poker', null);
      const alice = mockWs('p1');
      const bob = mockWs('p2');
      await handleMessage(alice, room, { type: 'join', name: 'Alice' });
      await handleMessage(bob, room, { type: 'join', name: 'Bob' });
      await handleMessage(alice, room, { type: 'vote', vote: '5' });
      await handleMessage(bob, room, { type: 'vote', vote: '8' });
      assert.equal(room.participants.find(p => p.id === 'p1').vote, '5');
      assert.equal(room.participants.find(p => p.id === 'p2').vote, '8');
      assert.ok(!alice.messages.some(m => m.type === 'error'));
      assert.ok(!bob.messages.some(m => m.type === 'error'));
    });

    it('errors gracefully when voting before joining', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'vote', vote: '5' });
      assert.equal(ws.messages[0].type, 'error');
      assert.equal(ws.messages[0].message, 'Join before voting');
      assert.equal(room.participants.length, 0);
    });

    it('errors on invalid vote value', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('p1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'vote', vote: '99' });
      const err = ws.messages.find(m => m.type === 'error');
      assert.ok(err);
      assert.ok(err.message.includes('99'));
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
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('bucket', pinHash);
      await handleMessage(mockWs('f1'), room, { type: 'join', name: 'Alice', pin: 'secret' });
      const other = mockWs('p2');
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(other, room, { type: 'add_item', label: 'Story' });
      assert.ok(other.messages.some(m => m.type === 'error'));
      assert.equal(room.items.length, 0);
    });

    it('allows any participant to add an item when the room has no PIN', async () => {
      const room = createRoom('bucket', null);
      await handleMessage(mockWs('f1'), room, { type: 'join', name: 'Alice' });
      const other = mockWs('p2');
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(other, room, { type: 'add_item', label: 'Story' });
      assert.ok(!other.messages.some(m => m.type === 'error'));
      assert.equal(room.items.length, 1);
      assert.equal(room.items[0].label, 'Story');
    });

    it('errors when label exceeds 200 characters', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'x'.repeat(201) });
      assert.ok(ws.messages.some(m => m.type === 'error' && m.message === 'Item label must be 200 characters or fewer'));
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

    it('does not clear existing votes when adding an item during voting', async () => {
      const room = createRoom('planning-poker', null);
      const facilitator = mockWs('f1');
      const participant = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice' });
      await handleMessage(participant, room, { type: 'join', name: 'Bob' });
      await handleMessage(facilitator, room, { type: 'vote', vote: '5' });
      await handleMessage(participant, room, { type: 'vote', vote: '8' });
      await handleMessage(facilitator, room, { type: 'add_item', label: 'Story A' });
      assert.equal(room.items.length, 1);
      assert.equal(room.participants.find(p => p.id === 'f1').vote, '5');
      assert.equal(room.participants.find(p => p.id === 'p2').vote, '8');
      assert.ok(!facilitator.messages.some(m => m.type === 'error'));
      assert.ok(!participant.messages.some(m => m.type === 'error'));
    });

    it('trims whitespace from label', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: '  Story B  ' });
      assert.equal(room.items[0].label, 'Story B');
    });

    it('strips HTML tags from item label', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: '<b>Bold</b> story' });
      assert.equal(room.items[0].label, 'Bold story');
    });

    it('errors when label is only empty HTML tags', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: '<b></b>' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
      assert.equal(room.items.length, 0);
    });

    it('errors when item count is at the 200-item limit', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      for (let i = 0; i < 200; i++) {
        room.items.push({ id: `i${i}`, label: `Item ${i}`, position: null });
      }
      await handleMessage(ws, room, { type: 'add_item', label: 'One too many' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
      assert.equal(room.items.length, 200);
    });
  });

  describe('reveal', () => {
    it('errors when called by a non-facilitator', async () => {
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      await handleMessage(mockWs('f1'), room, { type: 'join', name: 'Alice', pin: 'secret' });
      const other = mockWs('p2');
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(other, room, { type: 'reveal' });
      assert.ok(other.messages.some(m => m.type === 'error'));
      assert.equal(room.revealed, false);
    });

    it('allows any participant to reveal when the room has no PIN', async () => {
      const room = createRoom('planning-poker', null);
      await handleMessage(mockWs('f1'), room, { type: 'join', name: 'Alice' });
      const other = mockWs('p2');
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(other, room, { type: 'reveal' });
      assert.ok(!other.messages.some(m => m.type === 'error'));
      assert.equal(room.revealed, true);
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
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice', pin: 'secret' });
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
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice', pin: 'secret' });
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(facilitator, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(other, room, { type: 'select_item', itemId: room.items[0].id });
      assert.ok(other.messages.some(m => m.type === 'error'));
      assert.equal(room.items[0].status, 'pending');
    });

    it('allows any participant to select items when the room has no PIN', async () => {
      const room = createRoom('planning-poker', null);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice' });
      await handleMessage(other, room, { type: 'join', name: 'Bob' });
      await handleMessage(other, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(other, room, { type: 'select_item', itemId: room.items[0].id });
      assert.ok(!other.messages.some(m => m.type === 'error'));
      assert.equal(room.items[0].status, 'active');
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
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice', pin: 'secret' });
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
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice', pin: 'secret' });
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
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice', pin: 'secret' });
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
      const pinHash = await bcrypt.hash('secret', 10);
      const room = createRoom('planning-poker', pinHash);
      const facilitator = mockWs('f1');
      const other = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice', pin: 'secret' });
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

  describe('move_item', () => {
    it('errors when itemId is missing', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      ws.messages.length = 0;
      await handleMessage(ws, room, { type: 'move_item', position: 'M' });
      assert.ok(ws.messages.some(m => m.type === 'error'));
      assert.equal(room.items[0].position, null);
    });

    it('errors when position is missing', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      ws.messages.length = 0;
      await handleMessage(ws, room, { type: 'move_item', itemId: room.items[0].id });
      assert.ok(ws.messages.some(m => m.type === 'error'));
    });

    it('any participant can move an item', async () => {
      const room = createRoom('bucket', null);
      const facilitator = mockWs('f1');
      const participant = mockWs('p2');
      await handleMessage(facilitator, room, { type: 'join', name: 'Alice' });
      await handleMessage(participant, room, { type: 'join', name: 'Bob' });
      await handleMessage(facilitator, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(participant, room, { type: 'move_item', itemId: room.items[0].id, position: 'L' });
      assert.ok(!participant.messages.some(m => m.type === 'error'));
      assert.equal(room.items[0].position, 'L');
    });

    it('facilitator can also move an item', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'move_item', itemId: room.items[0].id, position: 'XS' });
      assert.equal(room.items[0].position, 'XS');
    });

    it('position can be null (move back to unsized)', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'move_item', itemId: room.items[0].id, position: 'M' });
      await handleMessage(ws, room, { type: 'move_item', itemId: room.items[0].id, position: null });
      assert.equal(room.items[0].position, null);
    });

    it('works with relative estimation column values', async () => {
      const room = createRoom('relative', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'move_item', itemId: room.items[0].id, position: '13' });
      assert.equal(room.items[0].position, '13');
    });

    it('rejects invalid bucket positions', async () => {
      const room = createRoom('bucket', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'move_item', itemId: room.items[0].id, position: 'XXL' });
      assert.deepEqual(ws.messages[0], {
        type: 'error',
        code: WEBSOCKET_MESSAGE_ERRORS.ITEM_POSITION_INVALID,
        message: 'Invalid position for bucket room: XXL',
      });
      assert.equal(room.items[0].position, null);
    });

    it('rejects invalid relative positions', async () => {
      const room = createRoom('relative', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'move_item', itemId: room.items[0].id, position: '34' });
      assert.deepEqual(ws.messages[0], {
        type: 'error',
        code: WEBSOCKET_MESSAGE_ERRORS.ITEM_POSITION_INVALID,
        message: 'Invalid position for relative room: 34',
      });
      assert.equal(room.items[0].position, null);
    });

    it('rejects moving items in Planning Poker rooms', async () => {
      const room = createRoom('planning-poker', null);
      const ws = mockWs('f1');
      await handleMessage(ws, room, { type: 'join', name: 'Alice' });
      await handleMessage(ws, room, { type: 'add_item', label: 'Story A' });
      await handleMessage(ws, room, { type: 'move_item', itemId: room.items[0].id, position: 'M' });
      assert.deepEqual(ws.messages[0], {
        type: 'error',
        code: WEBSOCKET_MESSAGE_ERRORS.ITEM_POSITION_ROOM_TYPE_INVALID,
        message: 'Items cannot be moved in Planning Poker rooms',
      });
      assert.equal(room.items[0].position, undefined);
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
