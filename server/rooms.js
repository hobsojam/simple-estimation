const { v4: uuidv4 } = require('uuid');

const rooms = new Map();

function createRoom(type, pinHash, name) {
  const room = {
    id: uuidv4(),
    type,
    name: name || null,
    facilitatorId: null,
    pinHash: pinHash || null,
    participants: [],
    items: [],
    revealed: false,
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

function resetRound(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.revealed = false;
  for (const p of room.participants) {
    p.vote = null;
  }
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
  revealVotes,
  resetRound,
  deleteRoom,
  clearRooms,
};
