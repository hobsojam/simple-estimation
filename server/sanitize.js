function sanitizeRoom(room, isAuthorized = true) {
  if (!isAuthorized) {
    return {
      id: room.id,
      type: room.type,
      name: room.name,
      accessRequired: true,
      pinProtected: room.pinHash !== null,
      facilitatorId: null,
      revealed: false,
      participants: [],
      items: [],
    };
  }

  return {
    id: room.id,
    type: room.type,
    name: room.name,
    pinProtected: room.pinHash !== null,
    facilitatorId: room.facilitatorId,
    revealed: room.revealed,
    timer: room.timer || { endsAt: null, durationSeconds: null },
    participants: room.participants.map(p => ({
      id: p.id,
      name: p.name,
      voted: p.vote !== null,
      vote: room.revealed ? p.vote : null,
    })),
    items: room.items.map(i => ({ ...i })),
  };
}

module.exports = { sanitizeRoom };
