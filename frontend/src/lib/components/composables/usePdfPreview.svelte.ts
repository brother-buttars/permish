import { toastError } from "$lib/stores/toast";
import { getSubmissionPdfUrl } from "$lib/services/pdfHelper";

/**
 * PDF preview modal lifecycle. Replaces the inlined
 * `pdfModalOpen` / `pdfModalUrl` / `pdfModalName` / `pdfLoading` state
 * that was duplicated across event/[id], submissions, dashboard.
 *
 * Usage:
 *   const pdf = usePdfPreview();
 *   ...
 *   <Button onclick={() => pdf.open(submissionId, participantName)}>PDF</Button>
 *   <PdfModal
 *     bind:open={pdf.isOpen}
 *     url={pdf.url}
 *     name={pdf.name}
 *     loading={pdf.loading}
 *     onclose={pdf.close}
 *   />
 */
export function usePdfPreview() {
	let isOpen = $state(false);
	let url = $state("");
	let name = $state("");
	let loading = $state(false);
	// Guards against races: a slow response for an earlier open() must not
	// clobber (and leak past) the URL of a newer open, or resurrect a URL
	// after close() already ran.
	let requestSeq = 0;

	function revokeCurrent() {
		if (url) {
			URL.revokeObjectURL(url);
			url = "";
		}
	}

	async function openPreview(submissionId: string, participantName: string) {
		const seq = ++requestSeq;
		revokeCurrent();
		name = participantName;
		loading = true;
		isOpen = true;
		try {
			const next = await getSubmissionPdfUrl(submissionId);
			if (seq !== requestSeq) {
				// A newer open() or close() superseded this request — the blob
				// would otherwise be orphaned in memory forever.
				URL.revokeObjectURL(next);
				return;
			}
			url = next;
		} catch {
			if (seq === requestSeq) {
				toastError("Failed to load PDF");
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
		get loading() {
			return loading;
		},
		open: openPreview,
		close,
	};
}
