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

function addParticipant(roomId, participant) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.participants.push(participant);
}

function removeParticipant(roomId, participantId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.participants = room.participants.filter(p => p.id !== participantId);
  if (room.facilitatorId === participantId) {
    room.facilitatorId = room.participants.length > 0 ? room.participants[0].id : null;
  }
}

function setFacilitator(roomId, participantId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.facilitatorId = participantId;
}

function castVote(roomId, participantId, vote) {
  const room = rooms.get(roomId);
  if (!room) return;
  const participant = room.participants.find(p => p.id === participantId);
  if (participant) {
    participant.vote = vote;
  }
}

function moveItem(roomId, itemId, position) {
  const room = rooms.get(roomId);
  if (!room) return;
  const item = room.items.find(i => i.id === itemId);
  if (item) {
    item.position = position;
  }
}

function addItem(roomId, item) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.items.push(item);
}

function revealVotes(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.revealed = true;
}

function startTimer(roomId, durationSeconds) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.timer = { endsAt: Date.now() + durationSeconds * 1000, durationSeconds };
}

function clearTimer(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.timer = { endsAt: null, durationSeconds: null };
}

function resetRound(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.revealed = false;
  room.timer = { endsAt: null, durationSeconds: null };
  for (const p of room.participants) {
    p.vote = null;
  }
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
}

function finaliseItem(roomId, itemId, estimate) {
  const room = rooms.get(roomId);
  if (!room) return;
  const item = room.items.find(i => i.id === itemId);
  if (item) {
    item.status = 'done';
    item.estimate = estimate;
  }
}

function removeItem(roomId, itemId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.items = room.items.filter(i => i.id !== itemId);
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
  addParticipant,
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
