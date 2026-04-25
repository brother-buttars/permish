<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";

	type DataMode = "online" | "hybrid" | "local";

	let {
		dataMode = $bindable(),
		initialDataMode,
		migrationProgress = "",
		applyingMode = false,
		onApply,
	}: {
		dataMode: DataMode;
		initialDataMode: DataMode;
		migrationProgress?: string;
		applyingMode?: boolean;
		onApply: () => void;
	} = $props();
</script>

<Card>
	<CardHeader>
		<CardTitle>Data Storage</CardTitle>
		<p class="text-sm text-muted-foreground">
			Choose how your data is stored and synced.
		</p>
	</CardHeader>
	<CardContent class="space-y-4">
		<div class="space-y-3">
			<label
				class="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors {dataMode ===
				'online'
					? 'border-primary bg-primary/5'
					: ''}"
			>
				<input type="radio" name="dataMode" value="online" bind:group={dataMode} class="mt-1" />
				<div>
					<div class="font-medium">Online only</div>
					<div class="text-sm text-muted-foreground">All data stored on server. Requires internet.</div>
				</div>
			</label>

			<label
				class="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors {dataMode ===
				'hybrid'
					? 'border-primary bg-primary/5'
					: ''}"
			>
				<input type="radio" name="dataMode" value="hybrid" bind:group={dataMode} class="mt-1" />
				<div>
					<div class="font-medium">Hybrid</div>
					<div class="text-sm text-muted-foreground">
						Works offline, syncs when connected. Recommended for desktop and mobile.
					</div>
				</div>
			</label>

			<label
				class="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors {dataMode ===
				'local'
					? 'border-primary bg-primary/5'
					: ''}"
			>
				<input type="radio" name="dataMode" value="local" bind:group={dataMode} class="mt-1" />
				<div>
					<div class="font-medium">Local only</div>
					<div class="text-sm text-muted-foreground">Data never leaves this device. No sync, complete privacy.</div>
				</div>
			</label>
		</div>

		{#if dataMode !== initialDataMode}
			<div
				class="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm"
			>
				{#if initialDataMode === "online" && dataMode === "hybrid"}
					Switching to hybrid will download your data for offline use. This may take a moment.
				{:else if initialDataMode === "local" && dataMode === "hybrid"}
					Switching to hybrid will upload your local data to the server.
				{:else if dataMode === "local"}
					Local-only mode means no sync. Pending changes will remain pending until you switch back.
				{:else if initialDataMode === "hybrid" && dataMode === "online"}
					Switching to online will push pending changes first, then remove local data.
				{/if}
			</div>
			{#if migrationProgress}
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
					</svg>
					{migrationProgress}
				</div>
			{/if}
			<Button onclick={onApply} variant="outline" class="w-full" disabled={applyingMode}>
				{applyingMode ? "Migrating..." : "Apply Changes"}
			</Button>
		{/if}
	</CardContent>
</Card>
