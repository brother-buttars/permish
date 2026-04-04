<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Select } from "$lib/components/ui/select";
	import { Separator } from "$lib/components/ui/separator";
	import { carriers } from "$lib/utils/carriers";

	let {
		notifyEmail = $bindable(""),
		notifyPhone = $bindable(""),
		notifyCarrier = $bindable(""),
		emailError,
	}: {
		notifyEmail: string;
		notifyPhone: string;
		notifyCarrier: string;
		emailError?: string;
	} = $props();
</script>

<Card>
	<CardHeader>
		<CardTitle>Notification Settings</CardTitle>
		<p class="text-sm text-muted-foreground">Optional — get notified when forms are submitted</p>
	</CardHeader>
	<CardContent class="space-y-4">
		<div class="space-y-2">
			<Label for="notifyEmail">Notification Email</Label>
			<Input id="notifyEmail" type="email" bind:value={notifyEmail} placeholder="notify@example.com" />
			{#if emailError}<p class="text-sm text-destructive">{emailError}</p>{/if}
		</div>

		<Separator />

		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-2">
				<Label for="notifyPhone">Notification Phone</Label>
				<Input id="notifyPhone" type="tel" bind:value={notifyPhone} placeholder="(555) 123-4567" />
			</div>
			<div class="space-y-2">
				<Label for="notifyCarrier">Carrier</Label>
				<Select
					id="notifyCarrier"
					bind:value={notifyCarrier}
				>
					<option value="">Select carrier...</option>
					{#each carriers as carrier}
						<option value={carrier.value}>{carrier.label}</option>
					{/each}
				</Select>
			</div>
		</div>
	</CardContent>
</Card>
