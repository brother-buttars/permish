import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import type { DB } from '../db.ts';
import {
  type AppEnv,
  type AuthUser,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  currentUser,
} from '../lib/auth.ts';
import { sanitizeString, validateEmail } from '../lib/validate.ts';
import { registerLimiter, loginLimiter } from '../lib/rateLimit.ts';
import { config } from '../config.ts';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'super' | 'user';
  must_change_password?: number;
}

export function createAuthRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  app.post('/register', registerLimiter, async (c) => {
    const { email, password, name, role } = await c.req.json().catch(() => ({}));
    const errors: string[] = [];
    if (!email || !validateEmail(email)) errors.push('Valid email is required');
    if (!password || password.length < 8) errors.push('Password must be at least 8 characters');
    if (!name || !name.trim()) errors.push('Name is required');
    if (!['user', 'planner', 'parent'].includes(role)) errors.push('Role must be "user"');
    if (errors.length) return c.json({ error: errors.join(', ') }, 400);

    const existing = db.query<{ id: string }, [string]>('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return c.json({ error: 'Email already registered' }, 409);

    const id = crypto.randomUUID();
    const password_hash = await bcrypt.hash(password, 10);
    db.query('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
      .run(id, email, password_hash, sanitizeString(name) as string, 'user');

    const user: AuthUser = { id, email, name, role: 'user' };
    await setAuthCookie(c, user);
    return c.json({ user }, 201);
  });

  app.post('/login', loginLimiter, async (c) => {
    const { email, password } = await c.req.json().catch(() => ({}));
    if (!email || !password) return c.json({ error: 'Email and password required' }, 400);

    const row = db.query<UserRow, [string]>('SELECT * FROM users WHERE email = ?').get(email);
    if (!row) return c.json({ error: 'Invalid credentials' }, 401);

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) return c.json({ error: 'Invalid credentials' }, 401);

    const user: AuthUser = { id: row.id, email: row.email, name: row.name, role: row.role };
    await setAuthCookie(c, user);
    return c.json({ user: { ...user, must_change_password: !!row.must_change_password } });
  });

  app.post('/logout', (c) => {
    clearAuthCookie(c);
    return c.json({ message: 'Logged out' });
  });

  app.get('/me', requireAuth, (c) => {
    const { id } = currentUser(c);
    const full = db
      .query(
        'SELECT id, email, name, role, phone, address, city, state_province, guardian_signature, guardian_signature_type, must_change_password FROM users WHERE id = ?'
      )
      .get(id) as Record<string, unknown> | null;
    if (full) full.must_change_password = !!full.must_change_password;
    return c.json({ user: full ?? currentUser(c) });
  });

  app.get('/profile', requireAuth, (c) => {
    const { id } = currentUser(c);
    const user = db
      .query(
        'SELECT id, email, name, role, phone, address, city, state_province, guardian_signature, guardian_signature_type FROM users WHERE id = ?'
      )
      .get(id);
    if (!user) return c.json({ error: 'User not found' }, 404);
    return c.json({ user });
  });

  app.put('/profile', requireAuth, async (c) => {
    const { id } = currentUser(c);
    const d = await c.req.json().catch(() => ({}));
    if (!d.name || !d.name.trim()) return c.json({ error: 'Name is required' }, 400);
    if (d.guardian_signature_type && !['drawn', 'typed', 'hand'].includes(d.guardian_signature_type)) {
      return c.json({ error: 'Invalid signature type' }, 400);
    }
    if (d.guardian_signature && d.guardian_signature.length > 700000) {
      return c.json({ error: 'Signature too large' }, 400);
    }
    db.query(
      `UPDATE users SET name = ?, phone = ?, address = ?, city = ?, state_province = ?,
        guardian_signature = ?, guardian_signature_type = ? WHERE id = ?`
    ).run(
      sanitizeString(d.name.trim()) as string,
      (sanitizeString(d.phone) as string) ?? null,
      (sanitizeString(d.address) as string) ?? null,
      (sanitizeString(d.city) as string) ?? null,
      (sanitizeString(d.state_province) as string) ?? null,
      d.guardian_signature || null,
      d.guardian_signature_type || null,
      id
    );
    const updated = db
      .query(
        'SELECT id, email, name, role, phone, address, city, state_province, guardian_signature, guardian_signature_type FROM users WHERE id = ?'
      )
      .get(id);
    return c.json({ profile: updated });
  });

  app.put('/setup-credentials', requireAuth, async (c) => {
    const me = currentUser(c);
    const { email, name, password } = await c.req.json().catch(() => ({}));
    if (!email || !name || !password) return c.json({ error: 'Email, name, and password are required' }, 400);
    if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);

    const clash = db
      .query<{ id: string }, [string, string]>('SELECT id FROM users WHERE email = ? AND id != ?')
      .get(email, me.id);
    if (clash) return c.json({ error: 'Email is already in use' }, 409);

    const password_hash = await bcrypt.hash(password, 10);
    db.query('UPDATE users SET email = ?, name = ?, password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(email, name, password_hash, me.id);

    const user: AuthUser = { id: me.id, email, name, role: me.role };
    await setAuthCookie(c, user);
    return c.json({ user: { ...user, must_change_password: false } });
  });

  app.put('/password', requireAuth, async (c) => {
    const me = currentUser(c);
    const { currentPassword, newPassword } = await c.req.json().catch(() => ({}));
    if (!currentPassword || !newPassword) return c.json({ error: 'Current password and new password are required' }, 400);
    if (newPassword.length < 8) return c.json({ error: 'New password must be at least 8 characters' }, 400);

    const row = db.query<UserRow, [string]>('SELECT * FROM users WHERE id = ?').get(me.id);
    if (!row) return c.json({ error: 'User not found' }, 404);
    const valid = await bcrypt.compare(currentPassword, row.password_hash);
    if (!valid) return c.json({ error: 'Current password is incorrect' }, 401);

    const password_hash = await bcrypt.hash(newPassword, 10);
    db.query('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, me.id);
    return c.json({ message: 'Password updated successfully' });
  });

  // Phase 0: token issuance without email delivery (email service ported in Phase 1).
  app.post('/forgot-password', async (c) => {
    const { email } = await c.req.json().catch(() => ({}));
    if (!email) return c.json({ error: 'Email is required' }, 400);
    const user = db.query<{ id: string }, [string]>('SELECT id FROM users WHERE email = ?').get(email);
    if (user) {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db.query('INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
        .run(crypto.randomUUID(), user.id, token, expiresAt);
      console.log(`[dev] password reset link: ${config.frontendUrl}/reset-password?token=${token}`);
    }
    return c.json({ message: 'If an account exists with that email, a reset link has been sent.' });
  });

  app.post('/reset-password', async (c) => {
    const { token, newPassword } = await c.req.json().catch(() => ({}));
    if (!token || !newPassword) return c.json({ error: 'Token and new password are required' }, 400);
    if (newPassword.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);

    const rt = db
      .query<{ id: string; user_id: string; expires_at: string }, [string]>(
        'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0'
      )
      .get(token);
    if (!rt) return c.json({ error: 'Invalid or expired reset link' }, 400);
    if (new Date(rt.expires_at) < new Date()) return c.json({ error: 'Reset link has expired. Please request a new one.' }, 400);

    const password_hash = await bcrypt.hash(newPassword, 10);
    db.query('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, rt.user_id);
    db.query('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(rt.id);
    return c.json({ message: 'Password reset successfully. You can now log in.' });
  });

  return app;
}
