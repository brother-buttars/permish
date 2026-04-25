<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";
	import type { SyncStatus } from "$lib/data/sync/manager";

	interface PendingChange {
		id: string;
		operation: string;
		collection: string;
		last_error?: string;
		retry_count: number;
	}

	let {
		syncStatus,
		pendingCount,
		failedChanges,
		onSync,
		onRetry,
		onAskDiscard,
	}: {
		syncStatus: SyncStatus;
		pendingCount: number;
		failedChanges: PendingChange[];
		onSync: () => void;
		onRetry: (id: string) => void;
		onAskDiscard: (id: string) => void;
	} = $props();
</script>

<Card>
	<CardHeader>
		<CardTitle class="flex items-center justify-between">
			<span>Pending Changes</span>
			<span class="text-sm font-normal text-muted-foreground">
				{#if syncStatus === "syncing"}
					Syncing...
				{:else if syncStatus === "offline"}
					Offline
				{:else if syncStatus === "error"}
					Sync error
				{:else if syncStatus === "idle"}
					Synced
				{/if}
			</span>
		</CardTitle>
		<p class="text-sm text-muted-foreground">
			Changes made while offline are queued and synced when connected.
		</p>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if pendingCount === 0 && failedChanges.length === 0}
			<p class="text-sm text-muted-foreground text-center py-4">All changes synced.</p>
		{:else}
			{#if pendingCount > 0}
				<div class="flex items-center justify-between rounded-lg border p-3">
					<div>
						<span class="font-medium">{pendingCount}</span>
						<span class="text-sm text-muted-foreground"> change{pendingCount !== 1 ? "s" : ""} waiting to sync</span>
					</div>
					<Button variant="outline" size="sm" onclick={onSync} disabled={syncStatus === "syncing"}>
						{syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
					</Button>
				</div>
			{/if}

			{#if failedChanges.length > 0}
				<div class="space-y-2">
					<p class="text-sm font-medium text-destructive">Failed Changes</p>
					{#each failedChanges as change (change.id)}
						<div
							class="flex items-start justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3"
						>
							<div class="min-w-0 flex-1">
								<div class="text-sm font-medium capitalize">{change.operation} {change.collection}</div>
								<div class="text-xs text-muted-foreground truncate">{change.last_error || "Unknown error"}</div>
								<div class="text-xs text-muted-foreground">Retries: {change.retry_count}</div>
							</div>
							<div class="flex gap-1">
								<Button variant="outline" size="sm" onclick={() => onRetry(change.id)}>Retry</Button>
								<Button variant="ghost" size="sm" onclick={() => onAskDiscard(change.id)}>Discard</Button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</CardContent>
</Card>
