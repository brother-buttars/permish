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
  res.json({ user: req.user });
});

module.exports = router;
