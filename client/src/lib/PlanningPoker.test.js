import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
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
  pinProtected: true,
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

const revealedWithActiveItem = {
  id: 'room-1',
  type: 'planning-poker',
  facilitatorId: 'user-1',
  pinProtected: true,
  revealed: true,
  participants: [{ id: 'user-1', name: 'Alice', voted: true, vote: '5' }],
  items: [{ id: 'i1', label: 'Story A', status: 'active', estimate: null }],
};

describe('finalise section', () => {
  beforeEach(() => {
    roomState.set(null);
    send.mockClear();
  });

  it('is not shown when round is not yet revealed (even with active item and facilitator)', () => {
    roomState.set({ ...revealedWithActiveItem, revealed: false });
    const { container } = render(PlanningPoker);
    expect(container.querySelector('.finalise-section')).toBeNull();
  });

  it('is not shown when revealed but no item is active', () => {
    roomState.set({
      ...revealedWithActiveItem,
      items: [{ id: 'i1', label: 'Story A', status: 'pending', estimate: null }],
    });
    const { container } = render(PlanningPoker);
    expect(container.querySelector('.finalise-section')).toBeNull();
  });

  it('is not shown when revealed and active item exists but current user is not the facilitator', () => {
    roomState.set({ ...revealedWithActiveItem, facilitatorId: 'someone-else' });
    const { container } = render(PlanningPoker);
    expect(container.querySelector('.finalise-section')).toBeNull();
  });

  it('is shown to a non-facilitator when the room has no facilitator PIN', () => {
    roomState.set({ ...revealedWithActiveItem, facilitatorId: 'someone-else', pinProtected: false });
    const { container } = render(PlanningPoker);
    expect(container.querySelector('.finalise-section')).not.toBeNull();
  });

  it('is shown when revealed, active item exists, and current user is the facilitator', () => {
    roomState.set(revealedWithActiveItem);
    const { container } = render(PlanningPoker);
    const section = container.querySelector('.finalise-section');
    expect(section).not.toBeNull();
    expect(section.textContent).toContain('Story A');
  });

  it('Finalise button is enabled when majority vote auto-fills the estimate', () => {
    roomState.set(revealedWithActiveItem);
    const { getByRole } = render(PlanningPoker);
    expect(getByRole('button', { name: 'Finalise' })).toBeEnabled();
  });
});

describe('PlanningPoker — outbound messages', () => {
  beforeEach(() => {
    roomState.set(null);
    send.mockClear();
  });

  it('clicking a card sends a vote message', async () => {
    roomState.set({
      ...baseState,
      participants: [{ id: 'user-1', name: 'Alice', voted: false, vote: null }],
    });
    const { container } = render(PlanningPoker);
    const card = [...container.querySelectorAll('button.card')].find(b => b.textContent.trim() === '5');
    await fireEvent.click(card);
    expect(send).toHaveBeenCalledWith({ type: 'vote', vote: '5' });
  });

  it('clicking Reveal Votes sends a reveal message', async () => {
    roomState.set({
      ...baseState,
      participants: [{ id: 'user-1', name: 'Alice', voted: true, vote: null }],
    });
    const { getByRole } = render(PlanningPoker);
    await fireEvent.click(getByRole('button', { name: 'Reveal Votes' }));
    expect(send).toHaveBeenCalledWith({ type: 'reveal' });
  });

  it('clicking Reset sends a reset message', async () => {
    roomState.set({
      ...baseState,
      revealed: true,
      participants: [{ id: 'user-1', name: 'Alice', voted: true, vote: '5' }],
    });
    const { getByRole } = render(PlanningPoker);
    await fireEvent.click(getByRole('button', { name: 'Reset Round' }));
    expect(send).toHaveBeenCalledWith({ type: 'reset' });
  });
});
