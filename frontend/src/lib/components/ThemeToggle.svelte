<script lang="ts">
	import { theme, setTheme, type Theme } from '$lib/stores/theme';
	import { Button } from '$lib/components/ui/button';

	let currentTheme: Theme = $state('system');
	let open = $state(false);

	const unsub = theme.subscribe(t => { currentTheme = t; });

	function select(t: Theme) {
		setTheme(t);
		open = false;
	}
</script>

<div class="relative">
	<Button variant="ghost" size="sm" class="h-9 w-9 p-0" onclick={() => open = !open} aria-label="Toggle theme">
		{#if currentTheme === 'light'}
			<!-- Sun icon -->
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="4" />
				<path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41m12.73-12.73l1.41-1.41" />
			</svg>
		{:else if currentTheme === 'dark'}
			<!-- Moon icon -->
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
			</svg>
		{:else}
			<!-- Monitor icon (system) -->
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<rect x="2" y="3" width="20" height="14" rx="2" />
				<path d="M8 21h8m-4-4v4" />
			</svg>
		{/if}
	</Button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-40" onclick={() => open = false}></div>
		<div class="absolute right-0 top-full z-50 mt-1 w-36 rounded-md border border-border bg-popover p-1 shadow-md">
			<button
				class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors {currentTheme === 'light' ? 'bg-accent text-accent-foreground' : 'text-popover-foreground hover:bg-accent hover:text-accent-foreground'}"
				onclick={() => select('light')}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="4" />
					<path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41m12.73-12.73l1.41-1.41" />
				</svg>
				Light
			</button>
			<button
				class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors {currentTheme === 'dark' ? 'bg-accent text-accent-foreground' : 'text-popover-foreground hover:bg-accent hover:text-accent-foreground'}"
				onclick={() => select('dark')}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
				</svg>
				Dark
			</button>
			<button
				class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors {currentTheme === 'system' ? 'bg-accent text-accent-foreground' : 'text-popover-foreground hover:bg-accent hover:text-accent-foreground'}"
				onclick={() => select('system')}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<rect x="2" y="3" width="20" height="14" rx="2" />
					<path d="M8 21h8m-4-4v4" />
				</svg>
				System
			</button>
		</div>
	{/if}
</div>
