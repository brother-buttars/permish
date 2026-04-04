const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { requireAuth, requireSuper } = require('../middleware/auth');
const { sanitizeString, validateEmail } = require('../middleware/validate');

const router = Router();
router.use(requireAuth, requireSuper);

// List all users
router.get('/users', (req, res) => {
  const db = req.app.locals.db;
  const users = db.prepare('SELECT id, email, name, role, phone, city, state_province, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users });
});

// Get single user
router.get('/users/:id', (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT id, email, name, role, phone, address, city, state_province, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// Update user role
router.put('/users/:id/role', (req, res) => {
  const db = req.app.locals.db;
  const { role } = req.body;
  if (!['super', 'planner', 'parent'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent removing the last super admin
  if (user.role === 'super' && role !== 'super') {
    const superCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super'").get();
    if (superCount.count <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last super admin' });
    }
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  const updated = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json({ user: updated });
});

// Create user (admin can create with any role)
router.post('/users', async (req, res) => {
  const db = req.app.locals.db;
  const { email, password, name, role } = req.body;

  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'Email, password, name, and role are required' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!['super', 'planner', 'parent'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = randomUUID();
  const password_hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, password_hash, sanitizeString(name), role);

  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(id);
  res.status(201).json({ user });
});

// Delete user
router.delete('/users/:id', (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent deleting yourself
  if (user.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  // Prevent deleting the last super admin
  if (user.role === 'super') {
    const superCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super'").get();
    if (superCount.count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last super admin' });
    }
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deleted' });
});

// Reset user password
router.put('/users/:id/password', async (req, res) => {
  const db = req.app.locals.db;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const password_hash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, req.params.id);
  res.json({ message: 'Password reset successfully' });
});

// System stats
router.get('/stats', (req, res) => {
  const db = req.app.locals.db;
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get().count;
  const submissionCount = db.prepare('SELECT COUNT(*) as count FROM submissions').get().count;
  const profileCount = db.prepare('SELECT COUNT(*) as count FROM child_profiles').get().count;
  const activeEventCount = db.prepare('SELECT COUNT(*) as count FROM events WHERE is_active = 1').get().count;
  res.json({ stats: { userCount, eventCount, activeEventCount, submissionCount, profileCount } });
});

module.exports = router;
