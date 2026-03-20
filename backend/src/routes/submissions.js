const { Router } = require('express');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');

const router = Router();
router.use(requireAuth);

// Parent's own submissions — MUST be before /:id/pdf
router.get('/mine', (req, res) => {
  const db = req.app.locals.db;
  const submissions = db.prepare(`
    SELECT s.id, s.participant_name, s.submitted_at, s.pdf_path, e.event_name
    FROM submissions s
    JOIN events e ON s.event_id = e.id
    WHERE s.submitted_by = ?
    ORDER BY s.submitted_at DESC
  `).all(req.user.id);
  res.json({ submissions });
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

  const fileName = `permission-form-${submission.participant_name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
  res.download(submission.pdf_path, fileName);
});

module.exports = router;
