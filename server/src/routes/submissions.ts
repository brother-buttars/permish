import { Hono } from 'hono';
import { existsSync, unlinkSync } from 'node:fs';
import type { DB } from '../db.ts';
import { type AppEnv, requireAuth, currentUser } from '../lib/auth.ts';
import { sanitizeString } from '../lib/validate.ts';
import { generatePdf } from '../services/pdf.ts';
import { config } from '../config.ts';

type Row = Record<string, any>;

export function createSubmissionRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  // Parent's own submissions — MUST be before /:id routes.
  app.get('/mine', (c) => {
    const submissions = db
      .query(
        `SELECT s.id, s.participant_name, s.submitted_at, s.pdf_path, s.event_id, e.event_name, e.organizations
         FROM submissions s JOIN events e ON s.event_id = e.id
         WHERE s.submitted_by = ? ORDER BY s.submitted_at DESC`
      )
      .all(currentUser(c).id);
    return c.json({ submissions });
  });

  // Access: super, event owner, or the submitter.
  function canAccess(c: Parameters<typeof currentUser>[0], submission: Row): boolean {
    const me = currentUser(c);
    if (me.role === 'super') return true;
    const event = db.query('SELECT created_by FROM events WHERE id = ?').get(submission.event_id) as Row | null;
    return (!!event && event.created_by === me.id) || submission.submitted_by === me.id;
  }

  app.get('/:id', (c) => {
    const submission = db.query('SELECT * FROM submissions WHERE id = ?').get(c.req.param('id')) as Row | null;
    if (!submission) return c.json({ error: 'Submission not found' }, 404);
    if (!canAccess(c, submission)) return c.json({ error: 'Access denied' }, 403);
    return c.json({ submission });
  });

  app.get('/:id/pdf', (c) => {
    const submission = db.query('SELECT * FROM submissions WHERE id = ?').get(c.req.param('id')) as Row | null;
    if (!submission) return c.json({ error: 'Submission not found' }, 404);
    if (!canAccess(c, submission)) return c.json({ error: 'Access denied' }, 403);
    if (!submission.pdf_path || !existsSync(submission.pdf_path)) return c.json({ error: 'PDF not available' }, 404);

    const fileName = `permish-${String(submission.participant_name).replace(/\s+/g, '-').toLowerCase()}.pdf`;
    return new Response(Bun.file(submission.pdf_path), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}"` },
    });
  });

  app.put('/:id', async (c) => {
    const submission = db.query('SELECT * FROM submissions WHERE id = ?').get(c.req.param('id')) as Row | null;
    if (!submission) return c.json({ error: 'Submission not found' }, 404);
    const event = db.query('SELECT * FROM events WHERE id = ?').get(submission.event_id) as Row | null;
    if (!canAccess(c, submission)) return c.json({ error: 'Access denied' }, 403);

    const d = await c.req.json().catch(() => ({}));
    db.query(
      `UPDATE submissions SET
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
       WHERE id = ?`
    ).run(
      sanitizeString(d.participant_name) as string, d.participant_dob, d.participant_age || submission.participant_age,
      (sanitizeString(d.participant_phone) as string) ?? null, (sanitizeString(d.address) as string) ?? null,
      (sanitizeString(d.city) as string) ?? null, (sanitizeString(d.state_province) as string) ?? null,
      (sanitizeString(d.emergency_contact) as string) ?? null, (sanitizeString(d.emergency_phone_primary) as string) ?? null,
      (sanitizeString(d.emergency_phone_secondary) as string) ?? null,
      d.special_diet ? 1 : 0, (sanitizeString(d.special_diet_details) as string) ?? null,
      d.allergies ? 1 : 0, (sanitizeString(d.allergies_details) as string) ?? null,
      (sanitizeString(d.medications) as string) ?? null, d.can_self_administer_meds == null ? null : d.can_self_administer_meds ? 1 : 0,
      d.chronic_illness ? 1 : 0, (sanitizeString(d.chronic_illness_details) as string) ?? null,
      d.recent_surgery ? 1 : 0, (sanitizeString(d.recent_surgery_details) as string) ?? null,
      (sanitizeString(d.activity_limitations, 1000) as string) ?? null, (sanitizeString(d.other_accommodations, 1000) as string) ?? null,
      d.participant_signature ?? null, d.participant_signature_type, d.participant_signature_date,
      d.guardian_signature || null, d.guardian_signature_type || null, d.guardian_signature_date || null,
      c.req.param('id')
    );

    const updated = db.query('SELECT * FROM submissions WHERE id = ?').get(c.req.param('id')) as Row;
    try {
      if (updated.pdf_path && existsSync(updated.pdf_path)) unlinkSync(updated.pdf_path);
      const pdfPath = await generatePdf({ event: event as any, submission: updated as any }, config.pdfDir);
      db.query('UPDATE submissions SET pdf_path = ? WHERE id = ?').run(pdfPath, c.req.param('id'));
      updated.pdf_path = pdfPath;
    } catch (err) {
      console.error('PDF regeneration failed:', (err as Error).message);
    }
    return c.json({ submission: updated });
  });

  app.delete('/:id', (c) => {
    const me = currentUser(c);
    const submission = db.query('SELECT * FROM submissions WHERE id = ?').get(c.req.param('id')) as Row | null;
    if (!submission) return c.json({ error: 'Submission not found' }, 404);
    if (me.role !== 'super') {
      const event = db.query('SELECT created_by FROM events WHERE id = ?').get(submission.event_id) as Row | null;
      if (!event || event.created_by !== me.id) return c.json({ error: 'Access denied' }, 403);
    }
    if (submission.pdf_path && existsSync(submission.pdf_path)) unlinkSync(submission.pdf_path);
    db.query('DELETE FROM submissions WHERE id = ?').run(c.req.param('id'));
    return c.json({ message: 'Submission deleted' });
  });

  return app;
}
