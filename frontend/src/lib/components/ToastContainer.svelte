<script lang="ts">
  import { toasts, removeToast } from '$lib/stores/toast';
  import { fly } from 'svelte/transition';

  let items: any[] = $state([]);
  const unsub = toasts.subscribe(t => { items = t; });
</script>

<div class="fixed top-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 pointer-events-none">
  {#each items as toast (toast.id)}
    <div
      class="pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm max-w-md w-full
        {toast.type === 'success' ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' : ''}
        {toast.type === 'error' ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200' : ''}
        {toast.type === 'info' ? 'bg-popover border-border text-popover-foreground' : ''}"
      transition:fly={{ y: -40, duration: 300 }}
      role="alert"
    >
      <!-- Icon -->
      {#if toast.type === 'success'}
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      {:else if toast.type === 'error'}
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      {/if}

      <span class="text-sm font-medium flex-1">{toast.message}</span>

      <button
        onclick={() => removeToast(toast.id)}
        class="shrink-0 rounded-md p-1 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  {/each}
</div>
