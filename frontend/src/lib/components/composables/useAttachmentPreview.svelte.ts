import { toastError } from "$lib/stores/toast";

interface Attachment {
	id: string;
	original_name: string;
	mime_type: string;
}

interface UseAttachmentPreviewOptions {
	getUrl: (att: Attachment) => string;
}

/**
 * Attachment preview lifecycle. Replaces the inlined
 * `attachPreviewOpen` / `attachPreviewUrl` / `attachPreviewName` /
 * `attachPreviewType` / `attachPreviewLoading` quintuple in event/[id].
 *
 * Usage:
 *   const att = useAttachmentPreview({ getUrl: (a) => repo.attachments.getUrl(eventId, a.id) });
 *   ...
 *   <button onclick={() => att.open(attachment)}>Preview</button>
 *   <EventAttachmentPreviewModal
 *     bind:open={att.isOpen}
 *     name={att.name}
 *     url={att.url}
 *     mimeType={att.mimeType}
 *     loading={att.loading}
 *     onclose={att.close}
 *   />
 */
export function useAttachmentPreview(opts: UseAttachmentPreviewOptions) {
	let isOpen = $state(false);
	let url = $state("");
	let name = $state("");
	let mimeType = $state("");
	let loading = $state(false);

	async function openPreview(att: Attachment) {
		name = att.original_name;
		mimeType = att.mime_type;
		loading = true;
		isOpen = true;
		try {
			const fetchUrl = opts.getUrl(att);
			const res = await fetch(fetchUrl, { credentials: "include" });
			const blob = await res.blob();
			url = URL.createObjectURL(blob);
		} catch {
			toastError("Failed to load attachment");
			isOpen = false;
		} finally {
			loading = false;
		}
	}

	function close() {
		isOpen = false;
		if (url) {
			URL.revokeObjectURL(url);
			url = "";
		}
	}

	return {
		get isOpen() {
			return isOpen;
		},
		set isOpen(v: boolean) {
			isOpen = v;
		},
		get url() {
			return url;
		},
		get name() {
			return name;
		},
		get mimeType() {
			return mimeType;
		},
		get loading() {
			return loading;
		},
		open: openPreview,
		close,
	};
}
