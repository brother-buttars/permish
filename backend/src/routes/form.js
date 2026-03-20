const { Router } = require('express');
const crypto = require('crypto');
const { sanitizeString } = require('../middleware/validate');
const { generatePdf } = require('../services/pdf');
const { createTransport, sendNotification } = require('../services/email');
const { sendSmsNotification } = require('../services/sms');
const config = require('../config');

const router = Router();

function computeAge(dob) {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

router.get('/:id/form', (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT id, event_name, event_dates, event_description, ward, stake, leader_name, leader_phone, leader_email, is_active FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!event.is_active) return res.status(410).json({ error: 'This form is no longer accepting submissions' });
  const { is_active, ...publicEvent } = event;
  res.json({ event: publicEvent });
});

router.post('/:id/submit', async (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!event.is_active) return res.status(410).json({ error: 'This form is no longer accepting submissions' });

  const d = req.body;
  const id = crypto.randomUUID();
  const age = computeAge(d.participant_dob);
  const submittedBy = req.user?.id || null;

  if (!d.participant_name || !d.participant_dob || !d.participant_signature || !d.participant_signature_type || !d.participant_signature_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (d.participant_signature && d.participant_signature.length > 700000) {
    return res.status(400).json({ error: 'Signature too large' });
  }
  if (d.guardian_signature && d.guardian_signature.length > 700000) {
    return res.status(400).json({ error: 'Guardian signature too large' });
  }

  db.prepare(`INSERT INTO submissions (id, event_id, submitted_by, participant_name, participant_dob, participant_age,
    participant_phone, address, city, state_province, emergency_contact, emergency_phone_primary,
    emergency_phone_secondary, special_diet, special_diet_details, allergies, allergies_details,
    medications, can_self_administer_meds, chronic_illness, chronic_illness_details,
    recent_surgery, recent_surgery_details, activity_limitations, other_accommodations,
    participant_signature, participant_signature_type, participant_signature_date,
    guardian_signature, guardian_signature_type, guardian_signature_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.params.id, submittedBy,
      sanitizeString(d.participant_name), d.participant_dob, age,
      sanitizeString(d.participant_phone), sanitizeString(d.address),
      sanitizeString(d.city), sanitizeString(d.state_province),
      sanitizeString(d.emergency_contact), sanitizeString(d.emergency_phone_primary),
      sanitizeString(d.emergency_phone_secondary),
      d.special_diet ? 1 : 0, sanitizeString(d.special_diet_details),
      d.allergies ? 1 : 0, sanitizeString(d.allergies_details),
      sanitizeString(d.medications), d.can_self_administer_meds == null ? null : (d.can_self_administer_meds ? 1 : 0),
      d.chronic_illness ? 1 : 0, sanitizeString(d.chronic_illness_details),
      d.recent_surgery ? 1 : 0, sanitizeString(d.recent_surgery_details),
      sanitizeString(d.activity_limitations, 1000), sanitizeString(d.other_accommodations, 1000),
      d.participant_signature, d.participant_signature_type, d.participant_signature_date,
      d.guardian_signature || null, d.guardian_signature_type || null, d.guardian_signature_date || null);

  const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);

  // Generate PDF (async, don't block response if it fails)
  try {
    const pdfPath = await generatePdf({ event, submission }, config.pdfDir);
    db.prepare('UPDATE submissions SET pdf_path = ? WHERE id = ?').run(pdfPath, id);
    submission.pdf_path = pdfPath;

    if (event.notify_email || event.notify_phone) {
      const transport = createTransport(config.email);
      if (event.notify_email) {
        sendNotification(transport, {
          to: event.notify_email, participantName: submission.participant_name,
          eventName: event.event_name, pdfPath,
          fromName: config.email.fromName, fromAddress: config.email.fromAddress,
        }).catch(err => console.error('Email notification failed:', err.message));
      }
      if (event.notify_phone && event.notify_carrier) {
        sendSmsNotification(transport, {
          phone: event.notify_phone, carrier: event.notify_carrier,
          participantName: submission.participant_name, eventName: event.event_name,
          fromName: config.email.fromName, fromAddress: config.email.fromAddress,
        }).catch(err => console.error('SMS notification failed:', err.message));
      }
    }
  } catch (err) {
    console.error('PDF generation failed:', err.message);
  }

  res.status(201).json({ submission });
});

module.exports = router;
