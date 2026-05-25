import { writable } from 'svelte/store';

export const roomState = writable(null);
export const wsError = writable(null);

let socket = null;
let retryCount = 0;
let retryTimeout = null;
let currentRoomId = null;
let intentionalClose = false;

const SESSION_KEY = 'participantId';

function getOrCreateParticipantId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.trunc(Math.random() * 16);
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

const _myId = writable(null);
export const myId = { subscribe: _myId.subscribe };

export function connect(roomId) {
  currentRoomId = roomId;
  intentionalClose = false;
  retryCount = 0;
  const participantId = getOrCreateParticipantId();
  _myId.set(participantId);
  openConnection();
}

function openConnection() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const participantId = sessionStorage.getItem(SESSION_KEY);
  const url = `${protocol}//${location.host}/ws?roomId=${encodeURIComponent(currentRoomId)}&participantId=${encodeURIComponent(participantId)}`;
  socket = new WebSocket(url);

  socket.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      console.log('[WS] Received:', msg.type, msg.message || '');
      if (msg.type === 'state') {
        roomState.set(msg.room);
      } else if (msg.type === 'error') {
        wsError.set(msg.message);
      }
    } catch {
      // ignore malformed messages
    }
  });

  socket.addEventListener('close', (event) => {
    if (intentionalClose) return;
    if (event.code === 1008) {
      wsError.set('Room not found. The link may be expired or incorrect.');
      return;
    }
    if (retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 1000;
      retryTimeout = setTimeout(openConnection, delay);
      retryCount++;
    } else {
      wsError.set('Connection lost. Please refresh the page.');
    }
  });

  socket.addEventListener('error', () => {
    wsError.set('WebSocket error. Attempting to reconnect...');
  });
}

export function send(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    wsError.set(null);
    socket.send(JSON.stringify(message));
  }
}

export function disconnect() {
  intentionalClose = true;
  sessionStorage.removeItem(SESSION_KEY);
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  roomState.set(null);
  wsError.set(null);
  _myId.set(null);
}
