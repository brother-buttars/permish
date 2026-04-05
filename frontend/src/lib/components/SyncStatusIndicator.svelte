<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getDataMode, getSyncManager } from '$lib/data';
  import type { SyncStatus } from '$lib/data/sync/manager';

  let status = $state<SyncStatus>('idle');
  let pendingCount = $state(0);
  let visible = $state(false);
  let unsub: (() => void) | null = null;
  let countTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    const mode = getDataMode();
    if (mode !== 'hybrid') return;

    visible = true;
    const mgr = getSyncManager();
    if (!mgr) return;

    status = mgr.status;
    unsub = mgr.onStatusChange((s) => {
      status = s;
    });

    // Poll pending count every 10s
    async function updateCount() {
      if (mgr) pendingCount = await mgr.getPendingCount();
    }
    updateCount();
    countTimer = setInterval(updateCount, 10000);
  });

  onDestroy(() => {
    unsub?.();
    if (countTimer) clearInterval(countTimer);
  });

  function handleSync() {
    const mgr = getSyncManager();
    mgr?.sync();
  }

  const statusConfig = {
    idle: { color: 'bg-green-500', label: 'Synced' },
    syncing: { color: 'bg-yellow-500 animate-pulse', label: 'Syncing...' },
    error: { color: 'bg-red-500', label: 'Sync error' },
    offline: { color: 'bg-gray-400', label: 'Offline' },
  };

  let config = $derived(statusConfig[status]);
</script>

{#if visible}
  <button
    onclick={handleSync}
    class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
    title={`${config.label}${pendingCount > 0 ? ` (${pendingCount} pending)` : ''} — Click to sync now`}
  >
    <span class="h-2 w-2 rounded-full {config.color}"></span>
    {#if pendingCount > 0}
      <span class="font-medium">{pendingCount}</span>
    {/if}
  </button>
{/if}
