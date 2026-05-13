<script>
  import { roomState, send, wsError, myId } from '../ws.js';

  const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];
  const ALL_POSITIONS = [null, ...FIBONACCI.map(String)];

  let newItemLabel = '';
  let dragItemId = null;
  let moveAnnouncement = '';

  $: state = $roomState;
  $: isFacilitator = state && $myId && state.facilitatorId === $myId;

  $: unplaced = state ? state.items.filter(i => i.position === null) : [];
  $: inColumn = (fib) => state ? state.items.filter(i => i.position === String(fib)) : [];

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
      send({ type: 'move_item', itemId: dragItemId, position: position !== null ? String(position) : null });
      dragItemId = null;
    }
  }

  function onDragEnd() {
    dragItemId = null;
  }

  function onItemKeydown(event, item) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const currentIdx = ALL_POSITIONS.indexOf(item.position);
    const dir = event.shiftKey ? -1 : 1;
    const nextIdx = (currentIdx + dir + ALL_POSITIONS.length) % ALL_POSITIONS.length;
    const next = ALL_POSITIONS[nextIdx];
    send({ type: 'move_item', itemId: item.id, position: next });
    moveAnnouncement = `${item.label} moved to ${next ?? 'Unplaced'}`;
  }
</script>

{#if state}
  <div class="relative-room">
  <div class="sr-only" aria-live="polite" aria-atomic="true">{moveAnnouncement}</div>
  <p id="relative-kb-hint" class="sr-only">Press Enter or Space to move to the next column. Hold Shift to move backwards.</p>
    <div class="header">
      <h2>Relative Estimation</h2>
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

    <div class="layout">
      <aside
        class="sidebar"
        on:dragover={onDragOver}
        on:drop={(e) => onDrop(e, null)}
        role="region"
        aria-label="Unplaced items"
      >
        <div class="sidebar-header">Unplaced</div>
        {#each unplaced as item (item.id)}
          <div
            class="item-card"
            role="button"
            tabindex="0"
            draggable="true"
            aria-describedby="relative-kb-hint"
            on:dragstart={(e) => onDragStart(e, item.id)}
            on:dragend={onDragEnd}
            on:keydown={(e) => onItemKeydown(e, item)}
          >
            {item.label}
          </div>
        {/each}
        {#if unplaced.length === 0}
          <div class="empty-hint">All items placed</div>
        {/if}
      </aside>

      <div class="scale">
        <div class="scale-label">Relative effort — drag items to the appropriate column</div>
        <div class="columns">
          {#each FIBONACCI as fib}
            <div
              class="fib-column"
              on:dragover={onDragOver}
              on:drop={(e) => onDrop(e, fib)}
              role="region"
              aria-label={String(fib)}
            >
              <div class="fib-header">{fib}</div>
              <div class="fib-items">
                {#each inColumn(fib) as item (item.id)}
                  <div
                    class="item-card"
                    role="button"
                    tabindex="0"
                    draggable="true"
                    on:dragstart={(e) => onDragStart(e, item.id)}
                    on:dragend={onDragEnd}
                  >
                    {item.label}
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
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

  .relative-room {
    padding: 24px;
    max-width: 1200px;
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
    color: #767676;
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

  .layout {
    display: flex;
    gap: 20px;
    align-items: flex-start;
  }

  .sidebar {
    width: 180px;
    flex-shrink: 0;
    min-height: 200px;
    background: #f9fafb;
    border: 2px dashed #e5e7eb;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sidebar-header {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #4b5563;
    margin-bottom: 4px;
  }

  .empty-hint {
    font-size: 0.8rem;
    color: #767676;
    text-align: center;
    padding: 12px 0;
  }

  .scale {
    flex: 1;
    overflow-x: auto;
  }

  .scale-label {
    font-size: 0.8rem;
    color: #767676;
    margin-bottom: 10px;
  }

  .columns {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  .fib-column {
    flex: 1;
    min-width: 100px;
    min-height: 300px;
    background: #f3f4f6;
    border: 2px dashed #d1d5db;
    border-radius: 8px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .fib-header {
    text-align: center;
    font-size: 1.1rem;
    font-weight: 700;
    color: #2563eb;
    padding-bottom: 6px;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 2px;
  }

  .fib-items {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .item-card {
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 0.85rem;
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
