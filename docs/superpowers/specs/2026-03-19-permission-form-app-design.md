# Permission & Medical Release Form App — Design Spec

## Overview

A mobile-friendly web app that digitizes the LDS Church "Parental or Guardian Permission and Medical Release Form." Event planners create pre-filled form instances with event details, generating unique URLs that parents use to complete the remaining fields, sign, and submit. Completed forms are stored as immutable records with generated PDFs matching the official church form layout.

## Architecture

### Stack

- **Frontend:** SvelteKit + shadcn-svelte
- **Backend:** Node.js / Express
- **Database:** SQLite (file-based, no separate container)
- **PDF Generation:** Puppeteer (HTML template rendered to PDF)
- **Email:** Nodemailer (Gmail SMTP default, Resend-ready abstraction)
- **SMS:** Carrier email gateways via Nodemailer
- **Auth:** JWT via HttpOnly cookies (bcrypt password hashing)
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

## User Roles & Authentication

### Roles

| | Event Planner | Parent |
|---|---|---|
| Account required? | Yes | Optional |
| Can create events? | Yes | No |
| Can fill out forms? | Yes | Yes |
| Can save child profiles? | Yes | Yes |

### Auth Flow

- JWT stored in HttpOnly, Secure cookies
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
| event_dates | TEXT | Date(s) of event |
| event_description | TEXT | Description of event and activities |
| ward | TEXT | Ward name |
| stake | TEXT | Stake name |
| leader_name | TEXT | Event/activity leader |
| leader_phone | TEXT | Leader's phone number |
| leader_email | TEXT | Leader's email |
| notify_email | TEXT (nullable) | Where to send completed form notifications |
| notify_phone | TEXT (nullable) | Phone number for SMS delivery |
| notify_carrier | TEXT (nullable) | Carrier for SMS gateway |
| created_at | DATETIME | When the event was created |

### `child_profiles`

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | Primary key |
| user_id | TEXT (FK) | Owner of the profile |
| participant_name | TEXT | Child's name |
| participant_dob | TEXT | Date of birth |
| participant_age | INTEGER | Age |
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
| participant_name | TEXT | Participant's full name |
| participant_dob | TEXT | Date of birth |
| participant_age | INTEGER | Age |
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
| participant_signature_date | TEXT | Date signed |
| guardian_signature | TEXT (nullable) | Guardian signature |
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
| DELETE | `/api/events/:id` | Delete event |
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
| GET | `/api/submissions/:id/pdf` | Download PDF |

### Health

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | Health check for Docker |

## Frontend Pages

| Route | Description | Auth |
|-------|-------------|------|
| `/` | Landing page — login/register or quick links | Public |
| `/login` | Login form | Public |
| `/register` | Register form (choose planner or parent role) | Public |
| `/dashboard` | Planner: events + submission counts. Parent: child profiles + past submissions | Required |
| `/create` | Event creation form — Event Details + delivery settings | Planner only |
| `/event/:id` | Event dashboard — details, shareable URL, submissions list with PDF actions | Planner only |
| `/form/:id` | Parent-facing form — pre-filled event details (read-only), contact/medical/signature | Public |
| `/form/:id/success` | Confirmation page after submission | Public |
| `/profiles` | Manage child profiles (CRUD) | Required |

## Parent Form Flow

1. Parent opens `/form/:id` (shared link)
2. Sees event details at top (read-only, styled like the original form header)
3. If logged in, sees dropdown: "Select a child profile" to pre-fill, or "Fill out manually"
4. If not logged in, sees empty form with subtle prompt: "Have an account? Log in to auto-fill from saved profiles"
5. Fills out contact info, medical info, conditions, accommodations
6. Signs — chooses draw or type-to-sign for participant and guardian signatures
7. Submits
8. If logged in and no profile exists for this child, prompts: "Save this as a profile for next time?"
9. Sees success confirmation page

## Event Dashboard Features

- Event details summary + shareable form URL with copy button
- Submissions table: participant name, emergency contact, date submitted
- Per-submission actions: View PDF, Download PDF, Print
- Bulk actions: Download all PDFs as ZIP, Print all

## Email & SMS Delivery

### Transport Abstraction

Selected by `EMAIL_PROVIDER` env var:
- `gmail` — Nodemailer SMTP (default)
- `resend` — Resend API (future, swap via env var only)

### SMS via Carrier Email Gateways

| Carrier | Gateway |
|---------|---------|
| AT&T | @txt.att.net |
| Verizon | @vtext.com |
| T-Mobile | @tmomail.net |
| Sprint | @messaging.sprintpcs.com |
| US Cellular | @email.uscc.net |
| Cricket | @sms.cricketwireless.net |
| Boost | @smsmyboostmobile.com |
| Metro PCS | @mymetropcs.com |

### Notification Content

- **Email:** PDF attached. Body: "A permission form has been submitted for [participant] for [event]."
- **SMS:** Text only: "[Participant] submitted a permission form for [event]." No attachment.

Both are **optional** — the planner dashboard is the primary way to track and access submissions.

## PDF Generation

- Puppeteer renders an HTML template to PDF
- Template mirrors the official church form layout: logo, section headers, checkbox styling, signature images, "Conduct at Church Activities" second page
- Populated with submitted data
- Stored on disk (`pdf-storage` volume), path saved in `submissions.pdf_path`

## Signature Options

- **Draw:** Touch-screen canvas for finger/stylus drawing
- **Type-to-sign:** Type name, rendered in cursive/script font
- Parent chooses either method
- Guardian signature can be saved to child profile for re-use
- Participant signature is always fresh (not saved to profiles)

## Mobile-First Design

- Single-column layouts
- Large touch targets for checkboxes and buttons
- Signature canvas sized for finger drawing
- Sticky submit button
- shadcn-svelte components for consistent UI

## Environment Variables

```env
# App
NODE_ENV=production
JWT_SECRET=your-secret-here
FRONTEND_URL=http://yourserver:3000

# Email provider
EMAIL_PROVIDER=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=app-password

# Resend (future)
# EMAIL_PROVIDER=resend
# RESEND_API_KEY=re_xxxxx

# Email display
EMAIL_FROM_NAME=Permission Forms
EMAIL_FROM_ADDRESS=your@gmail.com
```
