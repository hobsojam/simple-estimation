const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeRoom } = require('../sanitize');

const baseRoom = {
  id: 'room-1',
  type: 'planning-poker',
  name: 'Sprint 42',
  facilitatorId: 'p1',
  pinHash: '$2b$10$somehashvalue',
  revealed: false,
  participants: [
    { id: 'p1', name: 'Alice', vote: '5' },
    { id: 'p2', name: 'Bob', vote: '8' },
  ],
  items: [{ id: 'i1', label: 'Story A', position: null }],
};

describe('sanitizeRoom', () => {
  it('never includes pinHash', () => {
    const result = sanitizeRoom(baseRoom);
    assert.ok(!('pinHash' in result));
  });

  it('hides all votes when not revealed', () => {
    const result = sanitizeRoom({ ...baseRoom, revealed: false });
    for (const p of result.participants) {
      assert.equal(p.vote, null, `vote for ${p.name} should be null`);
    }
  });

  it('exposes votes when revealed', () => {
    const result = sanitizeRoom({ ...baseRoom, revealed: true });
    assert.equal(result.participants[0].vote, '5');
    assert.equal(result.participants[1].vote, '8');
  });

  it('preserves all expected top-level fields', () => {
    const result = sanitizeRoom(baseRoom);
    assert.equal(result.id, 'room-1');
    assert.equal(result.type, 'planning-poker');
    assert.equal(result.name, 'Sprint 42');
    assert.equal(result.pinProtected, true);
    assert.equal(result.facilitatorId, 'p1');
    assert.equal(result.revealed, false);
  });

  it('includes name when null', () => {
    const result = sanitizeRoom({ ...baseRoom, name: null });
    assert.equal(result.name, null);
  });

  it('sets pinProtected false when the room has no facilitator PIN', () => {
    const result = sanitizeRoom({ ...baseRoom, pinHash: null });
    assert.equal(result.pinProtected, false);
  });

  it('includes item values unchanged', () => {
    const result = sanitizeRoom(baseRoom);
    assert.deepEqual(result.items, baseRoom.items);
  });

  it('clones items to avoid exposing live room state references', () => {
    const result = sanitizeRoom(baseRoom);
    assert.notEqual(result.items, baseRoom.items);
    assert.notEqual(result.items[0], baseRoom.items[0]);
  });

  it('preserves participant id and name', () => {
    const result = sanitizeRoom(baseRoom);
    assert.equal(result.participants[0].id, 'p1');
    assert.equal(result.participants[0].name, 'Alice');
  });

  it('passes through planning-poker item shape unchanged', () => {
    const planningPokerItems = [
      { id: 'i1', label: 'Story A', status: 'done', estimate: '5' },
      { id: 'i2', label: 'Story B', status: 'active', estimate: null },
      { id: 'i3', label: 'Story C', status: 'pending', estimate: null },
    ];
    const result = sanitizeRoom({ ...baseRoom, items: planningPokerItems });
    assert.deepEqual(result.items, planningPokerItems);
  });

  it('sets voted=true when a participant has voted', () => {
    const result = sanitizeRoom({ ...baseRoom, revealed: false });
    assert.equal(result.participants[0].voted, true);
    assert.equal(result.participants[1].voted, true);
  });

  it('sets voted=false when a participant has not voted', () => {
    const room = { ...baseRoom, participants: [{ id: 'p1', name: 'Alice', vote: null }] };
    const result = sanitizeRoom(room);
    assert.equal(result.participants[0].voted, false);
  });

  it('includes timer state when room has a timer', () => {
    const timer = { endsAt: 9_999_999, durationSeconds: 60 };
    const before = Date.now();
    const result = sanitizeRoom({ ...baseRoom, timer });
    const after = Date.now();
    assert.equal(result.timer.endsAt, timer.endsAt);
    assert.equal(result.timer.durationSeconds, timer.durationSeconds);
    assert.ok(result.timer.serverNow >= before);
    assert.ok(result.timer.serverNow <= after);
  });

  it('uses null defaults for timer when room.timer is undefined', () => {
    const { timer: _timer, ...roomWithoutTimer } = baseRoom;
    const before = Date.now();
    const result = sanitizeRoom(roomWithoutTimer);
    const after = Date.now();
    assert.equal(result.timer.endsAt, null);
    assert.equal(result.timer.durationSeconds, null);
    assert.ok(result.timer.serverNow >= before);
    assert.ok(result.timer.serverNow <= after);
  });

  it('passes through bucket/relative item shape (position field) unchanged', () => {
    const bucketItems = [
      { id: 'i1', label: 'Story A', position: null },
      { id: 'i2', label: 'Story B', position: 'M' },
    ];
    const result = sanitizeRoom({ ...baseRoom, type: 'bucket', items: bucketItems });
    assert.deepEqual(result.items, bucketItems);
  });

  it('returns safe stub when not authorized', () => {
    const result = sanitizeRoom(baseRoom, false);
    assert.equal(result.id, baseRoom.id);
    assert.equal(result.type, baseRoom.type);
    assert.equal(result.name, baseRoom.name);
    assert.equal(result.accessRequired, true);
    assert.equal(result.pinProtected, true);
    assert.equal(result.facilitatorId, null);
    assert.equal(result.revealed, false);
    assert.deepEqual(result.participants, []);
    assert.deepEqual(result.items, []);
    assert.ok(!('pinHash' in result));
  });
});
