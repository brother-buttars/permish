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

	async function openPreview(submissionId: string, participantName: string) {
		name = participantName;
		loading = true;
		isOpen = true;
		try {
			url = await getSubmissionPdfUrl(submissionId);
		} catch {
			toastError("Failed to load PDF");
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
		get loading() {
			return loading;
		},
		open: openPreview,
		close,
	};
}
