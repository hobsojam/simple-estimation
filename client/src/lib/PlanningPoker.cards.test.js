import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import PlanningPoker from './PlanningPoker.svelte';
import { roomState, send } from '../ws.js';

vi.mock('../ws.js', async () => {
  const { writable, readable } = await import('svelte/store');
  return {
    roomState: writable(null),
    wsError: writable(null),
    myId: readable('user-1'),
    send: vi.fn(),
  };
});

const baseState = {
  id: 'room-1',
  type: 'planning-poker',
  facilitatorId: 'user-1',
  revealed: false,
  participants: [{ id: 'user-1', name: 'Alice', voted: false, vote: null }],
  items: [],
};

describe('voting card buttons', () => {
  beforeEach(() => {
    roomState.set(null);
    send.mockClear();
  });

  it('cards are enabled when revealed is false and there are no items', () => {
    roomState.set({ ...baseState, items: [] });
    const { container } = render(PlanningPoker);
    const cards = container.querySelectorAll('button.card');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card).toBeEnabled();
    }
  });

  it('cards are enabled when revealed is false and items exist but none is active', () => {
    roomState.set({
      ...baseState,
      items: [
        { id: 'i1', label: 'Story A', status: 'pending', estimate: null },
        { id: 'i2', label: 'Story B', status: 'pending', estimate: null },
      ],
    });
    const { container } = render(PlanningPoker);
    const cards = container.querySelectorAll('button.card');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card).toBeEnabled();
    }
  });

  it('cards are enabled when revealed is false and there is an active item', () => {
    roomState.set({
      ...baseState,
      items: [
        { id: 'i1', label: 'Story A', status: 'active', estimate: null },
      ],
    });
    const { container } = render(PlanningPoker);
    const cards = container.querySelectorAll('button.card');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card).toBeEnabled();
    }
  });

  it('cards are disabled when revealed is true', () => {
    roomState.set({
      ...baseState,
      revealed: true,
      participants: [{ id: 'user-1', name: 'Alice', voted: true, vote: '5' }],
    });
    const { container } = render(PlanningPoker);
    const cards = container.querySelectorAll('button.card');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card).toBeDisabled();
    }
  });
});
