import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeAge } from './age';

describe('computeAge', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('should compute age correctly when birthday has passed this year', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-15'));
		expect(computeAge('2014-03-10')).toBe(12);
	});

	it('should compute age correctly when birthday has not yet passed this year', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-01'));
		expect(computeAge('2014-03-10')).toBe(11);
	});

	it('should compute age correctly on the birthday', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-10'));
		expect(computeAge('2014-03-10')).toBe(12);
	});

	it('should compute age correctly the day before the birthday', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-09'));
		expect(computeAge('2014-03-10')).toBe(11);
	});

	it('should handle newborns', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-22'));
		expect(computeAge('2026-03-22')).toBe(0);
	});

	it('should handle leap year birthdays', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-01'));
		// Born on Feb 29, 2000 -- by March 1 2026 they have turned 26
		expect(computeAge('2000-02-29')).toBe(26);
	});
});
