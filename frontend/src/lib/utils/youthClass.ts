/**
 * Determines the youth class (quorum/class) based on date of birth and program.
 *
 * LDS youth classes are based on what age a youth turns during the current calendar year:
 * - Turns 12 or 13 → Deacons / Builders of Faith
 * - Turns 14 or 15 → Teachers / Messengers of Hope
 * - Turns 16, 17, or 18 → Priests / Gatherers of Light
 */

import { normalizeOrgKeys } from './organizations';

export type YouthProgram = 'young_men' | 'young_women';

export interface YouthClassInfo {
	key: string;      // e.g. 'deacons', 'builders_of_faith'
	label: string;    // e.g. 'Deacons', 'Builders of Faith'
	program: YouthProgram;
	programLabel: string; // 'Young Men' or 'Young Women'
}

export function getYouthClass(dob: string, program: YouthProgram): YouthClassInfo | null {
	if (!dob || !program) return null;

	const birthYear = new Date(dob).getFullYear();
	if (isNaN(birthYear)) return null;

	const currentYear = new Date().getFullYear();
	const ageTurningThisYear = currentYear - birthYear;

	if (ageTurningThisYear < 12 || ageTurningThisYear > 18) return null;

	const programLabel = program === 'young_men' ? 'Young Men' : 'Young Women';

	if (ageTurningThisYear <= 13) {
		return program === 'young_men'
			? { key: 'deacons', label: 'Deacons', program, programLabel }
			: { key: 'builders_of_faith', label: 'Builders of Faith', program, programLabel };
	}

	if (ageTurningThisYear <= 15) {
		return program === 'young_men'
			? { key: 'teachers', label: 'Teachers', program, programLabel }
			: { key: 'messengers_of_hope', label: 'Messengers of Hope', program, programLabel };
	}

	// 16, 17, 18
	return program === 'young_men'
		? { key: 'priests', label: 'Priests', program, programLabel }
		: { key: 'gatherers_of_light', label: 'Gatherers of Light', program, programLabel };
}

/** Badge CSS classes matching YouthIcon colors */
export function youthClassBadgeClass(program: YouthProgram): string {
	return program === 'young_men'
		? 'border-blue-300 bg-blue-100 text-blue-600 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
		: 'border-pink-300 bg-pink-100 text-pink-600 dark:border-pink-700 dark:bg-pink-900/30 dark:text-pink-400';
}

/**
 * Checks if a profile's computed youth class matches any of the event's organization keys.
 */
export function profileMatchesEventOrgs(dob: string, program: YouthProgram | null, eventOrgs: string[]): boolean {
	if (!eventOrgs || eventOrgs.length === 0) return true;
	if (!program || !dob) return true; // no program set = show for all

	const youthClass = getYouthClass(dob, program);
	if (!youthClass) return true; // age out of range = show for all

	// Match if event includes the specific class OR the parent program (normalize legacy keys)
	const normalized = normalizeOrgKeys(eventOrgs);
	return normalized.includes(youthClass.key) ||
		normalized.includes(youthClass.program);
}
