<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { logout } from "$lib/stores/auth";
  import { getDataMode, getSyncManager } from "$lib/data";
  import type { SyncStatus } from "$lib/data/sync/manager";
  import ThemeToggle from "./ThemeToggle.svelte";

  interface Props {
    user: { name: string; email: string; role: string };
    pathname?: string;
    onnavigate?: () => void;
  }

  let { user, pathname = "/", onnavigate }: Props = $props();

  function menuItemClass(active: boolean): string {
    const base =
      "relative z-10 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors cursor-pointer";
    return active
      ? `${base} bg-primary text-primary-foreground`
      : `${base} text-popover-foreground hover:bg-primary/25`;
  }

  let open = $state(false);
  let triggerEl: HTMLButtonElement | undefined = $state();
  let popoverTop = $state(0);
  let popoverRight = $state(0);
  let arrowRight = $state(0);

  // Sync state
  let syncVisible = $state(false);
  let syncStatus = $state<SyncStatus>('idle');
  let pendingCount = $state(0);
  let syncUnsub: (() => void) | null = null;
  let syncTimer: ReturnType<typeof setInterval> | null = null;

  let initials = $derived(
    user.name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("")
  );

  const syncDotColor: Record<SyncStatus, string> = {
    idle: 'bg-green-500',
    syncing: 'bg-yellow-500 animate-pulse',
    error: 'bg-red-500',
    offline: 'bg-gray-400',
  };

  const syncLabel: Record<SyncStatus, string> = {
    idle: 'Synced',
    syncing: 'Syncing...',
    error: 'Sync error',
    offline: 'Offline',
  };

  onMount(() => {
    const mode = getDataMode();
    if (mode !== 'hybrid') return;

    syncVisible = true;
    const mgr = getSyncManager();
    if (!mgr) return;

    syncStatus = mgr.status;
    syncUnsub = mgr.onStatusChange((s) => { syncStatus = s; });

    async function updateCount() {
      if (mgr) pendingCount = await mgr.getPendingCount();
    }
    updateCount();
    syncTimer = setInterval(updateCount, 10000);
  });

  onDestroy(() => {
    syncUnsub?.();
    if (syncTimer) clearInterval(syncTimer);
  });

  function triggerSync() {
    getSyncManager()?.sync();
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function toggleOpen() {
    if (!open && triggerEl) {
      const rect = triggerEl.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      popoverTop = rect.bottom + 10;
      popoverRight = viewportWidth - rect.right;
      const buttonCenterFromRight = viewportWidth - (rect.left + rect.width / 2);
      arrowRight = buttonCenterFromRight - popoverRight - 6;
    }
    open = !open;
  }

  function nav(href: string) {
    open = false;
    onnavigate?.();
    goto(href);
  }

  async function handleLogout() {
    open = false;
    onnavigate?.();
    await logout();
    goto("/");
  }
</script>

<!-- Avatar button with optional sync dot overlay -->
<div class="relative">
  <button
    bind:this={triggerEl}
    class="flex items-center justify-center rounded-full h-9 w-9 text-sm font-semibold cursor-pointer transition-colors border-2 border-primary {open
      ? 'bg-primary text-primary-foreground'
      : 'bg-transparent text-foreground hover:bg-primary/10'}"
    onclick={toggleOpen}
    aria-label="User menu"
  >
    {initials}
  </button>
  {#if syncVisible}
    <span
      class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background {syncDotColor[syncStatus]}"
      title={syncLabel[syncStatus]}
    ></span>
  {/if}
</div>

{#if open}
  <div use:portal>
    <button
      type="button"
      class="fixed inset-0 z-40 cursor-default"
      aria-label="Close user menu"
      onclick={() => (open = false)}
    ></button>
    <div
      class="fixed z-50 w-56 rounded-md border border-border bg-glass backdrop-blur-lg p-1 shadow-md flex flex-col gap-1"
      style="top: {popoverTop}px; right: {popoverRight}px;"
    >
      <!-- Arrow -->
      <div
        class="absolute -top-[7px] z-[51] h-3 w-3 rotate-45 border-l border-t border-border bg-glass backdrop-blur-lg shadow-none"
        style="right: {arrowRight}px;"
      ></div>

      <!-- User info -->
      <div class="px-2 py-2 border-b border-border">
        <p class="text-sm font-semibold truncate">{user.name}</p>
        <p class="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>

      <!-- Sync status (hybrid mode only) -->
      {#if syncVisible}
        <button
          class="flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors cursor-pointer"
          onclick={triggerSync}
          title="Click to sync now"
        >
          <span class="flex items-center gap-2">
            <span class="h-2 w-2 rounded-full {syncDotColor[syncStatus]}"></span>
            {syncLabel[syncStatus]}
          </span>
          {#if pendingCount > 0}
            <span class="text-xs font-medium">{pendingCount} pending</span>
          {/if}
        </button>
      {/if}

      <!-- Menu items -->
      <button
        class={menuItemClass(pathname === "/account")}
        onclick={() => nav("/account")}
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        Account
      </button>

      {#if user.role === "super"}
        <button
          class={menuItemClass(pathname.startsWith("/admin"))}
          onclick={() => nav("/admin")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z" />
          </svg>
          Admin
        </button>
      {/if}

      <!-- Theme -->
      <div class="border-t border-border pt-1">
        <div class="px-2 py-1">
          <ThemeToggle inline />
        </div>
      </div>

      <!-- Logout -->
      <div class="border-t border-border pt-1">
        <button
          class="relative z-10 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          onclick={handleLogout}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </div>
    </div>
  </div>
{/if}
