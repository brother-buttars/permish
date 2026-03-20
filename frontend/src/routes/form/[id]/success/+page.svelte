<script lang="ts">
	import { goto } from "$app/navigation";
	import { user } from "$lib/stores/auth";
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent } from "$lib/components/ui/card";

	let currentUser: any = $state(null);

	const unsub = user.subscribe((u) => {
		currentUser = u;
	});
</script>

<svelte:head>
	<title>Form Submitted</title>
</svelte:head>

<div class="container mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-4 py-8">
	<Card class="w-full text-center">
		<CardContent class="space-y-4 py-12">
			<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-8 w-8 text-green-600"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
			</div>
			<h1 class="text-2xl font-bold">Form Submitted Successfully!</h1>
			<p class="text-muted-foreground">
				Your permission form has been submitted successfully. The event organizer will be notified.
			</p>
			{#if currentUser}
				<Button onclick={() => goto("/dashboard")}>Go to Dashboard</Button>
			{:else}
				<p class="text-sm text-muted-foreground">
					You can close this page now, or
					<button class="text-primary underline" onclick={() => goto("/login")}
						>log in</button
					>
					to view your submissions.
				</p>
			{/if}
		</CardContent>
	</Card>
</div>
