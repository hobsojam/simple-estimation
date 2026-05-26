import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import BucketEstimation from './BucketEstimation.svelte';
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
  type: 'bucket',
  facilitatorId: 'user-1',
  revealed: false,
  participants: [{ id: 'user-1', name: 'Alice', vote: null }],
  items: [],
};

describe('BucketEstimation — Download CSV button', () => {
  beforeEach(() => {
    roomState.set(null);
    send.mockClear();
  });

  it('is not shown when no items have been sized', () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: null }],
    });
    const { queryByRole } = render(BucketEstimation);
    expect(queryByRole('button', { name: 'Download CSV' })).not.toBeInTheDocument();
  });

  it('is shown when at least one item is in a bucket', () => {
    roomState.set({
      ...baseState,
      items: [
        { id: 'i1', label: 'Story A', position: 'M' },
        { id: 'i2', label: 'Story B', position: null },
      ],
    });
    const { getByRole } = render(BucketEstimation);
    expect(getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
  });

  it('triggers a CSV download when clicked', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: 'M' }],
    });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('#');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const { getByRole } = render(BucketEstimation);
    await fireEvent.click(getByRole('button', { name: 'Download CSV' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});

describe('BucketEstimation — Add Item bar', () => {
  beforeEach(() => {
    roomState.set(null);
    send.mockClear();
  });

  it('is shown to the facilitator', () => {
    roomState.set({ ...baseState, facilitatorId: 'user-1' });
    const { getByRole } = render(BucketEstimation);
    expect(getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
  });

  it('is not shown to a non-facilitator', () => {
    roomState.set({ ...baseState, facilitatorId: 'someone-else' });
    const { queryByRole } = render(BucketEstimation);
    expect(queryByRole('button', { name: 'Add Item' })).not.toBeInTheDocument();
  });

  it('Add Item button is disabled when the input is empty', () => {
    roomState.set({ ...baseState });
    const { getByRole } = render(BucketEstimation);
    expect(getByRole('button', { name: 'Add Item' })).toBeDisabled();
  });

  it('Add Item button is enabled when the input has text', async () => {
    roomState.set({ ...baseState });
    const { getByRole, getByPlaceholderText } = render(BucketEstimation);
    await fireEvent.input(getByPlaceholderText('Add new item…'), { target: { value: 'Story A' } });
    expect(getByRole('button', { name: 'Add Item' })).toBeEnabled();
  });

  it('sends add_item with the label when Add Item is clicked', async () => {
    roomState.set({ ...baseState });
    const { getByRole, getByPlaceholderText } = render(BucketEstimation);
    await fireEvent.input(getByPlaceholderText('Add new item…'), { target: { value: 'Story A' } });
    await fireEvent.click(getByRole('button', { name: 'Add Item' }));
    expect(send).toHaveBeenCalledWith({ type: 'add_item', label: 'Story A' });
  });

  it('trims whitespace before sending', async () => {
    roomState.set({ ...baseState });
    const { getByRole, getByPlaceholderText } = render(BucketEstimation);
    await fireEvent.input(getByPlaceholderText('Add new item…'), { target: { value: '  Story A  ' } });
    await fireEvent.click(getByRole('button', { name: 'Add Item' }));
    expect(send).toHaveBeenCalledWith({ type: 'add_item', label: 'Story A' });
  });

  it('clears the input after submission', async () => {
    roomState.set({ ...baseState });
    const { getByRole, getByPlaceholderText } = render(BucketEstimation);
    const input = getByPlaceholderText('Add new item…');
    await fireEvent.input(input, { target: { value: 'Story A' } });
    await fireEvent.click(getByRole('button', { name: 'Add Item' }));
    expect(input.value).toBe('');
  });
});

describe('BucketEstimation — item placement', () => {
  beforeEach(() => {
    roomState.set(null);
    send.mockClear();
  });

  it('keeps an item visible after state moves it into a bucket', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: null }],
    });
    const { getByRole } = render(BucketEstimation);

    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: 'M' }],
    });

    const targetColumn = getByRole('region', { name: 'M' });
    const sourceColumn = getByRole('region', { name: 'Unsized items' });
    await waitFor(() => {
      expect(within(targetColumn).getByRole('button', { name: 'Story A' })).toBeInTheDocument();
    });
    expect(within(sourceColumn).queryByRole('button', { name: 'Story A' })).not.toBeInTheDocument();
  });
});

// BUCKETS order: null (Unsized), XS, S, M, L, XL
const ALL_POSITIONS = [null, 'XS', 'S', 'M', 'L', 'XL'];

describe('BucketEstimation — keyboard navigation (onItemKeydown)', () => {
  beforeEach(() => {
    roomState.set(null);
    send.mockClear();
  });

  it('Enter advances an Unsized item to the first bucket (XS)', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: null }],
    });
    const { getByRole } = render(BucketEstimation);
    const card = getByRole('button', { name: 'Story A' });
    await fireEvent.keyDown(card, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith({ type: 'move_item', itemId: 'i1', position: 'XS' });
  });

  it('Space advances an item forward by one bucket', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: 'S' }],
    });
    const { getAllByRole } = render(BucketEstimation);
    const cards = getAllByRole('button', { name: 'Story A' });
    await fireEvent.keyDown(cards[0], { key: ' ' });
    expect(send).toHaveBeenCalledWith({ type: 'move_item', itemId: 'i1', position: 'M' });
  });

  it('wraps forward from XL back to Unsized (null)', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: 'XL' }],
    });
    const { getAllByRole } = render(BucketEstimation);
    const cards = getAllByRole('button', { name: 'Story A' });
    await fireEvent.keyDown(cards[0], { key: 'Enter' });
    expect(send).toHaveBeenCalledWith({ type: 'move_item', itemId: 'i1', position: null });
  });

  it('Shift+Enter moves an item backwards one bucket', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: 'M' }],
    });
    const { getAllByRole } = render(BucketEstimation);
    const cards = getAllByRole('button', { name: 'Story A' });
    await fireEvent.keyDown(cards[0], { key: 'Enter', shiftKey: true });
    expect(send).toHaveBeenCalledWith({ type: 'move_item', itemId: 'i1', position: 'S' });
  });

  it('wraps backward from Unsized to XL', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: null }],
    });
    const { getByRole } = render(BucketEstimation);
    const card = getByRole('button', { name: 'Story A' });
    await fireEvent.keyDown(card, { key: 'Enter', shiftKey: true });
    expect(send).toHaveBeenCalledWith({ type: 'move_item', itemId: 'i1', position: 'XL' });
  });

  it('ignores keys other than Enter and Space', async () => {
    roomState.set({
      ...baseState,
      items: [{ id: 'i1', label: 'Story A', position: null }],
    });
    const { getByRole } = render(BucketEstimation);
    const card = getByRole('button', { name: 'Story A' });
    await fireEvent.keyDown(card, { key: 'ArrowDown' });
    expect(send).not.toHaveBeenCalled();
  });
});
