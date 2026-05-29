# simple-estimation — Project Context

@CLAUDE_SECURITY.md
@CLAUDE_ACCESSIBILITY.md

## Purpose

A self-hosted, real-time web tool for agile estimation. Supports Planning Poker and two Magic Estimation variants (bucket sizing, relative line sizing). Runs as a single Docker container with no external dependencies.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, `ws` |
| Frontend | Svelte 4, Vite |
| Real-time | WebSockets (native, no Socket.io) |
| Deployment | Docker (single container, single port) |
| Pin hashing | `bcryptjs` |

No database. No external services. Room state is in-memory and ephemeral.

## Project Structure

```
simple-estimation/
├── Dockerfile
├── docker-compose.yml
├── server/
│   ├── package.json        # express, ws, uuid, bcryptjs
│   ├── index.js            # Express + WebSocket server, port 3000
│   ├── rooms.js            # In-memory room state (Map)
│   └── handlers.js         # WebSocket message handlers
└── client/
    ├── package.json        # svelte, vite, @sveltejs/vite-plugin-svelte
    ├── vite.config.js      # WS proxy to :3000 in dev
    ├── index.html
    └── src/
        ├── main.js
        ├── App.svelte          # Routing: Home / Room
        ├── ws.js               # WS client + roomState / wsError stores
        └── lib/
            ├── JoinForm.svelte
            ├── PlanningPoker.svelte
            ├── BucketEstimation.svelte
            ├── RelativeEstimation.svelte
            └── Card.svelte
```

## Architecture

```
┌─────────────────────────────────────┐
│             Docker Container        │
│                                     │
│  Express (HTTP + static files)      │
│    └── WS upgrade → ws server      │
│                                     │
│  In-memory: Map<roomId, RoomState>  │
└─────────────────────────────────────┘
```

The Svelte app is compiled at Docker build time and served as static files by Express. WebSocket connections share port 3000 via HTTP upgrade.

## Room State Shape

```js
{
  id: string,                    // uuid
  type: 'planning-poker' | 'bucket' | 'relative',
  facilitatorId: string | null,
  pinHash: string | null,        // bcryptjs hash — never sent to clients
  participants: [{ id, name, vote: null | string }],
  items: [{ id, label, position: null | string }],
  revealed: boolean
}
```

When broadcasting state to clients:
- Always omit `pinHash`
- Set `vote` to `null` for all participants when `revealed` is `false`

## WebSocket Message Protocol

`docs/api.md` is the source of truth for HTTP endpoints, WebSocket messages, sanitized room state, timer state, error payloads, and close codes. If any client-visible API or protocol behavior changes, update `docs/api.md` in the same PR. Do not make protocol changes only for the web client without considering native clients.

All messages are JSON. Inbound (client → server):

| type | Payload | Notes |
|---|---|---|
| `join` | `{ name, pin? }` | First joiner with correct pin becomes facilitator |
| `claim_facilitator` | `{ pin }` | Verify with bcryptjs |
| `vote` | `{ vote }` | Fibonacci: 1 2 3 5 8 13 21 ? ∞ ☕ |
| `move_item` | `{ itemId, position }` | Bucket name or Fibonacci value |
| `add_item` | `{ label }` | Facilitator only |
| `reveal` | — | Facilitator only |
| `reset` | — | Facilitator only |
| `select_item` | `{ itemId }` | Planning Poker only; facilitator only. Sets item `active`, clears votes |
| `finalise_item` | `{ itemId, estimate }` | Planning Poker only; facilitator only. Estimate must be a valid vote value |
| `remove_item` | `{ itemId }` | Planning Poker only; facilitator only. Only `pending` items can be removed |

Outbound (server → client):

| type | Payload |
|---|---|
| `state` | Full sanitised room state |
| `error` | `{ message }` |

## Development Workflow

Run server and client in separate terminals:

```bash
# Terminal 1 — backend
cd server && npm install && node index.js

# Terminal 2 — frontend (Vite dev server with WS proxy)
cd client && npm install && npm run dev
```

Vite proxies WebSocket connections to `localhost:3000` so the dev server works against the local Node backend without CORS issues.

When changing client UI or any Svelte source, verify the production build before opening a PR:

```bash
cd client && npm run build
```

Do not commit generated static bundles. Docker and CI build them from `client/dist`; for local direct-server checks, run the server with `STATIC_DIR` pointing at `client/dist`.

## Docker

```bash
# Build and run
docker build -t simple-estimation .
docker run -p 3000:3000 simple-estimation

# Or with compose
docker compose up
```

The Dockerfile is a two-stage build:
1. `builder` stage: Node alpine, builds the Svelte client (`npm run build`)
2. `runner` stage: Node alpine, installs server prod deps only, copies built client into `./public`

Static files are served from `./public` in production. The `STATIC_DIR` env var overrides this path.

## Conventions

- Plain JavaScript throughout — no TypeScript
- No comments unless the WHY is non-obvious
- No external cloud dependencies — all runtime deps must be `npm` packages only
- Server code never sends `pinHash` to any client under any circumstance
- Server code never sends `accessPinHash` to any client under any circumstance
- All inbound WebSocket messages must be validated before acting on them (check required fields, check facilitator permissions)
- Facilitator-only actions (`reveal`, `reset`, `add_item`) must verify `ws.participantId === room.facilitatorId` server-side — never trust the client

## Dependency changes

When adding or removing npm packages, do all installs and uninstalls in one pass, then verify the lock file is clean before committing:

```bash
# Good — single pass
npm install pkg-a pkg-b && npm uninstall pkg-c

# If you've made multiple separate npm calls, regenerate the lock file:
rm package-lock.json && npm install
```

Always commit both `package.json` and `package-lock.json` together.

The client CI steps use `npm install` rather than `npm ci`. The lock file is generated on Windows (or macOS) and so does not contain Linux-specific optional packages (`@rolldown/binding-linux-x64-gnu` etc.) that `npm ci` on Linux requires to be pre-recorded. `npm install` uses the lock file for exact versions of everything it can, and resolves platform-specific optional packages for the current environment. The lock file is still worth committing — it pins the vast majority of packages to known-good versions.

If this becomes a persistent problem (more deps with platform-specific optional binaries), the fix is to switch the client to **pnpm**, which handles cross-platform lock files correctly.

## Git Workflow

- Feature work on `feat/<short-description>` branches, PRs targeting `main`
- Never commit directly to `main`
- Always include the co-author trailer in commit messages:
  ```
  Co-Authored-By: Claude Code <noreply@anthropic.com>
  ```
- Never force-push to `main`

## Shell tool selection (Windows)

This project runs on Windows with PowerShell 5.1 as the login shell.

**Decision rule — pick one tool per operation:**

| What you need | Use |
|---|---|
| `git`, `gh`, `npm`, `node`, `docker` | `Bash` tool (POSIX shell, same commands on any OS) |
| File ops: search, read, edit, write | Dedicated tools (`Grep`, `Read`, `Edit`, `Write`, `Glob`) — never `Bash` or `PowerShell` |
| Windows-only tasks (registry, COM, etc.) | `PowerShell` tool |
| Everything else | `Bash` tool first; fall back to `PowerShell` only if Bash fails |

Do **not** mix shells in a single logical operation (e.g., `cd` in Bash then use the new directory in PowerShell).

**PowerShell 5.1 specifics** (apply only when you use the `PowerShell` tool):
- Pipeline chain operators `&&` and `||` do **not** exist — use `; if ($?) { ... }` instead.
- `&&` in a Bash tool call works fine because Bash handles it.
- `gh pr create --body` does not accept a PowerShell variable containing backtick characters — write the body to a temp file and use `--body-file <path>`, then delete the file.
