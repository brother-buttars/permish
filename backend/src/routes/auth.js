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

  const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role, must_change_password: !!user.must_change_password };
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
  const fullUser = db.prepare('SELECT id, email, name, role, phone, address, city, state_province, guardian_signature, guardian_signature_type, must_change_password FROM users WHERE id = ?').get(req.user.id);
  if (fullUser) fullUser.must_change_password = !!fullUser.must_change_password;
  res.json({ user: fullUser || req.user });
});

// Force change credentials (email, name, password) — for first-login setup
router.put('/setup-credentials', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { email, name, password } = req.body;

  if (!email || !name || !password) {
    return res.status(400).json({ error: 'Email, name, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Check if email is already taken by another user
  const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id);
  if (existing) {
    return res.status(409).json({ error: 'Email is already in use' });
  }

  const password_hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET email = ?, name = ?, password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(email, name, password_hash, req.user.id);

  const user = { id: req.user.id, email, name, role: req.user.role, must_change_password: false };
  setAuthCookie(res, user);
  res.json({ user });
});

router.get('/profile', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT id, email, name, role, phone, address, city, state_province, guardian_signature, guardian_signature_type FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

router.put('/profile', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { sanitizeString } = require('../middleware/validate');
  const d = req.body;

  if (!d.name || !d.name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (d.guardian_signature_type && !['drawn', 'typed', 'hand'].includes(d.guardian_signature_type)) {
    return res.status(400).json({ error: 'Invalid signature type' });
  }
  if (d.guardian_signature && d.guardian_signature.length > 700000) {
    return res.status(400).json({ error: 'Signature too large' });
  }

  db.prepare(`UPDATE users SET name = ?, phone = ?, address = ?, city = ?, state_province = ?,
    guardian_signature = ?, guardian_signature_type = ? WHERE id = ?`)
    .run(
      sanitizeString(d.name.trim()), sanitizeString(d.phone),
      sanitizeString(d.address), sanitizeString(d.city), sanitizeString(d.state_province),
      d.guardian_signature || null, d.guardian_signature_type || null,
      req.user.id);

  const updated = db.prepare('SELECT id, email, name, role, phone, address, city, state_province, guardian_signature, guardian_signature_type FROM users WHERE id = ?').get(req.user.id);
  res.json({ profile: updated });
});

router.post('/forgot-password', async (req, res) => {
  const db = req.app.locals.db;
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email);
  // Always return success to prevent email enumeration
  if (!user) return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  db.prepare('INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), user.id, token, expiresAt);

  // Send reset email
  try {
    const config = require('../config');
    const { createTransport } = require('../services/email');
    const transport = createTransport(config.email);
    const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;
    await transport.sendMail({
      from: `"${config.email.fromName}" <${config.email.fromAddress}>`,
      to: user.email,
      subject: 'Password Reset — Permish',
      text: `Hi ${user.name},\n\nClick the link below to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Hi ${user.name},</p><p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p><p>If you did not request this, you can ignore this email.</p>`,
    });
  } catch (err) {
    console.error('Failed to send reset email:', err.message);
  }

  res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
});

router.post('/reset-password', async (req, res) => {
  const db = req.app.locals.db;
  const { token, newPassword } = req.body;

  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const resetToken = db.prepare('SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0').get(token);
  if (!resetToken) return res.status(400).json({ error: 'Invalid or expired reset link' });
  if (new Date(resetToken.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
  }

  const password_hash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, resetToken.user_id);
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(resetToken.id);

  res.json({ message: 'Password reset successfully. You can now log in.' });
});

router.put('/password', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const password_hash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, req.user.id);
  res.json({ message: 'Password updated successfully' });
});

module.exports = router;
