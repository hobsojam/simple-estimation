<script>
  import { onMount, onDestroy } from 'svelte';
  import { roomState, wsError, connect, disconnect, send } from './ws.js';
  import JoinForm from './lib/JoinForm.svelte';
  import RoomList from './lib/RoomList.svelte';
  import PlanningPoker from './lib/PlanningPoker.svelte';
  import BucketEstimation from './lib/BucketEstimation.svelte';
  import RelativeEstimation from './lib/RelativeEstimation.svelte';

  let page = 'home';
  let pendingJoin = null;
  let joinSent = false;
  let createError = null;

  function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return { roomId: params.get('room'), roomType: params.get('type') };
  }

  function setUrlParams(roomId, roomType) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    if (roomType) url.searchParams.set('type', roomType);
    window.history.pushState({}, '', url.toString());
  }

  function clearUrlParams() {
    window.history.pushState({}, '', window.location.pathname);
  }

  onMount(() => {
    const { roomId } = getUrlParams();
    if (roomId) {
      pendingJoin = { roomId };
      page = 'joining';
      connect(roomId);
    }
  });

  onDestroy(() => {
    disconnect();
  });

  async function handleCreate(event) {
    const { name, roomType, pin } = event.detail;
    createError = null;
    let roomId;
    try {
      const body = { type: roomType };
      if (pin) body.pin = pin;
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Server error: ' + res.status);
      const data = await res.json();
      roomId = data.id;
    } catch (err) {
      createError = err.message.includes('Failed to fetch')
        ? 'Could not reach the server. Is it running?'
        : err.message;
      return;
    }

    setUrlParams(roomId, roomType);
    joinSent = false;
    connect(roomId);
    pendingJoin = { name, pin };
    page = 'joining';
  }

  function handleJoin(event) {
    const { roomId, name, pin } = event.detail;
    setUrlParams(roomId, null);

    joinSent = false;
    connect(roomId);
    pendingJoin = { name, pin };
    page = 'joining';
  }

  function handleJoinById(roomId) {
    setUrlParams(roomId, null);
    joinSent = false;
    connect(roomId);
    pendingJoin = null;
    page = 'joining';
  }

  function handleLeave() {
    disconnect();
    clearUrlParams();
    page = 'home';
    pendingJoin = null;
    joinSent = false;
  }

  // Once state arrives, we are in the room. Send join message if we have pending join info.
  $: if ($roomState && !joinSent && pendingJoin) {
    joinSent = true;
    const { name, pin } = pendingJoin;
    if (name) {
      send({ type: 'join', name, ...(pin ? { pin } : {}) });
    }
    page = 'room';
  }

  // If we arrive via URL without a name (direct link), show the name prompt after connecting
  $: if ($roomState && page === 'joining' && !pendingJoin?.name) {
    page = 'room-enter-name';
  }

  let directName = '';
  let directPin = '';

  function handleDirectJoin() {
    if (!directName.trim()) return;
    joinSent = true;
    send({ type: 'join', name: directName.trim(), ...(directPin.trim() ? { pin: directPin.trim() } : {}) });
    page = 'room';
  }

  $: roomType = $roomState?.type;
</script>

<div class="app">
  {#if page === 'home'}
    <JoinForm on:create={handleCreate} on:join={handleJoin} />
    {#if createError}
      <div class="create-error">{createError}</div>
    {/if}
    <RoomList on:join={(e) => handleJoinById(e.detail.roomId)} />

  {:else if page === 'joining'}
    <div class="loading">Connecting…</div>
    {#if $wsError}
      <div class="error-center">{$wsError}</div>
    {/if}

  {:else if page === 'room-enter-name'}
    <div class="name-prompt">
      <h2>Join Room</h2>
      <label>
        Your name
        <input type="text" bind:value={directName} placeholder="Enter your name" />
      </label>
      <label>
        Facilitator PIN (optional)
        <input type="text" bind:value={directPin} placeholder="Enter PIN if you have one" />
      </label>
      <button class="primary" on:click={handleDirectJoin} disabled={!directName.trim()}>Join</button>
    </div>

  {:else if page === 'room'}
    <div class="room-wrapper">
      <nav class="top-bar">
        <button class="leave-btn" on:click={handleLeave}>Leave Room</button>
        {#if $wsError}
          <span class="ws-error">{$wsError}</span>
        {/if}
      </nav>

      {#if $roomState}
        {#if roomType === 'planning-poker'}
          <PlanningPoker />
        {:else if roomType === 'bucket'}
          <BucketEstimation />
        {:else if roomType === 'relative'}
          <RelativeEstimation />
        {:else}
          <div class="loading">Loading room…</div>
        {/if}
      {:else}
        <div class="loading">Loading room…</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f8fafc;
    color: #1e293b;
  }

  .app {
    min-height: 100vh;
  }

  .create-error {
    max-width: 420px;
    margin: -64px auto 0;
    padding: 10px 14px;
    background: #fee2e2;
    border: 1px solid #f87171;
    color: #b91c1c;
    border-radius: 4px;
    font-size: 0.9rem;
    text-align: center;
  }

  .loading {
    text-align: center;
    padding: 80px 20px;
    color: #6b7280;
    font-size: 1.1rem;
  }

  .error-center {
    text-align: center;
    color: #b91c1c;
    padding: 12px 20px;
  }

  .name-prompt {
    max-width: 380px;
    margin: 80px auto;
    padding: 32px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .name-prompt h2 {
    margin: 0;
  }

  .name-prompt label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.9rem;
    font-weight: 500;
    color: #444;
  }

  .name-prompt input {
    padding: 8px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  .primary {
    padding: 10px;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  .primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .room-wrapper {
    min-height: 100vh;
  }

  .top-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 24px;
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
  }

  .leave-btn {
    padding: 6px 12px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 0.9rem;
    color: #374151;
  }

  .leave-btn:hover {
    background: #f9fafb;
  }

  .ws-error {
    font-size: 0.85rem;
    color: #b91c1c;
  }
</style>
