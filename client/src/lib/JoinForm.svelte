<script>
  let { oncreate, onjoin } = $props();

  let mode = $state('join');
  let roomId = $state('');
  let name = $state('');
  let pin = $state('');
  let roomType = $state('planning-poker');

  function handleCreate() {
    if (!name.trim()) return;
    oncreate?.({ name: name.trim(), roomType, pin: pin.trim() || undefined });
  }

  function handleJoin() {
    if (!name.trim() || !roomId.trim()) return;
    onjoin?.({ roomId: roomId.trim(), name: name.trim(), pin: pin.trim() || undefined });
  }
</script>

<div class="join-form">
  <h1>Simple Estimation</h1>

  <div class="tabs">
    {#if mode === 'join'}
      <span class="tab active">Join Room</span>
      <button class="tab" onclick={() => mode = 'create'}>Create Room</button>
    {:else}
      <button class="tab" onclick={() => mode = 'join'}>Join Room</button>
      <span class="tab active">Create Room</span>
    {/if}
  </div>

  <div class="fields">
    <label>
      Your name
      <input type="text" bind:value={name} placeholder="Enter your name" />
    </label>

    {#if mode === 'join'}
      <label>
        Room ID
        <input type="text" bind:value={roomId} placeholder="Paste room ID" />
      </label>
      <label>
        Facilitator PIN (optional)
        <input type="text" bind:value={pin} placeholder="Enter PIN if you have one" />
      </label>
      <button class="primary" onclick={handleJoin} disabled={!name.trim() || !roomId.trim()}>
        Join
      </button>
    {:else}
      <label>
        Room type
        <select bind:value={roomType}>
          <option value="planning-poker">Planning Poker</option>
          <option value="bucket">Bucket Estimation</option>
          <option value="relative">Relative Estimation</option>
        </select>
      </label>
      <label>
        Facilitator PIN (optional)
        <input type="text" bind:value={pin} placeholder="Set a PIN to protect facilitator role" />
      </label>
      <button class="primary" onclick={handleCreate} disabled={!name.trim()}>
        Create Room
      </button>
    {/if}
  </div>
</div>

<style>
  .join-form {
    max-width: 420px;
    margin: 80px auto;
    padding: 32px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #fff;
  }

  h1 {
    margin: 0 0 24px;
    font-size: 1.6rem;
    text-align: center;
  }

  .tabs {
    display: flex;
    margin-bottom: 24px;
    border-bottom: 2px solid #eee;
  }

  .tab {
    flex: 1;
    padding: 10px;
    border: none;
    background: none;
    font-size: 1rem;
    color: #666;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    text-align: center;
    font-family: inherit;
    display: block;
  }

  button.tab {
    cursor: pointer;
  }

  .tab.active {
    color: #2563eb;
    border-bottom-color: #2563eb;
    font-weight: 600;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.9rem;
    color: #444;
    font-weight: 500;
  }

  input, select {
    padding: 8px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  input:focus, select:focus {
    outline: 2px solid #2563eb;
    border-color: transparent;
  }

  button.primary {
    padding: 10px;
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
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
