const { Router } = require('express');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');

const router = Router();
router.use(requireAuth);

// Parent's own submissions — MUST be before /:id routes
router.get('/mine', (req, res) => {
  const db = req.app.locals.db;
  const submissions = db.prepare(`
    SELECT s.id, s.participant_name, s.submitted_at, s.pdf_path, s.event_id, e.event_name, e.organizations
    FROM submissions s
    JOIN events e ON s.event_id = e.id
    WHERE s.submitted_by = ?
    ORDER BY s.submitted_at DESC
  `).all(req.user.id);
  res.json({ submissions });
});

// Get a single submission by ID
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  if (!submission) return res.status(404).json({ error: 'Submission not found' });

  const event = db.prepare('SELECT created_by FROM events WHERE id = ?').get(submission.event_id);
  const isPlanner = event && event.created_by === req.user.id;
  const isSubmitter = submission.submitted_by === req.user.id;
  if (!isPlanner && !isSubmitter) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json({ submission });
});

router.get('/:id/pdf', (req, res) => {
  const db = req.app.locals.db;
  const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  if (!submission) return res.status(404).json({ error: 'Submission not found' });

  const event = db.prepare('SELECT created_by FROM events WHERE id = ?').get(submission.event_id);
  const isPlanner = event && event.created_by === req.user.id;
  const isSubmitter = submission.submitted_by === req.user.id;

  if (!isPlanner && !isSubmitter) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!submission.pdf_path || !fs.existsSync(submission.pdf_path)) {
    return res.status(404).json({ error: 'PDF not available' });
  }

  const fileName = `permish-${submission.participant_name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
  res.download(submission.pdf_path, fileName);
});

// Update a submission
router.put('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  if (!submission) return res.status(404).json({ error: 'Submission not found' });

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(submission.event_id);
  const isPlanner = event && event.created_by === req.user.id;
  const isSubmitter = submission.submitted_by === req.user.id;
  if (!isPlanner && !isSubmitter) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const d = req.body;
  const { sanitizeString } = require('../middleware/validate');

  db.prepare(`UPDATE submissions SET
    participant_name = ?, participant_dob = ?, participant_age = ?,
    participant_phone = ?, address = ?, city = ?, state_province = ?,
    emergency_contact = ?, emergency_phone_primary = ?, emergency_phone_secondary = ?,
    special_diet = ?, special_diet_details = ?, allergies = ?, allergies_details = ?,
    medications = ?, can_self_administer_meds = ?,
    chronic_illness = ?, chronic_illness_details = ?,
    recent_surgery = ?, recent_surgery_details = ?,
    activity_limitations = ?, other_accommodations = ?,
    participant_signature = ?, participant_signature_type = ?, participant_signature_date = ?,
    guardian_signature = ?, guardian_signature_type = ?, guardian_signature_date = ?
    WHERE id = ?`)
    .run(
      sanitizeString(d.participant_name), d.participant_dob, d.participant_age || submission.participant_age,
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
      d.guardian_signature || null, d.guardian_signature_type || null, d.guardian_signature_date || null,
      req.params.id);

  // Regenerate PDF
  const updatedSubmission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  try {
    const { generatePdf } = require('../services/pdf');
    const config = require('../config');
    // Delete old PDF
    if (updatedSubmission.pdf_path && fs.existsSync(updatedSubmission.pdf_path)) {
      fs.unlinkSync(updatedSubmission.pdf_path);
    }
    const pdfPath = await generatePdf({ event, submission: updatedSubmission }, config.pdfDir);
    db.prepare('UPDATE submissions SET pdf_path = ? WHERE id = ?').run(pdfPath, req.params.id);
    updatedSubmission.pdf_path = pdfPath;
  } catch (err) {
    console.error('PDF regeneration failed:', err.message);
  }

  res.json({ submission: updatedSubmission });
});

// Delete a submission (planner who owns the event only)
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  if (!submission) return res.status(404).json({ error: 'Submission not found' });

  const event = db.prepare('SELECT created_by FROM events WHERE id = ?').get(submission.event_id);
  if (!event || event.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Delete the PDF file if it exists
  if (submission.pdf_path && fs.existsSync(submission.pdf_path)) {
    fs.unlinkSync(submission.pdf_path);
  }

  db.prepare('DELETE FROM submissions WHERE id = ?').run(req.params.id);
  res.json({ message: 'Submission deleted' });
});

module.exports = router;
