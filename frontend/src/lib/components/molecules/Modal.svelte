<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "$lib/utils";

	type ModalSize = "sm" | "md" | "lg" | "fullscreen";

	interface ModalContext {
		close: () => void;
	}

	let {
		open = $bindable(false),
		size = "md",
		closeOnBackdrop = true,
		onclose,
		header,
		children,
		class: className = "",
	}: {
		open?: boolean;
		size?: ModalSize;
		closeOnBackdrop?: boolean;
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

	function close() {
		open = false;
		onclose?.();
	}

	function handleBackdrop() {
		if (closeOnBackdrop) close();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (open && e.key === "Escape") close();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center"
		role="dialog"
		aria-modal="true"
	>
		<button
			type="button"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			aria-label="Close"
			onclick={handleBackdrop}
		></button>
		<div class={cn("relative", sizeClasses[size], className)}>
			{#if header}
				{@render header({ close })}
			{/if}
			{@render children({ close })}
		</div>
	</div>
{/if}
