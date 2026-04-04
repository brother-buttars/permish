import { describe, it, expect } from 'vitest';
import { getOrgDisplayLabels, matchesOrgFilter } from './organizations';

describe('getOrgDisplayLabels', () => {
	it('should return individual labels when not all children selected', () => {
		expect(getOrgDisplayLabels(['deacons'])).toEqual(['Deacons']);
		expect(getOrgDisplayLabels(['deacons', 'teachers'])).toEqual(['Deacons', 'Teachers']);
	});

	it('should return parent label when all children of a group are selected', () => {
		expect(getOrgDisplayLabels(['deacons', 'teachers', 'priests'])).toEqual(['Young Men']);
		expect(getOrgDisplayLabels(['beehives', 'mia_maids', 'laurels'])).toEqual(['Young Women']);
	});

	it('should return both parent labels when all orgs selected', () => {
		const allOrgs = ['deacons', 'teachers', 'priests', 'beehives', 'mia_maids', 'laurels'];
		expect(getOrgDisplayLabels(allOrgs)).toEqual(['Young Men', 'Young Women']);
	});

	it('should handle mixed: one full group and individual from another', () => {
		const keys = ['deacons', 'teachers', 'priests', 'beehives'];
		expect(getOrgDisplayLabels(keys)).toEqual(['Young Men', 'Beehives']);
	});

	it('should return empty array for empty input', () => {
		expect(getOrgDisplayLabels([])).toEqual([]);
	});

	it('should ignore unknown keys', () => {
		expect(getOrgDisplayLabels(['unknown_org'])).toEqual([]);
	});
});

describe('matchesOrgFilter', () => {
	it('should return true when filter is empty (no filter applied)', () => {
		expect(matchesOrgFilter(['deacons'], [])).toBe(true);
		expect(matchesOrgFilter([], [])).toBe(true);
	});

	it('should return true when event orgs overlap with filter', () => {
		expect(matchesOrgFilter(['deacons', 'teachers'], ['deacons'])).toBe(true);
		expect(matchesOrgFilter(['deacons'], ['deacons', 'beehives'])).toBe(true);
	});

	it('should return false when no overlap', () => {
		expect(matchesOrgFilter(['deacons'], ['beehives'])).toBe(false);
		expect(matchesOrgFilter(['deacons', 'teachers'], ['beehives', 'laurels'])).toBe(false);
	});

	it('should expand parent group filters to include children', () => {
		// Filter by "young_men" parent should match any child
		expect(matchesOrgFilter(['deacons'], ['young_men'])).toBe(true);
		expect(matchesOrgFilter(['teachers'], ['young_men'])).toBe(true);
		expect(matchesOrgFilter(['priests'], ['young_men'])).toBe(true);
		// But not young women children
		expect(matchesOrgFilter(['beehives'], ['young_men'])).toBe(false);
	});

	it('should handle mix of parent and child filters', () => {
		expect(matchesOrgFilter(['beehives'], ['young_men', 'beehives'])).toBe(true);
		expect(matchesOrgFilter(['deacons'], ['young_men', 'beehives'])).toBe(true);
		expect(matchesOrgFilter(['laurels'], ['young_men', 'beehives'])).toBe(false);
	});
});
