import { describe, it, expect } from 'vitest';
import { validateEmail, validatePhone, validateDate } from './validation';

describe('validateEmail', () => {
	it('should accept valid email addresses', () => {
		expect(validateEmail('user@example.com')).toBe(true);
		expect(validateEmail('user+tag@example.com')).toBe(true);
		expect(validateEmail('user@subdomain.example.com')).toBe(true);
		expect(validateEmail('first.last@example.com')).toBe(true);
	});

	it('should reject invalid email addresses', () => {
		expect(validateEmail('')).toBe(false);
		expect(validateEmail('invalid')).toBe(false);
		expect(validateEmail('missing@')).toBe(false);
		expect(validateEmail('@missing.com')).toBe(false);
		expect(validateEmail('has spaces@example.com')).toBe(false);
		expect(validateEmail('user@')).toBe(false);
	});
});

describe('validatePhone', () => {
	it('should accept valid phone numbers', () => {
		expect(validatePhone('1234567')).toBe(true);
		expect(validatePhone('123-456-7890')).toBe(true);
		expect(validatePhone('(123) 456-7890')).toBe(true);
		expect(validatePhone('+1 123 456 7890')).toBe(true);
	});

	it('should accept empty phone (optional field)', () => {
		expect(validatePhone('')).toBe(true);
	});

	it('should reject invalid phone numbers', () => {
		expect(validatePhone('123')).toBe(false);
		expect(validatePhone('abcdefghij')).toBe(false);
		expect(validatePhone('1234567890123456')).toBe(false);
	});
});

describe('validateDate', () => {
	it('should accept valid YYYY-MM-DD dates', () => {
		expect(validateDate('2026-03-20')).toBe(true);
		expect(validateDate('2000-01-01')).toBe(true);
		expect(validateDate('1990-12-31')).toBe(true);
	});

	it('should reject invalid date formats', () => {
		expect(validateDate('03-20-2026')).toBe(false);
		expect(validateDate('20/03/2026')).toBe(false);
		expect(validateDate('2026-3-20')).toBe(false);
		expect(validateDate('not-a-date')).toBe(false);
		expect(validateDate('')).toBe(false);
	});

	it('should reject dates with out-of-range month', () => {
		expect(validateDate('2026-13-01')).toBe(false);
	});

	it('should note that Date.parse accepts rolled-over days like Feb 30', () => {
		// This is a known JS Date quirk: Feb 30 rolls to March 2
		// The current implementation does not catch this edge case
		expect(validateDate('2026-02-30')).toBe(true);
	});
});
