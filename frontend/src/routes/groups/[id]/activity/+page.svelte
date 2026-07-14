<script lang="ts">
	import { goto } from '$app/navigation';
	import { getRepository } from '$lib/data';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { formatDate } from '$lib/utils/formatDate';
	import type { AuditEntry } from '$lib/data/types';
	import { getGroupContext } from '../_context.svelte';
	import { formatAuditAction } from '../_lib';

	const ctx = getGroupContext();

	let auditLoaded = $state(false);
	let auditEntries: AuditEntry[] = $state([]);

	const repo = getRepository();

	$effect(() => {
		if (ctx.group && !ctx.isAdmin) {
			goto(`/groups/${ctx.groupId}`, { replaceState: true });
		}
	});

	$effect(() => {
		if (ctx.group && ctx.isAdmin && !auditLoaded) {
			loadAudit();
		}
	});

	async function loadAudit() {
		try {
			auditEntries = await repo.groups.getAuditLog(ctx.groupId, { limit: 100 });
		} catch {
			auditEntries = [];
		} finally {
			auditLoaded = true;
		}
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>Activity</CardTitle>
	</CardHeader>
	<CardContent>
		{#if !auditLoaded}
			<p class="text-sm text-muted-foreground py-4 text-center">Loading…</p>
		{:else if auditEntries.length === 0}
			<p class="text-sm text-muted-foreground py-4 text-center">No activity yet.</p>
		{:else}
			<ul class="divide-y divide-border">
				{#each auditEntries as entry (entry.id)}
					<li class="flex items-start justify-between gap-4 py-3">
						<p class="text-sm">{formatAuditAction(entry)}</p>
						<span class="shrink-0 text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</CardContent>
</Card>
