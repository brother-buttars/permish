import { describe, it, expect } from 'vitest';
import { formatDate, formatEventDates } from './formatDate';

describe('formatDate', () => {
	it('should return empty string for empty input', () => {
		expect(formatDate('')).toBe('');
	});

	it('should return original string for unparseable dates', () => {
		expect(formatDate('not-a-date')).toBe('not-a-date');
	});

	it('should format date-only strings without time', () => {
		const result = formatDate('2026-03-20');
		// toLocaleDateString output is locale-dependent; just verify it contains the year and month
		expect(result).toContain('March');
		expect(result).toContain('2026');
		expect(result).not.toContain('at');
	});

	it('should format SQLite datetime strings with time', () => {
		const result = formatDate('2026-03-20 18:29:35');
		expect(result).toContain('March');
		expect(result).toContain('2026');
		expect(result).toContain('at');
	});

	it('should format ISO datetime strings with time', () => {
		const result = formatDate('2026-03-20T18:29:35');
		expect(result).toContain('March');
		expect(result).toContain('2026');
		expect(result).toContain('at');
	});

	it('should include time when includeTime is true and there is a timestamp', () => {
		const result = formatDate('2026-03-20 14:00:00', true);
		expect(result).toContain('at');
	});

	it('should not include time for date-only even when includeTime is true', () => {
		// date-only string is <= 10 chars, so time is not appended
		const result = formatDate('2026-03-20', true);
		expect(result).toContain('March');
		expect(result).toContain('2026');
		expect(result).not.toContain('at');
	});
});

describe('formatEventDates', () => {
	it('should return empty string for empty start', () => {
		expect(formatEventDates('', null)).toBe('');
	});

	it('should return original string for unparseable start', () => {
		expect(formatEventDates('bad-date', null)).toBe('bad-date');
	});

	it('should format start-only date with time', () => {
		const result = formatEventDates('2026-03-20T18:00:00', null);
		expect(result).toContain('March');
		expect(result).toContain('2026');
		expect(result).toContain('at');
	});

	it('should format same-day range with dash between times', () => {
		const result = formatEventDates('2026-03-20T09:00:00', '2026-03-20T17:00:00');
		expect(result).toContain('March');
		expect(result).toContain('2026');
		expect(result).toContain('at');
		// Should have an en dash between times
		expect(result).toMatch(/\u2013/);
	});

	it('should format multi-day range with both dates', () => {
		const result = formatEventDates('2026-03-20T09:00:00', '2026-03-22T17:00:00');
		expect(result).toContain('March');
		expect(result).toContain('20');
		expect(result).toContain('22');
		expect(result).toMatch(/\u2013/);
	});

	it('should handle unparseable end date gracefully', () => {
		const result = formatEventDates('2026-03-20T09:00:00', 'bad-end');
		expect(result).toContain('March');
		expect(result).toContain('2026');
		expect(result).toContain('at');
	});
});
