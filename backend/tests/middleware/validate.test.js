const { sanitizeString, validateEmail, validatePhone, validateDate } = require('../../src/middleware/validate');

describe('sanitizeString', () => {
  test('strips < and > characters', () => {
    expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
  });

  test('truncates to default max length of 500', () => {
    const long = 'a'.repeat(600);
    expect(sanitizeString(long)).toHaveLength(500);
  });

  test('truncates to custom max length', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeString(long, 100)).toHaveLength(100);
  });

  test('returns non-string values unchanged', () => {
    expect(sanitizeString(null)).toBeNull();
    expect(sanitizeString(undefined)).toBeUndefined();
    expect(sanitizeString(42)).toBe(42);
    expect(sanitizeString(true)).toBe(true);
  });

  test('handles empty string', () => {
    expect(sanitizeString('')).toBe('');
  });

  test('handles string with only angle brackets', () => {
    expect(sanitizeString('<<<>>>')).toBe('');
  });

  test('preserves safe characters', () => {
    const safe = 'Hello World! @#$%^&*()_+-=[]{}|;:\'",./? 123';
    expect(sanitizeString(safe)).toBe(safe);
  });

  test('strips nested HTML tags', () => {
    expect(sanitizeString('<div><p>text</p></div>')).toBe('divptext/p/div');
  });

  test('handles mixed content with angle brackets', () => {
    expect(sanitizeString('5 > 3 and 2 < 4')).toBe('5  3 and 2  4');
  });
});

describe('validateEmail', () => {
  test('accepts valid emails', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('user+tag@example.co.uk')).toBe(true);
  });

  test('rejects invalid emails', () => {
    expect(validateEmail('not-an-email')).toBe(false);
    expect(validateEmail('@example.com')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });
});

describe('validatePhone', () => {
  test('accepts valid phone numbers', () => {
    expect(validatePhone('555-123-4567')).toBe(true);
    expect(validatePhone('(555) 123-4567')).toBe(true);
    expect(validatePhone('+15551234567')).toBe(true);
  });

  test('accepts empty/null (optional field)', () => {
    expect(validatePhone('')).toBe(true);
    expect(validatePhone(null)).toBe(true);
    expect(validatePhone(undefined)).toBe(true);
  });

  test('rejects invalid phone numbers', () => {
    expect(validatePhone('abc')).toBe(false);
    expect(validatePhone('123')).toBe(false);
  });
});

describe('validateDate', () => {
  test('accepts valid YYYY-MM-DD dates', () => {
    expect(validateDate('2026-03-29')).toBe(true);
    expect(validateDate('2000-01-01')).toBe(true);
  });

  test('rejects invalid date formats', () => {
    expect(validateDate('03/29/2026')).toBe(false);
    expect(validateDate('2026-13-01')).toBe(false);
    expect(validateDate('not-a-date')).toBe(false);
    expect(validateDate('')).toBe(false);
  });
});
