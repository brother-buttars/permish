function sanitizeString(value, maxLength = 500) {
  if (value == null) return null;
  return String(value).replace(/[<>]/g, '').trim().slice(0, maxLength);
}

module.exports = { sanitizeString };
