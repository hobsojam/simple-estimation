<script>
  let { value, selected = false, disabled = false, onselect } = $props();
</script>

<button
  class="card"
  class:selected
  {disabled}
  onclick={() => { if (!disabled) onselect?.(value); }}
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
