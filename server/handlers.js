const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const {
  addParticipant,
  setFacilitator,
  castVote,
  moveItem,
  addItem,
  selectItem,
  finaliseItem,
  removeItem,
  revealVotes,
  resetRound,
} = require('./rooms');

const VALID_VOTES = new Set(['1', '2', '3', '5', '8', '13', '21', '?', '∞', '☕']);

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
        console.log(`[WS] Join failed: name missing or invalid`);
        return sendError(ws, 'Name is required');
      }

      // 1. Check Access PIN if room is protected and ws not yet authorized
      if (room.accessPinHash && !ws.isAuthorized) {
        if (!data.accessPin) {
          console.log(`[WS] Join failed: access PIN required`);
          return sendError(ws, 'Access PIN required');
        }
        const valid = await bcrypt.compare(String(data.accessPin), room.accessPinHash);
        if (!valid) {
          console.log(`[WS] Join failed: invalid access PIN`);
          return sendError(ws, 'Invalid access PIN');
        }
        console.log(`[WS] Join: access PIN verified for ${ws.participantId}`);
        ws.isAuthorized = true;
      }

      console.log(`[WS] Join success for ${data.name} (${ws.participantId}) in ${room.id}`);

      const noFacilitator = !room.facilitatorId;
      const pinRequired = !!room.pinHash;

      if (pinRequired && noFacilitator && data.pin) {
        const valid = await bcrypt.compare(String(data.pin), room.pinHash);
        if (!valid) return sendError(ws, 'Invalid PIN');
      }

      const participant = { id: ws.participantId, name: data.name.trim(), vote: null };
      addParticipant(room.id, participant);

      if (noFacilitator) {
        if (!pinRequired) {
          setFacilitator(room.id, ws.participantId);
        } else if (data.pin) {
          const valid = await bcrypt.compare(String(data.pin), room.pinHash);
          if (valid) setFacilitator(room.id, ws.participantId);
        }
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
      const voteStr = String(data.vote);
      if (!VALID_VOTES.has(voteStr)) {
        return sendError(ws, `Invalid vote value: ${voteStr}`);
      }
      castVote(room.id, ws.participantId, voteStr);
      break;
    }

    case 'move_item': {
      if (!data.itemId) return sendError(ws, 'itemId required');
      if (data.position === undefined) return sendError(ws, 'position required');
      moveItem(room.id, data.itemId, data.position);
      break;
    }

    case 'add_item': {
      if (room.facilitatorId !== ws.participantId) return sendError(ws, 'Only the facilitator can add items');
      if (!data.label || typeof data.label !== 'string' || !data.label.trim()) {
        return sendError(ws, 'Item label required');
      }
      if (data.label.trim().length > 200) {
        return sendError(ws, 'Item label must be 200 characters or fewer');
      }
      const newItem = room.type === 'planning-poker'
        ? { id: uuidv4(), label: data.label.trim(), status: 'pending', estimate: null }
        : { id: uuidv4(), label: data.label.trim(), position: null };
      addItem(room.id, newItem);
      break;
    }

    case 'select_item': {
      if (room.facilitatorId !== ws.participantId) return sendError(ws, 'Only the facilitator can select items');
      if (!data.itemId) return sendError(ws, 'itemId required');
      const selectTarget = room.items.find(i => i.id === data.itemId);
      if (!selectTarget) return sendError(ws, 'Item not found');
      if (selectTarget.status === 'done') return sendError(ws, 'Cannot select a done item');
      selectItem(room.id, data.itemId);
      break;
    }

    case 'finalise_item': {
      if (room.facilitatorId !== ws.participantId) return sendError(ws, 'Only the facilitator can finalise items');
      if (!data.itemId) return sendError(ws, 'itemId required');
      if (data.estimate === undefined || data.estimate === null) return sendError(ws, 'estimate required');
      const estimateStr = String(data.estimate);
      if (!VALID_VOTES.has(estimateStr)) return sendError(ws, `Invalid estimate value: ${estimateStr}`);
      const finaliseTarget = room.items.find(i => i.id === data.itemId);
      if (!finaliseTarget) return sendError(ws, 'Item not found');
      if (finaliseTarget.status !== 'active') return sendError(ws, 'Only the active item can be finalised');
      finaliseItem(room.id, data.itemId, estimateStr);
      break;
    }

    case 'remove_item': {
      if (room.facilitatorId !== ws.participantId) return sendError(ws, 'Only the facilitator can remove items');
      if (!data.itemId) return sendError(ws, 'itemId required');
      const removeTarget = room.items.find(i => i.id === data.itemId);
      if (!removeTarget) return sendError(ws, 'Item not found');
      if (removeTarget.status !== 'pending') return sendError(ws, 'Only pending items can be removed');
      removeItem(room.id, data.itemId);
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

    default:
      sendError(ws, `Unknown message type: ${data.type}`);
  }
}

module.exports = { handleMessage };
