// Shared permission-form logic used by BOTH the create form (form/[id]) and the
// edit form (form/[id]/edit/[submissionId]). Extracting the validation, payload
// assembly, and age calc here keeps the two forms from silently drifting apart —
// the markup still lives per-page, but the rules that produce a submission do not.

export type SignatureType = 'drawn' | 'typed' | 'hand';

export interface SubmissionFormFields {
	participantName: string;
	dateOfBirth: string;
	phone: string;
	address: string;
	city: string;
	stateProvince: string;
	emergencyContact: string;
	primaryPhone: string;
	secondaryPhone: string;
	hasSpecialDiet: boolean;
	specialDietDetails: string;
	hasAllergies: boolean;
	allergyDetails: string;
	medications: string;
	canSelfAdminister: boolean;
	hasChronicIllness: boolean;
	chronicIllnessDetails: string;
	hadRecentSurgery: boolean;
	recentSurgeryDetails: string;
	activityLimitations: string;
	otherAccommodations: string;
	participantSigValue: string;
	participantSigType: SignatureType;
	participantSigDate: string;
	guardianSigValue: string;
	guardianSigType: SignatureType;
	guardianSigDate: string;
}

/**
 * A blank set of form fields. Signatures default to "drawn" so a submission
 * cannot validate with no signature at all — signing on paper ("hand") must be
 * an explicit choice, never the silent default on a medical release.
 */
export function emptyFields(): SubmissionFormFields {
	return {
		participantName: '', dateOfBirth: '', phone: '', address: '', city: '', stateProvince: '',
		emergencyContact: '', primaryPhone: '', secondaryPhone: '',
		hasSpecialDiet: false, specialDietDetails: '', hasAllergies: false, allergyDetails: '',
		medications: '', canSelfAdminister: false,
		hasChronicIllness: false, chronicIllnessDetails: '', hadRecentSurgery: false, recentSurgeryDetails: '',
		activityLimitations: '', otherAccommodations: '',
		participantSigValue: '', participantSigType: 'drawn', participantSigDate: '',
		guardianSigValue: '', guardianSigType: 'drawn', guardianSigDate: '',
	};
}

/** Age in whole years for a YYYY-MM-DD date of birth, or null if unparseable/future. */
export function computeAge(dob: string): number | null {
	if (!dob) return null;
	const today = new Date();
	const birth = new Date(dob);
	if (isNaN(birth.getTime())) return null;
	let age = today.getFullYear() - birth.getFullYear();
	const monthDiff = today.getMonth() - birth.getMonth();
	if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
	return age >= 0 ? age : null;
}

/** Human label like "13 years old", or "" when age is unknown. */
export function computeAgeLabel(dob: string): string {
	const age = computeAge(dob);
	return age === null ? '' : `${age} years old`;
}

/**
 * The only truly required fields: participant name, DOB, and both signatures
 * (unless signed by hand). Everything else on the form is optional.
 */
export function validateSubmissionForm(f: SubmissionFormFields): string[] {
	const errors: string[] = [];
	if (!f.participantName.trim()) errors.push('Participant name is required.');
	if (!f.dateOfBirth) errors.push('Date of birth is required.');
	else if (computeAge(f.dateOfBirth) === null) errors.push('Date of birth must be a valid past date.');
	if (f.participantSigType !== 'hand' && !f.participantSigValue) errors.push('Participant signature is required (or choose "By Hand" to sign the printed form).');
	if (f.guardianSigType !== 'hand' && !f.guardianSigValue) errors.push('Parent/Guardian signature is required (or choose "By Hand" to sign the printed form).');
	if (!f.participantSigDate) errors.push('Participant signature date is required.');
	return errors;
}

/** Build the submission payload sent to `submissions.submit` / `submissions.update`. */
export function buildSubmissionPayload(f: SubmissionFormFields): Record<string, unknown> {
	return {
		participant_name: f.participantName,
		participant_dob: f.dateOfBirth,
		participant_phone: f.phone,
		address: f.address,
		city: f.city,
		state_province: f.stateProvince,
		emergency_contact: f.emergencyContact,
		emergency_phone_primary: f.primaryPhone,
		emergency_phone_secondary: f.secondaryPhone,
		special_diet: f.hasSpecialDiet,
		special_diet_details: f.hasSpecialDiet ? f.specialDietDetails : '',
		allergies: f.hasAllergies,
		allergies_details: f.hasAllergies ? f.allergyDetails : '',
		medications: f.medications,
		can_self_administer_meds: f.canSelfAdminister,
		chronic_illness: f.hasChronicIllness,
		chronic_illness_details: f.hasChronicIllness ? f.chronicIllnessDetails : '',
		recent_surgery: f.hadRecentSurgery,
		recent_surgery_details: f.hadRecentSurgery ? f.recentSurgeryDetails : '',
		activity_limitations: f.activityLimitations,
		other_accommodations: f.otherAccommodations,
		participant_signature: f.participantSigType === 'hand' ? null : f.participantSigValue,
		participant_signature_type: f.participantSigType,
		participant_signature_date: f.participantSigDate,
		guardian_signature: f.guardianSigType === 'hand' ? null : f.guardianSigValue,
		guardian_signature_type: f.guardianSigType,
		guardian_signature_date: f.guardianSigDate,
	};
}

/** Build the youth-profile payload for "save profile" (submission fields minus signatures). */
export function buildProfilePayload(f: SubmissionFormFields): Record<string, unknown> {
	return {
		participant_name: f.participantName,
		participant_dob: f.dateOfBirth,
		participant_phone: f.phone,
		address: f.address,
		city: f.city,
		state_province: f.stateProvince,
		emergency_contact: f.emergencyContact,
		emergency_phone_primary: f.primaryPhone,
		emergency_phone_secondary: f.secondaryPhone,
		special_diet: f.hasSpecialDiet,
		special_diet_details: f.specialDietDetails,
		allergies: f.hasAllergies,
		allergies_details: f.allergyDetails,
		medications: f.medications,
		can_self_administer_meds: f.canSelfAdminister,
		chronic_illness: f.hasChronicIllness,
		chronic_illness_details: f.chronicIllnessDetails,
		recent_surgery: f.hadRecentSurgery,
		recent_surgery_details: f.recentSurgeryDetails,
		activity_limitations: f.activityLimitations,
		other_accommodations: f.otherAccommodations,
	};
}
