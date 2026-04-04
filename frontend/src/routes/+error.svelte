<script lang="ts">
	import { page } from "$app/stores";
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent } from "$lib/components/ui/card";

	let status = $derived($page.status);
	let message = $derived($page.error?.message || "Something went wrong");
</script>

<svelte:head>
	<title>{status} — Permish</title>
</svelte:head>

<div class="container mx-auto flex min-h-[calc(100vh-8rem)] max-w-md items-center justify-center px-4">
	<Card class="w-full text-center">
		<CardContent class="py-12">
			<p class="mb-2 text-6xl font-bold text-muted-foreground">{status}</p>
			<p class="mb-6 text-lg text-muted-foreground">{message}</p>
			<div class="flex justify-center gap-3">
				<Button variant="outline" onclick={() => history.back()}>Go Back</Button>
				<Button onclick={() => window.location.href = '/dashboard'}>Dashboard</Button>
			</div>
		</CardContent>
	</Card>
</div>
