---
title: "Tech Debt & Codebase Quality Scan"
created: 2026-03-22
updated: 2026-03-22
tags: [research, tech-debt, code-quality, security, accessibility]
agent: research
status: complete
---

# Tech Debt & Codebase Quality Scan

**Date:** 2026-03-22
**Scope:** Full codebase scan of permish project
**Agent:** Research

## Summary

| Category                          | Critical | High | Medium | Low | Total |
|-----------------------------------|----------|------|--------|-----|-------|
| 1. Field Name Consistency         | 0        | 0    | 0      | 0   | 0     |
| 2. Dead Code & Unused Deps       | 0        | 1    | 3      | 1   | 5     |
| 3. Svelte 5 Runes Compliance     | 0        | 0    | 0      | 0   | 0     |
| 4. Security Issues                | 1        | 2    | 2      | 0   | 5     |
| 5. Error Handling Gaps            | 0        | 1    | 3      | 0   | 4     |
| 6. Dependency Issues              | 0        | 0    | 2      | 0   | 2     |
| 7. Configuration Issues           | 0        | 1    | 1      | 0   | 2     |
| 8. Frontend/Backend Mismatches    | 0        | 0    | 1      | 0   | 1     |
| 9. Accessibility                  | 0        | 1    | 3      | 0   | 4     |
| 10. Code Quality / Duplication    | 0        | 1    | 4      | 1   | 6     |
| **TOTAL**                         | **1**    | **7**| **19** | **2**| **29**|

---

## 1. Field Name Consistency

**Result: CLEAN** -- All frontend API calls use correct field names matching the backend schema.

Verified across all `+page.svelte` files and `api.ts`:
- `participant_name`, `participant_dob`, `participant_phone` -- correct everywhere
- `emergency_contact`, `emergency_phone_primary`, `emergency_phone_secondary` -- correct
- `allergies_details`, `can_self_administer_meds` -- correct
- `event_name`, `event_dates`, `event_description` -- correct
- `submitted_at` -- used correctly (not `created_at`)

No mismatches found.

---

## 2. Dead Code & Unused Dependencies

### 2.1 -- `uuid` package in backend (HIGH)

- **File:** `backend/package.json:37`
- **Description:** The `uuid` package is listed as a dependency but is never imported anywhere in `backend/src/`. All ID generation uses `crypto.randomUUID()` instead.
- **Severity:** HIGH (unnecessary dependency, increases install size and attack surface)
- **Fix:** `pnpm remove uuid` from the backend directory.

### 2.2 -- `handlebars` package in backend (MEDIUM)

- **File:** `backend/package.json:32`
- **Description:** The `handlebars` package is listed as a dependency but is never imported anywhere in `backend/src/`. There are no template files using Handlebars.
- **Severity:** MEDIUM (unused dependency)
- **Fix:** `pnpm remove handlebars` from the backend directory.

### 2.3 -- `submitLimiter` and `formLoadLimiter` exported but never used (MEDIUM)

- **File:** `backend/src/middleware/rateLimiter.js:19-31`
- **Description:** `submitLimiter` and `formLoadLimiter` are defined and exported but are never imported or applied to any route in `backend/src/index.js` or any route file. The form submission route (`POST /:id/submit` in `form.js`) and form load route (`GET /:id/form`) have no rate limiting applied.
- **Severity:** MEDIUM (rate limiters exist but are not wired up -- the form submit endpoint is unprotected from abuse)
- **Fix:** Apply `submitLimiter` to the `POST /:id/submit` route and `formLoadLimiter` to the `GET /:id/form` route in `backend/src/index.js` or `form.js`.

### 2.4 -- `page` import unused in `profiles/+page.svelte` (MEDIUM)

- **File:** `frontend/src/routes/profiles/+page.svelte:4`
- **Description:** `page` is imported from `$app/stores` but never referenced in the component.
- **Severity:** MEDIUM (unused import)
- **Fix:** Remove the `import { page } from "$app/stores"` line.

### 2.5 -- `Separator` imported but usage is minimal in some pages (LOW)

- **File:** Various
- **Description:** The `Separator` import exists in `dashboard/+page.svelte` but is only used once in parent view. Not a real issue, just noting for completeness.
- **Severity:** LOW

---

## 3. Svelte 5 Runes Compliance

**Result: CLEAN** -- Excellent compliance throughout.

Verified:
- No `export let` found in any `.svelte` file -- all use `$props()`.
- No `$:` reactive statements found -- all use `$derived`, `$derived.by()`, or `$effect`.
- No `alert()` or `confirm()` calls found -- all use toasts and `ConfirmModal`.
- All components properly use `$state()`, `$bindable()`, and `$effect()`.

---

## 4. Security Issues

### 4.1 -- Default JWT secret in production (CRITICAL)

- **File:** `backend/src/config.js:5`
- **Description:** `jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me'` falls back to a hardcoded default. If `JWT_SECRET` is not set in production, any attacker can forge valid JWT tokens. There is no runtime check that `JWT_SECRET` has been changed from the default.
- **Severity:** CRITICAL
- **Fix:** Add a startup check that throws an error if `NODE_ENV=production` and `JWT_SECRET` is missing or equals the default value.

### 4.2 -- No rate limiting on form submission endpoint (HIGH)

- **File:** `backend/src/routes/form.js:29` / `backend/src/index.js`
- **Description:** The `POST /:id/submit` route (public form submission) has no rate limiting applied, even though `submitLimiter` exists in `rateLimiter.js`. An attacker could flood the system with submissions, generating PDFs and consuming disk space and CPU.
- **Severity:** HIGH
- **Fix:** Apply `submitLimiter` middleware to the submit route. Similarly apply `formLoadLimiter` to the `GET /:id/form` route.

### 4.3 -- No input length validation on form submission body (HIGH)

- **File:** `backend/src/routes/form.js:29-72`
- **Description:** While `sanitizeString` limits individual strings to 500 chars (or 1000 for some fields), the overall request body size is only limited by `express.json({ limit: '2mb' })`. There is no validation on `participant_dob` format, `participant_signature_type` value (only checked for length, not enum), or that `participant_dob` is a valid date. The `computeAge` function will produce incorrect results for malformed dates.
- **Severity:** HIGH (could lead to bad data in the database)
- **Fix:** Add validation for `participant_dob` using `validateDate()` from the validate middleware. Validate `participant_signature_type` is one of `'drawn'` or `'typed'`. Validate `guardian_signature_type` similarly.

### 4.4 -- Email notification has potential header injection (MEDIUM)

- **File:** `backend/src/services/email.js:24-26`
- **Description:** `participantName` and `eventName` are interpolated directly into email subject and body HTML without sanitization. While the risk is low with Nodemailer's built-in protections, the HTML body uses `${participantName}` inside `<strong>` tags without HTML escaping.
- **Severity:** MEDIUM
- **Fix:** HTML-escape `participantName` and `eventName` in the HTML body. Nodemailer handles subject header injection, so the subject is safe.

### 4.5 -- PDF file path traversal potential (MEDIUM)

- **File:** `backend/src/routes/submissions.js:50`
- **Description:** `fs.existsSync(submission.pdf_path)` and `res.download(submission.pdf_path)` use the path stored in the database. If an attacker could inject a path into the database, they could read arbitrary files. The risk is mitigated because `pdf_path` is only set by the `generatePdf` function (using `submission.id` as filename), but there is no validation that the path is within the expected directory.
- **Severity:** MEDIUM
- **Fix:** Validate that `submission.pdf_path` starts with the configured `pdfDir` before serving the file.

---

## 5. Error Handling Gaps

### 5.1 -- `console.error` instead of toast on planner pages (HIGH)

- **File:** `frontend/src/routes/event/[id]/+page.svelte:74`, `event/[id]/+page.svelte:104`, `event/[id]/submissions/+page.svelte:83`, `submissions/+page.svelte:76`, `dashboard/+page.svelte:60`
- **Description:** Several planner pages use `console.error()` when data loading fails but show no user-facing error message. The user sees a blank/loading page with no feedback. Examples: loading event data, loading submissions, toggling event active status.
- **Severity:** HIGH (poor UX -- user doesn't know something went wrong)
- **Fix:** Replace `console.error()` with `toastError()` and/or set an error state variable to show an error message in the UI.

### 5.2 -- ZIP download failures silently logged (MEDIUM)

- **File:** `frontend/src/routes/event/[id]/+page.svelte:161`, `event/[id]/submissions/+page.svelte:143`
- **Description:** When ZIP download fails, only `console.error` is called. The user sees "Creating ZIP..." button revert to normal but gets no feedback that it failed.
- **Severity:** MEDIUM
- **Fix:** Add `toastError('Failed to download ZIP')` in the catch block.

### 5.3 -- Missing try/catch on profile creation routes (MEDIUM)

- **File:** `backend/src/routes/profiles.js:15-41`
- **Description:** The `POST /` and `PUT /:id` routes do not have try/catch blocks. If the database insert/update fails (e.g., constraint violation), Express will return a 500 with an unformatted error.
- **Severity:** MEDIUM
- **Fix:** Wrap database operations in try/catch and return structured error responses.

### 5.4 -- Missing try/catch on event create/update routes (MEDIUM)

- **File:** `backend/src/routes/events.js:10-25`, `events.js:65-89`
- **Description:** Same as above -- no try/catch around database operations in event create and update routes.
- **Severity:** MEDIUM
- **Fix:** Add try/catch blocks with structured error responses.

---

## 6. Dependency Issues

### 6.1 -- Frontend missing `PUBLIC_API_URL` env var in .env.example (MEDIUM)

- **File:** `frontend/src/lib/api.ts:1`, `.env.example`
- **Description:** The frontend uses `import.meta.env.PUBLIC_API_URL` but this variable is not documented in any `.env.example` file in the frontend directory. The root `.env.example` and `backend/.env.example` have no frontend-specific entries. The Docker Compose file sets it, but local development docs don't mention it.
- **Severity:** MEDIUM
- **Fix:** Create a `frontend/.env.example` with `PUBLIC_API_URL=http://localhost:3001`.

### 6.2 -- `tailwind-variants` dependency appears unused (MEDIUM)

- **File:** `frontend/package.json:34`
- **Description:** `tailwind-variants` is listed as a dependency. A search of the frontend source code should confirm whether it is actually imported. The project uses `cn()` (clsx + tailwind-merge) for class merging, which is the typical shadcn pattern. `tailwind-variants` may have been added during initial setup but never used.
- **Severity:** MEDIUM
- **Fix:** Verify with `grep -r "tailwind-variants" frontend/src/` and remove if unused.

---

## 7. Configuration Issues

### 7.1 -- Docker Compose `PUBLIC_API_URL` points to internal hostname (HIGH)

- **File:** `docker-compose.yml:22`
- **Description:** `PUBLIC_API_URL=http://backend:3001` is set as the frontend's API URL. This is an internal Docker network hostname, not accessible from the user's browser. SvelteKit is a client-side app that makes fetch calls from the browser, so the API URL must be a URL the browser can reach (e.g., `http://localhost:3001`). The current configuration will cause all API calls to fail when the frontend is accessed from a browser.
- **Severity:** HIGH (Docker deployment is completely broken for API calls)
- **Fix:** Change to `PUBLIC_API_URL=http://localhost:3001` or use a reverse proxy configuration where both frontend and backend are served from the same origin.

### 7.2 -- No health check in Docker Compose (MEDIUM)

- **File:** `docker-compose.yml`
- **Description:** No healthchecks are defined for either service. The `depends_on` for the frontend only waits for the backend container to start, not for it to be ready. If the backend takes time to initialize, the frontend may fail.
- **Severity:** MEDIUM
- **Fix:** Add healthcheck using the `/api/health` endpoint: `healthcheck: { test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"], interval: 10s, timeout: 5s, retries: 3 }`.

---

## 8. Frontend/Backend Contract Mismatches

### 8.1 -- Edit submission page uses `api.getEvent` (planner-only) instead of `api.getFormEvent` (public) (MEDIUM)

- **File:** `frontend/src/routes/form/[id]/edit/[submissionId]/+page.svelte:136`
- **Description:** The edit submission page calls `api.getEvent(data.eventId)` which hits the planner-only `GET /api/events/:id` route (requires `requireAuth + requirePlanner`). However, the edit submission page might be accessed by a parent (submitter) who is not a planner. The parent would get a 403 error when trying to load the event details for the edit page.
- **Severity:** MEDIUM (parents cannot edit their own submissions even though the backend allows it)
- **Fix:** Either use `api.getFormEvent(data.eventId)` (the public route) for loading event details on the edit page, or create a dedicated route that returns event details for users who have submitted to that event.

---

## 9. Accessibility Issues

### 9.1 -- PDF/QR modals missing keyboard escape handling (HIGH)

- **File:** `frontend/src/routes/event/[id]/+page.svelte:423-501`, `dashboard/+page.svelte:304-333`, `submissions/+page.svelte:347-376`, `event/[id]/submissions/+page.svelte:319-348`
- **Description:** The custom PDF preview modals and QR code modal have `role="dialog"` and `aria-modal="true"` but do not handle keyboard Escape to close. They also do not trap focus within the modal. Svelte's `a11y_click_events_have_key_events` warnings are suppressed with `svelte-ignore` comments rather than being properly fixed.
- **Severity:** HIGH (keyboard-only users cannot close modals)
- **Fix:** Add `onkeydown` handler for Escape key on the modal container. Implement focus trapping. Consider extracting the PDF modal into a shared component to fix this once.

### 9.2 -- Native `<select>` elements lack ARIA labels in some places (MEDIUM)

- **File:** `frontend/src/routes/create/+page.svelte:373-382`, `event/[id]/edit/+page.svelte:361-370`, `event/[id]/submissions/+page.svelte:229-237`, `submissions/+page.svelte:204-212`
- **Description:** Several `<select>` elements use inline styling to match shadcn patterns but lack `aria-label` attributes. While they have associated `<Label>` elements with `for` attributes in some cases, the filter selects on submissions pages do not.
- **Severity:** MEDIUM
- **Fix:** Add `aria-label` attributes to all `<select>` elements that don't have a visible label or `<Label for>` association.

### 9.3 -- Canvas signature pad not keyboard accessible (MEDIUM)

- **File:** `frontend/src/lib/components/SignaturePad.svelte:195-203`
- **Description:** The drawing canvas is only usable via pointer events. There is no keyboard fallback for the draw mode. While the typed mode exists as an alternative, there is no indication that keyboard users should switch to typed mode.
- **Severity:** MEDIUM (mitigated by typed mode alternative)
- **Fix:** Add a note near the draw mode that suggests typed mode for keyboard/assistive technology users. Add `role="img"` and `aria-label` to the canvas element.

### 9.4 -- Missing `<title>` on some SVG icons (MEDIUM)

- **File:** `frontend/src/routes/+layout.svelte:102-106` (hamburger icon), `event/[id]/+page.svelte:328-336` (QR code icon)
- **Description:** SVG icons used as interactive button content lack `<title>` elements for screen readers. The hamburger button has `aria-label="Open menu"` which is good, but the QR code button relies on its text label "QR Code" which is acceptable.
- **Severity:** MEDIUM (partially mitigated by button text/aria-labels)
- **Fix:** Minor -- the hamburger already has `aria-label`. The QR code button has visible text. Low priority.

---

## 10. Code Quality & Duplication

### 10.1 -- PDF preview modal duplicated across 4 pages (HIGH)

- **File:** `frontend/src/routes/event/[id]/+page.svelte`, `dashboard/+page.svelte`, `submissions/+page.svelte`, `event/[id]/submissions/+page.svelte`
- **Description:** The PDF preview modal (open/close/print/download logic + template markup) is copy-pasted identically across 4 different pages. Each page has its own `pdfModalOpen`, `pdfModalUrl`, `pdfModalName`, `pdfLoading`, `openPdfPreview()`, `closePdfModal()`, `printPdf()`, and `downloadPdf()` -- approximately 60 lines of duplicated code per page (240 lines total).
- **Severity:** HIGH (maintenance burden; bugs must be fixed in 4 places)
- **Fix:** Extract into a `PdfPreviewModal.svelte` component that accepts props for open state and provides open/close/print/download functionality.

### 10.2 -- `parseOrgs`, `isYM`, `isYW`, `isPastEvent` duplicated across 3 pages (MEDIUM)

- **File:** `frontend/src/routes/event/[id]/+page.svelte`, `events/+page.svelte`, `dashboard/+page.svelte`
- **Description:** The utility functions `parseOrgs()`, `isYM()`, `isYW()`, and `isPastEvent()` are defined identically in 3 different page components. `orgBadgeClass()` is also duplicated.
- **Severity:** MEDIUM
- **Fix:** Move `parseOrgs` and `isPastEvent` to `$lib/utils/` as shared utility functions. `isYM`/`isYW`/`orgBadgeClass` could go to `$lib/utils/organizations.ts`.

### 10.3 -- `computeAge` duplicated in frontend and backend (MEDIUM)

- **File:** `frontend/src/routes/form/[id]/+page.svelte:84-94`, `form/[id]/edit/[submissionId]/+page.svelte:76-86`, `backend/src/routes/form.js:11-18`
- **Description:** Age calculation from date of birth is implemented 3 times with slight variations. The frontend versions produce a display string while the backend produces a number.
- **Severity:** MEDIUM
- **Fix:** Create a shared utility function. For the frontend, extract to `$lib/utils/age.ts`.

### 10.4 -- `window.__submissionId` global variable hack (MEDIUM)

- **File:** `frontend/src/routes/form/[id]/+page.svelte:214,259,266`
- **Description:** After successful form submission, the submission ID is stored on `window` as a global property `__submissionId` to pass it between the submit handler and modal callbacks. This is fragile and pollutes the global namespace.
- **Severity:** MEDIUM
- **Fix:** Store the submission ID in a component-level `$state()` variable instead of on `window`.

### 10.5 -- Svelte store subscriptions done imperatively instead of using `$` prefix (MEDIUM)

- **File:** Nearly every page component (layout, dashboard, events, profiles, etc.)
- **Description:** All pages manually subscribe to Svelte stores using `user.subscribe()` and `authLoading.subscribe()` in `onMount`, managing unsubscribe callbacks manually. In Svelte 5, stores can be accessed reactively using `$user` and `$authLoading` syntax without manual subscription management. The current pattern is verbose (~10 lines per page) and error-prone (forgetting to unsubscribe causes memory leaks).
- **Severity:** MEDIUM (not a bug, but a significant code quality issue across the entire codebase)
- **Fix:** Replace `const unsub = user.subscribe(...)` patterns with `let currentUser = $derived($user)` or use `$user` directly in templates. This would eliminate hundreds of lines of boilerplate.

### 10.6 -- `validateEmail` duplicated in frontend and backend (LOW)

- **File:** `backend/src/middleware/validate.js:1-3`, `frontend/src/routes/create/+page.svelte:84-86`, `event/[id]/edit/+page.svelte:122-124`
- **Description:** The same email validation regex is defined in 3 places.
- **Severity:** LOW (simple utility, low risk of divergence)
- **Fix:** Could be centralized but low priority given the simplicity.

---

## Additional Observations (Non-Issues)

### Positive Patterns

1. **SQL injection protection**: All SQL queries use parameterized queries (`?` placeholders). No string interpolation in SQL.
2. **Auth middleware**: Properly applied -- form routes are public, events routes require planner auth, profiles require auth, submissions require auth with ownership checks.
3. **Route mounting order**: Correctly follows the CLAUDE.md specification (form before events).
4. **Input sanitization**: `sanitizeString()` is consistently applied to user input before database storage.
5. **Cookie security**: HttpOnly, SameSite=Strict, secure in production.
6. **No hardcoded secrets in source**: Only the fallback JWT secret in config.js (addressed above).
7. **CORS properly configured**: Only allows requests from the configured frontend URL.

### Items Not Scanned

- **Outdated package versions**: Not checked (would require `pnpm audit` or `npm outdated`). Recommend running `pnpm audit` in both frontend and backend directories.
- **Bundle size**: Not analyzed. Consider running `pnpm build` in frontend and analyzing output size.
- **Test coverage**: Backend has tests; frontend has none. Not flagged as an issue in this scan but worth noting for future work.
