function sanitizeRoom(room, isAuthorized = true) {
  if (!isAuthorized) {
    return {
      id: room.id,
      type: room.type,
      name: room.name,
      accessRequired: true,
    };
  }

  return {
    id: room.id,
    type: room.type,
    name: room.name,
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
