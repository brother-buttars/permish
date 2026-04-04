---
id: SPEC-001
title: "Permission & Medical Release Form App — Design Spec"
status: complete
created: 2026-03-19
updated: 2026-03-22
tags:
  - feature
  - architecture
---

# Permission & Medical Release Form App — Design Spec

## Overview

A mobile-friendly web app that digitizes the LDS Church "Parental or Guardian Permission and Medical Release Form." Event planners create pre-filled form instances with event details, generating unique URLs that parents use to complete the remaining fields, sign, and submit. Completed forms are stored as immutable records with generated PDFs matching the official church form layout.

## Architecture

### Stack

- **Frontend:** SvelteKit + shadcn-svelte
- **Backend:** Node.js / Express
- **Database:** SQLite (file-based, no separate container)
- **PDF Generation:** pdf-lib (fills actual church PDF form fields)
- **Email:** Nodemailer (Gmail SMTP default, Resend-ready abstraction)
- **SMS:** Carrier email gateways via Nodemailer (see Known Limitations)
- **Auth:** JWT via HttpOnly, SameSite=Strict cookies (bcrypt password hashing)
- **Deployment:** Docker Compose on local server

### Containers (Docker Compose)

| Service | Description |
|---------|-------------|
| `frontend` | SvelteKit app, proxies API calls to backend |
| `backend` | Express API, PDF generation, email/SMS sending |

SQLite runs inside the backend container. No separate DB container.

### Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `db-data` | `/app/data` | SQLite database file |
| `pdf-storage` | `/app/pdfs` | Generated PDF files |

### Ports

| Service | Internal | External |
|---------|----------|----------|
| Frontend | 3000 | 3000 |
| Backend | 3001 | 3001 |

### Backup Strategy

SQLite is a single file. Recommend periodic file copy (e.g., cron job copying the DB file to a backup location). The Docker volume should be backed up regularly since it contains medical records that planners may need for liability purposes.

## Security

### CSRF Protection

- JWT cookies use `SameSite=Strict` and `HttpOnly` flags
- All state-changing requests (POST, PUT, DELETE) are protected by the SameSite cookie policy

### JWT Token Strategy

- Access tokens expire after **24 hours**
- On expiry, users must re-authenticate (no refresh tokens — keeps it simple)
- Logout clears the cookie

### Rate Limiting

Public endpoints are rate-limited using `express-rate-limit`:

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/register` | 5 requests per hour per IP |
| `POST /api/auth/login` | 10 requests per 15 minutes per IP |
| `POST /api/events/:id/submit` | 20 requests per hour per IP |
| `GET /api/events/:id/form` | 60 requests per minute per IP |

### Input Validation

- `participant_dob`: ISO 8601 date format (YYYY-MM-DD)
- `participant_phone`, `emergency_phone_*`: Validated as phone numbers (digits, dashes, parentheses, spaces; 7-15 characters)
- Text fields: Maximum 500 characters (1000 for `event_description`, `activity_limitations`, `other_accommodations`)
- Drawn signatures (base64): Maximum 500KB
- Email fields: Validated as email format
- All inputs sanitized to prevent XSS

## User Roles & Authentication

### Roles

| | Event Planner | Parent |
|---|---|---|
| Account required? | Yes | Optional |
| Can create events? | Yes | No |
| Can fill out forms? | Yes | Yes |
| Can save child profiles? | Yes | Yes |

### Auth Flow

- JWT stored in HttpOnly, Secure, SameSite=Strict cookies
- bcrypt for password hashing
- Planner endpoints require authentication
- Parent form submission is public (no auth required)
- Logged-in parents get profile pre-fill convenience

## Data Model

### `users`

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | Primary key |
| email | TEXT (unique) | Login email |
| password_hash | TEXT | bcrypt hashed password |
| name | TEXT | Display name |
| role | TEXT | "planner" or "parent" |
| created_at | DATETIME | Account creation |

### `events`

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | Primary key, used in form URL |
| created_by | TEXT (FK) | User who created the event |
| event_name | TEXT | Event name |
| event_dates | TEXT | Freeform text — date(s) of event |
| event_description | TEXT | Description of event and activities |
| ward | TEXT | Ward name |
| stake | TEXT | Stake name |
| leader_name | TEXT | Event/activity leader |
| leader_phone | TEXT | Leader's phone number |
| leader_email | TEXT | Leader's email |
| notify_email | TEXT (nullable) | Where to send completed form notifications |
| notify_phone | TEXT (nullable) | Phone number for SMS delivery |
| notify_carrier | TEXT (nullable) | Carrier for SMS gateway |
| is_active | BOOLEAN | Whether the form is accepting submissions (default: true) |
| created_at | DATETIME | When the event was created |

### `child_profiles`

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | Primary key |
| user_id | TEXT (FK) | Owner of the profile |
| participant_name | TEXT | Child's name |
| participant_dob | TEXT | Date of birth (YYYY-MM-DD) |
| participant_phone | TEXT | Phone |
| address | TEXT | Address |
| city | TEXT | City |
| state_province | TEXT | State/province |
| emergency_contact | TEXT | Emergency contact name |
| emergency_phone_primary | TEXT | Primary phone |
| emergency_phone_secondary | TEXT | Secondary phone |
| special_diet | BOOLEAN | Requires special diet? |
| special_diet_details | TEXT (nullable) | Diet restrictions |
| allergies | BOOLEAN | Has allergies? |
| allergies_details | TEXT (nullable) | Allergy list |
| medications | TEXT (nullable) | Prescription/OTC medications |
| can_self_administer_meds | BOOLEAN (nullable) | Can self-administer? |
| chronic_illness | BOOLEAN | Chronic/recurring illness? |
| chronic_illness_details | TEXT (nullable) | Explanation |
| recent_surgery | BOOLEAN | Surgery/illness past year? |
| recent_surgery_details | TEXT (nullable) | Explanation |
| activity_limitations | TEXT (nullable) | Limits, restrictions, disabilities |
| other_accommodations | TEXT (nullable) | Other needs/considerations |
| guardian_signature | TEXT (nullable) | Saved guardian signature (base64 or typed) |
| guardian_signature_type | TEXT (nullable) | "drawn" or "typed" |
| updated_at | DATETIME | Last updated |

### `submissions`

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | Primary key |
| event_id | TEXT (FK) | Links to the event |
| submitted_by | TEXT (FK, nullable) | User who submitted (null for anonymous) |
| participant_name | TEXT | Participant's full name |
| participant_dob | TEXT | Date of birth (YYYY-MM-DD) |
| participant_age | INTEGER | Age at time of submission (snapshot) |
| participant_phone | TEXT | Telephone number |
| address | TEXT | Street address |
| city | TEXT | City |
| state_province | TEXT | State or province |
| emergency_contact | TEXT | Emergency contact name |
| emergency_phone_primary | TEXT | Primary phone |
| emergency_phone_secondary | TEXT | Secondary phone |
| special_diet | BOOLEAN | Requires special diet? |
| special_diet_details | TEXT (nullable) | Diet restrictions |
| allergies | BOOLEAN | Has allergies? |
| allergies_details | TEXT (nullable) | Allergy list |
| medications | TEXT (nullable) | Prescription/OTC medications |
| can_self_administer_meds | BOOLEAN (nullable) | Can self-administer? |
| chronic_illness | BOOLEAN | Chronic/recurring illness? |
| chronic_illness_details | TEXT (nullable) | Explanation |
| recent_surgery | BOOLEAN | Surgery/illness past year? |
| recent_surgery_details | TEXT (nullable) | Explanation |
| activity_limitations | TEXT (nullable) | Limits, restrictions, disabilities |
| other_accommodations | TEXT (nullable) | Other needs/considerations |
| participant_signature | TEXT | Signature data (base64 or typed) |
| participant_signature_type | TEXT | "drawn" or "typed" |
| participant_signature_date | TEXT | Date signed |
| guardian_signature | TEXT (nullable) | Guardian signature |
| guardian_signature_type | TEXT (nullable) | "drawn" or "typed" |
| guardian_signature_date | TEXT (nullable) | Date signed |
| submitted_at | DATETIME | When submitted |
| pdf_path | TEXT | Path to generated PDF |

Submissions are **immutable snapshots**. Profile edits do not retroactively change past submissions.

## API Endpoints

### Auth

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/register` | Public | Register (planner or parent) |
| POST | `/api/auth/login` | Public | Login, sets HttpOnly JWT cookie |
| POST | `/api/auth/logout` | Public | Clears the cookie |
| GET | `/api/auth/me` | Required | Get current user from cookie |

### Events (planner auth required)

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/events` | Create event |
| GET | `/api/events` | List planner's events |
| GET | `/api/events/:id` | Get event details |
| PUT | `/api/events/:id` | Update event details (owner only) |
| DELETE | `/api/events/:id` | Soft-delete event |
| GET | `/api/events/:id/submissions` | List submissions for event |

### Child Profiles (auth required)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/profiles` | List user's child profiles |
| POST | `/api/profiles` | Create child profile |
| PUT | `/api/profiles/:id` | Update profile |
| DELETE | `/api/profiles/:id` | Delete profile |

### Form (public, auth optional)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/events/:id/form` | Get event details for form display |
| POST | `/api/events/:id/submit` | Submit completed form |

### Submissions (auth required)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/submissions/:id/pdf` | Required | Download PDF (planner or submitter) |

### Health

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | Health check for Docker |

## Frontend Pages

| Route | Description | Auth |
|-------|-------------|------|
| `/` | Landing page | Public |
| `/login` | Login form | Public |
| `/register` | Register form | Public |
| `/dashboard` | Role-specific dashboard | Required |
| `/create` | Event creation form | Planner only |
| `/event/:id` | Event dashboard | Planner only |
| `/form/:id` | Parent-facing form | Public |
| `/form/:id/success` | Confirmation page | Public |
| `/profiles` | Manage child profiles | Required |

## Parent Form Flow

1. Parent opens `/form/:id` (shared link)
2. If event is inactive, sees "no longer accepting submissions" message
3. Sees event details at top (read-only)
4. If logged in, sees dropdown to select child profile or fill manually
5. If not logged in, sees empty form with login prompt
6. Fills out contact info, medical info, conditions, accommodations
7. Signs — draw or type-to-sign for participant and guardian
8. Submits
9. If logged in and no profile exists, prompts to save as profile
10. Sees success confirmation page

## Signature Options

- **Draw:** Touch-screen canvas for finger/stylus drawing
- **Type-to-sign:** Type name, rendered in cursive/script font
- Guardian signature can be saved to child profile for re-use
- Participant signature is always fresh (not saved to profiles)

## Email & SMS Delivery

### Transport Abstraction

Selected by `EMAIL_PROVIDER` env var: `gmail` (default) or `resend` (future).

### SMS via Carrier Email Gateways

| Carrier | Gateway |
|---------|---------|
| AT&T | @txt.att.net |
| Verizon | @vtext.com |
| T-Mobile | @tmomail.net |
| US Cellular | @email.uscc.net |
| Cricket | @sms.cricketwireless.net |
| Boost | @smsmyboostmobile.com |
| Metro PCS | @mymetropcs.com |

### Notification Content

- **Email:** PDF attached. Body: "A permission form has been submitted for [participant] for [event]."
- **SMS:** Text only: "[Participant] submitted a permission form for [event]."

Both are optional — the planner dashboard is the primary way to track submissions.

## Environment Variables

```env
NODE_ENV=production
JWT_SECRET=your-secret-here
JWT_EXPIRY=24h
FRONTEND_URL=http://yourserver:3000
EMAIL_PROVIDER=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=app-password
EMAIL_FROM_NAME=Permission Forms
EMAIL_FROM_ADDRESS=your@gmail.com
```
