import { PDFDocument, PDFName } from 'pdf-lib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Fills the actual official church permission form — ported verbatim from
// backend/src/services/pdf.js. This is the one server-only job (pdf-lib field fill
// + drawn-signature embedding + flatten) that kept a Node sidecar alive under PocketBase.

const templatePdfPath = fileURLToPath(new URL('../templates/permission-form.pdf', import.meta.url));

function formatDateForPdf(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function embedSignatureImage(
  pdfDoc: PDFDocument,
  page: ReturnType<PDFDocument['getPages']>[number],
  fieldName: string,
  base64DataUrl: string,
  form: ReturnType<PDFDocument['getForm']>
) {
  if (!base64DataUrl || !base64DataUrl.startsWith('data:image')) return;
  const base64Data = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
  const imageBytes = Buffer.from(base64Data, 'base64');
  const image = await pdfDoc.embedPng(imageBytes);

  const field = form.getTextField(fieldName);
  const widgets = field.acroField.getWidgets();
  if (widgets.length === 0) return;
  const rect = widgets[0].getRectangle();

  field.setText('');
  const scale = Math.min(rect.width / image.width, rect.height / image.height, 1);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.drawImage(image, { x: rect.x + 2, y: rect.y + (rect.height - drawHeight) / 2, width: drawWidth, height: drawHeight });
}

export interface PdfEvent {
  event_name: string; event_dates: string; event_description: string;
  ward: string; stake: string; leader_name: string; leader_phone: string; leader_email: string;
}
export interface PdfSubmission {
  id: string;
  participant_name: string; participant_dob: string; participant_age?: number | null;
  participant_phone?: string | null; address?: string | null; city?: string | null; state_province?: string | null;
  emergency_contact?: string | null; emergency_phone_primary?: string | null; emergency_phone_secondary?: string | null;
  special_diet?: number | boolean; special_diet_details?: string | null;
  allergies?: number | boolean; allergies_details?: string | null;
  medications?: string | null; can_self_administer_meds?: number | boolean | null;
  chronic_illness?: number | boolean; chronic_illness_details?: string | null;
  recent_surgery?: number | boolean; recent_surgery_details?: string | null;
  activity_limitations?: string | null; other_accommodations?: string | null;
  participant_signature?: string | null; participant_signature_type: string; participant_signature_date: string;
  guardian_signature?: string | null; guardian_signature_type?: string | null; guardian_signature_date?: string | null;
}

export async function generatePdf(
  { event, submission }: { event: PdfEvent; submission: PdfSubmission },
  pdfDir: string
): Promise<string> {
  mkdirSync(pdfDir, { recursive: true });

  const pdfDoc = await PDFDocument.load(readFileSync(templatePdfPath));
  const form = pdfDoc.getForm();

  function setText(fieldName: string, value?: string | null) {
    try {
      form.getTextField(fieldName).setText(value || '');
    } catch {
      /* field not found, skip */
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
      /* field not found, skip */
    }
  }

  setText('Event', event.event_name);
  setText('Dates of event', event.event_dates);
  setText('Event description', event.event_description);
  setText('Ward', event.ward);
  setText('Stake', event.stake);
  setText('Event or activity leader', event.leader_name);
  setText('Event or activity leaders phone number', event.leader_phone);
  setText('Event or activity leaders email', event.leader_email);

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

  setYesNo('Special diet', !!submission.special_diet);
  setText('diet explanation', submission.special_diet_details);
  setYesNo('Allergies', !!submission.allergies);
  setText('Allergy explanation', submission.allergies_details);
  setText('List of Medications', submission.medications);
  setYesNo('Self Admin', !!submission.can_self_administer_meds);

  setYesNo('Chronic illness', !!submission.chronic_illness);
  setText('illness explanation', submission.chronic_illness_details);
  setYesNo('Surgery', !!submission.recent_surgery);
  setText('If yes please explain_2', submission.recent_surgery_details);
  setText('Other limitations', submission.activity_limitations);

  setText('Special needs', submission.other_accommodations);

  if (submission.participant_signature_type === 'typed') {
    setText('Participants signature', submission.participant_signature);
  } else {
    setText('Participants signature', '');
  }
  setText('Date', formatDateForPdf(submission.participant_signature_date));

  if (submission.guardian_signature && submission.guardian_signature_type === 'typed') {
    setText('Parent or guardians signature if participant is a minor', submission.guardian_signature);
  } else {
    setText('Parent or guardians signature if participant is a minor', '');
  }
  setText('Date_2', formatDateForPdf(submission.guardian_signature_date));

  const firstPage = pdfDoc.getPages()[0];

  if (submission.participant_signature_type === 'drawn' && submission.participant_signature) {
    try {
      await embedSignatureImage(pdfDoc, firstPage, 'Participants signature', submission.participant_signature, form);
    } catch {
      setText('Participants signature', '[Signed]');
    }
  }
  if (submission.guardian_signature_type === 'drawn' && submission.guardian_signature) {
    try {
      await embedSignatureImage(pdfDoc, firstPage, 'Parent or guardians signature if participant is a minor', submission.guardian_signature, form);
    } catch {
      setText('Parent or guardians signature if participant is a minor', '[Signed]');
    }
  }

  if (pdfDoc.getPageCount() > 1) pdfDoc.removePage(1);
  form.flatten();

  const pdfBytes = await pdfDoc.save();
  const pdfPath = join(pdfDir, `${submission.id}.pdf`);
  writeFileSync(pdfPath, pdfBytes);
  return pdfPath;
}
