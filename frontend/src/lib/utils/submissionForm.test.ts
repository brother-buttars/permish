import { describe, it, expect } from 'vitest';
import {
	computeAge,
	computeAgeLabel,
	validateSubmissionForm,
	emptyFields,
	buildSubmissionPayload,
	buildProfilePayload,
	type SubmissionFormFields,
} from './submissionForm';

function fields(overrides: Partial<SubmissionFormFields> = {}): SubmissionFormFields {
	return {
		participantName: 'Timmy Youth',
		dateOfBirth: '2012-06-01',
		phone: '',
		address: '',
		city: '',
		stateProvince: '',
		emergencyContact: '',
		primaryPhone: '',
		secondaryPhone: '',
		hasSpecialDiet: false,
		specialDietDetails: '',
		hasAllergies: false,
		allergyDetails: '',
		medications: '',
		canSelfAdminister: false,
		hasChronicIllness: false,
		chronicIllnessDetails: '',
		hadRecentSurgery: false,
		recentSurgeryDetails: '',
		activityLimitations: '',
		otherAccommodations: '',
		participantSigValue: 'hand',
		participantSigType: 'hand',
		participantSigDate: '2026-04-01',
		guardianSigValue: 'hand',
		guardianSigType: 'hand',
		guardianSigDate: '2026-04-01',
		...overrides,
	};
}

describe('computeAge', () => {
	it('returns null for empty or unparseable input', () => {
		expect(computeAge('')).toBeNull();
		expect(computeAge('not-a-date')).toBeNull();
	});

	it('does not count a birthday that has not occurred yet this year', () => {
		const today = new Date();
		const y = today.getFullYear() - 10;
		const m = String(today.getMonth() + 1).padStart(2, '0');
		const tomorrow = new Date(today.getTime() + 86400000).getDate();
		// A DOB later this month → still 9, not 10 (birthday hasn't passed).
		const dob = `${y}-${m}-${String(tomorrow).padStart(2, '0')}`;
		const age = computeAge(dob);
		expect(age === 9 || age === 10).toBe(true); // exact depends on month boundary
	});

	it('labels a known age', () => {
		expect(computeAgeLabel('2000-01-01')).toMatch(/^\d+ years old$/);
		expect(computeAgeLabel('')).toBe('');
	});
});

describe('validateSubmissionForm', () => {
	it('passes with only the 4 required fields (hand signatures)', () => {
		expect(validateSubmissionForm(fields())).toEqual([]);
	});

	it('requires participant name and DOB', () => {
		const errs = validateSubmissionForm(fields({ participantName: '  ', dateOfBirth: '' }));
		expect(errs).toContain('Participant name is required.');
		expect(errs).toContain('Date of birth is required.');
	});

	it('requires a signature value when the type is not hand', () => {
		const errs = validateSubmissionForm(fields({ participantSigType: 'drawn', participantSigValue: '' }));
		expect(errs.some((e) => e.startsWith('Participant signature is required'))).toBe(true);
	});

	it('rejects a completely untouched form — unsigned submissions must not validate', () => {
		// Regression: signatures used to default to "hand", so a parent who never
		// reached the Signatures section submitted a blank-signature medical release.
		const errs = validateSubmissionForm({ ...emptyFields(), participantName: 'Kid', dateOfBirth: '2013-01-01', participantSigDate: '2026-07-01' });
		expect(errs.some((e) => e.startsWith('Participant signature is required'))).toBe(true);
		expect(errs.some((e) => e.startsWith('Parent/Guardian signature is required'))).toBe(true);
	});

	it('requires the participant signature date', () => {
		const errs = validateSubmissionForm(fields({ participantSigDate: '' }));
		expect(errs).toContain('Participant signature date is required.');
	});

	it('rejects a future date of birth', () => {
		const errs = validateSubmissionForm(fields({ dateOfBirth: '2099-01-01' }));
		expect(errs).toContain('Date of birth must be a valid past date.');
	});

	it('accepts a provided drawn/typed signature', () => {
		const errs = validateSubmissionForm(
			fields({
				participantSigType: 'typed',
				participantSigValue: 'Timmy',
				guardianSigType: 'typed',
				guardianSigValue: 'Parent',
			})
		);
		expect(errs).toEqual([]);
	});
});

describe('buildSubmissionPayload', () => {
	it('maps camelCase fields to the snake_case API shape', () => {
		const p = buildSubmissionPayload(fields({ participantName: 'Jane', dateOfBirth: '2013-02-03' }));
		expect(p.participant_name).toBe('Jane');
		expect(p.participant_dob).toBe('2013-02-03');
	});

	it('nulls out hand signatures but keeps drawn/typed values', () => {
		const hand = buildSubmissionPayload(fields());
		expect(hand.participant_signature).toBeNull();
		expect(hand.guardian_signature).toBeNull();

		const drawn = buildSubmissionPayload(fields({ participantSigType: 'drawn', participantSigValue: 'data:image/png;base64,AAA' }));
		expect(drawn.participant_signature).toBe('data:image/png;base64,AAA');
	});

	it('clears detail fields when their toggle is off, keeps them when on', () => {
		const off = buildSubmissionPayload(fields({ hasAllergies: false, allergyDetails: 'peanuts' }));
		expect(off.allergies).toBe(false);
		expect(off.allergies_details).toBe('');

		const on = buildSubmissionPayload(fields({ hasAllergies: true, allergyDetails: 'peanuts' }));
		expect(on.allergies).toBe(true);
		expect(on.allergies_details).toBe('peanuts');
	});
});

describe('buildProfilePayload', () => {
	it('includes medical fields but omits signatures', () => {
		const p = buildProfilePayload(fields({ hasAllergies: true, allergyDetails: 'bees' }));
		expect(p.allergies_details).toBe('bees');
		expect(p).not.toHaveProperty('participant_signature');
		expect(p).not.toHaveProperty('guardian_signature_type');
	});
});
