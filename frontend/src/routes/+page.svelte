<script lang="ts">
	import { user, authLoading } from '$lib/stores/auth';
	import { Button } from '$lib/components/ui/button/index.js';

	let currentUser = $derived.by(() => {
		let val: any = null;
		const unsub = user.subscribe((v) => (val = v));
		unsub();
		return val;
	});

	let loading = $derived.by(() => {
		let val = true;
		const unsub = authLoading.subscribe((v) => (val = v));
		unsub();
		return val;
	});
</script>

<div class="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4">
	<div class="max-w-xl text-center space-y-6">
		<h1 class="text-4xl font-bold tracking-tight sm:text-5xl">Permission Forms</h1>
		<p class="text-lg text-muted-foreground">
			Simplify event permission management. Create events, collect signed permission forms from
			parents, and keep everything organized in one place.
		</p>

		{#if !loading}
			{#if currentUser}
				<div>
					<a href="/dashboard">
						<Button size="lg">Go to Dashboard</Button>
					</a>
				</div>
			{:else}
				<div class="flex flex-col sm:flex-row gap-4 justify-center">
					<a href="/login">
						<Button variant="outline" size="lg" class="w-full sm:w-auto">Login</Button>
					</a>
					<a href="/register">
						<Button size="lg" class="w-full sm:w-auto">Register</Button>
					</a>
				</div>
			{/if}
		{/if}
	</div>
</div>
