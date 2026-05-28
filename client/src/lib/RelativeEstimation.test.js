import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import RelativeEstimation from './RelativeEstimation.svelte';
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
  id: 'aabbccdd-1234-5678-90ab-cdef01234567',
  type: 'relative',
  facilitatorId: 'user-1',
  revealed: false,
  participants: [{ id: 'user-1', name: 'Alice', vote: null }],
  items: [],
};

describe('RelativeEstimation — Download CSV button', () => {
  beforeEach(() => {
    roomState.set(null);
    send.mockClear();
  });

  it('is not shown when no items have been placed', () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: null }],
    });
    const { queryByRole } = render(RelativeEstimation);
    expect(queryByRole('button', { name: 'Download CSV' })).not.toBeInTheDocument();
  });

  it('is shown when at least one item is in a column', () => {
    roomState.set({
      ...baseState,
      items: [
        { id: 'i1', label: 'Story A', position: '5' },
        { id: 'i2', label: 'Story B', position: null },
      ],
    });
    const { getByRole } = render(RelativeEstimation);
    expect(getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
  });

  it('triggers a CSV download when clicked', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: '5' }],
    });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('#');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const { getByRole } = render(RelativeEstimation);
    await fireEvent.click(getByRole('button', { name: 'Download CSV' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});

describe('RelativeEstimation — Add Item bar', () => {
  beforeEach(() => {
    roomState.set(null);
    send.mockClear();
  });

  it('is shown to the facilitator', () => {
    roomState.set({ ...baseState, facilitatorId: 'user-1' });
    const { getByRole } = render(RelativeEstimation);
    expect(getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
  });

  it('is not shown to a non-facilitator', () => {
    roomState.set({ ...baseState, facilitatorId: 'someone-else' });
    const { queryByRole } = render(RelativeEstimation);
    expect(queryByRole('button', { name: 'Add Item' })).not.toBeInTheDocument();
  });

  it('Add Item button is disabled when the input is empty', () => {
    roomState.set({ ...baseState });
    const { getByRole } = render(RelativeEstimation);
    expect(getByRole('button', { name: 'Add Item' })).toBeDisabled();
  });

  it('Add Item button is enabled when the input has text', async () => {
    roomState.set({ ...baseState });
    const { getByRole, getByPlaceholderText } = render(RelativeEstimation);
    await fireEvent.input(getByPlaceholderText('Add new item…'), { target: { value: 'Story A' } });
    expect(getByRole('button', { name: 'Add Item' })).toBeEnabled();
  });

  it('sends add_item with the label when Add Item is clicked', async () => {
    roomState.set({ ...baseState });
    const { getByRole, getByPlaceholderText } = render(RelativeEstimation);
    await fireEvent.input(getByPlaceholderText('Add new item…'), { target: { value: 'Story A' } });
    await fireEvent.click(getByRole('button', { name: 'Add Item' }));
    expect(send).toHaveBeenCalledWith({ type: 'add_item', label: 'Story A' });
  });

  it('trims whitespace before sending', async () => {
    roomState.set({ ...baseState });
    const { getByRole, getByPlaceholderText } = render(RelativeEstimation);
    await fireEvent.input(getByPlaceholderText('Add new item…'), { target: { value: '  Story A  ' } });
    await fireEvent.click(getByRole('button', { name: 'Add Item' }));
    expect(send).toHaveBeenCalledWith({ type: 'add_item', label: 'Story A' });
  });

  it('clears the input after submission', async () => {
    roomState.set({ ...baseState });
    const { getByRole, getByPlaceholderText } = render(RelativeEstimation);
    const input = getByPlaceholderText('Add new item…');
    await fireEvent.input(input, { target: { value: 'Story A' } });
    await fireEvent.click(getByRole('button', { name: 'Add Item' }));
    expect(input.value).toBe('');
  });
});

describe('RelativeEstimation — item placement', () => {
  beforeEach(() => {
    roomState.set(null);
    send.mockClear();
  });

  it('keeps an item visible after state moves it into a column', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: null }],
    });
    const { getByRole } = render(RelativeEstimation);

    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: '5' }],
    });

    const targetColumn = getByRole('region', { name: '5' });
    const sourceColumn = getByRole('region', { name: 'Unplaced items' });
    await waitFor(() => {
      expect(within(targetColumn).getByRole('button', { name: 'Story A' })).toBeInTheDocument();
    });
    expect(within(sourceColumn).queryByRole('button', { name: 'Story A' })).not.toBeInTheDocument();
  });

  it('sends move_item when the placement select changes', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: null }],
    });
    const { getByLabelText } = render(RelativeEstimation);

    await fireEvent.change(getByLabelText('Move Story A to estimate'), { target: { value: '8' } });

    expect(send).toHaveBeenCalledWith({ type: 'move_item', itemId: 'i1', position: '8' });
  });

  it('sends null when the placement select moves an item back to Unplaced', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: '8' }],
    });
    const { getByLabelText } = render(RelativeEstimation);

    await fireEvent.change(getByLabelText('Move Story A to estimate'), { target: { value: '' } });

    expect(send).toHaveBeenCalledWith({ type: 'move_item', itemId: 'i1', position: null });
  });
});

// ALL_POSITIONS order: null (Unplaced), '1', '2', '3', '5', '8', '13', '21'
describe('RelativeEstimation — keyboard navigation (onItemKeydown)', () => {
  beforeEach(() => {
    roomState.set(null);
    send.mockClear();
  });

  it('Enter advances an Unplaced item to the first column (1)', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: null }],
    });
    const { getByRole } = render(RelativeEstimation);
    const card = getByRole('button', { name: 'Story A' });
    await fireEvent.keyDown(card, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith({ type: 'move_item', itemId: 'i1', position: '1' });
  });

  it('Space advances an item forward by one column', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: '3' }],
    });
    const { getAllByRole } = render(RelativeEstimation);
    const cards = getAllByRole('button', { name: 'Story A' });
    await fireEvent.keyDown(cards[0], { key: ' ' });
    expect(send).toHaveBeenCalledWith({ type: 'move_item', itemId: 'i1', position: '5' });
  });

  it('wraps forward from the last column (21) back to Unplaced (null)', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: '21' }],
    });
    const { getAllByRole } = render(RelativeEstimation);
    const cards = getAllByRole('button', { name: 'Story A' });
    await fireEvent.keyDown(cards[0], { key: 'Enter' });
    expect(send).toHaveBeenCalledWith({ type: 'move_item', itemId: 'i1', position: null });
  });

  it('Shift+Enter moves an item backwards one column', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: '5' }],
    });
    const { getAllByRole } = render(RelativeEstimation);
    const cards = getAllByRole('button', { name: 'Story A' });
    await fireEvent.keyDown(cards[0], { key: 'Enter', shiftKey: true });
    expect(send).toHaveBeenCalledWith({ type: 'move_item', itemId: 'i1', position: '3' });
  });

  it('wraps backward from Unplaced to the last column (21)', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: null }],
    });
    const { getByRole } = render(RelativeEstimation);
    const card = getByRole('button', { name: 'Story A' });
    await fireEvent.keyDown(card, { key: 'Enter', shiftKey: true });
    expect(send).toHaveBeenCalledWith({ type: 'move_item', itemId: 'i1', position: '21' });
  });

  it('ignores keys other than Enter and Space', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: null }],
    });
    const { getByRole } = render(RelativeEstimation);
    const card = getByRole('button', { name: 'Story A' });
    await fireEvent.keyDown(card, { key: 'ArrowDown' });
    expect(send).not.toHaveBeenCalled();
  });
});
