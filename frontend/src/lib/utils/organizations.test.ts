import { describe, it, expect } from 'vitest';
import { getOrgDisplayLabels, matchesOrgFilter, normalizeOrgKey } from './organizations';

describe('getOrgDisplayLabels', () => {
	it('should return individual labels when not all children selected', () => {
		expect(getOrgDisplayLabels(['deacons'])).toEqual(['Deacons']);
		expect(getOrgDisplayLabels(['deacons', 'teachers'])).toEqual(['Deacons', 'Teachers']);
	});

	it('should return parent label when all children of a group are selected', () => {
		expect(getOrgDisplayLabels(['deacons', 'teachers', 'priests'])).toEqual(['Young Men']);
		expect(getOrgDisplayLabels(['builders_of_faith', 'messengers_of_hope', 'gatherers_of_light'])).toEqual(['Young Women']);
	});

	it('should return both parent labels when all orgs selected', () => {
		const allOrgs = ['deacons', 'teachers', 'priests', 'builders_of_faith', 'messengers_of_hope', 'gatherers_of_light'];
		expect(getOrgDisplayLabels(allOrgs)).toEqual(['Young Men', 'Young Women']);
	});

	it('should handle mixed: one full group and individual from another', () => {
		const keys = ['deacons', 'teachers', 'priests', 'builders_of_faith'];
		expect(getOrgDisplayLabels(keys)).toEqual(['Young Men', 'Builders of Faith']);
	});

	it('should return empty array for empty input', () => {
		expect(getOrgDisplayLabels([])).toEqual([]);
	});

	it('should ignore unknown keys', () => {
		expect(getOrgDisplayLabels(['unknown_org'])).toEqual([]);
	});

	it('should normalize legacy YW keys to new keys', () => {
		expect(getOrgDisplayLabels(['beehives'])).toEqual(['Builders of Faith']);
		expect(getOrgDisplayLabels(['beehives', 'mia_maids', 'laurels'])).toEqual(['Young Women']);
	});
});

describe('matchesOrgFilter', () => {
	it('should return true when filter is empty (no filter applied)', () => {
		expect(matchesOrgFilter(['deacons'], [])).toBe(true);
		expect(matchesOrgFilter([], [])).toBe(true);
	});

	it('should return true when event orgs overlap with filter', () => {
		expect(matchesOrgFilter(['deacons', 'teachers'], ['deacons'])).toBe(true);
		expect(matchesOrgFilter(['deacons'], ['deacons', 'builders_of_faith'])).toBe(true);
	});

	it('should return false when no overlap', () => {
		expect(matchesOrgFilter(['deacons'], ['builders_of_faith'])).toBe(false);
		expect(matchesOrgFilter(['deacons', 'teachers'], ['builders_of_faith', 'gatherers_of_light'])).toBe(false);
	});

	it('should expand parent group filters to include children', () => {
		// Filter by "young_men" parent should match any child
		expect(matchesOrgFilter(['deacons'], ['young_men'])).toBe(true);
		expect(matchesOrgFilter(['teachers'], ['young_men'])).toBe(true);
		expect(matchesOrgFilter(['priests'], ['young_men'])).toBe(true);
		// But not young women children
		expect(matchesOrgFilter(['builders_of_faith'], ['young_men'])).toBe(false);
	});

	it('should handle mix of parent and child filters', () => {
		expect(matchesOrgFilter(['builders_of_faith'], ['young_men', 'builders_of_faith'])).toBe(true);
		expect(matchesOrgFilter(['deacons'], ['young_men', 'builders_of_faith'])).toBe(true);
		expect(matchesOrgFilter(['gatherers_of_light'], ['young_men', 'builders_of_faith'])).toBe(false);
	});

	it('should treat legacy YW keys as their renamed equivalents', () => {
		expect(matchesOrgFilter(['beehives'], ['builders_of_faith'])).toBe(true);
		expect(matchesOrgFilter(['builders_of_faith'], ['beehives'])).toBe(true);
	});
});

describe('normalizeOrgKey', () => {
	it('should map legacy YW keys to new keys', () => {
		expect(normalizeOrgKey('beehives')).toBe('builders_of_faith');
		expect(normalizeOrgKey('mia_maids')).toBe('messengers_of_hope');
		expect(normalizeOrgKey('laurels')).toBe('gatherers_of_light');
	});

	it('should leave new keys and other keys unchanged', () => {
		expect(normalizeOrgKey('builders_of_faith')).toBe('builders_of_faith');
		expect(normalizeOrgKey('deacons')).toBe('deacons');
		expect(normalizeOrgKey('young_men')).toBe('young_men');
	});
});
