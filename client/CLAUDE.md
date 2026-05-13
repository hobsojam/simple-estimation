# Client — Agent Context

Read the project README first. It is the source of truth for objectives, features, and the WebSocket protocol. This file adds implementation detail specific to the Svelte frontend.

## Stack

- Svelte 5 + Vite 8
- No UI framework — plain CSS only
- Native browser WebSocket API (wrapped in `src/ws.js`)

In dev, run `npm run dev`. Vite proxies `/ws` to `localhost:3000` so the dev server works against the local Node backend without CORS issues (see `vite.config.js`).

## File Map

```
src/
  ws.js                    # WebSocket client + Svelte stores
  App.svelte               # Page-state router
  lib/
    JoinForm.svelte         # Home page: create or join a room
    Card.svelte             # Reusable Fibonacci card button
    PlanningPoker.svelte    # Planning poker room view
    BucketEstimation.svelte # Bucket sizing room view
    RelativeEstimation.svelte # Relative line sizing room view
```

## WebSocket Client (`ws.js`)

All real-time communication goes through `ws.js`. Do not open WebSocket connections anywhere else.

**Exports:**
- `connect(roomId)` — opens the connection, initialises `myId`
- `send(message)` — sends JSON; no-ops if socket not open
- `disconnect()` — intentional close, clears sessionStorage participantId
- `roomState` — writable store; holds the current room state object or `null`
- `wsError` — writable store; holds the latest error string or `null`
- `myId` — read-only store (subscribe-only); holds the local participant's UUID

**Participant identity:**  
The participant UUID is generated once via `crypto.randomUUID()` and persisted in `sessionStorage` under the key `participantId`. It survives page refreshes but not new tabs. It is sent as a query param on the WS URL: `?roomId=<id>&participantId=<uuid>`. On `disconnect()` the sessionStorage entry is cleared.

**State store shape:**  
`roomState` holds the unwrapped room object — `msg.room` from the server's `{ type: 'state', room: {...} }` envelope. Components access it directly: `$roomState.facilitatorId`, `$roomState.participants`, etc.

**Reconnect:**  
Exponential backoff on unexpected close: 1 s, 2 s, 4 s. After 3 retries, sets `wsError` and gives up.

## App.svelte — Page State Router

No routing library. A `page` variable drives the view:

| Value | What's shown |
|---|---|
| `home` | `JoinForm` |
| `joining` | Spinner while WS connects |
| `room-enter-name` | Name prompt (arrived via direct link, no pending join info) |
| `room` | The correct room component based on `$roomState.type` |

**Create flow:** `JoinForm` dispatches `create` → `App` POSTs to `/api/rooms`, gets back `{ id }`, sets URL params, calls `connect(id)`, transitions to `joining`. Once `$roomState` arrives, sends `join` message and transitions to `room`.

**Join flow:** `JoinForm` dispatches `join` → `App` calls `connect(roomId)`, transitions to `joining`. Same reactive trigger sends `join` and transitions to `room`.

**Direct link flow:** On `onMount`, if URL has `?room=<id>`, connect immediately. When state arrives and there's no pending name, transition to `room-enter-name`. User submits name → send `join`, go to `room`.

## Room Components

All three room components:
- Import `{ roomState, send, myId }` from `../ws.js`
- Derive `isFacilitator` as `$roomState.facilitatorId === $myId`
- Are driven entirely by the `$roomState` store — they do not hold local copies of server state
- Send messages via `send({ type: '...', ...payload })`

### Card.svelte

Reusable card button. Props: `value` (string), `selected` (bool), `disabled` (bool). Dispatches a `select` event with the value. Used in `PlanningPoker.svelte`.

### PlanningPoker.svelte

- `CARDS` constant defines the allowed vote values: `['1','2','3','5','8','13','21','?','∞','☕']`
- Shows participant list with voted/waiting indicators (never exposes vote value until `revealed`)
- Outlier highlighting: any vote differing from the majority (by count) gets `.outlier` styling
- Facilitator controls: Reveal (disabled until ≥1 vote cast), Reset
- Claim facilitator: shown when `$roomState.facilitatorId === null`; prompts for PIN inline

### BucketEstimation.svelte

- Columns: Unsized, XS, S, M, L, XL
- HTML5 drag-and-drop: `dragstart` stores `itemId`, `drop` sends `move_item` with bucket name as `position` (null for Unsized)
- Facilitator add-item bar sends `add_item`
- All participants can move items — no facilitator check needed

### RelativeEstimation.svelte

- Sidebar: items where `position === null`
- Main area: seven columns labelled 1, 2, 3, 5, 8, 13, 21
- Same drag-and-drop pattern as BucketEstimation; `position` is the Fibonacci column label as a string
- All participants can move items

## Adding a New Room Type

1. Create `src/lib/<NewType>.svelte` following the same store-driven pattern
2. Add the type to the selector in `JoinForm.svelte`
3. Add the `{:else if roomType === '<new>'}` branch in `App.svelte`
4. Add the type to the `validTypes` array in `server/index.js`
5. Update the README

## Protocol Reminder

Inbound messages (server → client) that `ws.js` handles:
- `{ type: 'state', room: { id, type, facilitatorId, participants, items, revealed } }` → stored as `$roomState` (unwrapped to `room`)
- `{ type: 'error', message }` → stored in `$wsError`

For all outbound message types, see the protocol table in the project README.
