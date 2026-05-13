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

  it('does not echo the pin back in the response', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ type: 'planning-poker', pin: 'hunter2' });
    assert.equal(res.status, 200);
    assert.ok(!('pin' in res.body));
    assert.ok(!('pinHash' in res.body));
  });
});
