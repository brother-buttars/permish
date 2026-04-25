<script lang="ts">
	import { youthClassBadgeClass, type YouthProgram } from "$lib/utils/youthClass";
	import { cn } from "$lib/utils";

	let {
		label,
		program,
		class: className = "",
	}: { label: string; program: YouthProgram; class?: string } = $props();
</script>

<span
	class={cn(
		"rounded-full border px-2 py-0.5 text-xs font-medium",
		youthClassBadgeClass(program),
		className,
	)}
>
	{label}
</span>
