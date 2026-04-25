<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";
	import { Separator } from "$lib/components/ui/separator";
	import { OrgBadge } from "$lib/components/atoms";
	import { parseOrgs } from "$lib/utils/events";
	import { getOrgDisplayLabels } from "$lib/utils/organizations";
	import { formatFileSize } from "$lib/utils/format";
	import { linkify } from "$lib/utils/linkify";

	interface Attachment {
		id: string;
		original_name: string;
		mime_type: string;
		size: number;
	}

	let {
		event,
		attachments,
		formUrl,
		copySuccess = false,
		onCopyUrl,
		onShowQr,
		onShareEvent,
		onAttachmentPreview,
		onAttachmentDownload,
	}: {
		event: any;
		attachments: Attachment[];
		formUrl: string;
		copySuccess?: boolean;
		onCopyUrl: () => void;
		onShowQr: () => void;
		onShareEvent: () => void;
		onAttachmentPreview: (att: Attachment) => void;
		onAttachmentDownload: (att: Attachment) => void;
	} = $props();

	function isPreviewable(mimeType: string): boolean {
		return mimeType === "application/pdf" || mimeType.startsWith("image/");
	}
</script>

<Card class="mb-6">
	<CardHeader>
		<CardTitle>Activity Details</CardTitle>
	</CardHeader>
	<CardContent class="space-y-3">
		{#if event.event_description}
			<p class="text-sm">{event.event_description}</p>
		{/if}
		<div class="grid gap-2 text-sm sm:grid-cols-2">
			{#if event.ward}
				<div><span class="font-medium">Ward:</span> {event.ward}</div>
			{/if}
			{#if event.stake}
				<div><span class="font-medium">Stake:</span> {event.stake}</div>
			{/if}
			{#if event.leader_name}
				<div><span class="font-medium">Leader:</span> {event.leader_name}</div>
			{/if}
			{#if event.leader_phone}
				<div><span class="font-medium">Phone:</span> {event.leader_phone}</div>
			{/if}
			{#if event.leader_email}
				<div><span class="font-medium">Email:</span> {event.leader_email}</div>
			{/if}
		</div>

		{#if parseOrgs(event).length > 0}
			<div>
				<p class="mb-2 text-sm font-medium">Organizations</p>
				<div class="flex flex-wrap gap-1">
					{#each getOrgDisplayLabels(parseOrgs(event)) as label}
						<OrgBadge {label} />
					{/each}
				</div>
			</div>
		{/if}

		{#if event.additional_details}
			<Separator />
			<div>
				<p class="mb-2 text-sm font-medium">Additional Details</p>
				<div class="text-sm leading-relaxed">{@html linkify(event.additional_details)}</div>
			</div>
		{/if}

		{#if attachments.length > 0}
			<Separator />
			<div>
				<p class="mb-2 text-sm font-medium">Attachments</p>
				<ul class="space-y-1">
					{#each attachments as att (att.id)}
						<li class="flex items-center gap-2 text-sm">
							{#if att.mime_type === "application/pdf"}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
							{:else if att.mime_type?.startsWith("image/")}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
							{/if}
							{#if isPreviewable(att.mime_type)}
								<button class="text-primary underline hover:no-underline" onclick={() => onAttachmentPreview(att)}>
									{att.original_name}
								</button>
							{:else}
								<button class="text-primary underline hover:no-underline" onclick={() => onAttachmentDownload(att)}>
									{att.original_name}
								</button>
							{/if}
							<span class="text-muted-foreground">({formatFileSize(att.size)})</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<Separator />

		<div>
			<p class="mb-2 text-sm font-medium">Shareable Form URL</p>
			<div class="flex flex-col gap-2 sm:flex-row">
				<input
					type="text"
					readonly
					value={formUrl}
					class="flex h-10 flex-1 rounded-md border border-input bg-muted px-3 py-2 text-sm"
				/>
				<Button variant="outline" onclick={onCopyUrl}>
					{copySuccess ? "Copied!" : "Copy URL"}
				</Button>
				<a href={formUrl} target="_blank" rel="noopener noreferrer">
					<Button variant="outline">Open Form</Button>
				</a>
				<Button variant="outline" onclick={onShowQr}>
					<svg xmlns="http://www.w3.org/2000/svg" class="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<rect x="3" y="3" width="7" height="7" />
						<rect x="14" y="3" width="7" height="7" />
						<rect x="3" y="14" width="7" height="7" />
						<rect x="14" y="14" width="3" height="3" />
						<rect x="18" y="14" width="3" height="3" />
						<rect x="14" y="18" width="3" height="3" />
						<rect x="18" y="18" width="3" height="3" />
					</svg>
					QR Code
				</Button>
				<Button variant="outline" onclick={onShareEvent}>
					<svg xmlns="http://www.w3.org/2000/svg" class="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
						<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
					</svg>
					Share Activity
				</Button>
			</div>
		</div>
	</CardContent>
</Card>
