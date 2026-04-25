<script lang="ts">
	import { orgBadgeClass } from "$lib/utils/organizations";
	import { cn } from "$lib/utils";

	let {
		label,
		class: className = "",
	}: { label: string; class?: string } = $props();
</script>

<span
	class={cn(
		"rounded-full border px-2 py-0.5 text-xs font-medium",
		orgBadgeClass(label),
		className,
	)}
>
	{label}
</span>
