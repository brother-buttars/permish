<script lang="ts">
	let { program = '', size = 'md' }: { program?: string | null; size?: 'sm' | 'md' | 'lg' } = $props();

	const sizeClass = $derived(
		{
			sm: 'h-6 w-6',
			md: 'h-8 w-8',
			lg: 'h-10 w-10',
		}[size] || 'h-8 w-8'
	);

	let bgClass = $derived(
		program === 'young_men'
			? 'bg-blue-100 dark:bg-blue-900/30'
			: program === 'young_women'
				? 'bg-pink-100 dark:bg-pink-900/30'
				: 'bg-muted'
	);

	let iconClass = $derived(
		program === 'young_men'
			? 'text-blue-500 dark:text-blue-400'
			: program === 'young_women'
				? 'text-pink-500 dark:text-pink-400'
				: 'text-muted-foreground'
	);
</script>

<span class="inline-flex shrink-0 items-center justify-center rounded-full {bgClass} {sizeClass}">
	<svg viewBox="0 0 24 24" fill="none" class="h-[60%] w-[60%] {iconClass}">
		<circle cx="12" cy="8" r="3.5" fill="currentColor" />
		<path d="M5.5 21a6.5 6.5 0 0 1 13 0" fill="currentColor" />
	</svg>
</span>
