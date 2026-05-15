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
  participants: [
    { id: 'user-1', name: 'Alice', voted: false, vote: null },
  ],
  items: [],
};

describe('Reveal Votes button', () => {
  beforeEach(() => {
    roomState.set(null);
    send.mockClear();
  });

  it('is disabled when no participant has voted', () => {
    roomState.set({
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
    roomState.set({
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
    roomState.set({
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
    roomState.set({
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
