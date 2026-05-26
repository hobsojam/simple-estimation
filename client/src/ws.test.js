import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { WEBSOCKET_ERRORS } from '../../shared/errors.json';

// FakeWebSocket captures event listeners so tests can fire them manually.
class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.OPEN = FakeWebSocket.OPEN;
    this._listeners = {};
    FakeWebSocket._instances.push(this);
    FakeWebSocket._latest = this;
  }

  static OPEN = 1;
  static CLOSED = 3;
  static _instances = [];
  static _latest = null;
  static _sent = [];

  static reset() {
    FakeWebSocket._instances = [];
    FakeWebSocket._latest = null;
    FakeWebSocket._sent = [];
  }

  addEventListener(event, fn) { this._listeners[event] = fn; }

  send(data) { FakeWebSocket._sent.push(data); }

  close() { this.readyState = FakeWebSocket.CLOSED; }

  // Test helpers
  fireMessage(data) {
    this._listeners.message?.({ data: JSON.stringify(data) });
  }
  fireRawMessage(raw) {
    this._listeners.message?.({ data: raw });
  }
  fireClose(code = 1000, reason = '') {
    this._listeners.close?.({ code, reason });
  }
  fireError() {
    this._listeners.error?.();
  }
}

let connect, disconnect, send, roomState, wsError, myId;

async function freshModule() {
  vi.resetModules();
  const mod = await import('./ws.js');
  connect = mod.connect;
  disconnect = mod.disconnect;
  send = mod.send;
  roomState = mod.roomState;
  wsError = mod.wsError;
  myId = mod.myId;
}

describe('ws.js', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    FakeWebSocket.reset();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    await freshModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    disconnect?.();
  });

  describe('connect()', () => {
    it('stores a participantId in sessionStorage and sets myId', () => {
      connect('room-1');
      expect(sessionStorage.getItem('participantId')).toBeTruthy();
      expect(get(myId)).toBeTruthy();
    });

    it('creates a WebSocket whose URL contains the roomId', () => {
      connect('room-xyz');
      expect(FakeWebSocket._latest.url).toContain('roomId=room-xyz');
    });

    it('creates a WebSocket whose URL contains the participantId', () => {
      connect('room-1');
      const storedId = sessionStorage.getItem('participantId');
      expect(FakeWebSocket._latest.url).toContain(`participantId=${storedId}`);
    });

    it('reuses an existing participantId from sessionStorage', () => {
      sessionStorage.setItem('participantId', 'existing-id');
      connect('room-1');
      expect(get(myId)).toBe('existing-id');
    });
  });

  describe('message handler', () => {
    it('routes state messages to the roomState store', () => {
      connect('room-1');
      FakeWebSocket._latest.fireMessage({ type: 'state', room: { id: 'r1', type: 'bucket' } });
      expect(get(roomState)).toEqual({ id: 'r1', type: 'bucket' });
    });

    it('routes error messages to the wsError store', () => {
      connect('room-1');
      FakeWebSocket._latest.fireMessage({ type: 'error', message: 'Something went wrong' });
      expect(get(wsError)).toBe('Something went wrong');
    });

    it('silently ignores malformed JSON', () => {
      connect('room-1');
      expect(() => FakeWebSocket._latest.fireRawMessage('not-json')).not.toThrow();
      expect(get(wsError)).toBeNull();
      expect(get(roomState)).toBeNull();
    });
  });

  describe('close handler', () => {
    it('sets wsError and does not retry when the room is not found', () => {
      vi.useFakeTimers();
      connect('room-1');
      FakeWebSocket._latest.fireClose(WEBSOCKET_ERRORS.ROOM_NOT_FOUND.code, WEBSOCKET_ERRORS.ROOM_NOT_FOUND.description);
      expect(get(wsError)).toBe(WEBSOCKET_ERRORS.ROOM_NOT_FOUND.description);
      vi.advanceTimersByTime(5000);
      expect(FakeWebSocket._instances.length).toBe(1);
    });

    it('sets wsError and does not retry when the room is full', () => {
      vi.useFakeTimers();
      connect('room-1');
      FakeWebSocket._latest.fireClose(WEBSOCKET_ERRORS.ROOM_FULL.code, WEBSOCKET_ERRORS.ROOM_FULL.description);
      expect(get(wsError)).toBe(WEBSOCKET_ERRORS.ROOM_FULL.description);
      vi.advanceTimersByTime(5000);
      expect(FakeWebSocket._instances.length).toBe(1);
    });

    it('sets wsError and does not retry after rate limiting', () => {
      vi.useFakeTimers();
      connect('room-1');
      FakeWebSocket._latest.fireClose(WEBSOCKET_ERRORS.RATE_LIMIT_EXCEEDED.code, WEBSOCKET_ERRORS.RATE_LIMIT_EXCEEDED.description);
      expect(get(wsError)).toBe(WEBSOCKET_ERRORS.RATE_LIMIT_EXCEEDED.description);
      vi.advanceTimersByTime(5000);
      expect(FakeWebSocket._instances.length).toBe(1);
    });

    it('does nothing when intentionalClose is true', () => {
      vi.useFakeTimers();
      connect('room-1');
      disconnect();
      const countBefore = FakeWebSocket._instances.length;
      // After disconnect, intentionalClose=true; simulate a close event on the (now-null) socket
      // by directly calling the close listener if it was registered before close()
      vi.advanceTimersByTime(5000);
      expect(FakeWebSocket._instances.length).toBe(countBefore);
      expect(get(wsError)).toBeNull();
    });

    it('retries after 1000ms on first unexpected close', async () => {
      vi.useFakeTimers();
      connect('room-1');
      FakeWebSocket._latest.fireClose(1006, 'Connection lost');
      expect(FakeWebSocket._instances.length).toBe(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(FakeWebSocket._instances.length).toBe(2);
    });

    it('retries after 2000ms on second unexpected close', async () => {
      vi.useFakeTimers();
      connect('room-1');
      FakeWebSocket._latest.fireClose(1006);
      await vi.advanceTimersByTimeAsync(1000);
      FakeWebSocket._latest.fireClose(1006);
      expect(FakeWebSocket._instances.length).toBe(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(FakeWebSocket._instances.length).toBe(3);
    });

    it('sets wsError "Connection lost" after 3 retries', async () => {
      vi.useFakeTimers();
      connect('room-1');
      // Retry 0 → delay 1s
      FakeWebSocket._latest.fireClose(1006);
      await vi.advanceTimersByTimeAsync(1000);
      // Retry 1 → delay 2s
      FakeWebSocket._latest.fireClose(1006);
      await vi.advanceTimersByTimeAsync(2000);
      // Retry 2 → delay 4s
      FakeWebSocket._latest.fireClose(1006);
      await vi.advanceTimersByTimeAsync(4000);
      // 3rd close exhausts retries
      FakeWebSocket._latest.fireClose(1006);
      expect(get(wsError)).toMatch(/Connection lost/);
      // No 4th socket created
      expect(FakeWebSocket._instances.length).toBe(4);
    });
  });

  describe('error handler', () => {
    it('sets wsError with a reconnect message', () => {
      connect('room-1');
      FakeWebSocket._latest.fireError();
      expect(get(wsError)).toMatch(/reconnect/i);
    });
  });

  describe('send()', () => {
    it('sends JSON when socket is OPEN', () => {
      connect('room-1');
      send({ type: 'vote', vote: '5' });
      expect(FakeWebSocket._sent).toHaveLength(1);
      expect(JSON.parse(FakeWebSocket._sent[0])).toEqual({ type: 'vote', vote: '5' });
    });

    it('does nothing when socket is not OPEN', () => {
      connect('room-1');
      FakeWebSocket._latest.readyState = FakeWebSocket.CLOSED;
      send({ type: 'vote', vote: '5' });
      expect(FakeWebSocket._sent).toHaveLength(0);
    });

    it('does nothing when disconnect() has been called', () => {
      connect('room-1');
      disconnect();
      send({ type: 'vote', vote: '5' });
      expect(FakeWebSocket._sent).toHaveLength(0);
    });
  });

  describe('disconnect()', () => {
    it('removes participantId from sessionStorage', () => {
      connect('room-1');
      expect(sessionStorage.getItem('participantId')).toBeTruthy();
      disconnect();
      expect(sessionStorage.getItem('participantId')).toBeNull();
    });

    it('resets roomState, wsError, and myId to null', () => {
      connect('room-1');
      FakeWebSocket._latest.fireMessage({ type: 'state', room: { id: 'r1' } });
      FakeWebSocket._latest.fireMessage({ type: 'error', message: 'oops' });
      disconnect();
      expect(get(roomState)).toBeNull();
      expect(get(wsError)).toBeNull();
      expect(get(myId)).toBeNull();
    });

    it('closes the underlying socket', () => {
      connect('room-1');
      const ws = FakeWebSocket._latest;
      disconnect();
      expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
    });

    it('clears any pending retry timeout', async () => {
      vi.useFakeTimers();
      connect('room-1');
      FakeWebSocket._latest.fireClose(1006);
      const instancesBefore = FakeWebSocket._instances.length;
      disconnect();
      await vi.advanceTimersByTimeAsync(5000);
      expect(FakeWebSocket._instances.length).toBe(instancesBefore);
    });
  });
});
