<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "$lib/utils";
	import { getFocusable, trapTabKey } from "$lib/utils/focusTrap";

	type ModalSize = "sm" | "md" | "lg" | "fullscreen";

	interface ModalContext {
		close: () => void;
	}

	let {
		open = $bindable(false),
		size = "md",
		closeOnBackdrop = true,
		label,
		onclose,
		header,
		children,
		class: className = "",
	}: {
		open?: boolean;
		size?: ModalSize;
		closeOnBackdrop?: boolean;
		/** Accessible name announced when the dialog opens. */
		label?: string;
		onclose?: () => void;
		header?: Snippet<[ModalContext]>;
		children: Snippet<[ModalContext]>;
		class?: string;
	} = $props();

	const sizeClasses: Record<ModalSize, string> = {
		sm: "mx-4 w-full max-w-md rounded-lg bg-popover p-6 shadow-xl",
		md: "mx-4 w-full max-w-lg rounded-lg bg-popover p-6 shadow-xl",
		lg: "mx-4 w-full max-w-2xl rounded-lg bg-popover p-6 shadow-xl",
		fullscreen:
			"mx-6 my-6 flex h-[calc(100vh-3rem)] w-full flex-col rounded-lg bg-card shadow-xl",
	};

	let dialogEl: HTMLDivElement | undefined = $state();
	let previouslyFocused: HTMLElement | null = null;

	function close() {
		open = false;
		onclose?.();
	}

	function handleBackdrop() {
		if (closeOnBackdrop) close();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === "Escape") {
			close();
			return;
		}
		trapTabKey(e, dialogEl);
	}

	// Focus the first control when the dialog opens; restore focus on close so
	// keyboard users land back where they were.
	$effect(() => {
		if (open) {
			previouslyFocused = document.activeElement as HTMLElement | null;
			queueMicrotask(() => {
				(getFocusable(dialogEl)[0] ?? dialogEl)?.focus();
			});
		} else if (previouslyFocused) {
			previouslyFocused.focus();
			previouslyFocused = null;
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		role="dialog"
		aria-modal="true"
		aria-label={label}
	>
		<button
			type="button"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			aria-label="Close"
			tabindex="-1"
			onclick={handleBackdrop}
		></button>
		<div bind:this={dialogEl} tabindex="-1" class={cn("relative", sizeClasses[size], className)}>
			{#if header}
				{@render header({ close })}
			{/if}
			{@render children({ close })}
		</div>
	</div>
{/if}
