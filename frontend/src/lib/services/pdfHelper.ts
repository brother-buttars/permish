/**
 * PDF helper that works across all data modes.
 *
 * In online mode with a server PDF endpoint: fetches from server.
 * In all other cases (local, hybrid, or server PDF unavailable):
 * generates client-side using pdf-lib.
 */

import { getRepository, getDataMode } from '$lib/data';
import { generatePdfBytes } from './pdf';

/**
 * Get a PDF blob URL for a submission.
 * Tries server-side first (online mode), falls back to client-side generation.
 */
export async function getSubmissionPdfUrl(submissionId: string): Promise<string> {
	const repo = getRepository();
	const mode = getDataMode();

	// In online mode, try the server PDF endpoint first
	if (mode === 'online') {
		const serverUrl = repo.submissions.getPdfUrl(submissionId);
		if (serverUrl && serverUrl !== '' && serverUrl !== '#') {
			try {
				const res = await fetch(serverUrl, { credentials: 'include' });
				if (res.ok) {
					const blob = await res.blob();
					return URL.createObjectURL(blob);
				}
			} catch {
				// Server unavailable — fall through to client-side
			}
		}
	}

	// Client-side generation: fetch submission + event data, generate PDF
	return generatePdfForSubmission(submissionId);
}

/**
 * Generate a PDF client-side for a given submission ID.
 * Fetches the submission and event data from the repository, then generates the PDF.
 */
export async function generatePdfForSubmission(submissionId: string): Promise<string> {
	const repo = getRepository();

	const submission = await repo.submissions.getById(submissionId);
	const event = await repo.events.getById(submission.event_id);

	const pdfBytes = await generatePdfBytes(event, submission as any);
	const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
	return URL.createObjectURL(blob);
}

/**
 * Download a PDF for a submission (generates client-side).
 */
export async function downloadSubmissionPdf(submissionId: string): Promise<void> {
	const repo = getRepository();
	const submission = await repo.submissions.getById(submissionId);
	const event = await repo.events.getById(submission.event_id);

	const { downloadPdf } = await import('./pdf');
	await downloadPdf(event, submission as any);
}
