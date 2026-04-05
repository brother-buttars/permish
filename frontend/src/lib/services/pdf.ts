/**
 * Client-side PDF generation using pdf-lib.
 *
 * Fills the official LDS Church permission form template with event
 * and submission data. Works in any mode (online, local, hybrid, PWA).
 *
 * This is a browser-compatible port of backend/src/services/pdf.js.
 */

import { PDFDocument, PDFName } from 'pdf-lib';

const TEMPLATE_URL = '/permission-form-template.pdf';

// Cache the template bytes so we only fetch once
let templateCache: ArrayBuffer | null = null;

async function loadTemplate(): Promise<ArrayBuffer> {
	if (templateCache) return templateCache;
	const res = await fetch(TEMPLATE_URL);
	if (!res.ok) throw new Error('Failed to load PDF template');
	templateCache = await res.arrayBuffer();
	return templateCache;
}

function formatDateForPdf(dateStr: string | undefined | null): string {
	if (!dateStr) return '';
	const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
	if (isNaN(d.getTime())) return dateStr;
	return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function base64ToBytes(base64DataUrl: string): Uint8Array {
	const base64 = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

interface EventData {
	event_name: string;
	event_dates: string;
	event_description: string;
	ward: string;
	stake: string;
	leader_name: string;
	leader_phone: string;
	leader_email: string;
}

interface SubmissionData {
	participant_name: string;
	participant_dob: string;
	participant_age: number;
	participant_phone?: string;
	address?: string;
	city?: string;
	state_province?: string;
	emergency_contact?: string;
	emergency_phone_primary?: string;
	emergency_phone_secondary?: string;
	special_diet?: boolean;
	special_diet_details?: string;
	allergies?: boolean;
	allergies_details?: string;
	medications?: string;
	can_self_administer_meds?: boolean;
	chronic_illness?: boolean;
	chronic_illness_details?: string;
	recent_surgery?: boolean;
	recent_surgery_details?: string;
	activity_limitations?: string;
	other_accommodations?: string;
	participant_signature?: string;
	participant_signature_type: 'drawn' | 'typed' | 'hand';
	participant_signature_date: string;
	guardian_signature?: string;
	guardian_signature_type?: 'drawn' | 'typed' | 'hand';
	guardian_signature_date?: string;
}

/**
 * Generate a filled PDF from event and submission data.
 * Returns the PDF as a Uint8Array (can be downloaded or stored).
 */
export async function generatePdfBytes(
	event: EventData,
	submission: SubmissionData
): Promise<Uint8Array> {
	const templateBytes = await loadTemplate();
	const pdfDoc = await PDFDocument.load(templateBytes);
	const form = pdfDoc.getForm();

	function setText(fieldName: string, value: string | undefined | null) {
		try {
			const field = form.getTextField(fieldName);
			field.setText(value || '');
		} catch {
			// Field not found
		}
	}

	function setYesNo(fieldName: string, value: boolean) {
		try {
			const field = form.getCheckBox(fieldName);
			const widgets = field.acroField.getWidgets();
			if (value) {
				widgets[0].dict.set(PDFName.of('AS'), PDFName.of('Yes'));
				if (widgets[1]) widgets[1].dict.set(PDFName.of('AS'), PDFName.of('Off'));
				field.acroField.dict.set(PDFName.of('V'), PDFName.of('Yes'));
			} else {
				widgets[0].dict.set(PDFName.of('AS'), PDFName.of('Off'));
				if (widgets[1]) widgets[1].dict.set(PDFName.of('AS'), PDFName.of('No'));
				field.acroField.dict.set(PDFName.of('V'), PDFName.of('No'));
			}
		} catch {
			// Field not found
		}
	}

	// Event Details
	setText('Event', event.event_name);
	setText('Dates of event', event.event_dates);
	setText('Event description', event.event_description);
	setText('Ward', event.ward);
	setText('Stake', event.stake);
	setText('Event or activity leader', event.leader_name);
	setText('Event or activity leaders phone number', event.leader_phone);
	setText('Event or activity leaders email', event.leader_email);

	// Contact Information
	setText('Participant', submission.participant_name);
	setText('Date of birth', formatDateForPdf(submission.participant_dob));
	setText('Age', submission.participant_age != null ? String(submission.participant_age) : '');
	setText('Telephone number', submission.participant_phone);
	setText('Address', submission.address);
	setText('City', submission.city);
	setText('State or Province', submission.state_province);
	setText('Emergency contact parent or guardian', submission.emergency_contact);
	setText('Primary phone_1', submission.emergency_phone_primary);
	setText('Secondary phone_1', submission.emergency_phone_secondary);

	// Medical Information
	setYesNo('Special diet', !!submission.special_diet);
	setText('diet explanation', submission.special_diet_details);
	setYesNo('Allergies', !!submission.allergies);
	setText('Allergy explanation', submission.allergies_details);
	setText('List of Medications', submission.medications);
	setYesNo('Self Admin', !!submission.can_self_administer_meds);

	// Conditions
	setYesNo('Chronic illness', !!submission.chronic_illness);
	setText('illness explanation', submission.chronic_illness_details);
	setYesNo('Surgery', !!submission.recent_surgery);
	setText('If yes please explain_2', submission.recent_surgery_details);
	setText('Other limitations', submission.activity_limitations);

	// Other Accommodations
	setText('Special needs', submission.other_accommodations);

	// Signatures
	if (submission.participant_signature_type === 'typed') {
		setText('Participants signature', submission.participant_signature);
	} else {
		setText('Participants signature', '');
	}
	setText('Date', formatDateForPdf(submission.participant_signature_date));

	if (submission.guardian_signature) {
		if (submission.guardian_signature_type === 'typed') {
			setText('Parent or guardians signature if participant is a minor', submission.guardian_signature);
		} else {
			setText('Parent or guardians signature if participant is a minor', '');
		}
	} else {
		setText('Parent or guardians signature if participant is a minor', '');
	}
	setText('Date_2', formatDateForPdf(submission.guardian_signature_date));

	// Embed drawn signatures as images
	const pages = pdfDoc.getPages();
	const firstPage = pages[0];

	async function embedSignature(fieldName: string, dataUrl: string) {
		if (!dataUrl || !dataUrl.startsWith('data:image')) return;
		try {
			const imageBytes = base64ToBytes(dataUrl);
			const image = await pdfDoc.embedPng(imageBytes);
			const field = form.getTextField(fieldName);
			const widgets = field.acroField.getWidgets();
			if (widgets.length === 0) return;
			const widget = widgets[0];
			const rect = widget.getRectangle();

			field.setText('');

			const scale = Math.min(rect.width / image.width, rect.height / image.height, 1);
			const drawWidth = image.width * scale;
			const drawHeight = image.height * scale;
			const x = rect.x + 2;
			const y = rect.y + (rect.height - drawHeight) / 2;

			firstPage.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
		} catch {
			setText(fieldName, '[Signed]');
		}
	}

	if (submission.participant_signature_type === 'drawn' && submission.participant_signature) {
		await embedSignature('Participants signature', submission.participant_signature);
	}
	if (submission.guardian_signature_type === 'drawn' && submission.guardian_signature) {
		await embedSignature('Parent or guardians signature if participant is a minor', submission.guardian_signature);
	}

	// Remove second page
	if (pdfDoc.getPageCount() > 1) {
		pdfDoc.removePage(1);
	}

	// Flatten form
	form.flatten();

	return pdfDoc.save();
}

/**
 * Generate and download a PDF for a submission.
 */
export async function downloadPdf(
	event: EventData,
	submission: SubmissionData
): Promise<void> {
	const pdfBytes = await generatePdfBytes(event, submission);
	const blob = new Blob([pdfBytes], { type: 'application/pdf' });
	const name = `permish-${submission.participant_name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase()}.pdf`;
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

/**
 * Generate a PDF and return it as a blob URL (for preview/viewing).
 */
export async function getPdfBlobUrl(
	event: EventData,
	submission: SubmissionData
): Promise<string> {
	const pdfBytes = await generatePdfBytes(event, submission);
	const blob = new Blob([pdfBytes], { type: 'application/pdf' });
	return URL.createObjectURL(blob);
}
