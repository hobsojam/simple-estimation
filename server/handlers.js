const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const {
  addParticipant,
  setFacilitator,
  castVote,
  moveItem,
  revealVotes,
  resetRound,
} = require('./rooms');

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sendError(ws, message) {
  send(ws, { type: 'error', message });
}

async function handleMessage(ws, room, data) {
  switch (data.type) {
    case 'join': {
      if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        return sendError(ws, 'Name is required');
      }

      if (room.pinHash && !room.facilitatorId) {
        if (!data.pin) return sendError(ws, 'PIN required to become facilitator');
        const valid = await bcrypt.compare(String(data.pin), room.pinHash);
        if (!valid) return sendError(ws, 'Invalid PIN');
      }

      const participant = { id: ws.participantId, name: data.name.trim(), vote: null };
      addParticipant(room.id, participant);

      if (!room.facilitatorId && (!room.pinHash || (data.pin && await bcrypt.compare(String(data.pin), room.pinHash)))) {
        setFacilitator(room.id, ws.participantId);
      }

      break;
    }

    case 'claim_facilitator': {
      if (!data.pin) return sendError(ws, 'PIN required');
      if (!room.pinHash) return sendError(ws, 'This room has no PIN');
      const valid = await bcrypt.compare(String(data.pin), room.pinHash);
      if (!valid) return sendError(ws, 'Invalid PIN');
      setFacilitator(room.id, ws.participantId);
      break;
    }

    case 'vote': {
      if (data.vote === undefined || data.vote === null) return sendError(ws, 'Vote value required');
      castVote(room.id, ws.participantId, String(data.vote));
      break;
    }

    case 'move_item': {
      if (!data.itemId) return sendError(ws, 'itemId required');
      if (data.position === undefined) return sendError(ws, 'position required');
      moveItem(room.id, data.itemId, data.position);
      break;
    }

    case 'reveal': {
      if (room.facilitatorId !== ws.participantId) return sendError(ws, 'Only the facilitator can reveal votes');
      revealVotes(room.id);
      break;
    }

    case 'reset': {
      if (room.facilitatorId !== ws.participantId) return sendError(ws, 'Only the facilitator can reset the round');
      resetRound(room.id);
      break;
    }

    case 'add_item': {
      if (room.facilitatorId !== ws.participantId) return sendError(ws, 'Only the facilitator can add items');
      if (!data.label || typeof data.label !== 'string' || !data.label.trim()) {
        return sendError(ws, 'Item label required');
      }
      room.items.push({ id: uuidv4(), label: data.label.trim(), position: null });
      break;
    }

    default:
      sendError(ws, `Unknown message type: ${data.type}`);
  }
}

module.exports = { handleMessage };
