const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  createRoom, getRoom, upsertParticipant, removeParticipant, setFacilitator,
  castVote, revealVotes, resetRound, addItem, moveItem,
  selectItem, finaliseItem, removeItem, startTimer, clearTimer, clearRooms,
} = require('../rooms');

describe('rooms', () => {
  beforeEach(() => clearRooms());

  function expectUpdatesActivity(room, action) {
    room.lastActivityAt = 1;
    action();
    assert.ok(room.lastActivityAt > 1);
  }

  describe('createRoom', () => {
    it('returns the correct shape', () => {
      const room = createRoom('planning-poker', null);
      assert.equal(room.type, 'planning-poker');
      assert.equal(room.name, null);
      assert.equal(room.facilitatorId, null);
      assert.equal(room.pinHash, null);
      assert.deepEqual(room.participants, []);
      assert.deepEqual(room.items, []);
      assert.equal(room.revealed, false);
      assert.ok(room.id);
    });

    it('sets lastActivityAt on creation', () => {
      const before = Date.now();
      const room = createRoom('planning-poker', null);
      const after = Date.now();
      assert.ok(room.lastActivityAt >= before && room.lastActivityAt <= after);
    });

    it('stores pinHash when provided', () => {
      const room = createRoom('bucket', 'hash');
      assert.equal(room.pinHash, 'hash');
    });

    it('stores name when provided', () => {
      const room = createRoom('planning-poker', null, 'Sprint 42');
      assert.equal(room.name, 'Sprint 42');
    });

    it('sets name to null when not provided', () => {
      const room = createRoom('planning-poker', null);
      assert.equal(room.name, null);
    });
  });

  describe('getRoom', () => {
    it('returns the created room by id', () => {
      const room = createRoom('planning-poker', null);
      assert.equal(getRoom(room.id), room);
    });

    it('returns undefined for unknown id', () => {
      assert.equal(getRoom('nope'), undefined);
    });

    it('returns undefined for null id', () => {
      assert.equal(getRoom(null), undefined);
    });

    it('returns undefined for undefined id', () => {
      assert.equal(getRoom(undefined), undefined);
    });
  });

  describe('lastActivityAt', () => {
    it('is updated by castVote', () => {
      const room = createRoom('planning-poker', null);
      upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
      expectUpdatesActivity(room, () => castVote(room.id, 'p1', '5'));
    });

    it('is updated by moveItem', () => {
      const room = createRoom('bucket', null);
      addItem(room.id, { id: 'i1', label: 'A', position: null });
      expectUpdatesActivity(room, () => moveItem(room.id, 'i1', 'M'));
    });

    it('is updated by addItem', () => {
      const room = createRoom('bucket', null);
      expectUpdatesActivity(room, () => addItem(room.id, { id: 'i1', label: 'A', position: null }));
    });

    it('is updated by revealVotes', () => {
      const room = createRoom('planning-poker', null);
      expectUpdatesActivity(room, () => revealVotes(room.id));
    });

    it('is updated by resetRound', () => {
      const room = createRoom('planning-poker', null);
      expectUpdatesActivity(room, () => resetRound(room.id));
    });

    it('is updated by selectItem', () => {
      const room = createRoom('planning-poker', null);
      addItem(room.id, { id: 'i1', label: 'Story A', status: 'pending', estimate: null });
      expectUpdatesActivity(room, () => selectItem(room.id, 'i1'));
    });

    it('is updated by finaliseItem', () => {
      const room = createRoom('planning-poker', null);
      addItem(room.id, { id: 'i1', label: 'Story A', status: 'active', estimate: null });
      expectUpdatesActivity(room, () => finaliseItem(room.id, 'i1', '8'));
    });

    it('is updated by removeItem', () => {
      const room = createRoom('planning-poker', null);
      addItem(room.id, { id: 'i1', label: 'Story A', status: 'pending', estimate: null });
      expectUpdatesActivity(room, () => removeItem(room.id, 'i1'));
    });

    it('is updated by setFacilitator', () => {
      const room = createRoom('planning-poker', null);
      expectUpdatesActivity(room, () => setFacilitator(room.id, 'p1'));
    });

    it('is updated by upsertParticipant when adding a participant', () => {
      const room = createRoom('planning-poker', null);
      expectUpdatesActivity(room, () => upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null }));
    });

    it('is updated by upsertParticipant when renaming a participant', () => {
      const room = createRoom('planning-poker', null);
      upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
      expectUpdatesActivity(room, () => upsertParticipant(room.id, { id: 'p1', name: 'Alice Updated', vote: null }));
    });

    it('is updated by startTimer', () => {
      const room = createRoom('planning-poker', null);
      expectUpdatesActivity(room, () => startTimer(room.id, 60));
    });

    it('is updated by clearTimer', () => {
      const room = createRoom('planning-poker', null);
      startTimer(room.id, 60);
      expectUpdatesActivity(room, () => clearTimer(room.id));
    });

    it('is NOT updated by removeParticipant', () => {
      const room = createRoom('planning-poker', null);
      upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
      const snapshot = room.lastActivityAt;
      removeParticipant(room.id, 'p1');
      assert.equal(room.lastActivityAt, snapshot);
    });
  });

  describe('upsertParticipant / removeParticipant', () => {
    it('removes the correct participant', () => {
      const room = createRoom('planning-poker', null);
      upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
      upsertParticipant(room.id, { id: 'p2', name: 'Bob', vote: null });
      removeParticipant(room.id, 'p1');
      assert.equal(room.participants.length, 1);
      assert.equal(room.participants[0].id, 'p2');
    });

    it('auto-assigns facilitator when facilitator leaves a non-PIN room', () => {
      const room = createRoom('planning-poker', null);
      upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
      upsertParticipant(room.id, { id: 'p2', name: 'Bob', vote: null });
      setFacilitator(room.id, 'p1');
      removeParticipant(room.id, 'p1');
      assert.equal(room.facilitatorId, 'p2');
    });

    it('clears facilitator without reassigning when facilitator leaves a PIN-protected room', () => {
      const room = createRoom('planning-poker', 'hashed-pin');
      upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
      upsertParticipant(room.id, { id: 'p2', name: 'Bob', vote: null });
      setFacilitator(room.id, 'p1');
      removeParticipant(room.id, 'p1');
      assert.equal(room.facilitatorId, null);
    });

    it('sets facilitatorId to null when last participant leaves', () => {
      const room = createRoom('planning-poker', null);
      upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
      setFacilitator(room.id, 'p1');
      removeParticipant(room.id, 'p1');
      assert.equal(room.facilitatorId, null);
    });

    it('removeParticipant on a non-existent room is a no-op', () => {
      assert.doesNotThrow(() => removeParticipant('no-such-room', 'p1'));
    });

    it('removeParticipant with an unknown participant id is a no-op', () => {
      const room = createRoom('planning-poker', null);
      assert.doesNotThrow(() => removeParticipant(room.id, 'no-such-participant'));
      assert.equal(room.participants.length, 0);
    });

    it('does not change facilitator when a non-facilitator leaves', () => {
      const room = createRoom('planning-poker', null);
      upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
      upsertParticipant(room.id, { id: 'p2', name: 'Bob', vote: null });
      setFacilitator(room.id, 'p1');
      removeParticipant(room.id, 'p2');
      assert.equal(room.facilitatorId, 'p1');
    });
  });

  describe('castVote / revealVotes / resetRound', () => {
    it('castVote stores the vote', () => {
      const room = createRoom('planning-poker', null);
      upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: null });
      castVote(room.id, 'p1', '5');
      assert.equal(room.participants[0].vote, '5');
    });

    it('revealVotes sets revealed to true', () => {
      const room = createRoom('planning-poker', null);
      revealVotes(room.id);
      assert.equal(room.revealed, true);
    });

    it('resetRound clears votes and sets revealed to false', () => {
      const room = createRoom('planning-poker', null);
      upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: '8' });
      revealVotes(room.id);
      resetRound(room.id);
      assert.equal(room.revealed, false);
      assert.equal(room.participants[0].vote, null);
    });
  });

  describe('addItem / moveItem', () => {
    it('addItem appends to items', () => {
      const room = createRoom('bucket', null);
      addItem(room.id, { id: 'i1', label: 'Story A', position: null });
      assert.equal(room.items.length, 1);
      assert.equal(room.items[0].label, 'Story A');
    });

    it('moveItem updates position', () => {
      const room = createRoom('bucket', null);
      addItem(room.id, { id: 'i1', label: 'Story A', position: null });
      moveItem(room.id, 'i1', 'M');
      assert.equal(room.items[0].position, 'M');
    });

    it('moveItem accepts null position (unsized)', () => {
      const room = createRoom('bucket', null);
      addItem(room.id, { id: 'i1', label: 'Story A', position: 'M' });
      moveItem(room.id, 'i1', null);
      assert.equal(room.items[0].position, null);
    });
  });

  describe('selectItem', () => {
    it('sets the target item to active', () => {
      const room = createRoom('planning-poker', null);
      addItem(room.id, { id: 'i1', label: 'Story A', status: 'pending', estimate: null });
      selectItem(room.id, 'i1');
      assert.equal(room.items[0].status, 'active');
    });

    it('demotes the previous active item to pending', () => {
      const room = createRoom('planning-poker', null);
      addItem(room.id, { id: 'i1', label: 'Story A', status: 'pending', estimate: null });
      addItem(room.id, { id: 'i2', label: 'Story B', status: 'pending', estimate: null });
      selectItem(room.id, 'i1');
      selectItem(room.id, 'i2');
      assert.equal(room.items[0].status, 'pending');
      assert.equal(room.items[1].status, 'active');
    });

    it('keeps done items as done', () => {
      const room = createRoom('planning-poker', null);
      addItem(room.id, { id: 'i1', label: 'Done Story', status: 'done', estimate: '5' });
      addItem(room.id, { id: 'i2', label: 'Story B', status: 'pending', estimate: null });
      selectItem(room.id, 'i2');
      assert.equal(room.items[0].status, 'done');
    });

    it('resets all participant votes', () => {
      const room = createRoom('planning-poker', null);
      upsertParticipant(room.id, { id: 'p1', name: 'Alice', vote: '5' });
      upsertParticipant(room.id, { id: 'p2', name: 'Bob', vote: '8' });
      addItem(room.id, { id: 'i1', label: 'Story A', status: 'pending', estimate: null });
      selectItem(room.id, 'i1');
      assert.equal(room.participants[0].vote, null);
      assert.equal(room.participants[1].vote, null);
    });

    it('sets revealed to false', () => {
      const room = createRoom('planning-poker', null);
      room.revealed = true;
      addItem(room.id, { id: 'i1', label: 'Story A', status: 'pending', estimate: null });
      selectItem(room.id, 'i1');
      assert.equal(room.revealed, false);
    });
  });

  describe('finaliseItem', () => {
    it('sets item status to done and stores estimate', () => {
      const room = createRoom('planning-poker', null);
      addItem(room.id, { id: 'i1', label: 'Story A', status: 'active', estimate: null });
      finaliseItem(room.id, 'i1', '8');
      assert.equal(room.items[0].status, 'done');
      assert.equal(room.items[0].estimate, '8');
    });

    it('does nothing for an unknown item id', () => {
      const room = createRoom('planning-poker', null);
      finaliseItem(room.id, 'no-such-id', '5');
      assert.equal(room.items.length, 0);
    });
  });

  describe('removeItem', () => {
    it('removes the item with the given id', () => {
      const room = createRoom('planning-poker', null);
      addItem(room.id, { id: 'i1', label: 'Story A', status: 'pending', estimate: null });
      addItem(room.id, { id: 'i2', label: 'Story B', status: 'pending', estimate: null });
      removeItem(room.id, 'i1');
      assert.equal(room.items.length, 1);
      assert.equal(room.items[0].id, 'i2');
    });

    it('does nothing for an unknown item id', () => {
      const room = createRoom('planning-poker', null);
      addItem(room.id, { id: 'i1', label: 'Story A', status: 'pending', estimate: null });
      removeItem(room.id, 'no-such-id');
      assert.equal(room.items.length, 1);
    });
  });
});
