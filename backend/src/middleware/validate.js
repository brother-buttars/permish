function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  if (!phone) return true;
  const cleaned = phone.replace(/[\s\-().]/g, '');
  return /^\+?\d{7,15}$/.test(cleaned);
}

function validateDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return str;
  return str.slice(0, maxLength).replace(/[<>]/g, '');
}

function validateRegistration(req, res, next) {
  const { email, password, name, role } = req.body;
  const errors = [];
  if (!email || !validateEmail(email)) errors.push('Valid email is required');
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters');
  if (!name || name.trim().length === 0) errors.push('Name is required');
  // Accept 'user' or legacy 'planner'/'parent' — all map to 'user'
  const allowedRoles = ['user', 'planner', 'parent'];
  if (!allowedRoles.includes(role)) errors.push('Role must be "user"');
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });
  // Normalize legacy roles to 'user'
  req.body.role = 'user';
  req.body.name = sanitizeString(name);
  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  next();
}

module.exports = {
  validateEmail, validatePhone, validateDate, sanitizeString,
  validateRegistration, validateLogin,
};
