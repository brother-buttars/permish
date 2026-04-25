<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";
  import "../app.css";
  import "$lib/stores/theme";
  import ToastContainer from "$lib/components/ToastContainer.svelte";
  import OfflineBanner from "$lib/components/OfflineBanner.svelte";
  import { AppHeader } from "$lib/components/organisms";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen flex flex-col">
  <AppHeader />

  <OfflineBanner />

  <main class="flex-1">
    {@render children()}
  </main>
</div>

<ToastContainer />
