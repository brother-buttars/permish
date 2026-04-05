<script lang="ts">
  import { onMount } from 'svelte';
  import { getDataMode, getSyncManager } from '$lib/data';
  import { toastSuccess, toastError } from '$lib/stores/toast';

  let online = $state(true);
  let visible = $state(false);

  onMount(() => {
    const mode = getDataMode();
    if (mode !== 'hybrid') return;

    visible = true;
    online = navigator.onLine;

    function handleOnline() {
      online = true;
      toastSuccess('Back online. Syncing...');
      // Trigger sync when coming back online
      const mgr = getSyncManager();
      mgr?.sync();
    }

    function handleOffline() {
      online = false;
      toastError('You are offline. Changes will sync when reconnected.');
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  });
</script>

{#if visible && !online}
  <div class="bg-amber-500 text-white text-center text-sm py-1.5 px-4 font-medium">
    You're offline — changes are saved locally and will sync when reconnected
  </div>
{/if}
