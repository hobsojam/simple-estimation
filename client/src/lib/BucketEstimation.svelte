<script>
  import { roomState, send, wsError, myId } from '../ws.js';

  const BUCKETS = ['XS', 'S', 'M', 'L', 'XL'];

  let newItemLabel = '';
  let dragItemId = null;

  $: state = $roomState;
  $: isFacilitator = state && $myId && state.facilitatorId === $myId;

  $: unsized = state ? state.items.filter(i => i.position === null) : [];
  $: bucketed = (bucket) => state ? state.items.filter(i => i.position === bucket) : [];

  function addItem() {
    const label = newItemLabel.trim();
    if (!label) return;
    send({ type: 'add_item', label });
    newItemLabel = '';
  }

  function onDragStart(event, itemId) {
    dragItemId = itemId;
    event.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function onDrop(event, position) {
    event.preventDefault();
    if (dragItemId) {
      send({ type: 'move_item', itemId: dragItemId, position });
      dragItemId = null;
    }
  }

  function onDragEnd() {
    dragItemId = null;
  }
</script>

{#if state}
  <div class="bucket-room">
    <div class="header">
      <h2>Bucket Estimation</h2>
      <span class="room-id">Room: {state.id}</span>
    </div>

    {#if $wsError}
      <div class="error">{$wsError}</div>
    {/if}

    {#if isFacilitator}
      <div class="add-item-bar">
        <input
          type="text"
          bind:value={newItemLabel}
          placeholder="Add new item…"
          on:keydown={(e) => e.key === 'Enter' && addItem()}
        />
        <button class="primary" on:click={addItem} disabled={!newItemLabel.trim()}>Add Item</button>
      </div>
    {/if}

    <div class="board">
      <div
        class="column unsized"
        on:dragover={onDragOver}
        on:drop={(e) => onDrop(e, null)}
        role="region"
        aria-label="Unsized items"
      >
        <div class="column-header">Unsized</div>
        {#each unsized as item (item.id)}
          <div
            class="item-card"
            draggable="true"
            on:dragstart={(e) => onDragStart(e, item.id)}
            on:dragend={onDragEnd}
          >
            {item.label}
          </div>
        {/each}
      </div>

      {#each BUCKETS as bucket}
        <div
          class="column"
          on:dragover={onDragOver}
          on:drop={(e) => onDrop(e, bucket)}
          role="region"
          aria-label={bucket}
        >
          <div class="column-header bucket-label">{bucket}</div>
          {#each bucketed(bucket) as item (item.id)}
            <div
              class="item-card"
              draggable="true"
              on:dragstart={(e) => onDragStart(e, item.id)}
              on:dragend={onDragEnd}
            >
              {item.label}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .bucket-room {
    padding: 24px;
    max-width: 1100px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .header h2 {
    margin: 0;
  }

  .room-id {
    font-size: 0.85rem;
    color: #888;
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

  .add-item-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }

  .add-item-bar input {
    flex: 1;
    padding: 8px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  button.primary {
    padding: 8px 16px;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    font-weight: 600;
    white-space: nowrap;
  }

  button.primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  button.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .board {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    overflow-x: auto;
    padding-bottom: 8px;
  }

  .column {
    flex: 1;
    min-width: 140px;
    min-height: 300px;
    background: #f3f4f6;
    border: 2px dashed #d1d5db;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .column.unsized {
    background: #fafafa;
    border-color: #e5e7eb;
  }

  .column-header {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b7280;
    margin-bottom: 4px;
    text-align: center;
  }

  .bucket-label {
    color: #2563eb;
  }

  .item-card {
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 0.9rem;
    cursor: grab;
    user-select: none;
    word-break: break-word;
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  }

  .item-card:hover {
    border-color: #2563eb;
    box-shadow: 0 2px 4px rgba(37,99,235,0.15);
  }

  .item-card:active {
    cursor: grabbing;
  }
</style>
