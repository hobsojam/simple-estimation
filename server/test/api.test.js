const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../index');

describe('POST /api/rooms', () => {
  it('returns 200 with an id for a valid type', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ type: 'planning-poker' });
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.id === 'string' && res.body.id.length > 0);
  });

  it('accepts all three valid room types', async () => {
    for (const type of ['planning-poker', 'bucket', 'relative']) {
      const res = await request(app)
        .post('/api/rooms')
        .send({ type });
      assert.equal(res.status, 200, `type "${type}" should be accepted`);
      assert.ok(res.body.id);
    }
  });

  it('returns 400 for an invalid type', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ type: 'freeform' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 when type is missing', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({});
    assert.equal(res.status, 400);
  });

  it('does not echo the pins back in the response', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ type: 'planning-poker', pin: 'hunter2', accessPin: 'guest' });
    assert.equal(res.status, 200);
    assert.ok(!('pin' in res.body));
    assert.ok(!('pinHash' in res.body));
    assert.ok(!('accessPin' in res.body));
    assert.ok(!('accessPinHash' in res.body));
  });

  it('accepts an optional name', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ type: 'planning-poker', name: 'Sprint 42' });
    assert.equal(res.status, 200);
    assert.ok(res.body.id);
  });

  it('trims and truncates name to 200 chars', async () => {
    const longName = 'a'.repeat(250);
    const res = await request(app)
      .post('/api/rooms')
      .send({ type: 'planning-poker', name: '  ' + longName + '  ' });
    assert.equal(res.status, 200);
  });
});

describe('GET /api/rooms', () => {
  it('includes name and pin protections in room listing', async () => {
    await request(app).post('/api/rooms').send({
      type: 'planning-poker',
      name: 'Protected Room',
      pin: 'admin',
      accessPin: 'guest'
    });
    const res = await request(app).get('/api/rooms');
    assert.equal(res.status, 200);
    const room = res.body.find(r => r.name === 'Protected Room');
    assert.ok(room, 'room with name "Protected Room" should appear in listing');
    assert.equal(room.pinProtected, true);
    assert.equal(room.accessPinProtected, true);
  });

  it('includes name as null for rooms created without a name', async () => {
    await request(app).post('/api/rooms').send({ type: 'bucket' });
    const res = await request(app).get('/api/rooms');
    assert.equal(res.status, 200);
    const unnamed = res.body.find(r => r.name === null);
    assert.ok(unnamed, 'at least one unnamed room should appear in listing');
  });
});
