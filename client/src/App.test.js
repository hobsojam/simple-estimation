import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from './App.svelte';
import { roomState, wsError, connect, disconnect, send } from './ws.js';

vi.mock('./ws.js', async () => {
  const { writable } = await import('svelte/store');
  return {
    roomState: writable(null),
    wsError: writable(null),
    myId: writable(null),
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
  };
});

const baseRoom = {
  id: 'room-1',
  type: 'planning-poker',
  name: 'Sprint 1',
  facilitatorId: null,
  participants: [],
  items: [],
  revealed: false,
};

function mockFetch({ createResponse, configResponse } = {}) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    if (url === '/api/config') {
      return configResponse ?? {
        ok: true,
        json: async () => ({ demoMode: false }),
      };
    }

    if (url === '/api/rooms' && options.method === 'POST') {
      if (createResponse instanceof Error) throw createResponse;
      return createResponse ?? {
        ok: true,
        json: async () => ({ id: 'created-room' }),
      };
    }

    if (url === '/api/rooms') {
      return {
        ok: true,
        json: async () => [],
      };
    }

    return {
      ok: true,
      json: async () => ({}),
    };
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function flush() {
  await tick();
  await Promise.resolve();
}

beforeEach(() => {
  roomState.set(null);
  wsError.set(null);
  connect.mockClear();
  disconnect.mockClear();
  send.mockClear();
  mockFetch();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

describe('App.svelte page state machine', () => {
  it('shows the demo banner when demo mode is enabled', async () => {
    mockFetch({
      configResponse: {
        ok: true,
        json: async () => ({ demoMode: true }),
      },
    });

    const { findByRole } = render(App);

    const banner = await findByRole('status');
    expect(banner).toHaveTextContent('Demo only');
    expect(banner).toHaveTextContent('Data will be deleted after a few minutes of inactivity');
  });

  it('mounts on the home page without URL params', () => {
    const { getByRole } = render(App);

    expect(getByRole('tablist')).toBeInTheDocument();
    expect(getByRole('tab', { name: 'Join Room' })).toHaveAttribute('aria-selected', 'true');
    expect(connect).not.toHaveBeenCalled();
  });

  it('mounts in joining state and connects when ?room=<id> is present', async () => {
    window.history.pushState({}, '', '/?room=abc123');

    const { getByText } = render(App);
    await flush();

    expect(connect).toHaveBeenCalledWith('abc123');
    expect(getByText(/Connecting/)).toBeInTheDocument();
  });

  it('runs the direct-link flow after room state arrives without a pending name', async () => {
    window.history.pushState({}, '', '/?room=abc123');

    const { getByRole, getByPlaceholderText } = render(App);
    await flush();
    roomState.set(baseRoom);
    await flush();

    expect(getByRole('heading', { name: 'Join Room' })).toBeInTheDocument();

    await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    await fireEvent.input(getByPlaceholderText('Enter PIN if you have one'), { target: { value: 'admin-pin' } });
    await fireEvent.click(getByRole('button', { name: 'Join' }));
    await flush();

    expect(send).toHaveBeenCalledWith({
      type: 'join',
      name: 'Alice',
      pin: 'admin-pin',
    });
    expect(getByRole('button', { name: 'Leave Room' })).toBeInTheDocument();
  });

  it('runs the join form flow and sends join once room state arrives', async () => {
    const { getByRole, getByPlaceholderText, getByText } = render(App);

    await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Bob' } });
    await fireEvent.input(getByPlaceholderText('Paste room ID'), { target: { value: 'room-join' } });
    await fireEvent.input(getByPlaceholderText('Enter room access PIN'), { target: { value: 'guest-pin' } });
    await fireEvent.input(getByPlaceholderText('Enter PIN if you have one'), { target: { value: 'facilitator-pin' } });
    await fireEvent.click(getByRole('button', { name: 'Join' }));
    await flush();

    expect(window.location.search).toBe('?room=room-join');
    expect(connect).toHaveBeenCalledWith('room-join');
    expect(getByText(/Connecting/)).toBeInTheDocument();

    roomState.set(baseRoom);
    await flush();

    expect(send).toHaveBeenCalledWith({
      type: 'join',
      name: 'Bob',
      pin: 'facilitator-pin',
      accessPin: 'guest-pin',
    });
    expect(getByRole('button', { name: 'Leave Room' })).toBeInTheDocument();
  });

  it('runs the create flow, posts the room config, and joins the created room', async () => {
    const fetchMock = mockFetch();
    const { getByRole, getByPlaceholderText } = render(App);

    await fireEvent.click(getByRole('tab', { name: 'Create Room' }));
    await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Carol' } });
    await fireEvent.input(getByPlaceholderText('e.g. Sprint 42 Planning'), { target: { value: 'Sprint 42' } });
    await fireEvent.input(getByPlaceholderText('Limit room access to specific people'), { target: { value: 'team-pin' } });
    await fireEvent.input(getByPlaceholderText('Set a PIN to protect facilitator role'), { target: { value: 'admin-pin' } });
    await fireEvent.click(getByRole('button', { name: 'Create Room' }));

    await waitFor(() => expect(connect).toHaveBeenCalledWith('created-room'));

    expect(fetchMock).toHaveBeenCalledWith('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'planning-poker',
        pin: 'admin-pin',
        accessPin: 'team-pin',
        name: 'Sprint 42',
      }),
    });
    expect(window.location.search).toBe('?room=created-room&type=planning-poker');

    roomState.set(baseRoom);
    await flush();

    expect(send).toHaveBeenCalledWith({
      type: 'join',
      name: 'Carol',
      pin: 'admin-pin',
      accessPin: 'team-pin',
    });
    expect(getByRole('button', { name: 'Leave Room' })).toBeInTheDocument();
  });

  it('shows createError when creating a room fails', async () => {
    mockFetch({ createResponse: new Error('Failed to fetch') });
    const { getByRole, getByPlaceholderText, findByRole } = render(App);

    await fireEvent.click(getByRole('tab', { name: 'Create Room' }));
    await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Dana' } });
    await fireEvent.click(getByRole('button', { name: 'Create Room' }));

    expect(await findByRole('alert')).toHaveTextContent('Could not reach the server. Is it running?');
    expect(connect).not.toHaveBeenCalled();
  });

  it('shows wsError while still joining', async () => {
    window.history.pushState({}, '', '/?room=abc123');
    const { getByRole } = render(App);
    await flush();

    wsError.set('Connection failed');
    await flush();

    expect(getByRole('alert')).toHaveTextContent('Connection failed');
    expect(send).not.toHaveBeenCalled();
  });

  it('routes a pending join to the access prompt when access is required', async () => {
    const { getByRole, getByPlaceholderText } = render(App);

    await fireEvent.input(getByPlaceholderText('Enter your name'), { target: { value: 'Eve' } });
    await fireEvent.input(getByPlaceholderText('Paste room ID'), { target: { value: 'locked-room' } });
    await fireEvent.input(getByPlaceholderText('Enter PIN if you have one'), { target: { value: 'admin-pin' } });
    await fireEvent.click(getByRole('button', { name: 'Join' }));
    await flush();

    roomState.set({ ...baseRoom, accessRequired: true });
    await flush();

    expect(send).not.toHaveBeenCalled();
    expect(getByRole('heading', { name: 'Join Room' })).toBeInTheDocument();
    expect(getByPlaceholderText('Enter your name')).toHaveValue('Eve');
    expect(getByPlaceholderText('Enter access PIN')).toBeInTheDocument();
    expect(getByPlaceholderText('Enter PIN if you have one')).toHaveValue('admin-pin');

    await fireEvent.input(getByPlaceholderText('Enter access PIN'), { target: { value: 'guest-pin' } });
    await fireEvent.click(getByRole('button', { name: 'Join' }));
    await flush();

    expect(send).toHaveBeenCalledWith({
      type: 'join',
      name: 'Eve',
      accessPin: 'guest-pin',
      pin: 'admin-pin',
    });
  });

  it('handleLeave disconnects, clears URL params, and returns home', async () => {
    window.history.pushState({}, '', '/?room=abc123');
    const { getByRole } = render(App);
    await flush();
    roomState.set(baseRoom);
    await flush();

    await fireEvent.input(getByRole('textbox', { name: 'Your name' }), { target: { value: 'Frank' } });
    await fireEvent.click(getByRole('button', { name: 'Join' }));
    await flush();

    await fireEvent.click(getByRole('button', { name: 'Leave Room' }));
    await flush();

    expect(disconnect).toHaveBeenCalled();
    expect(window.location.search).toBe('');
    expect(getByRole('tablist')).toBeInTheDocument();
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
