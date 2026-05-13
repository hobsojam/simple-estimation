function sanitizeRoom(room) {
  return {
    id: room.id,
    type: room.type,
    facilitatorId: room.facilitatorId,
    revealed: room.revealed,
    participants: room.participants.map(p => ({
      id: p.id,
      name: p.name,
      voted: p.vote !== null,
      vote: room.revealed ? p.vote : null,
    })),
    items: room.items,
  };
}

module.exports = { sanitizeRoom };
