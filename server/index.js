const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { createRoom, getRoom, getAllRooms, removeParticipant, deleteRoom } = require('./rooms');
const { handleMessage } = require('./handlers');
const { sanitizeRoom } = require('./sanitize');

const PORT = process.env.PORT || 3000;
const STATIC_DIR = process.env.STATIC_DIR || './public';

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(STATIC_DIR)));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const createRoomLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
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
  const { type, pin } = req.body;
  const validTypes = ['planning-poker', 'bucket', 'relative'];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid room type' });
  }
  const pinHash = pin ? await bcrypt.hash(String(pin), 10) : null;
  const room = createRoom(type, pinHash);
  res.json({ id: room.id });
});

app.get('/api/rooms', (req, res) => {
  const rooms = getAllRooms();
  res.json(rooms.map(room => ({
    id: room.id,
    type: room.type,
    participantCount: room.participants.length,
    pinProtected: room.pinHash !== null,
  })));
});

app.delete('/api/rooms/:id', async (req, res) => {
  const room = getRoom(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (room.pinHash !== null) {
    const { pin } = req.body;
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

  deleteRoom(room.id);
  res.status(204).end();
});

app.get('/{*path}', staticFallbackLimiter, (req, res) => {
  res.sendFile(path.resolve(STATIC_DIR, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcastState(room, sockets) {
  const state = JSON.stringify({ type: 'state', room: sanitizeRoom(room) });
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      ws.send(state);
    }
  }
}

const roomSockets = new Map();

wss.on('connection', (ws, req) => {
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

  ws.participantId = participantId || uuidv4();
  ws.roomId = roomId;

  if (!roomSockets.has(roomId)) {
    roomSockets.set(roomId, new Set());
  }
  roomSockets.get(roomId).add(ws);

  ws.send(JSON.stringify({ type: 'state', room: sanitizeRoom(room) }));

  ws.on('message', async (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    const currentRoom = getRoom(roomId);
    if (!currentRoom) {
      ws.close(1008, 'Room not found');
      return;
    }

    await handleMessage(ws, currentRoom, data);

    const updatedRoom = getRoom(roomId);
    const sockets = roomSockets.get(roomId) || new Set();
    broadcastState(updatedRoom, sockets);
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
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = { app };
