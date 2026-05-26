[![Quality gate](https://sonarcloud.io/api/project_badges/quality_gate?project=hobsojam_simple-estimation)](https://sonarcloud.io/summary/new_code?id=hobsojam_simple-estimation)

# simple-estimation

A lightweight, self-hosted web tool for agile estimation. Supports Planning Poker and two Magic Estimation variants.

## Demo

A public demo is available at <https://simple-estimation.onrender.com/>.

This instance is for demonstration only. We make no promise that it will be available, retained, secure, or suitable for real work. Because it runs on a free hosting plan, data will be deleted after a few minutes of inactivity. Do not use it for actual estimation sessions, and do not enter real data, including personally identifying information such as real names or real project items.

## Objectives

- Real-time collaborative estimation for distributed teams
- No external cloud dependencies — runs entirely in a single Docker container
- Minimal infrastructure: one process, one port, no database

## Features

### Planning Poker
- Facilitator creates a room (with an optional name) and shares a link
- Participants join with a display name
- Each participant selects a Fibonacci card (1, 2, 3, 5, 8, 13, 21, ?, ∞, ☕)
- Cards stay hidden until the facilitator reveals them
- **Backlog**: facilitator adds named stories to a queue; one item is active at a time
- After reveal, the facilitator accepts the majority vote (or picks a custom value) to finalise the item
- Finalised items appear in a Done history with their agreed estimate
- **CSV export**: download a two-column spreadsheet (`Item, Estimate`) for all done items
- Facilitator can start a countdown timer (5–300 seconds); votes auto-reveal when it expires
- Facilitator can reset the round for re-voting on the same story

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
| `add_item` | C→S | Facilitator adds a named item to the backlog |
| `select_item` | C→S | Facilitator sets a backlog item active; resets current votes (Planning Poker) |
| `finalise_item` | C→S | Facilitator records the agreed estimate for the active item (Planning Poker) |
| `remove_item` | C→S | Facilitator removes a pending item from the backlog (Planning Poker) |
| `move_item` | C→S | Move an item to a bucket or position (Magic Estimation) |
| `reveal` | C→S | Facilitator reveals all votes |
| `reset` | C→S | Facilitator resets the round |
| `start_timer` | C→S | Facilitator starts a countdown timer (5–300 s); votes auto-reveal on expiry (Planning Poker) |
| `cancel_timer` | C→S | Facilitator cancels the running countdown (Planning Poker) |
| `state` | S→C | Full room state broadcast to all participants |
| `error` | S→C | Error message (e.g. wrong pin) |

### Room State Shape

The `state` message sent to clients contains the sanitized room (pin hash is never sent):

```js
{
  id: string,
  type: 'planning-poker' | 'bucket' | 'relative',
  name: string | null,
  facilitatorId: string | null,
  revealed: boolean,
  timer: { endsAt: number | null, durationSeconds: number | null },
  // endsAt is a Unix ms timestamp; null when no timer is running
  participants: [{ id, name, voted: boolean, vote: string | null }],
  // vote is null until revealed; voted indicates whether a card was placed

  // Planning Poker items (status-based backlog):
  items: [{ id, label, status: 'pending' | 'active' | 'done', estimate: string | null }],

  // Magic Estimation items (position-based):
  // items: [{ id, label, position: string | null }],
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
            ├── poker-utils.js        # getMajorityVote, buildCSV (shared helpers)
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

If you change client UI and plan to run the Express server without the Vite dev server, rebuild the client and point `STATIC_DIR` at `client/dist`. Do not commit generated static bundles; Docker and CI should create them from source.

## Versioning

The UI shows the application version from `client/package.json` as a discreet `vX.Y.Z` badge. When cutting a release or publishing a user-visible change set, bump both `client/package.json` and `server/package.json` together and commit the matching lock-file updates. Generated static bundles should be built by Docker or CI, not committed.

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

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP and WebSocket listen port |
| `STATIC_DIR` | `./public` | Directory to serve static files from |
| `ROOM_TTL_DAYS` | `7` | Days of inactivity before a room is automatically deleted |
| `DEMO_MODE` | `false` | Set to `true` to show the public demo warning banner |

Rooms are swept hourly. A room's inactivity timer resets on any vote, item move, add, reveal, or round reset. Participants joining or leaving does not count as activity.

## Docker

```bash
docker build -t simple-estimation .
docker run -p 3000:3000 simple-estimation

# Override the TTL
docker run -p 3000:3000 -e ROOM_TTL_DAYS=14 simple-estimation
```

Or with docker-compose:

```bash
docker compose up
```
