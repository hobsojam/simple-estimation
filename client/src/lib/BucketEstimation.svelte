<script>
  import { roomState, send, wsError, myId } from '../ws.js';
  import { buildCSV } from './poker-utils.js';

  const BUCKETS = ['XS', 'S', 'M', 'L', 'XL'];
  const ALL_POSITIONS = [null, ...BUCKETS];

  let newItemLabel = '';
  let dragItemId = null;
  let moveAnnouncement = '';

  $: state = $roomState;
  $: isFacilitator = state && $myId && state.facilitatorId === $myId;
  $: sizedItems = state ? state.items.filter(i => i.position !== null) : [];
  $: bucketsWithItems = BUCKETS.map(bucket => ({
    bucket,
    items: state ? state.items.filter(i => i.position === bucket) : [],
  }));

  function downloadCSV() {
    const blob = new Blob([buildCSV(sizedItems.map(i => ({ label: i.label, estimate: i.position })))], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estimation-${state.id.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  $: unsized = state ? state.items.filter(i => i.position === null) : [];

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

  function moveItemToPosition(itemId, position) {
    send({ type: 'move_item', itemId, position: position || null });
  }

  function onItemKeydown(event, item) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const currentIdx = ALL_POSITIONS.indexOf(item.position);
    const dir = event.shiftKey ? -1 : 1;
    const nextIdx = (currentIdx + dir + ALL_POSITIONS.length) % ALL_POSITIONS.length;
    const next = ALL_POSITIONS[nextIdx];
    send({ type: 'move_item', itemId: item.id, position: next });
    moveAnnouncement = `${item.label} moved to ${next ?? 'Unsized'}`;
  }
</script>

{#if state}
  <div class="bucket-room">
  <div class="sr-only" aria-live="polite" aria-atomic="true">{moveAnnouncement}</div>
  <p id="bucket-kb-hint" class="sr-only">Press Enter or Space to move to the next bucket. Hold Shift to move backwards.</p>
    <div class="header">
      <h2>Bucket Estimation</h2>
      <div class="header-right">
        <span class="room-id">Room: {state.id}</span>
        {#if sizedItems.length > 0}
          <button class="csv-btn" on:click={downloadCSV}>Download CSV</button>
        {/if}
      </div>
    </div>

    {#if $wsError}
      <div class="error" role="alert">{$wsError}</div>
    {/if}

    {#if isFacilitator}
      <div class="add-item-bar">
        <input
          type="text"
          bind:value={newItemLabel}
          placeholder="Add new item…"
          maxlength="200"
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
          <div class="item-shell">
            <div
              class="item-card"
              role="button"
              tabindex="0"
              draggable="true"
              aria-describedby="bucket-kb-hint"
              on:dragstart={(e) => onDragStart(e, item.id)}
              on:dragend={onDragEnd}
              on:keydown={(e) => onItemKeydown(e, item)}
            >
              {item.label}
            </div>
            <label class="move-control">
              <span>Move to</span>
              <select
                aria-label={`Move ${item.label} to bucket`}
                value={item.position ?? ''}
                on:change={(e) => moveItemToPosition(item.id, e.target.value)}
              >
                <option value="">Unsized</option>
                {#each BUCKETS as bucket (bucket)}
                  <option value={bucket}>{bucket}</option>
                {/each}
              </select>
            </label>
          </div>
        {/each}
      </div>

      {#each bucketsWithItems as column (column.bucket)}
        <div
          class="column"
          on:dragover={onDragOver}
          on:drop={(e) => onDrop(e, column.bucket)}
          role="region"
          aria-label={column.bucket}
        >
          <div class="column-header bucket-label">{column.bucket}</div>
          {#each column.items as item (item.id)}
            <div class="item-shell">
              <div
                class="item-card"
                role="button"
                tabindex="0"
                draggable="true"
                aria-describedby="bucket-kb-hint"
                on:dragstart={(e) => onDragStart(e, item.id)}
                on:dragend={onDragEnd}
                on:keydown={(e) => onItemKeydown(e, item)}
              >
                {item.label}
              </div>
              <label class="move-control">
                <span>Move to</span>
                <select
                  aria-label={`Move ${item.label} to bucket`}
                  value={item.position ?? ''}
                  on:change={(e) => moveItemToPosition(item.id, e.target.value)}
                >
                  <option value="">Unsized</option>
                  {#each BUCKETS as bucket (bucket)}
                    <option value={bucket}>{bucket}</option>
                  {/each}
                </select>
              </label>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
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

  .bucket-room {
    padding: 24px;
    max-width: 1100px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
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

  .room-id {
    font-size: 0.85rem;
    color: #4b5563;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    min-width: 0;
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
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
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
    color: #4b5563;
    margin-bottom: 4px;
    text-align: center;
  }

  .bucket-label {
    color: #2563eb;
  }

  .item-shell {
    display: flex;
    flex-direction: column;
    gap: 6px;
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

  .move-control {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: #4b5563;
  }

  .move-control span {
    flex-shrink: 0;
  }

  .move-control select {
    min-width: 0;
    width: 100%;
    padding: 5px 6px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #fff;
    font: inherit;
  }

  @media (max-width: 900px) {
    .board {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(132px, 1fr);
    }

    .column {
      min-width: 132px;
    }
  }

  @media (max-width: 640px) {
    .bucket-room {
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

    .add-item-bar {
      flex-direction: column;
    }

    .add-item-bar input,
    button.primary,
    .csv-btn,
    .item-card,
    .move-control select {
      min-height: 44px;
    }

    .board {
      gap: 10px;
      margin-right: -16px;
      padding-right: 16px;
      grid-auto-columns: minmax(148px, 72vw);
    }

    .column {
      min-height: 260px;
      min-width: 0;
    }
  }

  @media (max-width: 380px) {
    .bucket-room {
      padding: 12px;
    }

    .header-right {
      align-items: stretch;
      flex-direction: column;
    }

    .board {
      margin-right: -12px;
      padding-right: 12px;
    }
  }
</style>
