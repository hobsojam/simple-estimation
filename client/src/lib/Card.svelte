<script>
  import { createEventDispatcher } from 'svelte';

  export let value;
  export let selected = false;
  export let disabled = false;

  const dispatch = createEventDispatcher();
</script>

<button
  class="card"
  class:selected
  {disabled}
  on:click={() => { if (!disabled) dispatch('select', value); }}
>
  {value}
</button>

<style>
  .card {
    width: 54px;
    height: 72px;
    font-size: 1.2rem;
    font-weight: 600;
    border: 2px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    transition: border-color 0.1s, background 0.1s;
  }

  .card:hover:not(:disabled) {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .card.selected {
    border-color: #2563eb;
    background: #2563eb;
    color: #fff;
  }

  .card:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
