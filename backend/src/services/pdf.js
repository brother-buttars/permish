const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const templatePdfPath = path.join(__dirname, '../templates/permission-form.pdf');

async function embedSignatureImage(pdfDoc, page, fieldName, base64DataUrl, form) {
  if (!base64DataUrl || !base64DataUrl.startsWith('data:image')) return;

  // Extract base64 data
  const base64Data = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
  const imageBytes = Buffer.from(base64Data, 'base64');

  // Embed the image
  const image = await pdfDoc.embedPng(imageBytes);

  // Get the field widget to find its position
  const field = form.getTextField(fieldName);
  const widgets = field.acroField.getWidgets();
  if (widgets.length === 0) return;

  const widget = widgets[0];
  const rect = widget.getRectangle();

  // Clear the field text
  field.setText('');

  // Scale image to fit within the field bounds
  const maxWidth = rect.width;
  const maxHeight = rect.height;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  // Draw centered in the field area
  const x = rect.x + (rect.width - drawWidth) / 2;
  const y = rect.y + (rect.height - drawHeight) / 2;

  page.drawImage(image, {
    x,
    y,
    width: drawWidth,
    height: drawHeight,
  });
}

async function generatePdf({ event, submission }, pdfDir) {
  fs.mkdirSync(pdfDir, { recursive: true });

  const templateBytes = fs.readFileSync(templatePdfPath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  // Helper to safely set text fields
  function setText(fieldName, value) {
    try {
      const field = form.getTextField(fieldName);
      field.setText(value || '');
    } catch {
      // Field not found, skip
    }
  }

  // Helper to safely set checkboxes
  function setCheck(fieldName, value) {
    try {
      const field = form.getCheckBox(fieldName);
      if (value) {
        field.check();
      } else {
        field.uncheck();
      }
    } catch {
      // Field not found, skip
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
  setText('Date of birth', submission.participant_dob);
  setText('Age', submission.participant_age != null ? String(submission.participant_age) : '');
  setText('Telephone number', submission.participant_phone);
  setText('Address', submission.address);
  setText('City', submission.city);
  setText('State or Province', submission.state_province);
  setText('Emergency contact parent or guardian', submission.emergency_contact);
  setText('Primary phone_1', submission.emergency_phone_primary);
  setText('Secondary phone_1', submission.emergency_phone_secondary);

  // Medical Information
  setCheck('Special diet', !!submission.special_diet);
  setText('diet explanation', submission.special_diet_details);
  setCheck('Allergies', !!submission.allergies);
  setText('Allergy explanation', submission.allergies_details);
  setText('List of Medications', submission.medications);
  setCheck('Self Admin', !!submission.can_self_administer_meds);

  // Conditions
  setCheck('Chronic illness', !!submission.chronic_illness);
  setText('illness explanation', submission.chronic_illness_details);
  setCheck('Surgery', !!submission.recent_surgery);
  setText('If yes please explain_2', submission.recent_surgery_details);
  setText('Other limitations', submission.activity_limitations);

  // Other Accommodations
  setText('Special needs', submission.other_accommodations);

  // Signatures — for typed signatures, set the text; for drawn, we'll embed images below
  if (submission.participant_signature_type === 'typed') {
    setText('Participants signature', submission.participant_signature);
  } else {
    setText('Participants signature', '');
  }
  setText('Date', submission.participant_signature_date);

  if (submission.guardian_signature) {
    if (submission.guardian_signature_type === 'typed') {
      setText('Parent or guardians signature if participant is a minor', submission.guardian_signature);
    } else {
      setText('Parent or guardians signature if participant is a minor', '');
    }
  } else {
    setText('Parent or guardians signature if participant is a minor', '');
  }
  setText('Date_2', submission.guardian_signature_date);

  // Embed drawn signatures as images before flattening
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];

  if (submission.participant_signature_type === 'drawn' && submission.participant_signature) {
    try {
      await embedSignatureImage(pdfDoc, firstPage, 'Participants signature', submission.participant_signature, form);
    } catch (err) {
      // If image embedding fails, set text fallback
      setText('Participants signature', '[Signed]');
    }
  }
  if (submission.guardian_signature_type === 'drawn' && submission.guardian_signature) {
    try {
      await embedSignatureImage(pdfDoc, firstPage, 'Parent or guardians signature if participant is a minor', submission.guardian_signature, form);
    } catch (err) {
      // If image embedding fails, set text fallback
      setText('Parent or guardians signature if participant is a minor', '[Signed]');
    }
  }

  // Flatten the form so fields appear as static text
  form.flatten();

  const pdfBytes = await pdfDoc.save();
  const fileName = `${submission.id}.pdf`;
  const pdfPath = path.join(pdfDir, fileName);
  fs.writeFileSync(pdfPath, pdfBytes);

  return pdfPath;
}

module.exports = { generatePdf };
