const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { validateShortText } = require('./validate');
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
  return false;
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
  const result = validateShortText(label);
  if (!result.ok && result.reason === 'required') {
    sendError(ws, 'Item label required');
    return null;
  }
  if (!result.ok) {
    sendError(ws, 'Item label must be 200 characters or fewer');
    return null;
  }

  if (room.items.length >= 200) {
    sendError(ws, 'Room has reached the maximum number of items');
    return null;
  }

  return result.value;
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
  const participantName = validateShortText(data.name);
  if (!participantName.ok && participantName.reason === 'required') {
    // Stryker disable next-line StringLiteral
    console.log(`[WS] Join failed: name missing or invalid`);
    return sendError(ws, 'Name is required');
  }
  if (!participantName.ok) {
    // Stryker disable next-line StringLiteral
    console.log(`[WS] Join failed: name too long`);
    return sendError(ws, 'Name must be 200 characters or fewer');
  }

  if (!(await ensureAccess(ws, room, data))) return false;

  // Stryker disable next-line StringLiteral
  console.log(`[WS] Join success for ${participantName.value} (${ws.participantId}) in ${room.id}`);

  const noFacilitator = !room.facilitatorId;
  const pinRequired = !!room.pinHash;
  const facilitatorPinValid = await verifyInitialFacilitatorPin(ws, room, data, noFacilitator, pinRequired);
  if (facilitatorPinValid === null) return false;
  upsertParticipant(room.id, { id: ws.participantId, name: participantName.value, vote: null });

  if (!noFacilitator) return true;
  if (!pinRequired || facilitatorPinValid) {
    setFacilitator(room.id, ws.participantId);
  }
  return true;
}

async function handleClaimFacilitator(ws, room, data) {
  if (!data.pin) return sendError(ws, 'PIN required');
  if (!room.pinHash) return sendError(ws, 'This room has no PIN');

  const valid = await bcrypt.compare(String(data.pin), room.pinHash);
  if (!valid) return sendError(ws, 'Invalid PIN');

  setFacilitator(room.id, ws.participantId);
  return true;
}

function handleVote(ws, room, data) {
  if (!room.participants.some(p => p.id === ws.participantId)) {
    return sendError(ws, 'Join before voting');
  }

  const voteStr = parseVoteValue(ws, data.vote, 'Vote value required', 'Invalid vote value');
  if (voteStr === null) return false;

  castVote(room.id, ws.participantId, voteStr);
  return true;
}

function handleMoveItem(ws, room, data) {
  if (!room.participants.some(p => p.id === ws.participantId)) {
    return sendError(ws, 'Join before moving items');
  }
  if (!data.itemId) return sendError(ws, 'itemId required');
  if (data.position === undefined) return sendError(ws, 'position required');

  moveItem(room.id, data.itemId, data.position);
  return true;
}

function handleAddItem(ws, room, data) {
  if (!isFacilitator(ws, room, 'Only the facilitator can add items')) return false;

  const label = validateItemLabel(ws, room, data.label);
  if (label === null) return false;

  addItem(room.id, createItem(room, label));
  return true;
}

function handleSelectItem(ws, room, data) {
  if (!isFacilitator(ws, room, 'Only the facilitator can select items')) return false;
  if (!data.itemId) return sendError(ws, 'itemId required');

  const item = findItem(room, data.itemId);
  if (!item) return sendError(ws, 'Item not found');
  if (item.status === 'done') return sendError(ws, 'Cannot select a done item');

  selectItem(room.id, data.itemId);
  return true;
}

function handleFinaliseItem(ws, room, data) {
  if (!isFacilitator(ws, room, 'Only the facilitator can finalise items')) return false;
  if (!data.itemId) return sendError(ws, 'itemId required');

  const estimateStr = parseVoteValue(ws, data.estimate, 'estimate required', 'Invalid estimate value');
  if (estimateStr === null) return false;

  const item = findItem(room, data.itemId);
  if (!item) return sendError(ws, 'Item not found');
  if (item.status !== 'active') return sendError(ws, 'Only the active item can be finalised');

  finaliseItem(room.id, data.itemId, estimateStr);
  return true;
}

function handleRemoveItem(ws, room, data) {
  if (!isFacilitator(ws, room, 'Only the facilitator can remove items')) return false;
  if (!data.itemId) return sendError(ws, 'itemId required');

  const item = findItem(room, data.itemId);
  if (!item) return sendError(ws, 'Item not found');
  if (item.status !== 'pending') return sendError(ws, 'Only pending items can be removed');

  removeItem(room.id, data.itemId);
  return true;
}

function handleReveal(ws, room) {
  if (!isFacilitator(ws, room, 'Only the facilitator can reveal votes')) return false;

  clearTimer(room.id);
  revealVotes(room.id);
  return true;
}

function handleReset(ws, room) {
  if (!isFacilitator(ws, room, 'Only the facilitator can reset the round')) return false;

  resetRound(room.id);
  return true;
}

function handleStartTimer(ws, room, data) {
  if (!isFacilitator(ws, room, 'Only the facilitator can start the timer')) return false;
  if (room.type !== 'planning-poker') return sendError(ws, 'Timer is only available in Planning Poker rooms');

  const seconds = Number(data.seconds);
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 300) {
    return sendError(ws, 'Timer duration must be between 5 and 300 seconds');
  }

  startTimer(room.id, seconds);
  return true;
}

function handleCancelTimer(ws, room) {
  if (!isFacilitator(ws, room, 'Only the facilitator can cancel the timer')) return false;

  clearTimer(room.id);
  return true;
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
