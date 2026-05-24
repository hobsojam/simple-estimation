const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { shortText, longText } = require('../validate');

describe('shortText', () => {
  it('returns null for undefined', () => {
    assert.equal(shortText(undefined), null);
  });

  it('returns null for null', () => {
    assert.equal(shortText(null), null);
  });

  it('returns null for empty string', () => {
    assert.equal(shortText(''), null);
  });

  it('returns null for whitespace-only string', () => {
    assert.equal(shortText('   '), null);
  });

  it('trims whitespace', () => {
    assert.equal(shortText('  Alice  '), 'Alice');
  });

  it('strips HTML tags', () => {
    assert.equal(shortText('<script>alert(1)</script>Alice'), 'Alice');
  });

  it('strips tags leaving only text content', () => {
    assert.equal(shortText('<b>Bold</b> name'), 'Bold name');
  });

  it('returns null when only tags remain after stripping', () => {
    assert.equal(shortText('<script>alert(1)</script>'), null);
  });

  it('returns null when input exceeds maxLen', () => {
    assert.equal(shortText('a'.repeat(201)), null);
  });

  it('accepts a string exactly at maxLen', () => {
    const s = 'a'.repeat(200);
    assert.equal(shortText(s), s);
  });

  it('accepts a custom maxLen', () => {
    assert.equal(shortText('hello', 3), null);
    assert.equal(shortText('hi', 3), 'hi');
  });

  it('coerces non-string values', () => {
    assert.equal(shortText(42), '42');
  });
});

describe('longText', () => {
  it('returns null for undefined', () => {
    assert.equal(longText(undefined), null);
  });

  it('strips HTML tags', () => {
    assert.equal(longText('<p>Hello</p>'), 'Hello');
  });

  it('returns null when input exceeds 2000 chars', () => {
    assert.equal(longText('a'.repeat(2001)), null);
  });

  it('accepts a string exactly at 2000 chars', () => {
    const s = 'a'.repeat(2000);
    assert.equal(longText(s), s);
  });
});
