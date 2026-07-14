import { Hono } from 'hono';
import type { DB } from '../db.ts';
import { type AppEnv, requireAuth, currentUser } from '../lib/auth.ts';
import { sanitizeString } from '../lib/validate.ts';

type Row = Record<string, any>;

export function createProfileRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  app.get('/', (c) => {
    const profiles = db
      .query('SELECT * FROM child_profiles WHERE user_id = ? ORDER BY participant_name')
      .all(currentUser(c).id);
    return c.json({ profiles });
  });

  app.post('/', async (c) => {
    const me = currentUser(c);
    const d = await c.req.json().catch(() => ({}));
    if (!d.participant_name || !d.participant_name.trim()) return c.json({ error: 'Participant name is required' }, 400);
    if (!d.participant_dob) return c.json({ error: 'Date of birth is required' }, 400);

    const id = crypto.randomUUID();
    db.query(
      `INSERT INTO child_profiles (id, user_id, participant_name, participant_dob, participant_phone,
        address, city, state_province, emergency_contact, emergency_phone_primary, emergency_phone_secondary,
        special_diet, special_diet_details, allergies, allergies_details, medications, can_self_administer_meds,
        chronic_illness, chronic_illness_details, recent_surgery, recent_surgery_details,
        activity_limitations, other_accommodations, youth_program)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, me.id,
      sanitizeString(d.participant_name) as string, d.participant_dob, (sanitizeString(d.participant_phone) as string) ?? null,
      (sanitizeString(d.address) as string) ?? null, (sanitizeString(d.city) as string) ?? null, (sanitizeString(d.state_province) as string) ?? null,
      (sanitizeString(d.emergency_contact) as string) ?? null, (sanitizeString(d.emergency_phone_primary) as string) ?? null,
      (sanitizeString(d.emergency_phone_secondary) as string) ?? null,
      d.special_diet ? 1 : 0, (sanitizeString(d.special_diet_details) as string) ?? null,
      d.allergies ? 1 : 0, (sanitizeString(d.allergies_details) as string) ?? null,
      (sanitizeString(d.medications) as string) ?? null, d.can_self_administer_meds == null ? null : d.can_self_administer_meds ? 1 : 0,
      d.chronic_illness ? 1 : 0, (sanitizeString(d.chronic_illness_details) as string) ?? null,
      d.recent_surgery ? 1 : 0, (sanitizeString(d.recent_surgery_details) as string) ?? null,
      (sanitizeString(d.activity_limitations, 1000) as string) ?? null, (sanitizeString(d.other_accommodations, 1000) as string) ?? null,
      d.youth_program || null
    );
    const profile = db.query('SELECT * FROM child_profiles WHERE id = ?').get(id);
    return c.json({ profile }, 201);
  });

  app.put('/:id', async (c) => {
    const me = currentUser(c);
    const existing = db
      .query('SELECT * FROM child_profiles WHERE id = ? AND user_id = ?')
      .get(c.req.param('id'), me.id) as Row | null;
    if (!existing) return c.json({ error: 'Profile not found' }, 404);

    const d = await c.req.json().catch(() => ({}));
    if (!d.participant_name || !d.participant_name.trim()) return c.json({ error: 'Participant name is required' }, 400);
    if (!d.participant_dob) return c.json({ error: 'Date of birth is required' }, 400);

    db.query(
      `UPDATE child_profiles SET participant_name = ?, participant_dob = ?, participant_phone = ?,
        address = ?, city = ?, state_province = ?, emergency_contact = ?, emergency_phone_primary = ?,
        emergency_phone_secondary = ?, special_diet = ?, special_diet_details = ?, allergies = ?,
        allergies_details = ?, medications = ?, can_self_administer_meds = ?,
        chronic_illness = ?, chronic_illness_details = ?, recent_surgery = ?, recent_surgery_details = ?,
        activity_limitations = ?, other_accommodations = ?, youth_program = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      sanitizeString(d.participant_name) as string, d.participant_dob, (sanitizeString(d.participant_phone) as string) ?? null,
      (sanitizeString(d.address) as string) ?? null, (sanitizeString(d.city) as string) ?? null, (sanitizeString(d.state_province) as string) ?? null,
      (sanitizeString(d.emergency_contact) as string) ?? null, (sanitizeString(d.emergency_phone_primary) as string) ?? null,
      (sanitizeString(d.emergency_phone_secondary) as string) ?? null,
      d.special_diet ? 1 : 0, (sanitizeString(d.special_diet_details) as string) ?? null,
      d.allergies ? 1 : 0, (sanitizeString(d.allergies_details) as string) ?? null,
      (sanitizeString(d.medications) as string) ?? null, d.can_self_administer_meds == null ? null : d.can_self_administer_meds ? 1 : 0,
      d.chronic_illness ? 1 : 0, (sanitizeString(d.chronic_illness_details) as string) ?? null,
      d.recent_surgery ? 1 : 0, (sanitizeString(d.recent_surgery_details) as string) ?? null,
      (sanitizeString(d.activity_limitations, 1000) as string) ?? null, (sanitizeString(d.other_accommodations, 1000) as string) ?? null,
      d.youth_program !== undefined ? d.youth_program || null : existing.youth_program,
      c.req.param('id')
    );
    const profile = db.query('SELECT * FROM child_profiles WHERE id = ?').get(c.req.param('id'));
    return c.json({ profile });
  });

  app.delete('/:id', (c) => {
    const existing = db
      .query('SELECT id FROM child_profiles WHERE id = ? AND user_id = ?')
      .get(c.req.param('id'), currentUser(c).id);
    if (!existing) return c.json({ error: 'Profile not found' }, 404);
    db.query('DELETE FROM child_profiles WHERE id = ?').run(c.req.param('id'));
    return c.json({ message: 'Profile deleted' });
  });

  return app;
}
