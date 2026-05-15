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

const revealedWithActiveItem = {
  id: 'room-1',
  type: 'planning-poker',
  facilitatorId: 'user-1',
  revealed: true,
  participants: [{ id: 'user-1', name: 'Alice', voted: true, vote: '5' }],
  items: [{ id: 'i1', label: 'Story A', status: 'active', estimate: null }],
};

const notRevealed = { ...revealedWithActiveItem, revealed: false };

const revealedNoActiveItem = {
  ...revealedWithActiveItem,
  items: [{ id: 'i1', label: 'Story A', status: 'pending', estimate: null }],
};

const revealedNotFacilitator = {
  ...revealedWithActiveItem,
  facilitatorId: 'someone-else',
};

describe('finalise section', () => {
  beforeEach(() => {
    mockRoomState.set(null);
    mockSend.mockClear();
  });

  it('is not shown when round is not yet revealed (even with active item and facilitator)', () => {
    mockRoomState.set(notRevealed);
    const { container } = render(PlanningPoker);
    expect(container.querySelector('.finalise-section')).toBeNull();
  });

  it('is not shown when revealed but no item is active', () => {
    mockRoomState.set(revealedNoActiveItem);
    const { container } = render(PlanningPoker);
    expect(container.querySelector('.finalise-section')).toBeNull();
  });

  it('is not shown when revealed and active item exists but current user is not the facilitator', () => {
    mockRoomState.set(revealedNotFacilitator);
    const { container } = render(PlanningPoker);
    expect(container.querySelector('.finalise-section')).toBeNull();
  });

  it('is shown when revealed, active item exists, and current user is the facilitator', () => {
    mockRoomState.set(revealedWithActiveItem);
    const { container } = render(PlanningPoker);
    const section = container.querySelector('.finalise-section');
    expect(section).not.toBeNull();
    expect(section.textContent).toContain('Story A');
  });

  it('Finalise button is disabled until an estimate value is selected', () => {
    mockRoomState.set(revealedWithActiveItem);
    const { getByRole } = render(PlanningPoker);
    expect(getByRole('button', { name: 'Finalise' })).toBeDisabled();
  });
});
