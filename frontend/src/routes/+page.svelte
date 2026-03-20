<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user, authLoading } from '$lib/stores/auth';
	import { Button } from '$lib/components/ui/button/index.js';

	let currentUser: any = $state(null);
	let loading = $state(true);

	onMount(() => {
		const unsubUser = user.subscribe((v) => { currentUser = v; });
		const unsubLoading = authLoading.subscribe((v) => {
			loading = v;
			if (!v && currentUser) {
				goto('/dashboard');
			}
		});

		return () => { unsubUser(); unsubLoading(); };
	});
</script>

<div class="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4">
	<div class="max-w-xl text-center space-y-6">
		<h1 class="text-4xl font-bold tracking-tight sm:text-5xl">Permission Forms</h1>
		<p class="text-lg text-muted-foreground">
			Simplify event permission management. Create events, collect signed permission forms from
			parents, and keep everything organized in one place.
		</p>

		{#if !loading && !currentUser}
			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a href="/login">
					<Button variant="outline" size="lg" class="w-full sm:w-auto">Login</Button>
				</a>
				<a href="/register">
					<Button size="lg" class="w-full sm:w-auto">Register</Button>
				</a>
			</div>
		{/if}
	</div>
</div>
