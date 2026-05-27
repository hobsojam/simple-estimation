const { v4: uuidv4 } = require('uuid');

const rooms = new Map();

function createRoom(type, pinHash, name, accessPinHash) {
  const room = {
    id: uuidv4(),
    type,
    name: name || null,
    facilitatorId: null,
    pinHash: pinHash || null,
    accessPinHash: accessPinHash || null,
    participants: [],
    items: [],
    revealed: false,
    timer: { endsAt: null, durationSeconds: null },
    lastActivityAt: Date.now(),
  };
  rooms.set(room.id, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function getAllRooms() {
  return Array.from(rooms.values());
}

function markActivity(room) {
  room.lastActivityAt = Date.now();
}

function upsertParticipant(roomId, participant) {
  const room = rooms.get(roomId);
  if (!room) return;
  const existing = room.participants.find(p => p.id === participant.id);
  if (existing) {
    existing.name = participant.name;
    markActivity(room);
    return;
  }
  room.participants.push(participant);
  markActivity(room);
}

function removeParticipant(roomId, participantId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.participants = room.participants.filter(p => p.id !== participantId);
  if (room.facilitatorId === participantId) {
    room.facilitatorId = room.pinHash === null && room.participants.length > 0
      ? room.participants[0].id
      : null;
  }
}

function setFacilitator(roomId, participantId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.facilitatorId = participantId;
  markActivity(room);
}

function castVote(roomId, participantId, vote) {
  const room = rooms.get(roomId);
  if (!room) return;
  const participant = room.participants.find(p => p.id === participantId);
  if (participant) {
    participant.vote = vote;
    markActivity(room);
  }
}

function moveItem(roomId, itemId, position) {
  const room = rooms.get(roomId);
  if (!room) return;
  const item = room.items.find(i => i.id === itemId);
  if (item) {
    item.position = position;
    markActivity(room);
  }
}

function addItem(roomId, item) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.items.push(item);
  markActivity(room);
}

function revealVotes(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.revealed = true;
  markActivity(room);
}

function startTimer(roomId, durationSeconds) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.timer = { endsAt: Date.now() + durationSeconds * 1000, durationSeconds };
  markActivity(room);
}

function clearTimer(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.timer = { endsAt: null, durationSeconds: null };
  markActivity(room);
}

function resetRound(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.revealed = false;
  room.timer = { endsAt: null, durationSeconds: null };
  for (const p of room.participants) {
    p.vote = null;
  }
  markActivity(room);
}

function selectItem(roomId, itemId) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const item of room.items) {
    if (item.status === 'active') item.status = 'pending';
  }
  const item = room.items.find(i => i.id === itemId);
  if (item) item.status = 'active';
  for (const p of room.participants) p.vote = null;
  room.revealed = false;
  markActivity(room);
}

function finaliseItem(roomId, itemId, estimate) {
  const room = rooms.get(roomId);
  if (!room) return;
  const item = room.items.find(i => i.id === itemId);
  if (item) {
    item.status = 'done';
    item.estimate = estimate;
    markActivity(room);
  }
}

function removeItem(roomId, itemId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const originalLength = room.items.length;
  room.items = room.items.filter(i => i.id !== itemId);
  if (room.items.length !== originalLength) markActivity(room);
}

function deleteRoom(roomId) {
  rooms.delete(roomId);
}

function clearRooms() {
  rooms.clear();
}

module.exports = {
  createRoom,
  getRoom,
  getAllRooms,
  upsertParticipant,
  removeParticipant,
  setFacilitator,
  castVote,
  moveItem,
  addItem,
  selectItem,
  finaliseItem,
  removeItem,
  revealVotes,
  resetRound,
  startTimer,
  clearTimer,
  deleteRoom,
  clearRooms,
};
