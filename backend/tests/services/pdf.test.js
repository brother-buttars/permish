const fs = require('fs');
const path = require('path');
const { generatePdf } = require('../../src/services/pdf');

describe('PDF generation', () => {
  const testPdfDir = path.join(__dirname, '../../test-pdfs');

  beforeAll(() => {
    fs.mkdirSync(testPdfDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(testPdfDir, { recursive: true, force: true });
  });

  test('generates a PDF file from submission data', async () => {
    const data = {
      event: {
        event_name: 'Youth Camp',
        event_dates: 'June 15-18, 2026',
        event_description: 'Annual youth camp',
        ward: 'Maple Ward',
        stake: 'Cedar Stake',
        leader_name: 'John Smith',
        leader_phone: '555-123-4567',
        leader_email: 'john@example.com',
      },
      submission: {
        id: 'test-submission-id',
        participant_name: 'Jane Doe',
        participant_dob: '2014-05-15',
        participant_age: 12,
        participant_phone: '555-111-2222',
        address: '123 Main St',
        city: 'Springfield',
        state_province: 'UT',
        emergency_contact: 'John Doe',
        emergency_phone_primary: '555-333-4444',
        emergency_phone_secondary: '555-555-6666',
        special_diet: 0,
        special_diet_details: null,
        allergies: 1,
        allergies_details: 'Peanuts',
        medications: 'None',
        can_self_administer_meds: 1,
        chronic_illness: 0,
        chronic_illness_details: null,
        recent_surgery: 0,
        recent_surgery_details: null,
        activity_limitations: null,
        other_accommodations: null,
        participant_signature: 'data:image/png;base64,iVBORw0KGgo=',
        participant_signature_type: 'drawn',
        participant_signature_date: '2026-06-10',
        guardian_signature: 'John Doe',
        guardian_signature_type: 'typed',
        guardian_signature_date: '2026-06-10',
      },
    };

    const pdfPath = await generatePdf(data, testPdfDir);
    expect(fs.existsSync(pdfPath)).toBe(true);
    const stats = fs.statSync(pdfPath);
    expect(stats.size).toBeGreaterThan(0);
  }, 30000);
});
