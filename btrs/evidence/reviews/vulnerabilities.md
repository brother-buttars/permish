# Security Audit Report - PermissionForm (Permish)

**Date**: 2026-03-29
**Auditor**: Code Security Agent
**Scope**: Full codebase (backend + frontend)
**Methodology**: Manual static analysis of all route handlers, middleware, services, and frontend code

---

## Executive Summary

The codebase demonstrates good foundational security practices: parameterized SQL queries, HttpOnly/SameSite cookies, Helmet headers, CORS, input sanitization, and bcrypt password hashing. However, several issues ranging from CRITICAL to LOW were identified that should be addressed before production deployment.

**Findings by Severity:**
- CRITICAL: 1
- HIGH: 5
- MEDIUM: 6
- LOW: 5

---

## CRITICAL

### 1. Hardcoded JWT Secret Fallback

**File**: `backend/src/config.js`, line 5
**OWASP**: A07:2021 - Identification and Authentication Failures

```javascript
jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
```

**Description**: If `JWT_SECRET` is not set in the environment, the application silently falls back to a publicly known string (`'dev-secret-change-me'`). Any attacker who reads this source code (which is in a Git repository) can forge valid JWT tokens for any user, including planners. This completely bypasses all authentication and authorization.

**Recommended Fix**: Refuse to start the server if `JWT_SECRET` is not set or is too short:

```javascript
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  console.error('FATAL: JWT_SECRET must be set and at least 32 characters');
  process.exit(1);
}
```

---

## HIGH

### 2. Rate Limiters Defined but Never Applied to Form Submission

**File**: `backend/src/middleware/rateLimiter.js`, lines 19-31
**File**: `backend/src/index.js` (missing import)
**OWASP**: A05:2021 - Security Misconfiguration

```javascript
// rateLimiter.js defines these:
const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, ... });
const formLoadLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, ... });

// index.js only imports:
const { registerLimiter, loginLimiter } = require('./middleware/rateLimiter');
// submitLimiter and formLoadLimiter are NEVER used anywhere
```

**Description**: The form submission endpoint (`POST /:id/submit`) and form load endpoint (`GET /:id/form`) have no rate limiting. An attacker can flood the server with submissions (triggering PDF generation and email/SMS notifications) causing denial of service, disk exhaustion (PDFs), and potentially incurring email/SMS costs.

**Recommended Fix**: Apply the limiters in `index.js`:

```javascript
const { registerLimiter, loginLimiter, submitLimiter, formLoadLimiter } = require('./middleware/rateLimiter');
// ...
app.use('/api/events/:id/submit', submitLimiter);
app.use('/api/events/:id/form', formLoadLimiter);
```

---

### 3. No CSRF Protection

**File**: `backend/src/index.js` (global)
**OWASP**: A01:2021 - Broken Access Control

**Description**: The application uses cookie-based authentication with `SameSite: strict`, which provides strong CSRF protection in modern browsers. However, `SameSite: strict` is only set in production (`secure: process.env.NODE_ENV === 'production'`). There is no additional CSRF token mechanism. While `SameSite: strict` is generally sufficient, older browsers may not support it, and the `secure` flag being conditional means cookies are sent over HTTP in development (expected but worth noting).

The more pressing concern: the CORS configuration trusts a single origin (`config.frontendUrl`), which is good. But if `FRONTEND_URL` is not set, it falls back to `http://localhost:3000`, which could be exploited in development environments if the attacker can run on port 3000.

**Recommended Fix**: This is acceptable for the app's risk profile (church permission forms) as long as `SameSite: strict` is always set. Consider adding `SameSite: strict` unconditionally (not just in production):

```javascript
res.cookie('token', token, {
  httpOnly: true,
  sameSite: 'strict',  // Already strict regardless of env - GOOD
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000,
});
```

Note: `sameSite: 'strict'` IS already set unconditionally -- this is correct. The risk is LOW given the current implementation.

---

### 4. Weak Password Policy

**File**: `backend/src/middleware/validate.js`, line 24
**OWASP**: A07:2021 - Identification and Authentication Failures

```javascript
if (!password || password.length < 8) errors.push('Password must be at least 8 characters');
```

**Description**: The only password requirement is 8 characters minimum. No complexity requirements (uppercase, lowercase, digits, special characters). No check against common/breached password lists. An 8-character all-lowercase password is trivially brute-forceable if the database is compromised (despite bcrypt, common passwords will still be found quickly).

**Recommended Fix**: Increase minimum to 12 characters and add basic complexity requirements:

```javascript
if (!password || password.length < 12) errors.push('Password must be at least 12 characters');
if (password.length > 128) errors.push('Password must not exceed 128 characters');
```

At minimum, consider checking against the top 1000 common passwords.

---

### 5. Content-Disposition Header Injection in Attachment Downloads

**File**: `backend/src/routes/form.js`, line 51
**OWASP**: A03:2021 - Injection

```javascript
res.setHeader('Content-Disposition', `inline; filename="${attachment.original_name}"`);
```

**Description**: The `original_name` comes from the database but was originally derived from the user-uploaded file's original filename. If it contains double quotes, newlines, or other special characters, it can break the Content-Disposition header, potentially leading to response header injection. While multer does not sanitize `originalname`, the filename is stored as-is.

**Recommended Fix**: Sanitize the filename for the header:

```javascript
const safeName = attachment.original_name.replace(/["\r\n]/g, '_');
res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
```

Or use the `content-disposition` npm package which handles encoding properly.

---

### 6. Email HTML Injection in Notifications

**File**: `backend/src/services/email.js`, line 26
**OWASP**: A03:2021 - Injection

```javascript
html: `<p>A form has been submitted for <strong>${participantName}</strong> for <strong>${eventName}</strong>.</p>`,
```

**Description**: `participantName` and `eventName` are interpolated directly into HTML without escaping. While `participantName` goes through `sanitizeString()` which strips `<` and `>`, the `eventName` comes from the events table and the `sanitizeString` function only strips `<` and `>` -- it does not escape `"`, `'`, or `&`, which could still be leveraged in HTML attribute contexts. Additionally, the email `subject` line uses these values unescaped.

**Recommended Fix**: HTML-escape all interpolated values in email templates:

```javascript
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

---

## MEDIUM

### 7. Notify Email/Phone Not Sanitized

**File**: `backend/src/routes/events.js`, lines 54, 114-116
**OWASP**: A03:2021 - Injection

```javascript
notify_email || null, notify_phone || null, notify_carrier || null,
```

**Description**: `notify_email`, `notify_phone`, and `notify_carrier` are inserted into the database without sanitization or validation. While other string fields go through `sanitizeString()`, these three do not. The `notify_email` value is later used as the `to` address in `sendNotification()`, meaning a malicious planner could set this to an arbitrary email address (which is expected) but could also inject email headers if the value contains newlines.

**Recommended Fix**: Validate `notify_email` with the existing `validateEmail()` function, validate `notify_phone` with `validatePhone()`, and validate `notify_carrier` against the known carrier list.

---

### 8. `event_start` and `event_end` Not Sanitized

**File**: `backend/src/routes/events.js`, lines 54, 109-110
**OWASP**: A03:2021 - Injection

```javascript
event_start || null, event_end || null,
```

**Description**: `event_start` and `event_end` are passed directly to the database without any sanitization or format validation. While SQL injection is not possible due to parameterized queries, storing arbitrary strings in date fields could lead to unexpected behavior when these values are parsed and displayed on the frontend.

**Recommended Fix**: Validate these as ISO 8601 datetime strings before storing.

---

### 9. `participant_dob` Not Validated in Form Submission

**File**: `backend/src/routes/form.js`, line 63
**OWASP**: A03:2021 - Injection

```javascript
const age = computeAge(d.participant_dob);
// d.participant_dob is passed directly to the DB without validation
```

**Description**: `participant_dob` is used in `computeAge()` and then stored directly. It is not validated as a date format, not sanitized, and could contain any arbitrary string. The `computeAge` function will compute `NaN` for invalid dates, which then gets stored as the age. The schema requires `participant_age INTEGER NOT NULL`, so NaN would fail silently or store incorrect data.

**Recommended Fix**: Validate `participant_dob` with the existing `validateDate()` function:

```javascript
if (!d.participant_dob || !validateDate(d.participant_dob)) {
  return res.status(400).json({ error: 'Valid date of birth is required' });
}
```

---

### 10. File Upload MIME Type Validation Is Client-Trusting

**File**: `backend/src/routes/events.js`, lines 30-39
**OWASP**: A04:2021 - Insecure Design

```javascript
fileFilter: (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'));
  }
},
```

**Description**: The MIME type check relies on the `Content-Type` header sent by the client, which is trivially spoofable. An attacker could upload a malicious executable or HTML file by setting the Content-Type to `application/pdf` while sending entirely different content. The file is then served back with the stored (spoofed) MIME type via the public download endpoint.

**Recommended Fix**: Additionally validate the file extension AND use a library like `file-type` to verify the actual file content (magic bytes):

```javascript
const { fileTypeFromBuffer } = require('file-type');
// After upload, verify actual content type matches claimed type
```

---

### 11. No Maximum Password Length Check

**File**: `backend/src/middleware/validate.js`, line 24
**OWASP**: A07:2021 - Identification and Authentication Failures

```javascript
if (!password || password.length < 8) errors.push('Password must be at least 8 characters');
```

**Description**: There is no maximum password length enforced. bcrypt has a 72-byte input limit -- anything beyond 72 bytes is silently truncated. Additionally, extremely long passwords (e.g., 1MB) can cause DoS via CPU-intensive hashing. An attacker could submit multi-megabyte passwords repeatedly to exhaust server resources.

**Recommended Fix**: Add a maximum length check:

```javascript
if (password.length > 128) errors.push('Password must not exceed 128 characters');
```

---

### 12. Bcrypt Cost Factor is 10 (Low)

**File**: `backend/src/routes/auth.js`, line 17
**OWASP**: A02:2021 - Cryptographic Failures

```javascript
const password_hash = await bcrypt.hash(password, 10);
```

**Description**: A cost factor of 10 is the bcrypt default and was appropriate years ago. Current recommendations suggest 12+ for better resistance against GPU-based cracking. With modern hardware, cost factor 10 can be brute-forced significantly faster than 12.

**Recommended Fix**: Increase to 12:

```javascript
const password_hash = await bcrypt.hash(password, 12);
```

---

## LOW

### 13. JWT Payload Contains Mutable Data

**File**: `backend/src/middleware/auth.js`, lines 35-38
**OWASP**: A07:2021 - Identification and Authentication Failures

```javascript
const token = jwt.sign(
  { id: user.id, email: user.email, role: user.role, name: user.name },
  config.jwtSecret,
  { expiresIn: config.jwtExpiry }
);
```

**Description**: The JWT contains `role` and `name` which could change in the database (e.g., if a user's role is revoked). Since the token is valid for 24 hours, a user whose role was changed would retain their old privileges until the token expires. There is no token revocation mechanism.

**Recommended Fix**: For this app's risk profile, this is acceptable. For higher security, store only `id` in the JWT and look up role from the database on each request, or implement a token blacklist.

---

### 14. Error Messages Distinguish Registered vs. Unregistered Emails

**File**: `backend/src/routes/auth.js`, line 14

```javascript
if (existing) return res.status(409).json({ error: 'Email already registered' });
```

**Description**: The registration endpoint reveals whether an email is already registered. This enables user enumeration -- an attacker can probe to discover which email addresses have accounts. The login endpoint correctly uses a generic "Invalid credentials" message (line 31/34), but registration leaks this information.

**Recommended Fix**: For this app's use case (church forms, not high-security), this is a convenience trade-off. For stricter security, return a generic message and send a "you already have an account" email to existing users.

---

### 15. No Global Rate Limiting

**File**: `backend/src/index.js`
**OWASP**: A05:2021 - Security Misconfiguration

**Description**: While specific endpoints have rate limiters (register, login), there is no global rate limiter. All other endpoints (profiles CRUD, events CRUD, submissions CRUD) can be hit unlimited times. This could enable scraping, brute-force enumeration of event IDs, or general DoS.

**Recommended Fix**: Add a global rate limiter with a generous limit:

```javascript
const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 200 });
app.use(globalLimiter);
```

---

### 16. `organizations` Field Stored Without Validation

**File**: `backend/src/routes/events.js`, line 54

```javascript
JSON.stringify(organizations || [])
```

**Description**: The `organizations` array is stringified and stored without validating its contents. A malicious planner could store arbitrary large JSON arrays, deeply nested objects, or non-string values that could cause issues when parsed on the frontend.

**Recommended Fix**: Validate that `organizations` is an array of known organization strings before storing.

---

### 17. `participant_signature` and `guardian_signature` Stored Without Content Validation

**File**: `backend/src/routes/form.js`, lines 100-101

```javascript
d.participant_signature, d.participant_signature_type, d.participant_signature_date,
d.guardian_signature || null, d.guardian_signature_type || null, d.guardian_signature_date || null
```

**Description**: Signatures of type `drawn` are expected to be base64-encoded PNG data URLs. The only validation is a 700KB size limit (line 73-77). There is no validation that the data is actually a valid PNG data URL. The signature type is not validated against the allowed enum (`drawn`, `typed`, `hand`) at the application level (the DB CHECK constraint will catch invalid values, but with a 500 error instead of a clean 400).

**Recommended Fix**: Validate signature type is one of the allowed values, and validate that drawn signatures match the expected `data:image/png;base64,...` pattern.

---

## Positive Findings (Things Done Well)

1. **SQL Injection Protection**: All database queries use parameterized statements (`?` placeholders). No string interpolation in SQL queries (the one `db.exec` in schema.js migrations uses hardcoded column names from an internal object, not user input).

2. **XSS Protection**: The `linkify()` function properly escapes HTML before linkifying, and `sanitizeString()` strips `<>` from user input. The `{@html linkify(...)}` usage is safe because `linkify()` escapes first.

3. **Cookie Security**: HttpOnly, SameSite=strict, Secure in production -- good configuration.

4. **Helmet**: Security headers are applied via Helmet.

5. **CORS**: Properly restricted to a single origin.

6. **Authorization Checks**: Events are scoped to `created_by = ?`, profiles to `user_id = ?`, and submissions have proper planner/submitter access checks.

7. **File Uploads**: Size limits (10MB), type allowlist, UUID-based filenames (preventing path traversal in stored filenames), attachment count limits (10 per event).

8. **Password Hashing**: bcrypt is used (not MD5/SHA).

9. **No Sensitive Data Leakage**: Auth endpoints return only safe user fields (no password_hash).

10. **Foreign Key Enforcement**: `PRAGMA foreign_keys = ON` is set.

---

## Summary of Recommended Actions

| Priority | Action |
|----------|--------|
| **Immediate** | Remove JWT secret fallback; fail-fast if not configured |
| **Immediate** | Apply `submitLimiter` and `formLoadLimiter` to form routes |
| **Short-term** | Validate `notify_email`/`notify_phone`/`notify_carrier` |
| **Short-term** | Validate `participant_dob` format in form submission |
| **Short-term** | Sanitize Content-Disposition filename |
| **Short-term** | HTML-escape values in email templates |
| **Short-term** | Add max password length (128 chars) |
| **Medium-term** | Increase bcrypt cost factor to 12 |
| **Medium-term** | Validate file content (magic bytes) not just MIME type |
| **Medium-term** | Add global rate limiter |
| **Medium-term** | Validate organizations array contents |
| **Low** | Increase minimum password length to 12 |
| **Low** | Validate signature type and format at application level |
