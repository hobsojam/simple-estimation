const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const {
  upsertParticipant,
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

function isFacilitator(ws, room, message) {
  if (room.facilitatorId !== ws.participantId) {
    sendError(ws, message);
    return false;
  }
  return true;
}

function findItem(room, itemId) {
  return room.items.find(i => i.id === itemId);
}

function parseVoteValue(ws, value, requiredMessage, invalidPrefix) {
  if (value === undefined || value === null) {
    sendError(ws, requiredMessage);
    return null;
  }

  const voteStr = String(value);
  if (!VALID_VOTES.has(voteStr)) {
    sendError(ws, `${invalidPrefix}: ${voteStr}`);
    return null;
  }

  return voteStr;
}

function validateItemLabel(ws, room, label) {
  if (!label || typeof label !== 'string' || !label.trim()) {
    sendError(ws, 'Item label required');
    return null;
  }

  const trimmedLabel = label.trim();
  if (trimmedLabel.length > 200) {
    sendError(ws, 'Item label must be 200 characters or fewer');
    return null;
  }

  if (room.items.length >= 200) {
    sendError(ws, 'Room has reached the maximum number of items');
    return null;
  }

  return trimmedLabel;
}

function createItem(room, label) {
  if (room.type === 'planning-poker') {
    return { id: uuidv4(), label, status: 'pending', estimate: null };
  }

  return { id: uuidv4(), label, position: null };
}

async function ensureAccess(ws, room, data) {
  if (!room.accessPinHash || ws.isAuthorized) {
    return true;
  }

  if (!data.accessPin) {
    // Stryker disable next-line StringLiteral
    console.log(`[WS] Join failed: access PIN required`);
    sendError(ws, 'Access PIN required');
    return false;
  }

  const valid = await bcrypt.compare(String(data.accessPin), room.accessPinHash);
  if (!valid) {
    // Stryker disable next-line StringLiteral
    console.log(`[WS] Join failed: invalid access PIN`);
    sendError(ws, 'Invalid access PIN');
    return false;
  }

  // Stryker disable next-line StringLiteral
  console.log(`[WS] Join: access PIN verified for ${ws.participantId}`);
  ws.isAuthorized = true;
  return true;
}

async function verifyInitialFacilitatorPin(ws, room, data, noFacilitator, pinRequired) {
  if (!pinRequired || !noFacilitator || !data.pin) {
    return false;
  }

  const valid = await bcrypt.compare(String(data.pin), room.pinHash);
  if (!valid) {
    sendError(ws, 'Invalid PIN');
    return null;
  }

  return true;
}

async function handleJoin(ws, room, data) {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    // Stryker disable next-line StringLiteral
    console.log(`[WS] Join failed: name missing or invalid`);
    return sendError(ws, 'Name is required');
  }

  if (!(await ensureAccess(ws, room, data))) return;

  // Stryker disable next-line StringLiteral
  console.log(`[WS] Join success for ${data.name} (${ws.participantId}) in ${room.id}`);

  const noFacilitator = !room.facilitatorId;
  const pinRequired = !!room.pinHash;
  const facilitatorPinValid = await verifyInitialFacilitatorPin(ws, room, data, noFacilitator, pinRequired);
  if (facilitatorPinValid === null) return;

  const participantName = data.name.trim();
  upsertParticipant(room.id, { id: ws.participantId, name: participantName, vote: null });

  if (!noFacilitator) return;
  if (!pinRequired || facilitatorPinValid) {
    setFacilitator(room.id, ws.participantId);
  }
}

async function handleClaimFacilitator(ws, room, data) {
  if (!data.pin) return sendError(ws, 'PIN required');
  if (!room.pinHash) return sendError(ws, 'This room has no PIN');

  const valid = await bcrypt.compare(String(data.pin), room.pinHash);
  if (!valid) return sendError(ws, 'Invalid PIN');

  setFacilitator(room.id, ws.participantId);
}

function handleVote(ws, room, data) {
  if (!room.participants.some(p => p.id === ws.participantId)) {
    return sendError(ws, 'Join before voting');
  }

  const voteStr = parseVoteValue(ws, data.vote, 'Vote value required', 'Invalid vote value');
  if (voteStr === null) return;

  castVote(room.id, ws.participantId, voteStr);
}

function handleMoveItem(ws, room, data) {
  if (!data.itemId) return sendError(ws, 'itemId required');
  if (data.position === undefined) return sendError(ws, 'position required');

  moveItem(room.id, data.itemId, data.position);
}

function handleAddItem(ws, room, data) {
  if (!isFacilitator(ws, room, 'Only the facilitator can add items')) return;

  const label = validateItemLabel(ws, room, data.label);
  if (label === null) return;

  addItem(room.id, createItem(room, label));
}

function handleSelectItem(ws, room, data) {
  if (!isFacilitator(ws, room, 'Only the facilitator can select items')) return;
  if (!data.itemId) return sendError(ws, 'itemId required');

  const item = findItem(room, data.itemId);
  if (!item) return sendError(ws, 'Item not found');
  if (item.status === 'done') return sendError(ws, 'Cannot select a done item');

  selectItem(room.id, data.itemId);
}

function handleFinaliseItem(ws, room, data) {
  if (!isFacilitator(ws, room, 'Only the facilitator can finalise items')) return;
  if (!data.itemId) return sendError(ws, 'itemId required');

  const estimateStr = parseVoteValue(ws, data.estimate, 'estimate required', 'Invalid estimate value');
  if (estimateStr === null) return;

  const item = findItem(room, data.itemId);
  if (!item) return sendError(ws, 'Item not found');
  if (item.status !== 'active') return sendError(ws, 'Only the active item can be finalised');

  finaliseItem(room.id, data.itemId, estimateStr);
}

function handleRemoveItem(ws, room, data) {
  if (!isFacilitator(ws, room, 'Only the facilitator can remove items')) return;
  if (!data.itemId) return sendError(ws, 'itemId required');

  const item = findItem(room, data.itemId);
  if (!item) return sendError(ws, 'Item not found');
  if (item.status !== 'pending') return sendError(ws, 'Only pending items can be removed');

  removeItem(room.id, data.itemId);
}

function handleReveal(ws, room) {
  if (!isFacilitator(ws, room, 'Only the facilitator can reveal votes')) return;

  clearTimer(room.id);
  revealVotes(room.id);
}

function handleReset(ws, room) {
  if (!isFacilitator(ws, room, 'Only the facilitator can reset the round')) return;

  resetRound(room.id);
}

function handleStartTimer(ws, room, data) {
  if (!isFacilitator(ws, room, 'Only the facilitator can start the timer')) return;
  if (room.type !== 'planning-poker') return sendError(ws, 'Timer is only available in Planning Poker rooms');

  const seconds = Number(data.seconds);
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 300) {
    return sendError(ws, 'Timer duration must be between 5 and 300 seconds');
  }

  startTimer(room.id, seconds);
}

function handleCancelTimer(ws, room) {
  if (!isFacilitator(ws, room, 'Only the facilitator can cancel the timer')) return;

  clearTimer(room.id);
}

async function handleMessage(ws, room, data) {
  switch (data.type) {
    case 'join':
      return handleJoin(ws, room, data);
    case 'claim_facilitator':
      return handleClaimFacilitator(ws, room, data);
    case 'vote':
      return handleVote(ws, room, data);
    case 'move_item':
      return handleMoveItem(ws, room, data);
    case 'add_item':
      return handleAddItem(ws, room, data);
    case 'select_item':
      return handleSelectItem(ws, room, data);
    case 'finalise_item':
      return handleFinaliseItem(ws, room, data);
    case 'remove_item':
      return handleRemoveItem(ws, room, data);
    case 'reveal':
      return handleReveal(ws, room);
    case 'reset':
      return handleReset(ws, room);
    case 'start_timer':
      return handleStartTimer(ws, room, data);
    case 'cancel_timer':
      return handleCancelTimer(ws, room);

    default:
      return sendError(ws, `Unknown message type: ${data.type}`);
  }
}

module.exports = { handleMessage };
