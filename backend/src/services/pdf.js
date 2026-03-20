const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const templatePdfPath = path.join(__dirname, '../templates/permission-form.pdf');

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

  // Signatures — for typed signatures, set the text; for drawn, set the text representation
  const participantSig = submission.participant_signature_type === 'typed'
    ? submission.participant_signature
    : '[Signed]';
  setText('Participants signature', participantSig);
  setText('Date', submission.participant_signature_date);

  const guardianSig = submission.guardian_signature
    ? (submission.guardian_signature_type === 'typed'
      ? submission.guardian_signature
      : '[Signed]')
    : '';
  setText('Parent or guardians signature if participant is a minor', guardianSig);
  setText('Date_2', submission.guardian_signature_date);

  // Flatten the form so fields appear as static text
  form.flatten();

  const pdfBytes = await pdfDoc.save();
  const fileName = `${submission.id}.pdf`;
  const pdfPath = path.join(pdfDir, fileName);
  fs.writeFileSync(pdfPath, pdfBytes);

  return pdfPath;
}

module.exports = { generatePdf };
