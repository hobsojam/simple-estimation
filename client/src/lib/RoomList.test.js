import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import RoomList from './RoomList.svelte';

function stubFetch(rooms) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => rooms,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const NAMED_ROOM = { id: 'abc-00000000', type: 'planning-poker', name: 'Sprint 42', participantCount: 2, pinProtected: false };
const UNNAMED_ROOM = { id: 'abc-11111111', type: 'bucket', name: null, participantCount: 1, pinProtected: false };

describe('RoomList — named room', () => {
  it('displays the room name', async () => {
    stubFetch([NAMED_ROOM]);
    const { getByText } = render(RoomList);
    await waitFor(() => expect(getByText('Sprint 42')).toBeInTheDocument());
  });

  it('uses the name as the primary label (room-primary class)', async () => {
    stubFetch([NAMED_ROOM]);
    const { getByText } = render(RoomList);
    await waitFor(() => {
      const el = getByText('Sprint 42');
      expect(el.classList.contains('room-primary')).toBe(true);
    });
  });

  it('shows the room type as a secondary label (room-type class)', async () => {
    stubFetch([NAMED_ROOM]);
    const { getByText } = render(RoomList);
    await waitFor(() => {
      const el = getByText('Planning Poker');
      expect(el.classList.contains('room-type')).toBe(true);
    });
  });
});

describe('RoomList — unnamed room', () => {
  it('displays the room type', async () => {
    stubFetch([UNNAMED_ROOM]);
    const { getByText } = render(RoomList);
    await waitFor(() => expect(getByText('Bucket Estimation')).toBeInTheDocument());
  });

  it('uses the room type as the primary label (room-primary class)', async () => {
    stubFetch([UNNAMED_ROOM]);
    const { getByText } = render(RoomList);
    await waitFor(() => {
      const el = getByText('Bucket Estimation');
      expect(el.classList.contains('room-primary')).toBe(true);
    });
  });

  it('does not render a secondary room-type label', async () => {
    stubFetch([UNNAMED_ROOM]);
    const { container } = render(RoomList);
    await waitFor(() => expect(container.querySelector('.room-primary')).toBeTruthy());
    expect(container.querySelector('.room-type')).toBeNull();
  });
});
