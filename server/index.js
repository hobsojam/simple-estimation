const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { createRoom, getRoom, getAllRooms, removeParticipant, deleteRoom, revealVotes, clearTimer } = require('./rooms');
const { handleMessage } = require('./handlers');
const { sanitizeRoom } = require('./sanitize');
const { shortText } = require('./validate');

const PORT = process.env.PORT || 3000;
const STATIC_DIR = process.env.STATIC_DIR || './public';

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  // style-src 'unsafe-inline' is required for Svelte's runtime-injected styles (transitions, animations)
  res.set('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'");
  next();
});

app.use(express.static(path.resolve(STATIC_DIR)));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const createRoomLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.ROOM_RATE_LIMIT_MAX ? Number.parseInt(process.env.ROOM_RATE_LIMIT_MAX, 10) : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many rooms created, please try again later' },
});

const staticFallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

app.post('/api/rooms', createRoomLimiter, async (req, res) => {
  const { type, pin, accessPin, name } = req.body;
  const validTypes = ['planning-poker', 'bucket', 'relative'];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid room type' });
  }
  const trimmedName = shortText(name);
  const pinHash = pin ? await bcrypt.hash(String(pin), 10) : null;
  const accessPinHash = accessPin ? await bcrypt.hash(String(accessPin), 10) : null;
  const room = createRoom(type, pinHash, trimmedName || null, accessPinHash);
  res.json({ id: room.id });
});

app.get('/api/rooms', (req, res) => {
  const rooms = getAllRooms();
  res.json(rooms.map(room => ({
    id: room.id,
    type: room.type,
    name: room.name,
    participantCount: room.participants.length,
    pinProtected: room.pinHash !== null,
    accessPinProtected: room.accessPinHash !== null,
  })));
});

app.delete('/api/rooms/:id', async (req, res) => {
  const room = getRoom(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (room.pinHash !== null) {
    const pin = req.body?.pin;
    if (!pin) {
      return res.status(403).json({ error: 'PIN required' });
    }
    const match = await bcrypt.compare(String(pin), room.pinHash);
    if (!match) {
      return res.status(403).json({ error: 'Incorrect PIN' });
    }
  }

  const sockets = roomSockets.get(room.id);
  if (sockets) {
    for (const ws of sockets) {
      ws.close(1000, 'Room deleted');
    }
    roomSockets.delete(room.id);
  }

  clearRoomTimer(room.id);
  deleteRoom(room.id);
  res.status(204).end();
});

app.get('/{*path}', staticFallbackLimiter, (req, res) => {
  res.sendFile(path.resolve(STATIC_DIR, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcastState(room, sockets) {
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      const state = JSON.stringify({ type: 'state', room: sanitizeRoom(room, ws.isAuthorized) });
      ws.send(state);
    }
  }
}

const roomSockets = new Map();
const roomTimers = new Map();
const wsMessageTimestamps = new WeakMap();

function clearRoomTimer(roomId) {
  const handle = roomTimers.get(roomId);
  if (handle) {
    clearTimeout(handle);
    roomTimers.delete(roomId);
  }
}

function scheduleAutoReveal(roomId, endsAt) {
  clearRoomTimer(roomId);
  const delay = endsAt - Date.now();
  if (delay <= 0) return;
  const handle = setTimeout(() => {
    roomTimers.delete(roomId);
    const room = getRoom(roomId);
    if (!room || room.revealed) return;
    clearTimer(roomId);
    revealVotes(roomId);
    const updatedRoom = getRoom(roomId);
    const sockets = roomSockets.get(roomId);
    if (sockets && sockets.size > 0) {
      broadcastState(updatedRoom, sockets);
    }
  }, delay);
  roomTimers.set(roomId, handle);
}

function handleConnection(ws, req) {
  const url = new URL(req.url, `http://localhost`);
  const roomId = url.searchParams.get('roomId');
  const participantId = url.searchParams.get('participantId');

  if (!roomId) {
    ws.close(1008, 'roomId required');
    return;
  }

  const room = getRoom(roomId);
  if (!room) {
    ws.close(1008, 'Room not found');
    return;
  }

  if (room.participants.length >= 100) {
    ws.close(1008, 'Room is full');
    return;
  }

  ws.participantId = participantId || uuidv4();
  ws.roomId = roomId;
  ws.isAuthorized = room.accessPinHash === null;

  if (!roomSockets.has(roomId)) {
    roomSockets.set(roomId, new Set());
  }
  roomSockets.get(roomId).add(ws);

  ws.send(JSON.stringify({ type: 'state', room: sanitizeRoom(room, ws.isAuthorized) }));

  let messageChain = Promise.resolve();

  ws.on('message', (raw) => {
    const now = Date.now();
    const timestamps = wsMessageTimestamps.get(ws) || [];
    const recent = timestamps.filter(t => now - t < 1000);
    if (recent.length >= 30) {
      ws.close(1008, 'Rate limit exceeded');
      return;
    }
    wsMessageTimestamps.set(ws, [...recent, now]);

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    messageChain = messageChain.then(async () => {
      const currentRoom = getRoom(roomId);
      if (!currentRoom) {
        console.log(`[WS] Room not found: ${roomId}`);
        ws.close(1008, 'Room not found');
        return;
      }

      console.log(`[WS] Message from ${ws.participantId} in ${roomId}: ${data.type} (authorized: ${ws.isAuthorized})`);

      if (!ws.isAuthorized && data.type !== 'join') {
        console.log(`[WS] Unauthorized access attempt: ${data.type}`);
        ws.send(JSON.stringify({ type: 'error', message: 'Access PIN required' }));
        return;
      }

      await handleMessage(ws, currentRoom, data);

      const updatedRoom = getRoom(roomId);
      const sockets = roomSockets.get(roomId) || new Set();
      broadcastState(updatedRoom, sockets);

      if (updatedRoom.timer?.endsAt) {
        scheduleAutoReveal(roomId, updatedRoom.timer.endsAt);
      } else {
        clearRoomTimer(roomId);
      }
    });
  });

  ws.on('close', () => {
    const sockets = roomSockets.get(roomId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        roomSockets.delete(roomId);
      }
    }
    const currentRoom = getRoom(roomId);
    if (currentRoom) {
      removeParticipant(roomId, ws.participantId);
      const updatedRoom = getRoom(roomId);
      const remaining = roomSockets.get(roomId);
      if (remaining && remaining.size > 0) {
        broadcastState(updatedRoom, remaining);
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Socket error (${ws.participantId ?? 'unknown'}):`, err.message);
  });
}

wss.on('connection', handleConnection);

wss.on('error', (err) => {
  console.error('[WSS] Server error:', err.message);
});

const ROOM_TTL_MS = (Number.parseInt(process.env.ROOM_TTL_DAYS) || 7) * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function sweepInactiveRooms(sockets, ttlMs = ROOM_TTL_MS) {
  const cutoff = Date.now() - ttlMs;
  for (const room of getAllRooms()) {
    if (room.lastActivityAt < cutoff) {
      const roomWs = sockets.get(room.id);
      if (roomWs) {
        for (const ws of roomWs) ws.close(1001, 'Room expired');
        sockets.delete(room.id);
      }
      clearRoomTimer(room.id);
      deleteRoom(room.id);
    }
  }
}

if (require.main === module) {
  setInterval(() => sweepInactiveRooms(roomSockets), SWEEP_INTERVAL_MS).unref();
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = {
  app,
  broadcastState,
  clearRoomTimer,
  handleConnection,
  roomSockets,
  roomTimers,
  scheduleAutoReveal,
  sweepInactiveRooms,
};
