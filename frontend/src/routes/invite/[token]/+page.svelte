<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getRepository } from '$lib/data';
	import { user as userStore } from '$lib/stores/auth';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import { PageContainer } from '$lib/components/molecules';
	import { toastError, toastSuccess } from '$lib/stores/toast';
	import type { InvitePreview } from '$lib/data/types';

	let { data } = $props();
	const repo = getRepository();

	let currentUser = $state<{ id: string } | null>(null);
	const unsubscribe = userStore.subscribe((u) => { currentUser = u; });

	let preview: InvitePreview | null = $state(null);
	let loadError = $state<string | null>(null);
	let accepting = $state(false);

	$effect(() => {
		void loadPreview();
		return () => unsubscribe();
	});

	async function loadPreview() {
		try {
			preview = await repo.groups.previewInvite(data.token);
		} catch (err: any) {
			loadError = err.message || 'Invalid invite';
		}
	}

	async function accept() {
		if (!currentUser) {
			const next = encodeURIComponent($page.url.pathname + $page.url.search);
			goto(`/login?next=${next}`);
			return;
		}
		accepting = true;
		try {
			const result = await repo.groups.acceptInvite(data.token);
			toastSuccess(result.message);
			goto(`/groups/${result.group.id}`);
		} catch (err: any) {
			toastError(err.message || 'Failed to accept invite');
		} finally {
			accepting = false;
		}
	}
</script>

<svelte:head><title>You're invited</title></svelte:head>

<PageContainer size="sm">
	{#if loadError}
		<Card>
			<CardHeader><CardTitle>Invite unavailable</CardTitle></CardHeader>
			<CardContent>
				<p class="text-sm text-muted-foreground">
					This invite is {loadError.toLowerCase().includes('not_found') ? 'invalid' : loadError.replace('Invite ', '')}.
					Ask the group admin for a new one.
				</p>
			</CardContent>
			<CardFooter>
				<Button variant="outline" onclick={() => goto('/groups')}>Back to groups</Button>
			</CardFooter>
		</Card>
	{:else if !preview}
		<LoadingState />
	{:else}
		<Card>
			<CardHeader>
				<CardTitle>You're invited</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="space-y-1">
					<p class="text-sm text-muted-foreground">Group</p>
					<div class="flex items-center gap-2">
						<span class="text-lg font-semibold">{preview.group.name}</span>
						<Badge variant="secondary" class="text-xs capitalize">{preview.group.type}</Badge>
					</div>
					{#if preview.group.ward || preview.group.stake}
						<p class="text-sm text-muted-foreground">
							{preview.group.ward ?? ''}{preview.group.ward && preview.group.stake ? ' · ' : ''}{preview.group.stake ?? ''}
						</p>
					{/if}
				</div>
				<div class="grid gap-1 sm:grid-cols-3">
					<span class="text-sm text-muted-foreground">Role</span>
					<span class="sm:col-span-2 capitalize">{preview.invite.role}</span>
				</div>
				{#if preview.invite.email}
					<div class="grid gap-1 sm:grid-cols-3">
						<span class="text-sm text-muted-foreground">Sent to</span>
						<span class="sm:col-span-2">{preview.invite.email}</span>
					</div>
				{/if}
				{#if preview.invite.expires_at}
					<div class="grid gap-1 sm:grid-cols-3">
						<span class="text-sm text-muted-foreground">Expires</span>
						<span class="sm:col-span-2">{new Date(preview.invite.expires_at).toLocaleString()}</span>
					</div>
				{/if}
				{#if !currentUser}
					<p class="text-sm text-muted-foreground">
						You'll need to sign in or register to accept.
					</p>
				{/if}
			</CardContent>
			<CardFooter class="flex gap-3">
				<Button variant="outline" onclick={() => goto('/groups')}>Cancel</Button>
				<Button class="flex-1" onclick={accept} disabled={accepting}>
					{accepting ? 'Accepting...' : currentUser ? 'Accept invite' : 'Sign in to accept'}
				</Button>
			</CardFooter>
		</Card>
	{/if}
</PageContainer>
