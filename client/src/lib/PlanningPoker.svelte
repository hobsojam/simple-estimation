<script>
  import { roomState, send, wsError, myId } from '../ws.js';
  import Card from './Card.svelte';

  const CARDS = ['1', '2', '3', '5', '8', '13', '21', '?', '∞', '☕'];

  let selectedCard = null;
  let claimPin = '';
  let showClaimPin = false;

  $: state = $roomState;
  $: isFacilitator = state && $myId && state.facilitatorId === $myId;
  $: hasVotes = state && state.participants.some(p => p.voted);

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

  function getMajorityVote(participants) {
    const counts = {};
    for (const p of participants) {
      if (p.vote) counts[p.vote] = (counts[p.vote] || 0) + 1;
    }
    let max = 0;
    let majority = null;
    for (const [vote, count] of Object.entries(counts)) {
      if (count > max) { max = count; majority = vote; }
    }
    return majority;
  }
</script>

{#if state}
  <div class="poker-room">
    <div class="header">
      <h2>Planning Poker</h2>
      <span class="room-id">Room: {state.id}</span>
    </div>

    {#if $wsError}
      <div class="error">{$wsError}</div>
    {/if}

    <div class="layout">
      <aside class="sidebar">
        <h3>Participants</h3>
        <ul class="participant-list">
          {#each state.participants as p}
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

        {#if !isFacilitator}
          {#if showClaimPin}
            <div class="claim-form">
              <input type="text" bind:value={claimPin} placeholder="Enter PIN" />
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
              {#each state.participants.filter(p => p.vote !== null) as p}
                <div class="vote-card" class:outlier={p.vote !== majority}>
                  <div class="vote-value">{p.vote}</div>
                  <div class="vote-name">{p.name}</div>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="waiting">
            <p>Waiting for votes…</p>
            <p class="hint" aria-live="polite" aria-atomic="true">{state.participants.filter(p => p.voted).length} of {state.participants.length} voted</p>
          </div>
        {/if}

        <div class="card-selector">
          <h3>Your vote</h3>
          <div class="cards">
            {#each CARDS as card}
              <Card
                value={card}
                selected={selectedCard === card}
                disabled={state.revealed}
                onselect={() => castVote(card)}
              />
            {/each}
          </div>
        </div>

        {#if isFacilitator}
          <div class="facilitator-controls">
            <button class="primary" on:click={reveal} disabled={!hasVotes || state.revealed}>
              Reveal Votes
            </button>
            <button class="secondary" on:click={reset}>
              Reset Round
            </button>
          </div>
        {/if}
      </main>
    </div>
  </div>
{/if}

<style>
  .poker-room {
    max-width: 900px;
    margin: 0 auto;
    padding: 24px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  .header h2 {
    margin: 0;
  }

  .room-id {
    font-size: 0.85rem;
    color: #4b5563;
    font-family: monospace;
  }

  .error {
    background: #fee2e2;
    border: 1px solid #f87171;
    color: #b91c1c;
    padding: 10px 14px;
    border-radius: 4px;
    margin-bottom: 16px;
  }

  .layout {
    display: flex;
    gap: 24px;
  }

  .sidebar {
    width: 220px;
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
  }

  .participant.voted {
    border-color: #86efac;
    background: #f0fdf4;
  }

  .name {
    flex: 1;
    font-size: 0.9rem;
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
  }

  .waiting {
    text-align: center;
    padding: 24px;
    color: #6b7280;
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
    color: #6b7280;
    margin-top: 4px;
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

  .facilitator-controls {
    display: flex;
    gap: 12px;
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

  button.secondary:hover {
    background: #f9fafb;
  }
</style>
