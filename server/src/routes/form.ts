import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DB } from '../db.ts';
import type { AppEnv } from '../lib/auth.ts';
import { sanitizeString } from '../lib/validate.ts';
import { formLoadLimiter, submitLimiter } from '../lib/rateLimit.ts';
import { generatePdf } from '../services/pdf.ts';
import { createTransport, sendNotification } from '../services/email.ts';
import { sendSmsNotification } from '../services/sms.ts';
import { config } from '../config.ts';

type Row = Record<string, any>;

function computeAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * PUBLIC event/form routes — no auth. Mounted at /api/events BEFORE the authed
 * events routes (the two share the prefix but never collide on a path+method).
 */
export function createFormRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  app.get('/:id/form', formLoadLimiter, (c) => {
    const event = db
      .query('SELECT id, event_name, event_dates, event_description, additional_details, ward, stake, leader_name, leader_phone, leader_email, organizations, is_active FROM events WHERE id = ?')
      .get(c.req.param('id')) as Row | null;
    if (!event) return c.json({ error: 'Event not found' }, 404);
    if (!event.is_active) return c.json({ error: 'This form is no longer accepting submissions' }, 410);
    const { is_active, ...publicEvent } = event;
    const attachments = db
      .query('SELECT id, original_name, mime_type, size FROM event_attachments WHERE event_id = ? ORDER BY display_order ASC')
      .all(c.req.param('id'));
    return c.json({ event: publicEvent, attachments });
  });

  app.get('/:id/attachments', (c) => {
    const event = db.query('SELECT id FROM events WHERE id = ?').get(c.req.param('id'));
    if (!event) return c.json({ error: 'Event not found' }, 404);
    const attachments = db
      .query('SELECT id, original_name, mime_type, size FROM event_attachments WHERE event_id = ? ORDER BY display_order ASC')
      .all(c.req.param('id'));
    return c.json({ attachments });
  });

  app.get('/:id/attachments/:attachmentId', (c) => {
    const attachment = db
      .query('SELECT * FROM event_attachments WHERE id = ? AND event_id = ?')
      .get(c.req.param('attachmentId'), c.req.param('id')) as Row | null;
    if (!attachment) return c.json({ error: 'Attachment not found' }, 404);

    const uploadsRoot = resolve(config.uploadsDir);
    const filePath = resolve(config.uploadsDir, attachment.filename);
    if (!filePath.startsWith(uploadsRoot)) return c.json({ error: 'Access denied' }, 403);
    if (!existsSync(filePath)) return c.json({ error: 'File not found' }, 404);

    const safeName = String(attachment.original_name).replace(/[^\w.\-]/g, '_');
    return new Response(Bun.file(filePath), {
      headers: { 'Content-Type': attachment.mime_type, 'Content-Disposition': `inline; filename="${safeName}"` },
    });
  });

  app.post('/:id/submit', submitLimiter, async (c) => {
    const event = db.query('SELECT * FROM events WHERE id = ?').get(c.req.param('id')) as Row | null;
    if (!event) return c.json({ error: 'Event not found' }, 404);
    if (!event.is_active) return c.json({ error: 'This form is no longer accepting submissions' }, 410);

    const d = await c.req.json().catch(() => ({}));
    if (!d.participant_name || !d.participant_dob || !d.participant_signature_type || !d.participant_signature_date) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    if (d.participant_signature_type !== 'hand' && !d.participant_signature) {
      return c.json({ error: 'Participant signature is required unless signing by hand' }, 400);
    }
    if (d.participant_signature && d.participant_signature.length > 700000) return c.json({ error: 'Signature too large' }, 400);
    if (d.guardian_signature && d.guardian_signature.length > 700000) return c.json({ error: 'Guardian signature too large' }, 400);

    const id = crypto.randomUUID();
    const age = computeAge(d.participant_dob);
    const submittedBy = c.get('user')?.id || null;

    db.query(
      `INSERT INTO submissions (id, event_id, submitted_by, participant_name, participant_dob, participant_age,
        participant_phone, address, city, state_province, emergency_contact, emergency_phone_primary,
        emergency_phone_secondary, special_diet, special_diet_details, allergies, allergies_details,
        medications, can_self_administer_meds, chronic_illness, chronic_illness_details,
        recent_surgery, recent_surgery_details, activity_limitations, other_accommodations,
        participant_signature, participant_signature_type, participant_signature_date,
        guardian_signature, guardian_signature_type, guardian_signature_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, c.req.param('id'), submittedBy,
      sanitizeString(d.participant_name) as string, d.participant_dob, age,
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
      d.guardian_signature || null, d.guardian_signature_type || null, d.guardian_signature_date || null
    );

    const submission = db.query('SELECT * FROM submissions WHERE id = ?').get(id) as Row;

    try {
      const pdfPath = await generatePdf({ event: event as any, submission: submission as any }, config.pdfDir);
      db.query('UPDATE submissions SET pdf_path = ? WHERE id = ?').run(pdfPath, id);
      submission.pdf_path = pdfPath;

      if (event.notify_email || event.notify_phone) {
        const transport = createTransport(config.email);
        if (event.notify_email) {
          sendNotification(transport, {
            to: event.notify_email, participantName: submission.participant_name, eventName: event.event_name,
            pdfPath, fromName: config.email.fromName, fromAddress: config.email.fromAddress,
          }).catch((err) => console.error('Email notification failed:', err.message));
        }
        if (event.notify_phone && event.notify_carrier) {
          sendSmsNotification(transport, {
            phone: event.notify_phone, carrier: event.notify_carrier, participantName: submission.participant_name,
            eventName: event.event_name, fromName: config.email.fromName, fromAddress: config.email.fromAddress,
          }).catch((err) => console.error('SMS notification failed:', err.message));
        }
      }
    } catch (err) {
      console.error('PDF generation failed:', (err as Error).message);
    }

    return c.json({ submission }, 201);
  });

  return app;
}
