<script>
  import { onDestroy } from 'svelte';
  import { roomState, send, wsError, myId } from '../ws.js';
  import Card from './Card.svelte';
  import { getMajorityVote, buildCSV } from './poker-utils.js';

  const CARDS = ['1', '2', '3', '5', '8', '13', '21', '?', '∞', '☕'];

  let selectedCard = null;
  let claimPin = '';
  let showClaimPin = false;
  let newItemLabel = '';
  let finaliseEstimate = '';
  let trackedActiveId = null;
  let wasRevealed = false;
  let timerDuration = 60;
  let remaining = null;
  let timerId = null;
  let trackedEndsAt = null;
  let timerServerNow = null;
  let timerReceivedAt = null;

  $: state = $roomState;
  $: isAdmin = state && (state.pinProtected === false || ($myId && state.facilitatorId === $myId));
  $: hasVotes = state && state.participants.some(p => p.voted);
  $: activeItem = state ? (state.items.find(i => i.status === 'active') ?? null) : null;
  $: pendingItems = state ? state.items.filter(i => i.status === 'pending') : [];
  $: doneItems = state ? state.items.filter(i => i.status === 'done') : [];

  // Reset selected card when the active item changes (new item selected by facilitator)
  $: {
    const newId = activeItem?.id ?? null;
    if (newId !== trackedActiveId) {
      trackedActiveId = newId;
      selectedCard = null;
    }
  }

  // Pre-fill finalise estimate with majority when votes are first revealed
  $: {
    if (state?.revealed && !wasRevealed && activeItem) {
      finaliseEstimate = getMajorityVote(state.participants) ?? '';
    }
    wasRevealed = !!state?.revealed;
  }

  function tickTimer() {
    const elapsed = Date.now() - timerReceivedAt;
    const estimatedServerNow = timerServerNow + elapsed;
    remaining = Math.max(0, Math.ceil((trackedEndsAt - estimatedServerNow) / 1000));
    if (remaining <= 0) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  // Sync client-side countdown with server timer state
  $: {
    const endsAt = state?.timer?.endsAt ?? null;
    const serverNow = state?.timer?.serverNow ?? Date.now();
    if (endsAt !== trackedEndsAt || serverNow !== timerServerNow) {
      trackedEndsAt = endsAt;
      timerServerNow = serverNow;
      timerReceivedAt = Date.now();
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      if (endsAt !== null) {
        tickTimer();
        timerId = setInterval(tickTimer, 250);
      } else {
        remaining = null;
      }
    }
  }

  onDestroy(() => {
    if (timerId) clearInterval(timerId);
  });

  function castVote(card) {
    selectedCard = card;
    send({ type: 'vote', vote: card });
  }

  function reveal() {
    send({ type: 'reveal' });
  }

  function reset() {
    selectedCard = null;
    send({ type: 'reset' });
  }

  function claimFacilitator() {
    send({ type: 'claim_facilitator', pin: claimPin });
    claimPin = '';
    showClaimPin = false;
  }

  function addItem() {
    const label = newItemLabel.trim();
    if (!label) return;
    send({ type: 'add_item', label });
    newItemLabel = '';
  }

  function selectItem(itemId) {
    send({ type: 'select_item', itemId });
  }

  function finalise() {
    if (!activeItem || !finaliseEstimate) return;
    send({ type: 'finalise_item', itemId: activeItem.id, estimate: finaliseEstimate });
    finaliseEstimate = '';
  }

  function removeItem(itemId) {
    send({ type: 'remove_item', itemId });
  }

  function startTimer() {
    send({ type: 'start_timer', seconds: timerDuration });
  }

  function cancelTimer() {
    send({ type: 'cancel_timer' });
  }

  function downloadCSV() {
    const blob = new Blob([buildCSV(doneItems)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estimation-${state.id.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
</script>

{#if state}
  <div class="poker-room">
    <div class="header">
      <h2>Planning Poker</h2>
      <div class="header-right">
        <span class="room-id">Room: {state.id}</span>
        {#if doneItems.length > 0}
          <button class="csv-btn" on:click={downloadCSV}>Download CSV</button>
        {/if}
      </div>
    </div>

    {#if $wsError}
      <div class="error" role="alert">{$wsError}</div>
    {/if}

    {#if activeItem}
      <div class="active-banner" aria-live="polite" aria-atomic="true">
        <span class="active-label">Estimating:</span>
        <strong>{activeItem.label}</strong>
      </div>
    {/if}

    <div class="layout">
      <aside class="sidebar">
        <h3>Participants</h3>
        <ul class="participant-list">
          {#each state.participants as p (p.id)}
            <li class="participant" class:voted={p.voted}>
              <span class="name">{p.name}</span>
              {#if p.id === state.facilitatorId}
                <span class="badge">facilitator</span>
              {/if}
              <span class="vote-indicator">
                {#if state.revealed && p.vote !== null}
                  <strong>{p.vote}</strong>
                {:else if p.voted}
                  ✓
                {:else}
                  …
                {/if}
              </span>
            </li>
          {/each}
        </ul>

        {#if state.pinProtected && !isAdmin}
          {#if showClaimPin}
            <div class="claim-form">
              <input
                type="text"
                bind:value={claimPin}
                placeholder="Enter PIN"
                aria-label="PIN to claim facilitator"
              />
              <button on:click={claimFacilitator}>Claim</button>
              <button on:click={() => showClaimPin = false}>Cancel</button>
            </div>
          {:else}
            <button class="secondary" on:click={() => showClaimPin = true}>
              Claim Facilitator
            </button>
          {/if}
        {/if}
      </aside>

      <main class="main-area">
        {#if state.revealed}
          {@const majority = getMajorityVote(state.participants)}
          <div class="results">
            <h3>Results</h3>
            <div class="vote-grid">
              {#each state.participants.filter(p => p.vote !== null) as p (p.id)}
                <div class="vote-card" class:outlier={p.vote !== majority}>
                  <div class="vote-value">{p.vote}</div>
                  <div class="vote-name">{p.name}</div>
                </div>
              {/each}
            </div>
          </div>

          {#if isAdmin && activeItem}
            <div class="finalise-section">
              <h3>Finalise: {activeItem.label}</h3>
              {#if majority}
                <p class="majority-hint">Majority vote: <strong>{majority}</strong></p>
              {/if}
              <div class="estimate-picker" role="group" aria-label="Choose estimate">
                {#each CARDS as card (card)}
                  <button
                    class="estimate-btn"
                    class:selected={finaliseEstimate === card}
                    on:click={() => finaliseEstimate = card}
                    aria-pressed={finaliseEstimate === card}
                  >{card}</button>
                {/each}
              </div>
              <button class="primary" on:click={finalise} disabled={!finaliseEstimate}>
                Finalise
              </button>
            </div>
          {/if}
        {:else}
          <div class="waiting">
            <p>Waiting for votes…</p>
            <p class="hint" aria-live="polite" aria-atomic="true">{state.participants.filter(p => p.voted).length} of {state.participants.length} voted</p>
          </div>
        {/if}

        <div class="card-selector">
          <h3>Your vote</h3>
          <div class="cards">
            {#each CARDS as card (card)}
              <Card
                value={card}
                selected={selectedCard === card}
                disabled={state.revealed}
                onselect={() => castVote(card)}
              />
            {/each}
          </div>
          {#if !activeItem && state.items.length > 0}
            <p class="no-active-hint">Select an item from the backlog to start voting</p>
          {/if}
        </div>

        {#if remaining !== null}
          <div class="timer-section">
            <div
              class="timer-bar"
              role="progressbar"
              aria-label="Time remaining"
              aria-valuenow={remaining}
              aria-valuemin={0}
              aria-valuemax={state.timer.durationSeconds}
            >
              <div
                class="timer-bar-fill"
                style="width: {Math.max(0, remaining / state.timer.durationSeconds * 100)}%"
              ></div>
            </div>
            <p class="timer-countdown" role="timer" aria-live="off">
              {remaining}s remaining
            </p>
            {#if isAdmin}
              <button class="secondary" on:click={cancelTimer}>Cancel Timer</button>
            {/if}
          </div>
        {/if}

        {#if isAdmin && !state.revealed && remaining === null}
          <div class="timer-start">
            <label for="timer-duration" class="sr-only">Timer duration in seconds</label>
            <input
              id="timer-duration"
              type="number"
              min="5"
              max="300"
              bind:value={timerDuration}
              class="timer-input"
            />
            <span class="timer-unit">sec</span>
            <button class="secondary" on:click={startTimer}>Start Timer</button>
          </div>
        {/if}

        {#if isAdmin}
          <div class="facilitator-controls">
            <button class="primary" on:click={reveal} disabled={!hasVotes || state.revealed}>
              Reveal Votes
            </button>
            <button class="secondary" on:click={reset} disabled={!state.revealed}>
              Reset Round
            </button>
          </div>
        {/if}
      </main>

      <aside class="backlog">
        <h3>Backlog</h3>

        {#if isAdmin}
          <form class="add-item-form" on:submit|preventDefault={addItem}>
            <label for="new-item-label" class="sr-only">New item label</label>
            <input
              id="new-item-label"
              type="text"
              bind:value={newItemLabel}
              placeholder="Add item…"
              maxlength="200"
            />
            <button type="submit" disabled={!newItemLabel.trim()}>Add</button>
          </form>
        {/if}

        {#if activeItem}
          <section class="backlog-group">
            <h4>Active</h4>
            <div class="backlog-item active-item">
              <span class="item-label">{activeItem.label}</span>
            </div>
          </section>
        {/if}

        {#if pendingItems.length > 0}
          <section class="backlog-group">
            <h4>Pending</h4>
            <ul class="item-list">
              {#each pendingItems as item (item.id)}
                <li class="backlog-item">
                  <span class="item-label">{item.label}</span>
                  {#if isAdmin}
                    <div class="item-actions">
                      <button class="action-btn estimate-btn-sm" on:click={() => selectItem(item.id)}>
                        Estimate
                      </button>
                      <button
                        class="action-btn remove-btn"
                        on:click={() => removeItem(item.id)}
                        aria-label="Remove {item.label}"
                      >✕</button>
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if doneItems.length > 0}
          <section class="backlog-group">
            <h4>Done</h4>
            <ul class="item-list">
              {#each doneItems as item (item.id)}
                <li class="backlog-item done-item">
                  <span class="item-label">{item.label}</span>
                  <span class="estimate-badge">{item.estimate}</span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if state.items.length === 0}
          <p class="empty-hint">No items yet{isAdmin ? ' — add one above' : ''}.</p>
        {/if}
      </aside>
    </div>
  </div>
{/if}

<style>
  .poker-room {
    max-width: 1100px;
    margin: 0 auto;
    padding: 24px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  .header h2 {
    margin: 0;
  }

  .header-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    min-width: 0;
  }

  .room-id {
    font-size: 0.85rem;
    color: #4b5563;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .csv-btn {
    padding: 6px 12px;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    color: #374151;
  }

  .csv-btn:hover {
    background: #f9fafb;
  }

  .error {
    background: #fee2e2;
    border: 1px solid #f87171;
    color: #b91c1c;
    padding: 10px 14px;
    border-radius: 4px;
    margin-bottom: 16px;
  }

  .active-banner {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1e40af;
    padding: 10px 16px;
    border-radius: 6px;
    margin-bottom: 16px;
    font-size: 1rem;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .active-banner strong {
    overflow-wrap: anywhere;
  }

  .active-label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .layout {
    display: flex;
    gap: 24px;
  }

  .sidebar {
    width: 200px;
    flex-shrink: 0;
  }

  .sidebar h3, .main-area h3 {
    margin: 0 0 12px;
    font-size: 1rem;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .participant-list {
    list-style: none;
    padding: 0;
    margin: 0 0 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .participant {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 4px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    min-width: 0;
  }

  .participant.voted {
    border-color: #86efac;
    background: #f0fdf4;
  }

  .name {
    flex: 1;
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .badge {
    font-size: 0.7rem;
    background: #dbeafe;
    color: #1d4ed8;
    padding: 1px 6px;
    border-radius: 10px;
  }

  .vote-indicator {
    font-size: 0.85rem;
    color: #4b5563;
    min-width: 20px;
    text-align: right;
  }

  .claim-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .claim-form input {
    padding: 6px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .claim-form button {
    padding: 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    background: #f9fafb;
  }

  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-width: 0;
  }

  .waiting {
    text-align: center;
    padding: 24px;
    color: #4b5563;
  }

  .waiting p {
    margin: 4px 0;
  }

  .hint {
    font-size: 0.85rem;
  }

  .results {
    padding: 16px;
    background: #f9fafb;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }

  .vote-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .vote-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 16px;
    border-radius: 6px;
    background: #fff;
    border: 2px solid #86efac;
    min-width: 60px;
  }

  .vote-card.outlier {
    border-color: #fca5a5;
    background: #fff5f5;
  }

  .vote-value {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .vote-name {
    font-size: 0.75rem;
    color: #4b5563;
    margin-top: 4px;
    max-width: 96px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .finalise-section {
    padding: 16px;
    background: #f0fdf4;
    border: 1px solid #86efac;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .finalise-section h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .majority-hint {
    margin: 0;
    font-size: 0.9rem;
    color: #4b5563;
  }

  .estimate-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .estimate-btn {
    width: 44px;
    height: 44px;
    font-size: 0.95rem;
    font-weight: 600;
    border: 2px solid #d1d5db;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }

  .estimate-btn:hover {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .estimate-btn.selected {
    border-color: #2563eb;
    background: #2563eb;
    color: #fff;
  }

  .card-selector {
    padding: 16px;
    background: #f9fafb;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }

  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .no-active-hint {
    margin: 10px 0 0;
    font-size: 0.85rem;
    color: #4b5563;
  }

  .facilitator-controls {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  button.primary {
    padding: 10px 20px;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  button.primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  button.primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  button.secondary {
    padding: 10px 20px;
    background: #fff;
    color: #374151;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
  }

  button.secondary:hover:not(:disabled) {
    background: #f9fafb;
  }

  button.secondary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Backlog panel */

  .backlog {
    width: 240px;
    flex-shrink: 0;
  }

  .backlog h3 {
    margin: 0 0 12px;
    font-size: 1rem;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .add-item-form {
    display: flex;
    gap: 6px;
    margin-bottom: 16px;
  }

  .add-item-form input {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.9rem;
    min-width: 0;
  }

  .add-item-form button {
    padding: 6px 10px;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .add-item-form button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .backlog-group {
    margin-bottom: 16px;
  }

  .backlog-group h4 {
    margin: 0 0 6px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #4b5563;
  }

  .item-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .backlog-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 4px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    font-size: 0.85rem;
  }

  .backlog-item.active-item {
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  .backlog-item.done-item {
    background: #f0fdf4;
    border-color: #86efac;
  }

  .item-label {
    flex: 1;
    overflow-wrap: anywhere;
    min-width: 0;
  }

  .item-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .action-btn {
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.75rem;
    cursor: pointer;
    border: 1px solid #d1d5db;
    background: #fff;
    line-height: 1.4;
  }

  .estimate-btn-sm {
    color: #1d4ed8;
    border-color: #bfdbfe;
    background: #eff6ff;
  }

  .estimate-btn-sm:hover {
    background: #dbeafe;
  }

  .remove-btn {
    color: #dc2626;
    border-color: #fca5a5;
    background: #fff5f5;
  }

  .remove-btn:hover {
    background: #fee2e2;
  }

  .estimate-badge {
    font-weight: 700;
    font-size: 0.85rem;
    color: #15803d;
    flex-shrink: 0;
  }

  .empty-hint {
    font-size: 0.85rem;
    color: #4b5563;
    margin: 0;
  }

  .timer-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    background: #fffbeb;
    border: 1px solid #fcd34d;
    border-radius: 8px;
  }

  .timer-bar {
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .timer-bar-fill {
    height: 100%;
    background: #f59e0b;
    border-radius: 4px;
    transition: width 0.25s linear;
  }

  .timer-countdown {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #92400e;
  }

  .timer-start {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .timer-input {
    width: 64px;
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.9rem;
    text-align: center;
  }

  .timer-unit {
    font-size: 0.9rem;
    color: #4b5563;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 1024px) {
    .layout {
      display: grid;
      grid-template-columns: minmax(180px, 0.8fr) minmax(0, 1.4fr);
      gap: 18px;
    }

    .sidebar,
    .backlog {
      width: auto;
    }

    .backlog {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 720px) {
    .poker-room {
      padding: 16px;
    }

    .header {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }

    .header-right {
      width: 100%;
      justify-content: space-between;
    }

    .layout {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .sidebar,
    .backlog {
      width: 100%;
    }

    .participant-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }

    .active-banner {
      align-items: flex-start;
      flex-direction: column;
      gap: 4px;
    }

    .waiting,
    .results,
    .card-selector,
    .finalise-section {
      padding: 14px;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
    }

    .estimate-picker {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
    }

    .estimate-btn,
    .action-btn,
    button.primary,
    button.secondary,
    .claim-form button,
    .claim-form input,
    .add-item-form input,
    .add-item-form button,
    .timer-input {
      min-height: 44px;
    }

    .facilitator-controls {
      flex-direction: column;
    }

    .add-item-form {
      flex-direction: column;
    }

    .backlog-item {
      align-items: flex-start;
      flex-direction: column;
    }

    .item-actions {
      width: 100%;
    }

    .item-actions .estimate-btn-sm {
      flex: 1;
    }
  }

  @media (max-width: 380px) {
    .poker-room {
      padding: 12px;
    }

    .participant-list {
      grid-template-columns: 1fr;
    }

    .header-right {
      align-items: stretch;
      flex-direction: column;
    }

    .csv-btn {
      min-height: 44px;
    }
  }
</style>
