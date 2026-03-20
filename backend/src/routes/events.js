const { Router } = require('express');
const crypto = require('crypto');
const { requireAuth, requirePlanner } = require('../middleware/auth');
const { sanitizeString } = require('../middleware/validate');
const config = require('../config');

const router = Router();
router.use(requireAuth, requirePlanner);

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const id = crypto.randomUUID();
  const { event_name, event_dates, event_description, ward, stake, leader_name, leader_phone, leader_email, notify_email, notify_phone, notify_carrier, organizations } = req.body;

  if (!event_name || !event_dates || !event_description || !ward || !stake || !leader_name || !leader_phone || !leader_email) {
    return res.status(400).json({ error: 'All event detail fields are required' });
  }

  db.prepare(`INSERT INTO events (id, created_by, event_name, event_dates, event_description, ward, stake, leader_name, leader_phone, leader_email, notify_email, notify_phone, notify_carrier, organizations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id, sanitizeString(event_name), sanitizeString(event_dates), sanitizeString(event_description, 1000), sanitizeString(ward), sanitizeString(stake), sanitizeString(leader_name), sanitizeString(leader_phone), sanitizeString(leader_email), notify_email || null, notify_phone || null, notify_carrier || null, JSON.stringify(organizations || []));

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  const formUrl = `${config.frontendUrl}/form/${id}`;
  res.status(201).json({ event, formUrl });
});

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const showAll = req.query.all === '1';
  const events = showAll
    ? db.prepare('SELECT * FROM events WHERE created_by = ? ORDER BY created_at DESC').all(req.user.id)
    : db.prepare('SELECT * FROM events WHERE created_by = ? AND is_active = 1 ORDER BY created_at DESC').all(req.user.id);
  const eventsWithCounts = events.map(event => {
    const count = db.prepare('SELECT COUNT(*) as count FROM submissions WHERE event_id = ?').get(event.id);
    return { ...event, submission_count: count.count };
  });
  res.json({ events: eventsWithCounts });
});

// All submissions across all planner's events
router.get('/all-submissions', (req, res) => {
  const db = req.app.locals.db;
  const submissions = db.prepare(`
    SELECT s.id, s.participant_name, s.participant_dob, s.participant_age,
           s.emergency_contact, s.emergency_phone_primary, s.submitted_at, s.pdf_path,
           s.event_id, e.event_name, e.event_dates, e.organizations
    FROM submissions s
    JOIN events e ON s.event_id = e.id
    WHERE e.created_by = ?
    ORDER BY s.submitted_at DESC
  `).all(req.user.id);
  res.json({ submissions });
});

router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT * FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json({ event });
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT * FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const { event_name, event_dates, event_description, ward, stake, leader_name, leader_phone, leader_email, notify_email, notify_phone, notify_carrier, is_active, organizations } = req.body;

  db.prepare(`UPDATE events SET event_name = ?, event_dates = ?, event_description = ?, ward = ?, stake = ?, leader_name = ?, leader_phone = ?, leader_email = ?, notify_email = ?, notify_phone = ?, notify_carrier = ?, is_active = ?, organizations = ? WHERE id = ?`)
    .run(
      sanitizeString(event_name || event.event_name), sanitizeString(event_dates || event.event_dates),
      sanitizeString(event_description || event.event_description, 1000), sanitizeString(ward || event.ward),
      sanitizeString(stake || event.stake), sanitizeString(leader_name || event.leader_name),
      sanitizeString(leader_phone || event.leader_phone), sanitizeString(leader_email || event.leader_email),
      notify_email !== undefined ? notify_email : event.notify_email,
      notify_phone !== undefined ? notify_phone : event.notify_phone,
      notify_carrier !== undefined ? notify_carrier : event.notify_carrier,
      is_active !== undefined ? (is_active ? 1 : 0) : event.is_active,
      JSON.stringify(organizations || (event.organizations ? JSON.parse(event.organizations) : [])),
      req.params.id);

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  res.json({ event: updated });
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT * FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  db.prepare('UPDATE events SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Event deactivated' });
});

router.get('/:id/submissions', (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT * FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const submissions = db.prepare('SELECT id, participant_name, participant_dob, participant_age, emergency_contact, emergency_phone_primary, submitted_at, pdf_path FROM submissions WHERE event_id = ? ORDER BY submitted_at DESC').all(req.params.id);
  res.json({ submissions });
});

module.exports = router;
