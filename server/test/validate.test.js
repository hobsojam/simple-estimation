const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { shortText } = require('../validate');

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
    assert.equal(shortText('<script>alert(1)</script>Alice'), 'alert(1)Alice');
  });

  it('strips tags leaving only text content', () => {
    assert.equal(shortText('<b>Bold</b> name'), 'Bold name');
  });

  it('returns null when only empty tags remain after stripping', () => {
    assert.equal(shortText('<b></b>'), null);
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

  it('handles closing tag with whitespace (e.g. </script >)', () => {
    assert.equal(shortText('<script>x</script >Alice'), 'xAlice');
  });

  it('output never contains < regardless of input structure', () => {
    const result = shortText('<<script>script>alert(1)</script>/script>');
    assert.ok(result === null || !result.includes('<'));
  });
});
