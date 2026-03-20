const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { requireAuth, setAuthCookie } = require('../middleware/auth');
const { validateRegistration, validateLogin } = require('../middleware/validate');

const router = Router();

router.post('/register', validateRegistration, async (req, res) => {
  const db = req.app.locals.db;
  const { email, password, name, role } = req.body;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = randomUUID();
  const password_hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, password_hash, name, role);

  const user = { id, email, name, role };
  setAuthCookie(res, user);
  res.status(201).json({ user });
});

router.post('/login', validateLogin, async (req, res) => {
  const db = req.app.locals.db;
  const { email, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  setAuthCookie(res, safeUser);
  res.json({ user: safeUser });
});

router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const fullUser = db.prepare('SELECT id, email, name, role, phone, address, city, state_province, guardian_signature, guardian_signature_type FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: fullUser || req.user });
});

router.get('/profile', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT id, email, name, role, phone, address, city, state_province, guardian_signature, guardian_signature_type FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ profile: user });
});

router.put('/profile', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { sanitizeString } = require('../middleware/validate');
  const d = req.body;

  db.prepare(`UPDATE users SET name = ?, phone = ?, address = ?, city = ?, state_province = ?,
    guardian_signature = ?, guardian_signature_type = ? WHERE id = ?`)
    .run(
      sanitizeString(d.name || ''), sanitizeString(d.phone),
      sanitizeString(d.address), sanitizeString(d.city), sanitizeString(d.state_province),
      d.guardian_signature || null, d.guardian_signature_type || null,
      req.user.id);

  const updated = db.prepare('SELECT id, email, name, role, phone, address, city, state_province, guardian_signature, guardian_signature_type FROM users WHERE id = ?').get(req.user.id);
  res.json({ profile: updated });
});

module.exports = router;
