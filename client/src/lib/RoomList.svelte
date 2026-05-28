<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';

  const dispatch = createEventDispatcher();

  const ROOM_TYPE_LABELS = {
    'planning-poker': 'Planning Poker',
    'bucket': 'Bucket Estimation',
    'relative': 'Relative Estimation',
  };

  let rooms = [];
  let loading = false;
  let fetchError = null;

  // Per-room inline state: map of roomId -> { mode: null | 'confirm' | 'pin', pin: '', error: null, deleting: false }
  let roomState = {};

  function getRoomUiState(roomId) {
    if (!roomState[roomId]) {
      roomState[roomId] = { mode: null, pin: '', error: null, deleting: false };
    }
    return roomState[roomId];
  }

  async function fetchRooms() {
    loading = true;
    fetchError = null;
    try {
      const res = await fetch('/api/rooms');
      if (!res.ok) throw new Error('Failed to fetch rooms');
      rooms = await res.json();
      // Clear stale inline states for rooms no longer present
      const ids = new Set(rooms.map(r => r.id));
      for (const id of Object.keys(roomState)) {
        if (!ids.has(id)) delete roomState[id];
      }
      roomState = { ...roomState };
    } catch (err) {
      fetchError = 'Could not load rooms.';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchRooms();
  });

  function handleJoin(roomId) {
    dispatch('join', { roomId });
  }

  async function startDelete(room) {
    const s = getRoomUiState(room.id);
    if (room.pinProtected) {
      s.mode = 'pin';
      s.pin = '';
      s.error = null;
    } else {
      s.mode = 'confirm';
      s.error = null;
    }
    roomState = { ...roomState };
    await tick();
    document.querySelector(`[data-room-id="${room.id}"] .inline-confirm input, [data-room-id="${room.id}"] .inline-confirm button`)?.focus();
  }

  function cancelDelete(roomId) {
    const s = getRoomUiState(roomId);
    s.mode = null;
    s.pin = '';
    s.error = null;
    roomState = { ...roomState };
    document.querySelector(`[data-room-id="${roomId}"] .delete-btn`)?.focus();
  }

  async function confirmDelete(roomId) {
    const s = getRoomUiState(roomId);
    s.deleting = true;
    s.error = null;
    roomState = { ...roomState };

    try {
      const opts = { method: 'DELETE' };
      if (s.mode === 'pin' && s.pin) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify({ pin: s.pin });
      }
      const res = await fetch(`/api/rooms/${roomId}`, opts);
      if (res.status === 403) {
        s.error = 'Incorrect PIN';
        s.deleting = false;
        roomState = { ...roomState };
        return;
      }
      if (!res.ok && res.status !== 204) {
        s.error = 'Delete failed. Please try again.';
        s.deleting = false;
        roomState = { ...roomState };
        return;
      }
      // Success: remove from local list immediately
      rooms = rooms.filter(r => r.id !== roomId);
      delete roomState[roomId];
      roomState = { ...roomState };
      // Also refresh from server
      fetchRooms();
    } catch (err) {
      s.error = 'Delete failed. Please try again.';
      s.deleting = false;
      roomState = { ...roomState };
    }
  }
</script>

<svelte:window on:click={(e) => {
  // Dismiss inline states when clicking outside a room row
  if (!e.target.closest('.room-row')) {
    let changed = false;
    for (const id of Object.keys(roomState)) {
      if (roomState[id].mode !== null) {
        roomState[id] = { ...roomState[id], mode: null, pin: '', error: null };
        changed = true;
      }
    }
    if (changed) roomState = { ...roomState };
  }
}} />

<section class="room-list-section">
  <div class="room-list-header">
    <h2>Active Rooms</h2>
    <button class="refresh-btn" on:click={fetchRooms} disabled={loading}>
      {loading ? 'Loading…' : 'Refresh'}
    </button>
  </div>

  {#if fetchError}
    <p class="fetch-error">{fetchError}</p>
  {:else if loading && rooms.length === 0}
    <p class="empty-msg">Loading…</p>
  {:else if rooms.length === 0}
    <p class="empty-msg">No active rooms</p>
  {:else}
    <ul class="room-rows">
      {#each rooms as room (room.id)}
        {@const ui = roomState[room.id] ?? { mode: null, pin: '', error: null, deleting: false }}
        <li class="room-row" data-room-id={room.id}>
          <div class="room-main">
            <div class="room-info">
              <span class="room-primary">{room.name ?? ROOM_TYPE_LABELS[room.type] ?? room.type}</span>
              {#if room.name}
                <span class="room-type">{ROOM_TYPE_LABELS[room.type] ?? room.type}</span>
              {/if}
              <span class="room-id">{room.id.slice(0, 8)}</span>
              <span class="participant-count">{room.participantCount} participant{room.participantCount === 1 ? '' : 's'}</span>
              {#if room.pinProtected}
                <span class="pin-badge" title="Facilitator PIN protected">Admin</span>
              {/if}
              {#if room.accessPinProtected}
                <span class="access-pin-badge" title="Access PIN protected">Protected</span>
              {/if}
            </div>
            <div class="room-actions">
              <button class="join-btn" on:click|stopPropagation={() => handleJoin(room.id)}>
                Join
              </button>
              {#if ui.mode === null}
                <button class="delete-btn" on:click|stopPropagation={() => startDelete(room)}>
                  Delete
                </button>
              {/if}
            </div>
          </div>

          {#if ui.mode === 'confirm'}
            <div class="inline-confirm">
              <span class="confirm-msg">Are you sure?</span>
              <button class="confirm-yes-btn" on:click={() => confirmDelete(room.id)} disabled={ui.deleting}>
                {ui.deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button class="confirm-cancel-btn" on:click={() => cancelDelete(room.id)}>
                Cancel
              </button>
              {#if ui.error}
                <span class="inline-error">{ui.error}</span>
              {/if}
            </div>
          {:else if ui.mode === 'pin'}
            <div class="inline-confirm">
              <input
                class="pin-input"
                type="text"
                placeholder="Enter PIN"
                value={roomState[room.id].pin}
                on:input={(e) => {
                  roomState[room.id].pin = e.target.value;
                  roomState = { ...roomState };
                }}
              />
              <button
                class="confirm-yes-btn"
                on:click={() => confirmDelete(room.id)}
                disabled={ui.deleting || !ui.pin.trim()}
              >
                {ui.deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button class="confirm-cancel-btn" on:click={() => cancelDelete(room.id)}>
                Cancel
              </button>
              {#if ui.error}
                <span class="inline-error">{ui.error}</span>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .room-list-section {
    width: min(420px, calc(100% - 32px));
    margin: 24px auto 0;
  }

  .room-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .room-list-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #1e293b;
  }

  .refresh-btn {
    padding: 5px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #fff;
    font-size: 0.85rem;
    color: #374151;
    cursor: pointer;
    font-family: inherit;
  }

  .refresh-btn:hover:not(:disabled) {
    background: #f9fafb;
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .empty-msg {
    text-align: center;
    color: #4b5563;
    font-size: 0.95rem;
    padding: 20px 0;
    margin: 0;
  }

  .fetch-error {
    text-align: center;
    color: #b91c1c;
    font-size: 0.9rem;
    padding: 12px 0;
    margin: 0;
  }

  .room-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .room-row {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 12px 16px;
  }

  .room-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .room-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .room-primary {
    font-weight: 600;
    font-size: 0.95rem;
    color: #1e293b;
    overflow-wrap: anywhere;
  }

  .room-type {
    font-size: 0.85rem;
    color: #4b5563;
  }

  .room-id {
    font-size: 0.8rem;
    color: #4b5563;
    font-family: monospace;
    background: #f1f5f9;
    padding: 2px 5px;
    border-radius: 3px;
  }

  .participant-count {
    font-size: 0.85rem;
    color: #4b5563;
  }

  .pin-badge {
    font-size: 0.72rem;
    font-weight: 700;
    color: #92400e;
    background: #fef3c7;
    border: 1px solid #fde68a;
    border-radius: 4px;
    padding: 1px 5px;
    letter-spacing: 0.04em;
  }

  .access-pin-badge {
    font-size: 0.72rem;
    font-weight: 700;
    color: #1e40af;
    background: #dbeafe;
    border: 1px solid #bfdbfe;
    border-radius: 4px;
    padding: 1px 5px;
    letter-spacing: 0.04em;
  }

  .room-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .join-btn {
    padding: 6px 14px;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }

  .join-btn:hover {
    background: #1d4ed8;
  }

  .delete-btn {
    padding: 6px 12px;
    background: #fff;
    color: #b91c1c;
    border: 1px solid #fca5a5;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
    font-family: inherit;
  }

  .delete-btn:hover {
    background: #fff5f5;
  }

  .inline-confirm {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #f1f5f9;
    flex-wrap: wrap;
  }

  .confirm-msg {
    font-size: 0.9rem;
    color: #374151;
  }

  .confirm-yes-btn {
    padding: 5px 12px;
    background: #fff;
    color: #b91c1c;
    border: 1px solid #fca5a5;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    font-family: inherit;
  }

  .confirm-yes-btn:hover:not(:disabled) {
    background: #fff5f5;
  }

  .confirm-yes-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .confirm-cancel-btn {
    padding: 5px 12px;
    background: #fff;
    color: #374151;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    font-family: inherit;
  }

  .confirm-cancel-btn:hover {
    background: #f9fafb;
  }

  .pin-input {
    padding: 5px 9px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
    font-family: inherit;
    width: 110px;
  }

  .pin-input:focus {
    outline: 2px solid #2563eb;
    border-color: transparent;
  }

  .inline-error {
    font-size: 0.85rem;
    color: #b91c1c;
    width: 100%;
  }

  @media (max-width: 640px) {
    .room-list-section {
      margin-top: 18px;
    }

    .room-row {
      padding: 12px;
    }

    .room-main {
      align-items: stretch;
      flex-direction: column;
    }

    .room-actions {
      width: 100%;
    }

    .join-btn,
    .delete-btn,
    .confirm-yes-btn,
    .confirm-cancel-btn,
    .refresh-btn {
      min-height: 44px;
    }

    .join-btn,
    .delete-btn {
      flex: 1;
    }

    .inline-confirm {
      align-items: stretch;
    }

    .pin-input {
      width: 100%;
      min-height: 44px;
    }
  }
</style>
