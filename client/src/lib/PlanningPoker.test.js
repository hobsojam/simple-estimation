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
  participants: [
    { id: 'user-1', name: 'Alice', voted: false, vote: null },
  ],
  items: [],
};

describe('Reveal Votes button', () => {
  beforeEach(() => {
    mockRoomState.set(null);
    mockWsError.set(null);
    mockSend.mockClear();
  });

  it('is disabled when no participant has voted', () => {
    mockRoomState.set({
      ...baseState,
      participants: [
        { id: 'user-1', name: 'Alice', voted: false, vote: null },
        { id: 'user-2', name: 'Bob', voted: false, vote: null },
      ],
    });
    const { getByRole } = render(PlanningPoker);
    expect(getByRole('button', { name: 'Reveal Votes' })).toBeDisabled();
  });

  it('is enabled when at least one participant has voted', () => {
    mockRoomState.set({
      ...baseState,
      participants: [
        { id: 'user-1', name: 'Alice', voted: true, vote: null },
        { id: 'user-2', name: 'Bob', voted: false, vote: null },
      ],
    });
    const { getByRole } = render(PlanningPoker);
    expect(getByRole('button', { name: 'Reveal Votes' })).toBeEnabled();
  });

  it('is disabled when votes are already revealed', () => {
    mockRoomState.set({
      ...baseState,
      revealed: true,
      participants: [
        { id: 'user-1', name: 'Alice', voted: true, vote: '5' },
      ],
    });
    const { getByRole } = render(PlanningPoker);
    expect(getByRole('button', { name: 'Reveal Votes' })).toBeDisabled();
  });

  it('is enabled when multiple participants have voted', () => {
    mockRoomState.set({
      ...baseState,
      participants: [
        { id: 'user-1', name: 'Alice', voted: true, vote: null },
        { id: 'user-2', name: 'Bob', voted: true, vote: null },
        { id: 'user-3', name: 'Carol', voted: true, vote: null },
      ],
    });
    const { getByRole } = render(PlanningPoker);
    expect(getByRole('button', { name: 'Reveal Votes' })).toBeEnabled();
  });
});
