# Server — Agent Context

Read the project README first. It is the source of truth for objectives, features, and the WebSocket protocol. This file adds implementation detail specific to the server layer.

## Entry Points

- `index.js` — Express app + WebSocket server. Touch this only for routing, middleware, or connection lifecycle changes.
- `rooms.js` — All room state mutations. Every change to room state must go through a function exported from here. Never mutate room state directly from `index.js` or `handlers.js`.
- `handlers.js` — One `switch` per inbound message type. New message types go here.

## Room State

The canonical shape (as stored in memory):

```js
{
  id: string,                    // uuid
  type: 'planning-poker' | 'bucket' | 'relative',
  facilitatorId: string | null,
  pinHash: string | null,        // bcryptjs hash — never leave this codebase
  participants: [{ id, name, vote: null | string }],
  items: [{ id, label, position: null | string }],
  revealed: boolean
}
```

`rooms.js` stores all rooms in a module-level `Map<roomId, room>`. Objects are mutated in place — there is no immutability pattern here. `getRoom()` returns a live reference.

## State Broadcast

After every message handler runs, `index.js` fetches the updated room and broadcasts to all sockets in the room via `broadcastState()`. Handlers do not broadcast themselves — they only mutate state.

`sanitizeRoom()` in `index.js` is the only place room state is serialised for clients:
- Always omit `pinHash`
- Set every participant's `vote` to `null` when `revealed === false`

The wire format is: `{ type: 'state', room: { ...sanitizedFields } }`

The client unwraps this to `msg.room` before storing — do not change this envelope without updating `client/src/ws.js`.

## WebSocket Identity

Each socket gets a `ws.participantId` assigned on connection from the `participantId` query param (fallback: new uuid). This is the authoritative identity for that connection — all facilitator checks compare against it:

```js
if (room.facilitatorId !== ws.participantId) return sendError(ws, '...');
```

Never trust a participant ID sent in the message body.

## Facilitator Logic

- A room with a `pinHash` requires the correct PIN before the first joiner can become facilitator.
- Subsequent participants can claim facilitator via `claim_facilitator` + PIN at any time.
- If the facilitator disconnects, `removeParticipant()` auto-assigns to the first remaining participant.
- Facilitator-only actions: `reveal`, `reset`, `add_item`.
- `move_item` is intentionally open to all participants — magic estimation is collaborative.

## Vote Validation

Valid vote values are defined as a `Set` in `handlers.js`:
```js
const VALID_VOTES = new Set(['1', '2', '3', '5', '8', '13', '21', '?', '∞', '☕']);
```
Reject anything not in this set with an `error` message. Do not silently discard.

## Adding a New Message Type

1. Add a `case` to the `switch` in `handlers.js`
2. If it mutates room state, add the mutation function to `rooms.js` and export it
3. Update the protocol table in the project README and in `CLAUDE.md` (root)
4. Facilitator-only actions must check `room.facilitatorId !== ws.participantId`

## HTTP API

`POST /api/rooms` — the only HTTP mutation endpoint. Returns `{ id }` (not `{ roomId }`). Validates `type` against the allowed set before creating.

All other routes serve the SPA: `GET *` returns `index.html`.

## Environment Variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP + WS listen port |
| `STATIC_DIR` | `./public` | Directory to serve static files from |

In development, `STATIC_DIR` defaults to `./public` which won't exist — run the Vite dev server separately and let it proxy to this process.

## Security Rules

See `CLAUDE_SECURITY.md` in the project root. Key points for this layer:
- Never send `pinHash` to any client
- Validate all inbound message fields before acting
- Facilitator checks are server-side only — never trust client-supplied role claims
