<script lang="ts">
	import { cn } from "$lib/utils";

	type AlertVariant = "error" | "warning" | "info";

	let {
		variant = "error",
		message,
		errors,
		class: className = "",
	}: {
		variant?: AlertVariant;
		message?: string;
		errors?: string[];
		class?: string;
	} = $props();

	const variantClasses: Record<AlertVariant, string> = {
		error: "border-destructive bg-destructive/10 text-destructive",
		warning: "border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
		info: "border-primary bg-primary/10 text-primary",
	};
</script>

{#if message || (errors && errors.length > 0)}
	<div class={cn("rounded-md border p-3 text-sm", variantClasses[variant], className)}>
		{#if message}
			<p>{message}</p>
		{/if}
		{#if errors && errors.length > 0}
			<ul class="list-disc space-y-1 pl-4">
				{#each errors as error}
					<li>{error}</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
