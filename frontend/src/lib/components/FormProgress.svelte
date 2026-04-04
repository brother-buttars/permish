<script lang="ts">
	import { onMount } from "svelte";

	let {
		sections,
	}: {
		sections: { id: string; label: string }[];
	} = $props();

	let activeIndex = $state(0);

	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const idx = sections.findIndex(s => s.id === entry.target.id);
						if (idx !== -1) activeIndex = idx;
					}
				}
			},
			{ rootMargin: "-20% 0px -70% 0px" }
		);

		for (const section of sections) {
			const el = document.getElementById(section.id);
			if (el) observer.observe(el);
		}

		return () => observer.disconnect();
	});

	function scrollTo(id: string) {
		document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
	}
</script>

<div class="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm px-4 py-2">
	<div class="flex items-center justify-between gap-1 max-w-3xl mx-auto">
		<span class="text-xs font-medium text-muted-foreground whitespace-nowrap">
			{activeIndex + 1}/{sections.length}
		</span>
		<div class="flex items-center gap-1 flex-1 justify-center">
			{#each sections as section, i}
				<button
					class="group flex items-center gap-0.5"
					onclick={() => scrollTo(section.id)}
					aria-label="Go to {section.label}"
				>
					<div
						class="h-1.5 rounded-full transition-all duration-200 {i <= activeIndex ? 'bg-primary' : 'bg-muted-foreground/20'} {i === activeIndex ? 'w-6' : 'w-2'}"
					></div>
				</button>
			{/each}
		</div>
		<span class="text-xs text-muted-foreground truncate max-w-[8rem] text-right">
			{sections[activeIndex]?.label}
		</span>
	</div>
</div>
