<script lang="ts">
  import { theme, setTheme, type Theme } from "$lib/stores/theme";
  import { get } from "svelte/store";
  import { Button } from "$lib/components/ui/button";

  interface Props {
    inline?: boolean;
  }

  let { inline = false }: Props = $props();

  let currentTheme: Theme = $state(get(theme));
  let open = $state(false);
  let triggerEl: HTMLElement | undefined = $state();
  let popoverTop = $state(0);
  let popoverRight = $state(0);

  $effect(() => {
    const unsub = theme.subscribe((t) => {
      currentTheme = t;
    });
    return unsub;
  });

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
      popoverTop = rect.bottom + 10;
      popoverRight = document.documentElement.clientWidth - rect.right;
    }
    open = !open;
  }

  function select(t: Theme) {
    setTheme(t);
    open = false;
  }

  function itemClass(active: boolean): string {
    const base =
      "relative z-10 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors cursor-pointer";
    if (active) return `${base} bg-primary text-primary-foreground`;
    return `${base} text-popover-foreground hover:bg-primary/25`;
  }

  function inlineItemClass(active: boolean): string {
    const base =
      "flex items-center justify-center rounded-md p-1.5 transition-colors cursor-pointer";
    if (active) return `${base} bg-primary text-primary-foreground`;
    return `${base} text-muted-foreground hover:bg-muted`;
  }
</script>

{#if inline}
  <div class="flex items-center gap-1">
    <span class="text-sm text-muted-foreground mr-auto">Theme</span>
    <button
      class={inlineItemClass(currentTheme === "light")}
      onclick={() => setTheme("light")}
      aria-label="Light theme"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41m12.73-12.73l1.41-1.41" />
      </svg>
    </button>
    <button
      class={inlineItemClass(currentTheme === "dark")}
      onclick={() => setTheme("dark")}
      aria-label="Dark theme"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
    <button
      class={inlineItemClass(currentTheme === "system")}
      onclick={() => setTheme("system")}
      aria-label="System theme"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8m-4-4v4" />
      </svg>
    </button>
  </div>
{:else}
  <div class="relative" bind:this={triggerEl}>
    <Button
      variant="ghost"
      size="sm"
      class="h-9 w-9 p-0"
      onclick={toggleOpen}
      aria-label="Toggle theme"
    >
      {#if currentTheme === "light"}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41m12.73-12.73l1.41-1.41"
          />
        </svg>
      {:else if currentTheme === "dark"}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8m-4-4v4" />
        </svg>
      {/if}
    </Button>
  </div>

  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div use:portal>
      <div class="fixed inset-0 z-40" onclick={() => (open = false)}></div>
      <div
        class="fixed z-50 w-36 rounded-md border border-border bg-glass backdrop-blur-lg p-1 shadow-md"
        style="top: {popoverTop}px; right: {popoverRight}px;"
      >
        <!-- Arrow -->
        <div
          class="absolute -top-[7px] right-3 z-[51] h-3 w-3 rotate-45 border-l border-t border-border bg-glass backdrop-blur-lg shadow-none"
        ></div>

        <button
          class={itemClass(currentTheme === "light")}
          onclick={() => select("light")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41m12.73-12.73l1.41-1.41"
            />
          </svg>
          Light
        </button>
        <button
          class={itemClass(currentTheme === "dark")}
          onclick={() => select("dark")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          Dark
        </button>
        <button
          class={itemClass(currentTheme === "system")}
          onclick={() => select("system")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8m-4-4v4" />
          </svg>
          System
        </button>
      </div>
    </div>
  {/if}
{/if}
