# Security Guidelines for Claude

These rules apply whenever you are working in this repository. Follow them without exception unless the user explicitly overrides a specific rule with a clear reason.

## WebSocket input handling

- **Never trust inbound WebSocket message content.** Every message must be validated before acting on it: check that required fields are present, are the expected type, and fall within allowed values.
- **Never use `eval` or `new Function` on any client-supplied string.**
- Facilitator-only actions (`reveal`, `reset`, `add_item`) must be enforced server-side by comparing `ws.participantId === room.facilitatorId`. A client claiming to be the facilitator is not sufficient.
- Vote values must be validated against the allowed set: `['1','2','3','5','8','13','21','?','∞','☕']`. Reject anything else with an `error` message.
- Item labels and participant names must be length-limited (max 200 chars) and stripped of leading/trailing whitespace. Never interpolate them into shell commands or file paths.

## Pin handling

- Facilitator pins must be hashed with `bcryptjs` before being stored in room state. Never store or log a plaintext pin.
- The `pinHash` field must **never** appear in any outbound WebSocket message or HTTP response. The sanitised state broadcast must explicitly omit it.
- Use `bcryptjs.compare()` for pin verification — never compare hashes directly with `===`.

## Room state

- Room state exists only in the server process's memory. It is never written to disk, logged, or sent to any external service.
- When a room is empty (all participants disconnected), clean it up from the in-memory map to avoid unbounded memory growth.
- Do not expose internal room IDs or participant IDs in error messages sent to other participants.

## File system

- The server only reads from `./public` (static files) and `node_modules`. It must not read from or write to any path derived from client input.
- `server/public` and `client/dist` are generated static build outputs. Do not commit or force-add them; Docker and CI recreate them from source.
- Do not use `__dirname` concatenation with user-supplied strings to build file paths. Use `path.join` with validated, fixed path segments only.
- Never serve files outside of the `STATIC_DIR` directory. The static file middleware must be locked to that directory.

## HTTP

- The `POST /api/rooms` endpoint must validate the `type` field against the allowed set: `['planning-poker', 'bucket', 'relative']`. Reject unknown types with a 400.
- Do not reflect user-supplied strings back in HTTP response bodies without sanitising them first (XSS prevention for any future HTML responses).
- Do not log request bodies — they may contain pins.

## Dependencies

- Do not add new `npm` dependencies without a clear reason tied to an existing feature requirement.
- Do not pin dependencies to versions with known CVEs. Check `npm audit` before adding a new package.
- The production Docker image installs server deps with `npm ci --omit=dev`. Never include dev dependencies in the production image.

## Docker

- The Docker image must run as a non-root user. Add a `USER node` directive in the `runner` stage.
- Do not copy `.env` files, secrets, or credential files into the Docker image.
- The `.dockerignore` must exclude `node_modules`, `.git`, and any local config files.

## Git

- **Never force-push to `main`.**
- **Never commit secrets, tokens, or credentials** of any kind.
- The `.gitignore` must exclude `.env` and `*.local` files.
- Do not amend published commits on shared branches without user confirmation.

## What to do if uncertain

If an action could be destructive, irreversible, or exposes user data (pins, participant names, room contents), **stop and ask the user for confirmation** before proceeding. The cost of pausing is always lower than the cost of a security incident.
