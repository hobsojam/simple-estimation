import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
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
