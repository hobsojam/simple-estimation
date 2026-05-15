import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { writable, readable } from 'svelte/store';
import PlanningPoker from './PlanningPoker.svelte';

const mockSend = vi.fn();
const mockRoomState = writable(null);
const mockWsError = writable(null);

vi.mock('../ws.js', () => ({
  roomState: mockRoomState,
  wsError: mockWsError,
  myId: readable('user-1'),
  send: mockSend,
}));

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
    mockRoomState.set(null);
    mockSend.mockClear();
  });

  it('cards are enabled when revealed is false and there are no items', () => {
    mockRoomState.set({ ...baseState, items: [] });
    const { container } = render(PlanningPoker);
    const cards = container.querySelectorAll('button.card');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card).toBeEnabled();
    }
  });

  it('cards are enabled when revealed is false and items exist but none is active', () => {
    mockRoomState.set({
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
    mockRoomState.set({
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
    mockRoomState.set({
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
