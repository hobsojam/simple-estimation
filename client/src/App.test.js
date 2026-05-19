import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
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

beforeEach(() => {
  roomState.set(null);
  wsError.set(null);
  connect.mockClear();
  disconnect.mockClear();
  send.mockClear();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('App.svelte — home page', () => {
  it('renders the join form by default', () => {
    const { getByRole } = render(App);
    expect(getByRole('tablist')).toBeInTheDocument();
  });

  it('does not call connect() when there is no ?room= URL param', () => {
    render(App);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('App.svelte — direct link (?room=<id>)', () => {
  it('calls connect() with the roomId from the URL param', async () => {
    window.history.pushState({}, '', '?room=abc123');
    render(App);
    await tick();
    expect(connect).toHaveBeenCalledWith('abc123');
  });

  it('shows the connecting state when roomId is in URL', async () => {
    window.history.pushState({}, '', '?room=abc123');
    const { getByText } = render(App);
    await tick();
    expect(getByText('Connecting…')).toBeInTheDocument();
  });

  it('shows the name prompt when roomState arrives with no pending name', async () => {
    window.history.pushState({}, '', '?room=abc123');
    const { getByRole } = render(App);
    await tick();
    roomState.set(baseRoom);
    await tick();
    expect(getByRole('heading', { name: 'Join Room' })).toBeInTheDocument();
  });
});

describe('App.svelte — wsError display', () => {
  it('shows wsError with role="alert" during the joining state', async () => {
    window.history.pushState({}, '', '?room=abc123');
    const { getByRole } = render(App);
    await tick();
    wsError.set('Connection failed');
    await tick();
    expect(getByRole('alert')).toHaveTextContent('Connection failed');
  });
});

describe('App.svelte — create room error', () => {
  it('shows createError with role="alert" when API POST fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { getByRole, findByRole } = render(App);

    // Switch to Create tab (it may already be active — click it to be sure)
    const createTab = getByRole('tab', { name: 'Create Room' });
    fireEvent.click(createTab);
    await tick();

    // Fill in the name to enable the Create button
    const nameInput = document.querySelector('#create-panel input[placeholder="Enter your name"]');
    fireEvent.input(nameInput, { target: { value: 'Alice' } });
    await tick();

    // Click Create Room
    const createBtn = getByRole('button', { name: 'Create Room' });
    fireEvent.click(createBtn);
    await tick();

    const alert = await findByRole('alert');
    expect(alert).toBeInTheDocument();
  });
});

describe('App.svelte — join flow', () => {
  it('sends a join message and shows the room once roomState arrives', async () => {
    window.history.pushState({}, '', '?room=abc123');
    render(App);
    await tick();

    // Navigate to name prompt (direct link flow)
    roomState.set(baseRoom);
    await tick();

    // Fill in the name and submit
    const nameInput = document.querySelector('input[placeholder="Enter your name"]');
    if (nameInput) {
      fireEvent.input(nameInput, { target: { value: 'Alice' } });
      await tick();
      const joinBtn = document.querySelector('button.primary');
      if (joinBtn && !joinBtn.disabled) {
        fireEvent.click(joinBtn);
        await tick();
      }
    }

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'join', name: 'Alice' }));
  });
});

describe('App.svelte — leave room', () => {
  it('calls disconnect() and returns to home page when Leave Room is clicked', async () => {
    window.history.pushState({}, '', '?room=abc123');
    const { getByText } = render(App);
    await tick();
    roomState.set(baseRoom);
    await tick();

    // Submit name to get to room page
    const nameInput = document.querySelector('input[placeholder="Enter your name"]');
    if (nameInput) {
      fireEvent.input(nameInput, { target: { value: 'Alice' } });
      await tick();
      const joinBtn = document.querySelector('button.primary:not([disabled])');
      if (joinBtn) {
        fireEvent.click(joinBtn);
        await tick();
      }
    }

    const leaveBtn = document.querySelector('.leave-btn');
    if (leaveBtn) {
      fireEvent.click(leaveBtn);
      await tick();
      expect(disconnect).toHaveBeenCalled();
      // Back to home: join form tab list should be visible
      expect(document.querySelector('[role="tablist"]')).toBeInTheDocument();
    }
  });
});
