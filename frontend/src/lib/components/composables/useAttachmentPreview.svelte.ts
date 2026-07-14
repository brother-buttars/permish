import { toastError } from "$lib/stores/toast";

interface Attachment {
	id: string;
	original_name: string;
	mime_type: string;
}

interface UseAttachmentPreviewOptions {
	/** May resolve asynchronously — the local adapter loads blobs lazily. */
	getUrl: (att: Attachment) => string | Promise<string>;
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
	// See usePdfPreview — prevents stale responses from leaking blob URLs.
	let requestSeq = 0;

	function revokeCurrent() {
		if (url) {
			URL.revokeObjectURL(url);
			url = "";
		}
	}

	async function openPreview(att: Attachment) {
		const seq = ++requestSeq;
		revokeCurrent();
		name = att.original_name;
		mimeType = att.mime_type;
		loading = true;
		isOpen = true;
		try {
			const fetchUrl = await opts.getUrl(att);
			if (!fetchUrl) throw new Error("Attachment unavailable");
			const res = await fetch(fetchUrl, { credentials: "include" });
			if (!res.ok) throw new Error("Attachment unavailable");
			const blob = await res.blob();
			const next = URL.createObjectURL(blob);
			if (seq !== requestSeq) {
				URL.revokeObjectURL(next);
				return;
			}
			url = next;
		} catch {
			if (seq === requestSeq) {
				toastError("Failed to load attachment");
				isOpen = false;
			}
		} finally {
			if (seq === requestSeq) loading = false;
		}
	}

	function close() {
		requestSeq++;
		isOpen = false;
		loading = false;
		revokeCurrent();
	}

	return {
		get isOpen() {
			return isOpen;
		},
		set isOpen(v: boolean) {
			isOpen = v;
			if (!v) close();
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
