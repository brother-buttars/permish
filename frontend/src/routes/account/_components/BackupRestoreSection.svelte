<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Separator } from "$lib/components/ui/separator";

	let {
		backupPassphrase = $bindable(""),
		restorePassphrase = $bindable(""),
		restoreFile,
		exporting = false,
		restoring = false,
		onExport,
		onFileSelect,
		onAskRestore,
	}: {
		backupPassphrase?: string;
		restorePassphrase?: string;
		restoreFile: File | null;
		exporting?: boolean;
		restoring?: boolean;
		onExport: () => void;
		onFileSelect: (e: Event) => void;
		onAskRestore: () => void;
	} = $props();
</script>

<Card>
	<CardHeader>
		<CardTitle>Backup & Restore</CardTitle>
		<p class="text-sm text-muted-foreground">
			Export your data as an encrypted backup file, or restore from a previous backup.
		</p>
	</CardHeader>
	<CardContent class="space-y-4">
		<div class="space-y-2">
			<Label for="backupPassphrase">Encryption Passphrase (optional)</Label>
			<Input
				id="backupPassphrase"
				type="password"
				bind:value={backupPassphrase}
				placeholder="Leave empty for unencrypted backup"
			/>
		</div>
		<Button onclick={onExport} variant="outline" class="w-full" disabled={exporting}>
			{exporting ? "Exporting..." : "Export Backup"}
		</Button>

		<Separator />

		<div class="space-y-2">
			<Label for="restoreFile">Restore from Backup</Label>
			<Input id="restoreFile" type="file" accept=".permish-backup" onchange={onFileSelect} />
		</div>
		{#if restoreFile}
			<div class="space-y-2">
				<Label for="restorePassphrase">Decryption Passphrase</Label>
				<Input
					id="restorePassphrase"
					type="password"
					bind:value={restorePassphrase}
					placeholder="Enter passphrase if backup was encrypted"
				/>
			</div>
			<Button onclick={onAskRestore} variant="destructive" class="w-full" disabled={restoring}>
				{restoring ? "Restoring..." : "Restore Backup"}
			</Button>
		{/if}
	</CardContent>
</Card>
