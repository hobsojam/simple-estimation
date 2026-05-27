<script>
  import { onMount, onDestroy } from 'svelte';
  import { roomState, wsError, connect, disconnect, send } from './ws.js';
  import { WEBSOCKET_ERRORS } from '../../shared/errors.json';
  import JoinForm from './lib/JoinForm.svelte';
  import RoomList from './lib/RoomList.svelte';
  import PlanningPoker from './lib/PlanningPoker.svelte';
  import BucketEstimation from './lib/BucketEstimation.svelte';
  import RelativeEstimation from './lib/RelativeEstimation.svelte';
  import clientPackage from '../package.json';

  const FATAL_WS_MESSAGES = new Set([
    WEBSOCKET_ERRORS.ROOM_ID_REQUIRED.description,
    WEBSOCKET_ERRORS.ROOM_NOT_FOUND.description,
    WEBSOCKET_ERRORS.ROOM_FULL.description,
    WEBSOCKET_ERRORS.RATE_LIMIT_EXCEEDED.description,
    'Connection lost. Please refresh the page.',
  ]);

  let page = 'home';
  let pendingJoin = null;
  let joinSent = false;
  let createError = null;
  let demoMode = false;
  const appVersion = clientPackage.version;

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

  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const config = await res.json();
        demoMode = config.demoMode === true;
      }
    } catch {
      demoMode = false;
    }
  }

  onMount(() => {
    loadConfig();
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

  async function handleCreate({ name, roomType, pin, accessPin, roomName }) {
    createError = null;
    let roomId;
    try {
      const body = { type: roomType };
      if (pin) body.pin = pin;
      if (accessPin) body.accessPin = accessPin;
      if (roomName) body.name = roomName;
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
    pendingJoin = { name, pin, accessPin };
    page = 'joining';
  }

  function handleJoin({ roomId, name, pin, accessPin }) {
    setUrlParams(roomId, null);

    joinSent = false;
    connect(roomId);
    pendingJoin = { name, pin, accessPin };
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
  $: if ($roomState && !joinSent && pendingJoin?.name) {
    if ($roomState.accessRequired && !pendingJoin.accessPin) {
      directName = pendingJoin.name;
      if (pendingJoin.pin) directPin = pendingJoin.pin;
      page = 'room-enter-name';
    } else {
      joinSent = true;
      const { name, pin, accessPin } = pendingJoin;
      send({
        type: 'join',
        name,
        ...(pin ? { pin } : {}),
        ...(accessPin ? { accessPin } : {})
      });
      page = 'room';
    }
  }

  // If we arrive via URL without a name (direct link), show the name prompt after connecting
  $: if ($roomState && page === 'joining' && !pendingJoin?.name) {
    page = 'room-enter-name';
  }

  let directName = '';
  let directPin = '';
  let directAccessPin = '';

  function handleDirectJoin() {
    if (!directName.trim()) return;
    joinSent = true;
    send({
      type: 'join',
      name: directName.trim(),
      ...(directAccessPin.trim() ? { accessPin: directAccessPin.trim() } : {}),
      ...(directPin.trim() ? { pin: directPin.trim() } : {}),
    });
    page = 'room';
  }

  $: if ($wsError && FATAL_WS_MESSAGES.has($wsError) && page === 'room') {
    if (pendingJoin?.name) {
      directName = pendingJoin.name;
      directPin = pendingJoin.pin || '';
    }
    joinSent = false;
    pendingJoin = null;
    page = 'room-enter-name';
  }

  $: roomType = $roomState?.type;

  $: pageTitle = page === 'room' && $roomState
    ? `${$roomState.name ?? 'Room'} · Simple Estimation`
    : 'Simple Estimation';
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="app">
  <div class="version-badge" aria-label={`Application version ${appVersion}`}>v{appVersion}</div>

  {#if demoMode}
    <div class="demo-banner" role="status">
      Demo only. Data will be deleted after a few minutes of inactivity on the free hosting plan. Do not enter real names or real project items.
    </div>
  {/if}

  {#if page === 'home'}
    <JoinForm oncreate={handleCreate} onjoin={handleJoin} />
    {#if createError}
      <div class="create-error" role="alert">{createError}</div>
    {/if}
    <RoomList on:join={(e) => handleJoinById(e.detail.roomId)} />

  {:else if page === 'joining'}
    <div class="loading">Connecting…</div>
    {#if $wsError}
      <div class="error-center" role="alert">{$wsError}</div>
    {/if}

  {:else if page === 'room-enter-name'}
    <div class="name-prompt">
      <h2>Join Room</h2>
      {#if $wsError}
        <div class="error-msg" role="alert">{$wsError}</div>
      {/if}
      <label>
        Your name
        <input type="text" bind:value={directName} placeholder="Enter your name" on:keydown={(e) => e.key === 'Enter' && handleDirectJoin()} />
      </label>
      {#if $roomState?.accessRequired}
        <label>
          Access PIN
          <input type="text" bind:value={directAccessPin} placeholder="Enter access PIN" />
        </label>
      {/if}
      <label>
        Facilitator PIN (optional)
        <input type="text" bind:value={directPin} placeholder="Enter PIN if you have one" />
      </label>
      <div class="prompt-actions">
        <button class="secondary" on:click={handleLeave}>Cancel</button>
        <button class="primary" on:click={handleDirectJoin} disabled={!directName.trim()}>Join</button>
      </div>
    </div>

  {:else if page === 'room'}
    <div class="room-wrapper">
      <nav class="top-bar">
        <button class="leave-btn" on:click={handleLeave}>Leave Room</button>
        {#if $roomState?.name}
          <span class="room-name">{$roomState.name}</span>
        {/if}
        {#if $wsError}
          <span class="ws-error" role="alert">{$wsError}</span>
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

  .version-badge {
    position: fixed;
    right: 12px;
    bottom: 10px;
    z-index: 10;
    color: #64748b;
    background: rgba(248, 250, 252, 0.86);
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 0.72rem;
    line-height: 1.4;
    pointer-events: none;
  }

  .demo-banner {
    padding: 10px 24px;
    background: #fef3c7;
    border-bottom: 1px solid #f59e0b;
    color: #713f12;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: center;
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

  .error-msg {
    padding: 8px 12px;
    background: #fee2e2;
    border: 1px solid #f87171;
    color: #b91c1c;
    border-radius: 4px;
    font-size: 0.85rem;
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

  .prompt-actions {
    display: flex;
    gap: 8px;
  }

  .prompt-actions .primary,
  .prompt-actions .secondary {
    flex: 1;
  }

  .secondary {
    padding: 10px;
    background: #fff;
    color: #374151;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  .secondary:hover {
    background: #f9fafb;
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

  .room-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: #1e293b;
  }

  .ws-error {
    font-size: 0.85rem;
    color: #b91c1c;
  }
</style>
