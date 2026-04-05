<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user, authLoading } from '$lib/stores/auth';
	import { getRepository, hasCompletedSetup } from '$lib/data';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import { decodeShareData, type ShareableEvent } from '$lib/utils/eventShare';
	import { getOrgDisplayLabels, orgBadgeClass } from '$lib/utils/organizations';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import AlertBox from '$lib/components/AlertBox.svelte';

	let eventData = $state<ShareableEvent | null>(null);
	let decodeError = $state('');
	let adding = $state(false);
	let added = $state(false);
	let needsAuth = $state(false);
	let currentUser: any = $state(null);
	let loading = $state(true);

	onMount(() => {
		// Decode event data from URL
		const params = new URLSearchParams(window.location.search);
		const data = params.get('data');

		if (!data) {
			decodeError = 'No event data found in link.';
			loading = false;
			return;
		}

		try {
			eventData = decodeShareData(data);
		} catch (err: any) {
			decodeError = err.message || 'Invalid event link.';
		}

		// Check auth status
		const unsubUser = user.subscribe(v => { currentUser = v; });
		const unsubLoading = authLoading.subscribe(v => {
			if (!v) {
				loading = false;
				if (!currentUser) {
					needsAuth = true;
				}
			}
		});

		return () => { unsubUser(); unsubLoading(); };
	});

	function parseOrgs(orgStr: string): string[] {
		try { return JSON.parse(orgStr); } catch { return []; }
	}

	async function addToMyEvents() {
		if (!eventData) return;
		adding = true;

		try {
			const repo = getRepository();
			await repo.events.create({
				event_name: eventData.event_name,
				event_dates: eventData.event_dates,
				event_start: eventData.event_start,
				event_end: eventData.event_end,
				event_description: eventData.event_description,
				ward: eventData.ward,
				stake: eventData.stake,
				leader_name: eventData.leader_name,
				leader_phone: eventData.leader_phone,
				leader_email: eventData.leader_email,
				organizations: eventData.organizations || '[]',
				additional_details: eventData.additional_details,
			} as any);

			added = true;
			toastSuccess(`"${eventData.event_name}" added to your events.`);
		} catch (err: any) {
			toastError(err.message || 'Failed to add event.');
		} finally {
			adding = false;
		}
	}

	function loginThenReturn() {
		// Save the current URL so we can return after login
		const returnUrl = window.location.pathname + window.location.search;
		localStorage.setItem('permish_return_url', returnUrl);
		goto('/login');
	}
</script>

<svelte:head>
	<title>{eventData ? `Import: ${eventData.event_name}` : 'Import Event'} — Permish</title>
</svelte:head>

<div class="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-8">
	<Card class="w-full max-w-lg">
		<CardHeader>
			<CardTitle>
				{#if added}
					Event Added
				{:else}
					Shared Event
				{/if}
			</CardTitle>
			<CardDescription>
				{#if added}
					This event has been added to your events.
				{:else if eventData}
					Someone shared an event with you. Review the details below.
				{:else}
					Loading event details...
				{/if}
			</CardDescription>
		</CardHeader>

		<CardContent class="space-y-4">
			{#if loading}
				<LoadingState />
			{:else if decodeError}
				<AlertBox message={decodeError} />
				<Button variant="outline" class="w-full" onclick={() => goto('/')}>
					Go Home
				</Button>
			{:else if eventData}
				<!-- Event preview -->
				<div class="space-y-3">
					<div>
						<h3 class="text-xl font-bold">{eventData.event_name}</h3>
						<p class="text-sm text-muted-foreground">{eventData.event_dates}</p>
					</div>

					<p class="text-sm">{eventData.event_description}</p>

					<div class="grid grid-cols-2 gap-3 text-sm">
						<div>
							<span class="text-muted-foreground">Ward</span>
							<p class="font-medium">{eventData.ward}</p>
						</div>
						<div>
							<span class="text-muted-foreground">Stake</span>
							<p class="font-medium">{eventData.stake}</p>
						</div>
					</div>

					<div class="text-sm">
						<span class="text-muted-foreground">Event Leader</span>
						<p class="font-medium">{eventData.leader_name}</p>
						<p class="text-muted-foreground">{eventData.leader_phone} · {eventData.leader_email}</p>
					</div>

					{#if eventData.organizations}
						{@const orgs = parseOrgs(eventData.organizations)}
						{#if orgs.length > 0}
							<div class="flex flex-wrap gap-1.5">
								{#each getOrgDisplayLabels(orgs) as label}
									<Badge variant="secondary" class={orgBadgeClass(label)}>
										{label}
									</Badge>
								{/each}
							</div>
						{/if}
					{/if}

					{#if eventData.additional_details}
						<div class="text-sm">
							<span class="text-muted-foreground">Additional Details</span>
							<p>{eventData.additional_details}</p>
						</div>
					{/if}
				</div>

				<!-- Actions -->
				{#if added}
					<div class="space-y-2">
						<Button class="w-full" onclick={() => goto('/events')}>
							View My Events
						</Button>
					</div>
				{:else if needsAuth}
					<div class="space-y-3">
						<div class="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-center">
							Sign in to add this event to your account.
						</div>
						<Button class="w-full" onclick={loginThenReturn}>
							Sign In & Add Event
						</Button>
						<p class="text-xs text-muted-foreground text-center">
							Don't have an account?
							<a href="/register" class="text-primary underline">Register</a>
						</p>
					</div>
				{:else}
					<Button class="w-full" onclick={addToMyEvents} disabled={adding}>
						{adding ? 'Adding...' : 'Add to My Events'}
					</Button>
				{/if}
			{/if}
		</CardContent>
	</Card>
</div>
