const express = require('express');
const fs = require('fs');
const PocketBase = require('pocketbase/cjs');
const config = require('./config');
const { sanitizeString } = require('./middleware/validate');
const { generatePdf } = require('./services/pdf');
const { createTransport, sendNotification } = require('./services/email');
const { sendSmsNotification } = require('./services/sms');

const app = express();
app.use(express.json({ limit: '5mb' }));

// CORS — allow frontend origin and Caddy-proxied requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = [config.frontendUrl, 'tauri://localhost'];
  // In production behind Caddy, requests may come from the domain
  if (process.env.DOMAIN) allowed.push(`https://${process.env.DOMAIN}`);
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', config.frontendUrl);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Admin PocketBase client (for data access)
const pb = new PocketBase(config.pbUrl);

async function initPocketBase() {
  if (config.pbAdminEmail && config.pbAdminPassword) {
    await pb.collection('_superusers').authWithPassword(
      config.pbAdminEmail,
      config.pbAdminPassword
    );
    console.log('Authenticated with PocketBase as admin');
  }
}

// Verify user auth from Authorization header
async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '');
  try {
    const userPb = new PocketBase(config.pbUrl);
    userPb.authStore.save(token, null);
    const authData = await userPb.collection('users').authRefresh();
    return authData.record;
  } catch {
    return null;
  }
}

// Require auth helper — returns user or sends 401
async function requireAuth(req, res) {
  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return user;
}

function computeAge(dob) {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'permish-sidecar' });
});

// ============================================================
// POST /api/events/:id/submit — Form submission
// ============================================================
app.post('/api/events/:id/submit', async (req, res) => {
  try {
    const user = await verifyAuth(req); // optional auth

    // Fetch event from PocketBase
    let event;
    try {
      event = await pb.collection('events').getOne(req.params.id);
    } catch {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (!event.is_active) {
      return res.status(410).json({ error: 'This form is no longer accepting submissions' });
    }

    const d = req.body;

    // Validate required fields
    if (!d.participant_name || !d.participant_dob || !d.participant_signature_type || !d.participant_signature_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate signature
    if (d.participant_signature_type !== 'hand' && !d.participant_signature) {
      return res.status(400).json({ error: 'Participant signature is required unless signing by hand' });
    }

    // Validate signature sizes
    if (d.participant_signature && d.participant_signature.length > 700000) {
      return res.status(400).json({ error: 'Signature too large' });
    }
    if (d.guardian_signature && d.guardian_signature.length > 700000) {
      return res.status(400).json({ error: 'Guardian signature too large' });
    }

    const age = computeAge(d.participant_dob);

    // Create submission in PocketBase
    const submissionData = {
      event_id: req.params.id,
      submitted_by: user ? user.id : '',
      participant_name: sanitizeString(d.participant_name),
      participant_dob: d.participant_dob,
      participant_age: age,
      participant_phone: sanitizeString(d.participant_phone),
      address: sanitizeString(d.address),
      city: sanitizeString(d.city),
      state_province: sanitizeString(d.state_province),
      emergency_contact: sanitizeString(d.emergency_contact),
      emergency_phone_primary: sanitizeString(d.emergency_phone_primary),
      emergency_phone_secondary: sanitizeString(d.emergency_phone_secondary),
      special_diet: !!d.special_diet,
      special_diet_details: sanitizeString(d.special_diet_details),
      allergies: !!d.allergies,
      allergies_details: sanitizeString(d.allergies_details),
      medications: sanitizeString(d.medications),
      can_self_administer_meds: d.can_self_administer_meds == null ? null : !!d.can_self_administer_meds,
      chronic_illness: !!d.chronic_illness,
      chronic_illness_details: sanitizeString(d.chronic_illness_details),
      recent_surgery: !!d.recent_surgery,
      recent_surgery_details: sanitizeString(d.recent_surgery_details),
      activity_limitations: sanitizeString(d.activity_limitations, 1000),
      other_accommodations: sanitizeString(d.other_accommodations, 1000),
      participant_signature: d.participant_signature || '',
      participant_signature_type: d.participant_signature_type,
      participant_signature_date: d.participant_signature_date,
      guardian_signature: d.guardian_signature || '',
      guardian_signature_type: d.guardian_signature_type || '',
      guardian_signature_date: d.guardian_signature_date || '',
    };

    const submission = await pb.collection('submissions').create(submissionData);

    // Generate PDF
    try {
      const pdfPath = await generatePdf({ event, submission }, config.pdfDir);
      await pb.collection('submissions').update(submission.id, { pdf_path: pdfPath });
      submission.pdf_path = pdfPath;

      // Send notifications
      if (event.notify_email || event.notify_phone) {
        const transport = createTransport(config.email);
        if (event.notify_email) {
          sendNotification(transport, {
            to: event.notify_email,
            participantName: submission.participant_name,
            eventName: event.event_name,
            pdfPath,
            fromName: config.email.fromName,
            fromAddress: config.email.fromAddress,
          }).catch(err => console.error('Email notification failed:', err.message));
        }
        if (event.notify_phone && event.notify_carrier) {
          sendSmsNotification(transport, {
            phone: event.notify_phone,
            carrier: event.notify_carrier,
            participantName: submission.participant_name,
            eventName: event.event_name,
            fromName: config.email.fromName,
            fromAddress: config.email.fromAddress,
          }).catch(err => console.error('SMS notification failed:', err.message));
        }
      }
    } catch (err) {
      console.error('PDF generation failed:', err.message);
    }

    res.status(201).json({ submission });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// PUT /api/submissions/:id — Update submission (regenerate PDF)
// ============================================================
app.put('/api/submissions/:id', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    // Fetch submission
    let submission;
    try {
      submission = await pb.collection('submissions').getOne(req.params.id);
    } catch {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Fetch event for access check
    let event;
    try {
      event = await pb.collection('events').getOne(submission.event_id);
    } catch {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check access: submitted_by matches user OR event creator matches user
    const isSubmitter = submission.submitted_by === user.id;
    const isPlanner = event.created_by === user.id;
    if (!isSubmitter && !isPlanner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const d = req.body;

    // Update submission fields in PocketBase
    const updateData = {
      participant_name: sanitizeString(d.participant_name),
      participant_dob: d.participant_dob,
      participant_age: d.participant_age || submission.participant_age,
      participant_phone: sanitizeString(d.participant_phone),
      address: sanitizeString(d.address),
      city: sanitizeString(d.city),
      state_province: sanitizeString(d.state_province),
      emergency_contact: sanitizeString(d.emergency_contact),
      emergency_phone_primary: sanitizeString(d.emergency_phone_primary),
      emergency_phone_secondary: sanitizeString(d.emergency_phone_secondary),
      special_diet: !!d.special_diet,
      special_diet_details: sanitizeString(d.special_diet_details),
      allergies: !!d.allergies,
      allergies_details: sanitizeString(d.allergies_details),
      medications: sanitizeString(d.medications),
      can_self_administer_meds: d.can_self_administer_meds == null ? null : !!d.can_self_administer_meds,
      chronic_illness: !!d.chronic_illness,
      chronic_illness_details: sanitizeString(d.chronic_illness_details),
      recent_surgery: !!d.recent_surgery,
      recent_surgery_details: sanitizeString(d.recent_surgery_details),
      activity_limitations: sanitizeString(d.activity_limitations, 1000),
      other_accommodations: sanitizeString(d.other_accommodations, 1000),
      participant_signature: d.participant_signature || '',
      participant_signature_type: d.participant_signature_type,
      participant_signature_date: d.participant_signature_date,
      guardian_signature: d.guardian_signature || '',
      guardian_signature_type: d.guardian_signature_type || '',
      guardian_signature_date: d.guardian_signature_date || '',
    };

    const updatedSubmission = await pb.collection('submissions').update(req.params.id, updateData);

    // Delete old PDF if it exists
    if (submission.pdf_path && fs.existsSync(submission.pdf_path)) {
      try {
        fs.unlinkSync(submission.pdf_path);
      } catch (err) {
        console.error('Failed to delete old PDF:', err.message);
      }
    }

    // Regenerate PDF
    try {
      const pdfPath = await generatePdf({ event, submission: updatedSubmission }, config.pdfDir);
      await pb.collection('submissions').update(req.params.id, { pdf_path: pdfPath });
      updatedSubmission.pdf_path = pdfPath;
    } catch (err) {
      console.error('PDF regeneration failed:', err.message);
    }

    res.json({ submission: updatedSubmission });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /api/submissions/:id/pdf — Serve PDF file
// ============================================================
app.get('/api/submissions/:id/pdf', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    // Fetch submission
    let submission;
    try {
      submission = await pb.collection('submissions').getOne(req.params.id);
    } catch {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Fetch event for access check
    let event;
    try {
      event = await pb.collection('events').getOne(submission.event_id);
    } catch {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check access
    const isSubmitter = submission.submitted_by === user.id;
    const isPlanner = event.created_by === user.id;
    if (!isSubmitter && !isPlanner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!submission.pdf_path || !fs.existsSync(submission.pdf_path)) {
      return res.status(404).json({ error: 'PDF not available' });
    }

    const fileName = `permish-${submission.participant_name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
    res.download(submission.pdf_path, fileName);
  } catch (err) {
    console.error('PDF download error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
async function start() {
  try {
    await initPocketBase();
  } catch (err) {
    console.error('Failed to authenticate with PocketBase:', err.message);
    console.log('Starting without PocketBase admin auth (some features may not work)');
  }

  app.listen(config.port, () => {
    console.log(`Permish sidecar running on port ${config.port}`);
  });
}

start();
