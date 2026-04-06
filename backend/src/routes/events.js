const { Router } = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireAuth, requirePlanner } = require('../middleware/auth');
const { sanitizeString, validateEmail, validatePhone } = require('../middleware/validate');
const config = require('../config');

// Ensure uploads dir exists
fs.mkdirSync(config.uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
});

const router = Router();
router.use(requireAuth, requirePlanner);

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const id = crypto.randomUUID();
  const { event_name, event_dates, event_start, event_end, event_description, ward, stake, leader_name, leader_phone, leader_email, notify_email, notify_phone, notify_carrier, organizations, additional_details, group_id } = req.body;

  if (!event_name || !event_dates || !event_description || !ward || !stake || !leader_name || !leader_phone || !leader_email) {
    return res.status(400).json({ error: 'All event detail fields are required' });
  }
  if (!validateEmail(leader_email)) {
    return res.status(400).json({ error: 'Invalid leader email address' });
  }
  if (notify_email && !validateEmail(notify_email)) {
    return res.status(400).json({ error: 'Invalid notification email address' });
  }
  if (notify_phone && !validatePhone(notify_phone)) {
    return res.status(400).json({ error: 'Invalid notification phone number' });
  }

  // Validate group_id if provided
  if (group_id) {
    const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(group_id);
    if (!group) return res.status(400).json({ error: 'Group not found' });
    const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(group_id, req.user.id);
    if (!membership && req.user.role !== 'super') {
      return res.status(403).json({ error: 'Must be a member of the group to create events for it' });
    }
  }

  db.prepare(`INSERT INTO events (id, created_by, event_name, event_dates, event_start, event_end, event_description, ward, stake, leader_name, leader_phone, leader_email, notify_email, notify_phone, notify_carrier, organizations, additional_details, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id, sanitizeString(event_name), sanitizeString(event_dates), event_start || null, event_end || null, sanitizeString(event_description, 1000), sanitizeString(ward), sanitizeString(stake), sanitizeString(leader_name), sanitizeString(leader_phone), sanitizeString(leader_email), notify_email || null, notify_phone || null, notify_carrier || null, JSON.stringify(organizations || []), additional_details ? sanitizeString(additional_details, 5000) : null, group_id || null);

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  const formUrl = `${config.frontendUrl}/form/${id}`;
  res.status(201).json({ event, formUrl });
});

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const showAll = req.query.all === '1';
  const activeFilter = showAll ? '' : 'AND e.is_active = 1';

  // Super sees all events; others see own + group events
  let events;
  if (req.user.role === 'super') {
    events = db.prepare(`
      SELECT DISTINCT e.*, COALESCE(sc.count, 0) AS submission_count
      FROM events e
      LEFT JOIN (SELECT event_id, COUNT(*) AS count FROM submissions GROUP BY event_id) sc
        ON sc.event_id = e.id
      WHERE 1=1 ${activeFilter}
      ORDER BY e.created_at DESC
    `).all();
  } else {
    events = db.prepare(`
      SELECT DISTINCT e.*, COALESCE(sc.count, 0) AS submission_count
      FROM events e
      LEFT JOIN (SELECT event_id, COUNT(*) AS count FROM submissions GROUP BY event_id) sc
        ON sc.event_id = e.id
      WHERE (e.created_by = ? OR e.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?))
        ${activeFilter}
      ORDER BY e.created_at DESC
    `).all(req.user.id, req.user.id);
  }

  const now = new Date();
  const eventsWithPast = events.map(event => {
    const endStr = event.event_end || event.event_start;
    const is_past = endStr ? new Date(endStr) < now : false;
    // Attach group info if event belongs to a group
    if (event.group_id) {
      event.group = db.prepare('SELECT id, name, type FROM groups WHERE id = ?').get(event.group_id);
    }
    return { ...event, is_past };
  });
  res.json({ events: eventsWithPast });
});

// All submissions across all planner's events
router.get('/all-submissions', (req, res) => {
  const db = req.app.locals.db;
  let submissions;
  if (req.user.role === 'super') {
    submissions = db.prepare(`
      SELECT s.id, s.participant_name, s.participant_dob, s.participant_age,
             s.emergency_contact, s.emergency_phone_primary, s.submitted_at, s.pdf_path,
             s.event_id, e.event_name, e.event_dates, e.organizations
      FROM submissions s
      JOIN events e ON s.event_id = e.id
      ORDER BY s.submitted_at DESC
    `).all();
  } else {
    submissions = db.prepare(`
      SELECT s.id, s.participant_name, s.participant_dob, s.participant_age,
             s.emergency_contact, s.emergency_phone_primary, s.submitted_at, s.pdf_path,
             s.event_id, e.event_name, e.event_dates, e.organizations
      FROM submissions s
      JOIN events e ON s.event_id = e.id
      WHERE e.created_by = ?
      ORDER BY s.submitted_at DESC
    `).all(req.user.id);
  }
  res.json({ submissions });
});

router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  // Super can access any event
  let event;
  if (req.user.role === 'super') {
    event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  } else {
    event = db.prepare('SELECT * FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
    if (!event) {
      event = db.prepare(`SELECT e.* FROM events e
        JOIN group_members gm ON gm.group_id = e.group_id
        WHERE e.id = ? AND gm.user_id = ?`).get(req.params.id, req.user.id);
    }
  }
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (event.group_id) {
    event.group = db.prepare('SELECT id, name, type FROM groups WHERE id = ?').get(event.group_id);
  }
  res.json({ event });
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  let event;
  if (req.user.role === 'super') {
    event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  } else {
    event = db.prepare('SELECT * FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
    if (!event) {
      event = db.prepare(`SELECT e.* FROM events e
        JOIN group_members gm ON gm.group_id = e.group_id
        WHERE e.id = ? AND gm.user_id = ? AND gm.role = 'admin'`).get(req.params.id, req.user.id);
    }
  }
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const { event_name, event_dates, event_start, event_end, event_description, ward, stake, leader_name, leader_phone, leader_email, notify_email, notify_phone, notify_carrier, is_active, organizations, additional_details } = req.body;

  // Use !== undefined so fields can be intentionally cleared to empty string
  const val = (field, fallback) => field !== undefined ? field : fallback;

  if (leader_email !== undefined && leader_email && !validateEmail(leader_email)) {
    return res.status(400).json({ error: 'Invalid leader email address' });
  }
  if (notify_email !== undefined && notify_email && !validateEmail(notify_email)) {
    return res.status(400).json({ error: 'Invalid notification email address' });
  }
  if (notify_phone !== undefined && notify_phone && !validatePhone(notify_phone)) {
    return res.status(400).json({ error: 'Invalid notification phone number' });
  }

  db.prepare(`UPDATE events SET event_name = ?, event_dates = ?, event_start = ?, event_end = ?, event_description = ?, ward = ?, stake = ?, leader_name = ?, leader_phone = ?, leader_email = ?, notify_email = ?, notify_phone = ?, notify_carrier = ?, is_active = ?, organizations = ?, additional_details = ? WHERE id = ?`)
    .run(
      sanitizeString(val(event_name, event.event_name)),
      sanitizeString(val(event_dates, event.event_dates)),
      event_start !== undefined ? (event_start || null) : event.event_start,
      event_end !== undefined ? (event_end || null) : event.event_end,
      sanitizeString(val(event_description, event.event_description), 1000),
      sanitizeString(val(ward, event.ward)),
      sanitizeString(val(stake, event.stake)),
      sanitizeString(val(leader_name, event.leader_name)),
      sanitizeString(val(leader_phone, event.leader_phone)),
      sanitizeString(val(leader_email, event.leader_email)),
      notify_email !== undefined ? (notify_email || null) : event.notify_email,
      notify_phone !== undefined ? (notify_phone || null) : event.notify_phone,
      notify_carrier !== undefined ? (notify_carrier || null) : event.notify_carrier,
      is_active !== undefined ? (is_active ? 1 : 0) : event.is_active,
      JSON.stringify(organizations || (event.organizations ? JSON.parse(event.organizations) : [])),
      additional_details !== undefined ? (additional_details ? sanitizeString(additional_details, 5000) : null) : event.additional_details,
      req.params.id);

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  res.json({ event: updated });
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  let event;
  if (req.user.role === 'super') {
    event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  } else {
    event = db.prepare('SELECT * FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
    if (!event) {
      event = db.prepare(`SELECT e.* FROM events e
        JOIN group_members gm ON gm.group_id = e.group_id
        WHERE e.id = ? AND gm.user_id = ? AND gm.role = 'admin'`).get(req.params.id, req.user.id);
    }
  }
  if (!event) return res.status(404).json({ error: 'Event not found' });
  db.prepare('UPDATE events SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Event deactivated' });
});

router.get('/:id/submissions', (req, res) => {
  const db = req.app.locals.db;
  let event = db.prepare('SELECT * FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!event) {
    event = db.prepare(`SELECT e.* FROM events e
      JOIN group_members gm ON gm.group_id = e.group_id
      WHERE e.id = ? AND gm.user_id = ?`).get(req.params.id, req.user.id);
  }
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const submissions = db.prepare('SELECT id, participant_name, participant_dob, participant_age, emergency_contact, emergency_phone_primary, submitted_at, pdf_path FROM submissions WHERE event_id = ? ORDER BY submitted_at DESC').all(req.params.id);
  res.json({ submissions });
});

// --- Attachments ---

router.post('/:id/attachments', (req, res, next) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT id FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const existing = db.prepare('SELECT COUNT(*) as count FROM event_attachments WHERE event_id = ?').get(req.params.id);
  if (existing.count >= 10) return res.status(400).json({ error: 'Maximum 10 attachments per event' });

  next();
}, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const db = req.app.locals.db;
  const id = crypto.randomUUID();
  const maxOrder = db.prepare('SELECT MAX(display_order) as max_order FROM event_attachments WHERE event_id = ?').get(req.params.id);
  const order = (maxOrder?.max_order ?? -1) + 1;

  db.prepare('INSERT INTO event_attachments (id, event_id, filename, original_name, mime_type, size, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, order);

  const attachment = db.prepare('SELECT * FROM event_attachments WHERE id = ?').get(id);
  res.status(201).json({ attachment });
});

router.delete('/:id/attachments/:attachmentId', (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT id FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const attachment = db.prepare('SELECT * FROM event_attachments WHERE id = ? AND event_id = ?').get(req.params.attachmentId, req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  // Delete file from disk
  const filePath = path.join(config.uploadsDir, attachment.filename);
  try { fs.unlinkSync(filePath); } catch { /* file may already be gone */ }

  db.prepare('DELETE FROM event_attachments WHERE id = ?').run(req.params.attachmentId);
  res.json({ message: 'Attachment deleted' });
});

router.get('/:id/attachments', (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT id FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const attachments = db.prepare('SELECT * FROM event_attachments WHERE event_id = ? ORDER BY display_order ASC').all(req.params.id);
  res.json({ attachments });
});

module.exports = router;
