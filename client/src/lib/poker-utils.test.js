import { describe, it, expect } from 'vitest';
import { getMajorityVote, buildCSV } from './poker-utils.js';

describe('getMajorityVote', () => {
  it('returns null when participant list is empty', () => {
    expect(getMajorityVote([])).toBeNull();
  });

  it('returns null when no participants have voted', () => {
    const participants = [
      { id: '1', name: 'Alice', vote: null },
      { id: '2', name: 'Bob', vote: null },
    ];
    expect(getMajorityVote(participants)).toBeNull();
  });

  it('returns the vote when only one participant has voted', () => {
    const participants = [
      { id: '1', name: 'Alice', vote: '5' },
      { id: '2', name: 'Bob', vote: null },
    ];
    expect(getMajorityVote(participants)).toBe('5');
  });

  it('returns the most common vote when there is a clear majority', () => {
    const participants = [
      { id: '1', name: 'Alice', vote: '3' },
      { id: '2', name: 'Bob', vote: '5' },
      { id: '3', name: 'Carol', vote: '5' },
      { id: '4', name: 'Dan', vote: '5' },
    ];
    expect(getMajorityVote(participants)).toBe('5');
  });

  it('returns one of the tied votes when there is a tie', () => {
    const participants = [
      { id: '1', name: 'Alice', vote: '3' },
      { id: '2', name: 'Bob', vote: '8' },
    ];
    const result = getMajorityVote(participants);
    expect(['3', '8']).toContain(result);
  });
});

describe('buildCSV', () => {
  it('returns only the header row when doneItems is empty', () => {
    expect(buildCSV([])).toBe('Item,Estimate');
  });

  it('includes a header row followed by item rows', () => {
    const items = [
      { label: 'Login page', estimate: '5' },
      { label: 'Dashboard', estimate: '8' },
    ];
    const csv = buildCSV(items);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Item,Estimate');
    expect(lines[1]).toBe('"Login page",5');
    expect(lines[2]).toBe('"Dashboard",8');
  });

  it('escapes double quotes in item labels', () => {
    const items = [{ label: 'User "admin" flow', estimate: '3' }];
    const csv = buildCSV(items);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"User ""admin"" flow",3');
  });

  it('produces a single item row for a one-item list', () => {
    const items = [{ label: 'Sign up', estimate: '2' }];
    const csv = buildCSV(items);
    expect(csv).toBe('Item,Estimate\n"Sign up",2');
  });
});
