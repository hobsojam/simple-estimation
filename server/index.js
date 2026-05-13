const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { createRoom, getRoom, removeParticipant } = require('./rooms');
const { handleMessage } = require('./handlers');

const PORT = process.env.PORT || 3000;
const STATIC_DIR = process.env.STATIC_DIR || './public';

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(STATIC_DIR)));

app.post('/api/rooms', async (req, res) => {
  const { type, pin } = req.body;
  const validTypes = ['planning-poker', 'bucket', 'relative'];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid room type' });
  }
  const pinHash = pin ? await bcrypt.hash(String(pin), 10) : null;
  const room = createRoom(type, pinHash);
  res.json({ roomId: room.id });
});

app.get('*', (req, res) => {
  res.sendFile(path.resolve(STATIC_DIR, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function sanitizeRoom(room) {
  return {
    id: room.id,
    type: room.type,
    facilitatorId: room.facilitatorId,
    revealed: room.revealed,
    participants: room.participants.map(p => ({
      id: p.id,
      name: p.name,
      vote: room.revealed ? p.vote : (p.vote !== null ? '?' : null),
    })),
    items: room.items,
  };
}

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

  if (!roomId) {
    ws.close(1008, 'roomId required');
    return;
  }

  let room = getRoom(roomId);
  if (!room) {
    ws.close(1008, 'Room not found');
    return;
  }

  ws.participantId = uuidv4();
  ws.roomId = roomId;

  if (!roomSockets.has(roomId)) {
    roomSockets.set(roomId, new Set());
  }
  roomSockets.get(roomId).add(ws);

  ws.on('message', async (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    room = getRoom(roomId);
    if (!room) {
      ws.close(1008, 'Room not found');
      return;
    }

    await handleMessage(ws, room, data);

    room = getRoom(roomId);
    const sockets = roomSockets.get(roomId) || new Set();
    broadcastState(room, sockets);
  });

  ws.on('close', () => {
    const sockets = roomSockets.get(roomId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        roomSockets.delete(roomId);
      }
    }
    room = getRoom(roomId);
    if (room) {
      removeParticipant(roomId, ws.participantId);
      room = getRoom(roomId);
      const remaining = roomSockets.get(roomId);
      if (remaining && remaining.size > 0) {
        broadcastState(room, remaining);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
