const { Router } = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { sanitizeString } = require('../middleware/validate');

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const profiles = db.prepare('SELECT * FROM child_profiles WHERE user_id = ? ORDER BY participant_name').all(req.user.id);
  res.json({ profiles });
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const id = crypto.randomUUID();
  const d = req.body;

  db.prepare(`INSERT INTO child_profiles (id, user_id, participant_name, participant_dob, participant_phone,
    address, city, state_province, emergency_contact, emergency_phone_primary, emergency_phone_secondary,
    special_diet, special_diet_details, allergies, allergies_details, medications, can_self_administer_meds,
    chronic_illness, chronic_illness_details, recent_surgery, recent_surgery_details,
    activity_limitations, other_accommodations, guardian_signature, guardian_signature_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id,
      sanitizeString(d.participant_name), d.participant_dob, sanitizeString(d.participant_phone),
      sanitizeString(d.address), sanitizeString(d.city), sanitizeString(d.state_province),
      sanitizeString(d.emergency_contact), sanitizeString(d.emergency_phone_primary),
      sanitizeString(d.emergency_phone_secondary),
      d.special_diet ? 1 : 0, sanitizeString(d.special_diet_details),
      d.allergies ? 1 : 0, sanitizeString(d.allergies_details),
      sanitizeString(d.medications), d.can_self_administer_meds == null ? null : (d.can_self_administer_meds ? 1 : 0),
      d.chronic_illness ? 1 : 0, sanitizeString(d.chronic_illness_details),
      d.recent_surgery ? 1 : 0, sanitizeString(d.recent_surgery_details),
      sanitizeString(d.activity_limitations, 1000), sanitizeString(d.other_accommodations, 1000),
      d.guardian_signature || null, d.guardian_signature_type || null);

  const profile = db.prepare('SELECT * FROM child_profiles WHERE id = ?').get(id);
  res.status(201).json({ profile });
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const existing = db.prepare('SELECT * FROM child_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Profile not found' });

  const d = req.body;
  db.prepare(`UPDATE child_profiles SET participant_name = ?, participant_dob = ?, participant_phone = ?,
    address = ?, city = ?, state_province = ?, emergency_contact = ?, emergency_phone_primary = ?,
    emergency_phone_secondary = ?, special_diet = ?, special_diet_details = ?, allergies = ?,
    allergies_details = ?, medications = ?, can_self_administer_meds = ?,
    chronic_illness = ?, chronic_illness_details = ?, recent_surgery = ?, recent_surgery_details = ?,
    activity_limitations = ?, other_accommodations = ?, guardian_signature = ?, guardian_signature_type = ?,
    updated_at = datetime('now')
    WHERE id = ?`)
    .run(
      sanitizeString(d.participant_name), d.participant_dob, sanitizeString(d.participant_phone),
      sanitizeString(d.address), sanitizeString(d.city), sanitizeString(d.state_province),
      sanitizeString(d.emergency_contact), sanitizeString(d.emergency_phone_primary),
      sanitizeString(d.emergency_phone_secondary),
      d.special_diet ? 1 : 0, sanitizeString(d.special_diet_details),
      d.allergies ? 1 : 0, sanitizeString(d.allergies_details),
      sanitizeString(d.medications), d.can_self_administer_meds == null ? null : (d.can_self_administer_meds ? 1 : 0),
      d.chronic_illness ? 1 : 0, sanitizeString(d.chronic_illness_details),
      d.recent_surgery ? 1 : 0, sanitizeString(d.recent_surgery_details),
      sanitizeString(d.activity_limitations, 1000), sanitizeString(d.other_accommodations, 1000),
      d.guardian_signature || null, d.guardian_signature_type || null,
      req.params.id);

  const profile = db.prepare('SELECT * FROM child_profiles WHERE id = ?').get(req.params.id);
  res.json({ profile });
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const existing = db.prepare('SELECT * FROM child_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Profile not found' });
  db.prepare('DELETE FROM child_profiles WHERE id = ?').run(req.params.id);
  res.json({ message: 'Profile deleted' });
});

module.exports = router;
