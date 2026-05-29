# Simple Estimation API

This document describes the HTTP and WebSocket contract used by the web client.
Native clients can use the same contract to create, list, join, and operate
rooms against an existing Simple Estimation backend.

## Base URLs

Use the deployed application origin as the API base.

- HTTP: `https://example.com`
- WebSocket: `wss://example.com/ws`

For local development, use `http://localhost:3000` and `ws://localhost:3000/ws`.
Production native clients should use HTTPS and WSS.

All request and response bodies are JSON unless noted otherwise.

## Shared Limits

- Room types: `planning-poker`, `bucket`, `relative`
- Vote values: `1`, `2`, `3`, `5`, `8`, `13`, `21`, `?`, `∞`, `☕`
- PIN and access PIN length: 64 characters or fewer
- Room names, participant names, and item labels: non-empty after trimming and
  tag stripping, 200 characters or fewer
- Maximum participants per room: 100
- Maximum items per room: 200
- Planning Poker timer duration: integer from 5 to 300 seconds

## HTTP Endpoints

### GET `/health`

Returns service health.

Response `200`:

```json
{
  "status": "ok"
}
```

### GET `/api/config`

Returns public server configuration.

Response `200`:

```json
{
  "demoMode": false
}
```

### POST `/api/rooms`

Creates a room.

Request:

```json
{
  "type": "planning-poker",
  "name": "Sprint planning",
  "pin": "optional-facilitator-pin",
  "accessPin": "optional-room-access-pin"
}
```

Fields:

- `type` is required.
- `name` is optional. Empty or missing names are stored as `null`.
- `pin` is optional. When present, facilitator-only WebSocket actions require
  facilitator ownership.
- `accessPin` is optional. When present, joining over WebSocket requires the
  access PIN.

Response `200`:

```json
{
  "id": "0f48bd1c-b892-4b62-97ea-6fbe4df7198d"
}
```

Error responses:

- `400` `{ "error": "Invalid room type" }`
- `400` `{ "error": "PIN must be 64 characters or fewer" }`
- `400` `{ "error": "Access PIN must be 64 characters or fewer" }`
- `400` `{ "error": "Room name must include text" }`
- `400` `{ "error": "Room name must be 200 characters or fewer" }`
- `429` `{ "error": "Too many rooms created, please try again later" }`

### GET `/api/rooms`

Lists active rooms.

Response `200`:

```json
[
  {
    "id": "0f48bd1c-b892-4b62-97ea-6fbe4df7198d",
    "type": "planning-poker",
    "name": "Sprint planning",
    "participantCount": 3,
    "pinProtected": true,
    "accessPinProtected": false
  }
]
```

### DELETE `/api/rooms/:id`

Deletes a room. If the room has a facilitator PIN, the request must include the
PIN. Deleting a room closes its active WebSocket connections.

Request for PIN-protected rooms:

```json
{
  "pin": "facilitator-pin"
}
```

Responses:

- `204` with no body on success
- `403` `{ "error": "PIN required" }`
- `403` `{ "error": "Incorrect PIN" }`
- `404` `{ "error": "Room not found" }`

## WebSocket Connection

Connect to:

```text
wss://example.com/ws?roomId=<room-id>&participantId=<participant-id>
```

Query parameters:

- `roomId` is required.
- `participantId` is optional. If omitted, the server assigns one for the
  connection. Native clients should generate and persist a UUID per local user
  session, then reuse it across reconnects to preserve facilitator ownership and
  participant identity.

The server immediately sends a `state` message after a successful connection.
If the room has an access PIN, the initial state is redacted until the client
sends a successful `join` message with `accessPin`.

Close codes:

| Code | Meaning |
|---|---|
| `4001` | Rate limit exceeded |
| `4002` | Room ID required |
| `4003` | Room not found |
| `4004` | Room is full |
| `4999` | Unknown WebSocket error |

The server also rate-limits each WebSocket connection to 30 messages per second.

## WebSocket Messages

All WebSocket messages are JSON objects with a `type` field.

Room-type applicability in this document describes how clients should use the
protocol. Some older server handlers are more permissive than the intended
contract; the Android readiness plan tracks tightening those validations.

### Outbound: `state`

Sent by the server after connection and after valid state-changing messages.

```json
{
  "type": "state",
  "room": {
    "id": "0f48bd1c-b892-4b62-97ea-6fbe4df7198d",
    "type": "planning-poker",
    "name": "Sprint planning",
    "pinProtected": true,
    "facilitatorId": "participant-1",
    "revealed": false,
    "timer": {
      "endsAt": null,
      "durationSeconds": null
    },
    "participants": [
      {
        "id": "participant-1",
        "name": "Alice",
        "voted": true,
        "vote": null
      }
    ],
    "items": [
      {
        "id": "item-1",
        "label": "Checkout flow",
        "status": "active",
        "estimate": null
      }
    ]
  }
}
```

Security rules:

- `pinHash` and `accessPinHash` are never sent to clients.
- Participant `vote` is `null` until `revealed` is `true`.
- For access-protected rooms, unauthorized connections receive a redacted room:

```json
{
  "type": "state",
  "room": {
    "id": "0f48bd1c-b892-4b62-97ea-6fbe4df7198d",
    "type": "planning-poker",
    "name": "Sprint planning",
    "accessRequired": true,
    "pinProtected": true,
    "facilitatorId": null,
    "revealed": false,
    "participants": [],
    "items": []
  }
}
```

### Outbound: `error`

Sent when a WebSocket message is invalid or not allowed.

```json
{
  "type": "error",
  "message": "Only the facilitator can reveal votes"
}
```

Error messages are human-readable strings and are not currently versioned error
codes.

## Inbound Messages

### `join`

Joins or updates the current participant.

```json
{
  "type": "join",
  "name": "Alice",
  "pin": "optional-facilitator-pin",
  "accessPin": "optional-access-pin"
}
```

Behavior:

- `name` is required.
- `accessPin` is required only when the room is access-protected and the socket
  is not already authorized.
- If the room has no current facilitator and has no facilitator PIN, the joining
  participant becomes facilitator.
- If the room has no current facilitator and `pin` matches the facilitator PIN,
  the joining participant becomes facilitator.

### `claim_facilitator`

Claims facilitator ownership in a PIN-protected room.

```json
{
  "type": "claim_facilitator",
  "pin": "facilitator-pin"
}
```

### `vote`

Casts a Planning Poker vote for the current participant.

```json
{
  "type": "vote",
  "vote": "5"
}
```

The participant must have joined the room. The vote must be one of the shared
vote values.

### `move_item`

Moves an item to a bucket or relative-estimation position.

```json
{
  "type": "move_item",
  "itemId": "item-1",
  "position": "M"
}
```

Behavior:

- The participant must have joined the room.
- `itemId` is required.
- `position` is required and may be `null`.
- Bucket rooms usually use `null`, `XS`, `S`, `M`, `L`, `XL`.
- Relative rooms usually use `null`, `1`, `2`, `3`, `5`, `8`, `13`, `21`.

### `add_item`

Adds an item. Intended to be facilitator-only.

```json
{
  "type": "add_item",
  "label": "Checkout flow"
}
```

Planning Poker items are created with:

```json
{
  "id": "item-1",
  "label": "Checkout flow",
  "status": "pending",
  "estimate": null
}
```

Bucket and relative-estimation items are created with:

```json
{
  "id": "item-1",
  "label": "Checkout flow",
  "position": null
}
```

### `select_item`

Selects the active Planning Poker item and clears current votes. Intended to be
facilitator-only.

```json
{
  "type": "select_item",
  "itemId": "item-1"
}
```

Rules:

- Planning Poker only.
- `itemId` is required.
- Done items cannot be selected.

### `finalise_item`

Finalizes the active Planning Poker item estimate. Intended to be
facilitator-only.

```json
{
  "type": "finalise_item",
  "itemId": "item-1",
  "estimate": "5"
}
```

Rules:

- Planning Poker only.
- `itemId` is required.
- `estimate` must be one of the shared vote values.
- Only the active item can be finalized.

### `remove_item`

Removes a pending Planning Poker item. Intended to be facilitator-only.

```json
{
  "type": "remove_item",
  "itemId": "item-1"
}
```

Rules:

- Planning Poker only.
- `itemId` is required.
- Only pending items can be removed.

### `reveal`

Reveals votes. Intended to be facilitator-only.

```json
{
  "type": "reveal"
}
```

Also clears any active Planning Poker timer.

### `reset`

Resets the current Planning Poker round. Intended to be facilitator-only.

```json
{
  "type": "reset"
}
```

Behavior:

- Sets `revealed` to `false`.
- Clears the timer.
- Clears participant votes.

### `start_timer`

Starts a Planning Poker timer. Intended to be facilitator-only.

```json
{
  "type": "start_timer",
  "seconds": 60
}
```

Rules:

- Planning Poker only.
- `seconds` must be an integer from 5 to 300.
- When the timer expires, the server clears the timer and reveals votes.

Current timer caveat: clients calculate countdowns from their local clock using
`timer.endsAt`. A future protocol change should include server time in timer
state so native and web clients can compensate for clock skew.

### `cancel_timer`

Cancels a Planning Poker timer. Intended to be facilitator-only.

```json
{
  "type": "cancel_timer"
}
```

## Native Client Notes

- Persist a generated `participantId` for the current room/session and include
  it on reconnect.
- Always send `join` after connecting. For access-protected rooms, include
  `accessPin` in the first `join`.
- Treat `state.room` as the source of truth. The server broadcasts the full
  sanitized room after accepted state changes.
- Do not infer facilitator status from local UI state. Compare the persisted
  `participantId` with `room.facilitatorId`.
- Only show facilitator controls when the local `participantId` matches
  `room.facilitatorId`, even for rooms without a facilitator PIN.
- Handle WebSocket close codes separately from in-band `error` messages.
- Preserve unknown fields in local models where practical. The protocol is not
  formally versioned yet.
