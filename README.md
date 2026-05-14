# simple-estimation

A lightweight, self-hosted web tool for agile estimation. Supports Planning Poker and two Magic Estimation variants.

## Objectives

- Real-time collaborative estimation for distributed teams
- No external cloud dependencies — runs entirely in a single Docker container
- Minimal infrastructure: one process, one port, no database

## Features

### Planning Poker
- Facilitator creates a room and shares a link
- Participants join with a display name
- Each participant selects a Fibonacci card (1, 2, 3, 5, 8, 13, 21, ?, ∞, ☕)
- Cards stay hidden until the facilitator reveals them
- Facilitator can reset the round for the next story

### Magic Estimation — Bucket Mode
- Facilitator creates a set of items (user stories, tasks)
- Participants collaboratively drag items into size buckets (XS, S, M, L, XL)
- All moves are visible in real time

### Magic Estimation — Relative Line Mode
- Items are placed on a horizontal Fibonacci scale
- Participants move items relative to each other to establish sizing
- Outlier positions trigger discussion

### Room Management
- Each room has a type: Planning Poker, Bucket Estimation, or Relative Estimation
- Rooms are created with an optional facilitator pin
- Anyone with the pin can claim the facilitator role
- Room state is ephemeral — lost on server restart (acceptable for live sessions)

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express 5, `ws` |
| Frontend | Svelte 5 (compiled to static files, served by Express) |
| Real-time | WebSockets (single port, no Socket.io) |
| Deployment | Docker (single container, single port) |
| Rate limiting | `express-rate-limit` on HTTP endpoints |
| Pin hashing | `bcryptjs` |
| ID generation | `uuid` (rooms and items) |

No external services. No database. No cloud dependencies.

## Architecture

```
┌─────────────────────────────────────┐
│             Docker Container        │
│                                     │
│  Express (HTTP)                     │
│    ├── GET /          → Svelte SPA  │
│    └── WS upgrade     → ws server  │
│                                     │
│  In-memory room state               │
│    └── Map<roomId, RoomState>       │
└─────────────────────────────────────┘
```

The Svelte app is built at Docker image build time and served as static files. WebSocket connections share the same port as HTTP via an HTTP upgrade.

### WebSocket Message Protocol

All messages are JSON. Direction noted as C→S (client to server) or S→C (server to client).

| Message | Direction | Description |
|---|---|---|
| `join` | C→S | Join a room with a display name and optional pin |
| `claim_facilitator` | C→S | Claim facilitator role using the room pin |
| `vote` | C→S | Cast a vote (Planning Poker) |
| `add_item` | C→S | Facilitator adds an item (Magic Estimation) |
| `move_item` | C→S | Move an item to a bucket or position (Magic Estimation) |
| `reveal` | C→S | Facilitator reveals all votes |
| `reset` | C→S | Facilitator resets the round |
| `state` | S→C | Full room state broadcast to all participants |
| `error` | S→C | Error message (e.g. wrong pin) |

### Room State Shape

The `state` message sent to clients contains the sanitized room (pin hash is never sent):

```js
{
  id: string,
  type: 'planning-poker' | 'bucket' | 'relative',
  facilitatorId: string | null,
  revealed: boolean,
  participants: [{ id, name, voted: boolean, vote: string | null }],
  // vote is null until revealed; voted indicates whether a card was placed
  items: [{ id, label, position }],  // magic estimation only
}
```

## Project Structure

```
simple-estimation/
├── Dockerfile
├── docker-compose.yml
├── server/
│   ├── package.json
│   ├── index.js          # Express + ws setup
│   ├── rooms.js          # Room state management
│   ├── handlers.js       # WebSocket message handlers
│   └── sanitize.js       # Strips sensitive fields before broadcast
└── client/
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.svelte
        ├── ws.js             # WebSocket client + store
        └── lib/
            ├── JoinForm.svelte
            ├── RoomList.svelte
            ├── PlanningPoker.svelte
            ├── BucketEstimation.svelte
            ├── RelativeEstimation.svelte
            └── Card.svelte
```

## Running Locally

```bash
# Server
cd server && npm install && node index.js

# Client (separate terminal)
cd client && npm install && npm run dev
```

## Testing

There are three independent test suites.

### Server tests

Uses Node.js's built-in test runner — no framework needed.

```bash
cd server && npm test
```

### Client component tests

Vitest running against a real headless Chromium instance via Playwright. Install the browser binary once, then run tests:

```bash
cd client && npx playwright install chromium
cd client && npm test
```

### End-to-end tests

Playwright tests that drive the full running app. Build the client and start the server first:

```bash
cd client && npm run build
cd server && node index.js &
cd e2e && npx playwright install chromium && npm test
```

For an interactive Playwright UI:

```bash
cd e2e && npm run test:ui
```

## Docker

```bash
docker build -t simple-estimation .
docker run -p 3000:3000 simple-estimation
```

Or with docker-compose:

```bash
docker compose up
```
