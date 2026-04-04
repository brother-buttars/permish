# Test Coverage Review -- 2026-03-29

## 1. Backend API Endpoint Coverage Matrix

| Route File | Endpoint | Method | Has Test? | Test File | Notes |
|---|---|---|---|---|---|
| **auth.js** | `/api/auth/register` | POST | YES | auth.test.js | 4 cases: planner, parent, duplicate, invalid role |
| | `/api/auth/login` | POST | YES | auth.test.js | 2 cases: success, wrong password |
| | `/api/auth/logout` | POST | YES | auth.test.js | 1 case: clears cookie |
| | `/api/auth/me` | GET | YES | auth.test.js | 2 cases: authenticated, unauthenticated |
| | `/api/auth/profile` | GET | **NO** | -- | Untested: get user profile |
| | `/api/auth/profile` | PUT | **NO** | -- | Untested: update user profile |
| **events.js** | `/api/events` | POST | YES | events.test.js | 3 cases: planner, parent (403), unauth (401) |
| | `/api/events` | GET | YES | events.test.js | 1 case: list own events |
| | `/api/events/all-submissions` | GET | **NO** | -- | Untested: cross-event submission listing |
| | `/api/events/:id` | GET | YES | events.test.js | 1 case: get event |
| | `/api/events/:id` | PUT | YES | events.test.js | 1 case: update event |
| | `/api/events/:id` | DELETE | YES | events.test.js | 1 case: soft-delete |
| | `/api/events/:id/submissions` | GET | **NO** | -- | Untested: list submissions for event |
| | `/api/events/:id/attachments` | POST | **NO** | -- | Untested: file upload |
| | `/api/events/:id/attachments` | GET | **NO** | -- | Untested: list attachments |
| | `/api/events/:id/attachments/:aid` | DELETE | **NO** | -- | Untested: delete attachment |
| **form.js** | `/api/events/:id/form` | GET | YES | form.test.js | 2 cases: active, inactive (410) |
| | `/api/events/:id/submit` | POST | YES | form.test.js | 3 cases: anon, authed, inactive |
| | `/api/events/:id/attachments` | GET | **NO** | -- | Untested: public attachment listing |
| | `/api/events/:id/attachments/:aid` | GET | **NO** | -- | Untested: public attachment download |
| **profiles.js** | `/api/profiles` | POST | YES | profiles.test.js | 2 cases: create, requires auth |
| | `/api/profiles` | GET | YES | profiles.test.js | 1 case: list own |
| | `/api/profiles/:id` | PUT | YES | profiles.test.js | 1 case: update |
| | `/api/profiles/:id` | DELETE | YES | profiles.test.js | 1 case: delete |
| **submissions.js** | `/api/submissions/mine` | GET | **NO** | -- | Untested: parent's submissions |
| | `/api/submissions/:id` | GET | **NO** | -- | Untested: get single submission |
| | `/api/submissions/:id/pdf` | GET | **NO** | -- | Untested: download PDF |
| | `/api/submissions/:id` | PUT | **NO** | -- | Untested: update submission |
| | `/api/submissions/:id` | DELETE | **NO** | -- | Untested: delete submission |
| **index.js** | `/api/health` | GET | YES | health.test.js | 1 case: ok status |

**Summary: 19 of 30 endpoints tested (63%). 11 endpoints completely untested.**

---

## 2. Backend Service Function Coverage Matrix

| Service | Function | Has Test? | Test File | Notes |
|---|---|---|---|---|
| **email.js** | `createTransport()` | YES | services/email.test.js | Tests gmail provider |
| | `sendNotification()` | YES | services/email.test.js | Mock transport, verifies options |
| **sms.js** | `getCarrierList()` | **NO** | -- | Untested |
| | `buildSmsEmail()` | **NO** | -- | Untested |
| | `sendSmsNotification()` | **NO** | -- | Untested |
| **pdf.js** | `generatePdf()` | YES | services/pdf.test.js | Tests file generation |
| | `formatDateForPdf()` | **NO** | -- | Not exported but embedded logic |
| | `embedSignatureImage()` | **NO** | -- | Not exported but embedded logic |

**Summary: 3 of 5 exported functions tested (60%). SMS service has zero coverage.**

---

## 3. Backend Middleware Coverage Matrix

| Middleware | Function | Has Test? | Notes |
|---|---|---|---|
| **validate.js** | `validateEmail()` | **NO** (backend) | Tested indirectly via auth routes only |
| | `validatePhone()` | **NO** | Never directly tested |
| | `validateDate()` | **NO** | Never directly tested |
| | `sanitizeString()` | **NO** | Critical XSS-prevention function, zero tests |
| | `validateRegistration` | Indirect | Tested through auth.test.js route tests |
| | `validateLogin` | Indirect | Tested through auth.test.js route tests |
| **auth.js** | `extractUser` | Indirect | Tested through route tests only |
| | `requireAuth` | Indirect | Tested through route tests only |
| | `requirePlanner` | Indirect | Tested through route tests only |
| | `setAuthCookie` | Indirect | Tested through auth.test.js |
| **rateLimiter.js** | `registerLimiter` | **NO** | Skipped in test env, never tested even conditionally |
| | `loginLimiter` | **NO** | Skipped in test env, never tested |

---

## 4. Frontend Utility Test Coverage Matrix

| Utility File | Has Test? | Test File | Notes |
|---|---|---|---|
| `age.ts` | YES | age.test.ts | 6 cases, well-written with fake timers |
| `formatDate.ts` | YES | formatDate.test.ts | 12 cases across two functions, solid |
| `organizations.ts` | YES | organizations.test.ts | 13 cases, thorough |
| `validation.ts` | YES | validation.test.ts | 14 cases, good coverage |
| `linkify.ts` | **NO** | -- | Pure function, trivially testable |
| `youthClass.ts` | **NO** | -- | Pure functions, important business logic |
| `carriers.ts` | **NO** | -- | Static data, low priority |

**Summary: 4 of 7 utility modules tested (57%).**

---

## 5. Database Schema Tests

| Aspect | Tested? | Notes |
|---|---|---|
| Table creation (users, events, child_profiles, submissions) | YES | db.test.js |
| Unique constraint on email | YES | db.test.js |
| `event_attachments` table creation | **NO** | Missing from schema tests |
| Migration (column additions) | **NO** | `migrate()` function never tested |
| Foreign key enforcement | **NO** | No FK tests at all |
| Default values | **NO** | Not verified |

---

## 6. Test Quality Issues

### 6.1 Shared Mutable State via `app.locals.db`

Every test file overrides `app.locals.db` on the shared `app` singleton. Since tests run in the same process, if Jest runs files in parallel, test suites will clobber each other's database. This works today only because Jest defaults to serial execution per file, but it is a known fragility pattern.

**Risk**: Medium. Any switch to parallel test workers would cause failures.

### 6.2 Shallow Assertions on Success Paths

Many "happy path" tests only assert the status code and one or two fields. Examples:

- `events.test.js` GET `/api/events` test only checks the array length is 1. It does not verify that `submission_count` or `is_past` fields are correct -- these are computed server-side and represent business logic.
- `profiles.test.js` PUT test only checks `participant_name` changed. Does not verify other fields were preserved or that `updated_at` was set.
- `form.test.js` POST submit test checks `participant_age` is "defined" but not that it is the correct value.

### 6.3 Missing Negative/Edge Cases

- **Auth**: No test for missing fields (empty email, no password, empty name). The `validateRegistration` middleware handles this but is only tested through the "invalid role" case.
- **Auth**: No test for login with non-existent email.
- **Events**: No test for creating an event with missing required fields (400 path).
- **Events**: No test for GET/PUT/DELETE on a non-existent event ID (404 path).
- **Events**: No test for one planner accessing another planner's event (ownership check).
- **Profiles**: No test for updating/deleting a profile owned by a different user.
- **Form submit**: No test for missing required fields (400 path in form.js line 66-71).
- **Form submit**: No test for oversized signature (400 path at lines 73-76).
- **Form submit**: No test for non-existent event ID (404 path).
- **Form submit**: No test for `participant_signature_type === 'hand'` path.

### 6.4 No Test for PDF Content Correctness

The PDF test (`pdf.test.js`) only verifies a file exists and has non-zero size. It does not verify:
- Form fields were actually filled with correct data
- Signatures were embedded
- Second page was removed
- Form was flattened

### 6.5 Email Test Does Not Verify Resend Provider Path

`createTransport` has two code paths (gmail vs resend). Only gmail is tested.

### 6.6 No Integration Tests for Notification Flow

The form submission triggers email and SMS notifications asynchronously. No test verifies:
- Email is sent when `notify_email` is configured on the event
- SMS is sent when `notify_phone` and `notify_carrier` are configured
- Failures in notification don't break the submission response

### 6.7 Frontend Tests Have No Component Tests

All 4 frontend test files test pure utility functions. There are zero Svelte component tests. Given the app's complexity (SignaturePad, ProfileSelector, form pages), this is a significant gap.

### 6.8 `sanitizeString` Has No Direct Tests

This function is the primary XSS defense. It strips `<` and `>` characters and enforces length limits. There are no tests verifying:
- HTML tags are stripped
- Length truncation works
- Non-string inputs pass through
- Edge cases (empty string, null, undefined)

---

## 7. Priority-Ranked List of What Needs Tests

### P0 -- Critical (Security/Data Integrity)

1. **`sanitizeString()` unit tests** -- This is the XSS defense function. Must test HTML stripping, length limits, and edge cases.
2. **Submissions routes** (`submissions.js`) -- 5 endpoints, zero tests. These handle authorization (planner vs submitter), PDF downloads, submission updates, and deletion. Authorization bugs here expose user data.
3. **Form submission validation** -- Missing field validation (400 paths) and oversized signature rejection are completely untested.

### P1 -- High (Authorization/Business Logic)

4. **Cross-user access tests** -- No test verifies that User A cannot access User B's events, profiles, or submissions. Ownership checks exist in code but are never tested.
5. **`GET /api/auth/profile` and `PUT /api/auth/profile`** -- Account management endpoints with zero tests.
6. **SMS service** (`sms.js`) -- `buildSmsEmail()` and `sendSmsNotification()` have zero tests. `buildSmsEmail` returns null for unknown carriers which could silently fail.
7. **Event attachment endpoints** (3 endpoints) -- File upload, listing, and deletion untested. File upload has security implications (file type filtering, size limits).

### P2 -- Medium (Feature Coverage)

8. **`GET /api/events/:id/submissions`** -- Planner-facing submission listing untested.
9. **`GET /api/events/all-submissions`** -- Cross-event submission listing untested.
10. **`youthClass.ts` frontend utility** -- Important business logic for matching youth to church programs. Pure functions, easy to test.
11. **`linkify.ts` frontend utility** -- Handles URL detection and HTML escaping. XSS-relevant since it produces raw HTML.
12. **PDF content verification** -- Beyond file existence, verify field values in generated PDFs.

### P3 -- Low (Nice to Have)

13. **Frontend component tests** -- SignaturePad, ProfileSelector, form pages. Requires Svelte testing setup.
14. **Event `is_past` computation** -- GET `/api/events` computes `is_past` from event dates; untested.
15. **Database migration tests** -- `migrate()` function adding columns to existing tables.
16. **Rate limiter tests** -- Even though they skip in test env, could test the configuration.

---

## 8. Recommended Test Plan

### Phase 1: Security-Critical (Estimated: 2-3 hours)

- [ ] Add `sanitizeString()` unit tests (HTML stripping, length limits, non-string passthrough)
- [ ] Add `backend/tests/submissions.test.js` covering all 5 endpoints:
  - GET `/mine` -- returns only own submissions
  - GET `/:id` -- planner access, submitter access, unauthorized (403), not found (404)
  - GET `/:id/pdf` -- same auth checks, missing PDF (404)
  - PUT `/:id` -- update with valid data, auth checks
  - DELETE `/:id` -- planner-only, auth check
- [ ] Add form submission edge cases to `form.test.js`:
  - Missing required fields (400)
  - Oversized signature (400)
  - Non-existent event (404)
  - `participant_signature_type === 'hand'` path

### Phase 2: Authorization Hardening (Estimated: 2 hours)

- [ ] Add cross-user access tests to `events.test.js`:
  - Planner A cannot read/update/delete Planner B's events
  - Parent cannot access event management endpoints
- [ ] Add cross-user access tests to `profiles.test.js`:
  - User A cannot update/delete User B's profiles
- [ ] Add auth profile endpoint tests (`GET /api/auth/profile`, `PUT /api/auth/profile`)

### Phase 3: Service Coverage (Estimated: 1-2 hours)

- [ ] Add `backend/tests/services/sms.test.js`:
  - `buildSmsEmail()` with valid carrier, invalid carrier, phone formatting
  - `getCarrierList()` returns correct structure
  - `sendSmsNotification()` with mock transport
- [ ] Add resend provider test to email.test.js
- [ ] Add `createTransport` error handling tests

### Phase 4: Frontend Utilities (Estimated: 1 hour)

- [ ] Add `frontend/src/lib/utils/youthClass.test.ts`:
  - Age boundary cases (11, 12, 13, 14, 15, 16, 17, 18, 19)
  - Both programs (young_men, young_women)
  - Invalid inputs (bad dob, missing program)
  - `profileMatchesEventOrgs()` matching logic
- [ ] Add `frontend/src/lib/utils/linkify.test.ts`:
  - URL detection, HTML escaping, newline conversion
  - XSS edge cases (malicious URLs)

### Phase 5: Attachment & Integration (Estimated: 2-3 hours)

- [ ] Add attachment endpoint tests (requires multipart/file upload testing with supertest)
- [ ] Add integration test for form submit -> PDF generation -> notification flow
- [ ] Add PDF content verification (read back generated PDF and check field values)

---

## 9. Test Infrastructure Notes

**What works well:**
- In-memory SQLite via `createTestDb()` is fast and isolated
- Proper `beforeEach`/`afterEach` lifecycle for DB creation and cleanup
- Test environment skips rate limiters (good for test speed)
- Cookie-based auth is properly threaded through supertest requests
- Frontend tests use `vi.useFakeTimers()` correctly for date-dependent logic

**What needs improvement:**
- Shared `app` singleton with `app.locals.db` override is fragile
- No test for the `migrate()` function that handles schema evolution
- PDF test writes to disk (creates `test-pdfs/` dir) -- could use temp directories
- No CI integration visible (no `.github/workflows/*.yml` for test runs checked)
- Frontend has no `test` script in evidence (need to verify `package.json`)

---

## 10. Flaky Test Risk Assessment

| Risk | Severity | Description |
|---|---|---|
| Shared app singleton | Medium | Parallel test workers would clobber `app.locals.db` |
| PDF filesystem test | Low | Writes to `backend/test-pdfs/`, cleaned up in `afterAll`. Could fail if prior run crashed mid-test |
| Date-dependent age computation | Low | `form.test.js` asserts `participant_age` is "defined" but not a specific value. The computed age changes each year because DOB is hardcoded but `computeAge()` uses `new Date()`. This test will never fail but also never catches bugs. |
| Cookie expiration | Very Low | Cookies set during `beforeEach` could theoretically expire if tests run extremely slowly |

---

**Overall Assessment**: The test suite covers the core happy paths for auth, events, profiles, and form submission, but has significant gaps in authorization testing, negative/edge case coverage, and entire untested modules (submissions routes, SMS service, attachments). The highest-risk gap is the complete absence of tests for the submissions routes, which handle sensitive authorization logic around who can view/edit/delete submissions and download PDFs.
