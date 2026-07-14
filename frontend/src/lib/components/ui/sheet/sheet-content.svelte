<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";
	import { getFocusable, trapTabKey } from "$lib/utils/focusTrap";

	let {
		open = false,
		side = "right",
		label,
		onclose,
		children,
		class: className = "",
	}: {
		open?: boolean;
		side?: "left" | "right" | "top" | "bottom";
		/** Accessible name announced when the sheet opens. */
		label?: string;
		onclose?: () => void;
		children?: Snippet;
		class?: string;
	} = $props();

	const sideClasses: Record<string, string> = {
		right: "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l",
		left: "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r",
		top: "inset-x-0 top-0 border-b",
		bottom: "inset-x-0 bottom-0 border-t",
	};

	let sheetEl: HTMLDivElement | undefined = $state();
	let previouslyFocused: HTMLElement | null = null;

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === "Escape") {
			onclose?.();
			return;
		}
		trapTabKey(e, sheetEl);
	}

	// Focus the first control when the sheet opens; restore focus on close so
	// keyboard users land back on the trigger.
	$effect(() => {
		if (open) {
			previouslyFocused = document.activeElement as HTMLElement | null;
			queueMicrotask(() => {
				(getFocusable(sheetEl)[0] ?? sheetEl)?.focus();
			});
		} else if (previouslyFocused) {
			previouslyFocused.focus();
			previouslyFocused = null;
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<button
		type="button"
		class="fixed inset-0 z-50 bg-black/80"
		aria-label="Close"
		tabindex="-1"
		onclick={onclose}
	></button>
	<div
		bind:this={sheetEl}
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-label={label}
		class={cn(
			"fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out",
			sideClasses[side],
			className
		)}
	>
		{#if children}
			{@render children()}
		{/if}
		<button
			class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
			onclick={onclose}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
			<span class="sr-only">Close</span>
		</button>
	</div>
{/if}
