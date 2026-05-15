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
    assert.equal(result.facilitatorId, 'p1');
    assert.equal(result.revealed, false);
  });

  it('includes name when null', () => {
    const result = sanitizeRoom({ ...baseRoom, name: null });
    assert.equal(result.name, null);
  });

  it('includes items unchanged', () => {
    const result = sanitizeRoom(baseRoom);
    assert.deepEqual(result.items, baseRoom.items);
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
});
