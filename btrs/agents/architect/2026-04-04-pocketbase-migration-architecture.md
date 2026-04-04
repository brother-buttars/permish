# PocketBase Migration Architecture

**Date:** 2026-04-04
**Author:** Architect Agent
**Status:** Proposal
**Scope:** Full backend migration from Express + SQLite to PocketBase with loose coupling

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Migration Scope Assessment](#2-migration-scope-assessment)
3. [Repository/Adapter Pattern](#3-repositoryadapter-pattern)
4. [Service Layer Architecture](#4-service-layer-architecture)
5. [Auth Abstraction](#5-auth-abstraction)
6. [Frontend API Client Refactor](#6-frontend-api-client-refactor)
7. [Real-Time Abstraction](#7-real-time-abstraction)
8. [Docker Compose Design](#8-docker-compose-design)
9. [Migration Steps](#9-migration-steps)
10. [Risk Assessment](#10-risk-assessment)
11. [Alternative Patterns Comparison](#11-alternative-patterns-comparison)
12. [Offline-First Architecture](#12-offline-first-architecture)
13. [Tauri Desktop Integration](#13-tauri-desktop-integration)
14. [Mobile (Capacitor) Integration](#14-mobile-capacitor-integration)
15. [Cloud Backup (iCloud / Google Drive)](#15-cloud-backup-icloud--google-drive)
16. [Updated Phase Plan](#16-updated-phase-plan)

---

## 1. Executive Summary

### What PocketBase Gives You

PocketBase is a single-binary Go backend that provides:
- SQLite database with a REST/realtime API
- Built-in auth (email/password, OAuth2)
- File storage (local or S3)
- Real-time subscriptions (SSE)
- Admin dashboard
- API rules (row-level security)

### What It Replaces

| Current Component | PocketBase Equivalent |
|---|---|
| Express server (`index.js`) | PocketBase HTTP server |
| better-sqlite3 (`connection.js`) | PocketBase internal SQLite |
| Schema DDL (`schema.js`) | PocketBase collections (admin UI or migration files) |
| JWT auth (`middleware/auth.js`) | PocketBase auth records |
| bcryptjs password hashing | PocketBase internal auth |
| Rate limiting (`rateLimiter.js`) | PocketBase has no built-in rate limiting |
| CORS/helmet middleware | PocketBase CORS config |
| Multer file uploads | PocketBase file fields |

### What It Does NOT Replace

| Current Component | Why PocketBase Cannot Replace It |
|---|---|
| PDF generation (`services/pdf.js`) | Custom business logic using pdf-lib to fill official church PDF template fields |
| Email notifications (`services/email.js`) | PocketBase has email verification but not custom notification emails with PDF attachments |
| SMS notifications (`services/sms.js`) | Carrier gateway SMS via Nodemailer is entirely custom |
| `computeAge()` in `form.js` | Business logic that must run server-side before insert |
| Input sanitization (`sanitizeString`) | Custom XSS prevention logic |
| Super admin bootstrap (`bootstrapSuperAdmin`) | One-time seeding logic |

### Core Recommendation

**Do not use PocketBase SDK directly throughout the frontend.** Instead, introduce a thin adapter layer in the SvelteKit frontend that abstracts the data source. This costs approximately 200-300 lines of adapter code but makes the backend entirely swappable.

The recommended architecture is a **Repository Pattern implemented in the SvelteKit frontend**, with PocketBase as one concrete adapter implementation. PDF generation, email, and SMS move to either PocketBase hooks (Go) or a lightweight sidecar service (Node.js).

---

## 2. Migration Scope Assessment

### 2.1 Database Layer

**Current state:** 6 tables defined in `backend/src/db/schema.js`:
- `users` (11 columns including `guardian_signature` blob)
- `events` (18 columns including `organizations` JSON)
- `event_attachments` (7 columns)
- `child_profiles` (22 columns)
- `submissions` (30 columns including signature blobs)
- `password_reset_tokens` (5 columns)

**PocketBase mapping:**

Each table becomes a PocketBase "collection." Key considerations:

| Table | PocketBase Collection Type | Notes |
|---|---|---|
| `users` | **Auth collection** | PocketBase auth collections have built-in `email`, `password`, `created`, `updated`. Custom fields: `name`, `role`, `phone`, `address`, `city`, `state_province`, `guardian_signature`, `guardian_signature_type` |
| `events` | Base collection | `created_by` becomes a relation field to users. `organizations` stores as JSON field. File attachments become a separate relation. |
| `event_attachments` | Base collection | Could alternatively use PocketBase's native file field on events (multi-file), eliminating this table entirely |
| `child_profiles` | Base collection | `user_id` becomes a relation field to users |
| `submissions` | Base collection | `event_id` and `submitted_by` become relation fields. Signature blobs stored as text or file fields. |
| `password_reset_tokens` | **Eliminated** | PocketBase handles password reset natively |

**Critical field mapping issues:**

1. **Signature blobs:** `guardian_signature` and `participant_signature` store base64 data URLs (up to 700KB). PocketBase text fields have no hard limit but these are large. Better approach: store signatures as PocketBase file fields (upload the PNG/SVG).

2. **Boolean integers:** SQLite stores booleans as `INTEGER DEFAULT 0`. PocketBase has a native `bool` field type. All `special_diet`, `allergies`, `chronic_illness`, `recent_surgery`, `can_self_administer_meds` fields convert to bool.

3. **CHECK constraints:** `role IN ('super', 'planner', 'parent')` and `participant_signature_type IN ('drawn', 'typed', 'hand')` become PocketBase "select" fields with predefined options.

4. **`submitted_at` vs `created`:** PocketBase auto-generates `created` and `updated` timestamps. The `submitted_at` column maps to PocketBase's `created` on the submissions collection.

5. **`is_active` soft delete:** PocketBase has no built-in soft delete. Keep `is_active` as a bool field and filter in API rules.

**Effort: MEDIUM.** Schema translation is straightforward but tedious. The signature blob strategy needs a decision.

### 2.2 Auth Layer

**Current state:** Custom JWT implementation in `middleware/auth.js`:
- `extractUser`: reads JWT from `HttpOnly` cookie, sets `req.user`
- `requireAuth`: 401 if no user
- `requirePlanner`: 403 if user role is not `planner` or `super`
- `requireSuper`: 403 if user role is not `super`
- `setAuthCookie`: signs JWT with `{ id, email, role, name }`, sets HttpOnly cookie

**PocketBase equivalent:**
- PocketBase SDK handles auth tokens internally (stored in `localStorage` or a provided store)
- PocketBase uses its own JWT-like tokens (not exactly JWT, but similar)
- Auth state is managed by `pb.authStore`
- Role-based access is enforced via **API rules** on each collection

**Key differences:**

1. **Cookie-based auth vs token-based auth:** Current app uses `HttpOnly SameSite=Strict` cookies. PocketBase SDK stores the auth token in `localStorage` by default. This is a **security regression** -- `localStorage` is vulnerable to XSS. Mitigation options:
   - Use PocketBase's `AuthStore` with a custom implementation that uses cookies
   - Use a SvelteKit server-side proxy that holds the PocketBase token in an HttpOnly cookie
   - Accept the localStorage approach (simpler but less secure)

2. **Role enforcement:** Currently done in Express middleware. With PocketBase, enforce via API rules:
   ```
   // events collection - list rule
   @request.auth.id != "" && created_by = @request.auth.id
   
   // events collection - create rule  
   @request.auth.id != "" && @request.auth.role = "planner" || @request.auth.role = "super"
   ```

3. **Password reset:** Currently custom (`password_reset_tokens` table, custom email). PocketBase has built-in password reset with customizable email templates. The `password_reset_tokens` table is eliminated entirely.

**Effort: MEDIUM-HIGH.** The cookie-to-localStorage shift is the biggest risk. API rules require careful testing.

### 2.3 API Layer

**Current routes and their PocketBase equivalents:**

| Express Route | Method | PocketBase Equivalent |
|---|---|---|
| `POST /api/auth/register` | Register | `pb.collection('users').create()` |
| `POST /api/auth/login` | Login | `pb.collection('users').authWithPassword()` |
| `POST /api/auth/logout` | Logout | `pb.authStore.clear()` |
| `GET /api/auth/me` | Current user | `pb.authStore.model` |
| `GET /api/auth/profile` | Profile | `pb.collection('users').getOne(id)` |
| `PUT /api/auth/profile` | Update profile | `pb.collection('users').update(id, data)` |
| `POST /api/auth/forgot-password` | Password reset | `pb.collection('users').requestPasswordReset(email)` |
| `POST /api/auth/reset-password` | Reset | `pb.collection('users').confirmPasswordReset(token, pwd, pwd)` |
| `PUT /api/auth/password` | Change password | No direct equivalent -- need custom hook or use update |
| `POST /api/events` | Create event | `pb.collection('events').create(data)` |
| `GET /api/events` | List events | `pb.collection('events').getList(1, 50, { filter })` |
| `GET /api/events/:id` | Get event | `pb.collection('events').getOne(id)` |
| `PUT /api/events/:id` | Update event | `pb.collection('events').update(id, data)` |
| `DELETE /api/events/:id` | Soft delete | `pb.collection('events').update(id, { is_active: false })` |
| `GET /api/events/:id/form` | Public form load | `pb.collection('events').getOne(id)` with public API rule |
| `POST /api/events/:id/submit` | Submit form | **CANNOT be pure PocketBase** -- needs PDF gen + notifications |
| `GET /api/events/:id/submissions` | List submissions | `pb.collection('submissions').getList(...)` with filter |
| `GET /api/events/all-submissions` | All planner subs | `pb.collection('submissions').getList(...)` with expand |
| `GET /api/profiles` | List profiles | `pb.collection('child_profiles').getList(...)` |
| `POST /api/profiles` | Create profile | `pb.collection('child_profiles').create(data)` |
| `PUT /api/profiles/:id` | Update profile | `pb.collection('child_profiles').update(id, data)` |
| `DELETE /api/profiles/:id` | Delete profile | `pb.collection('child_profiles').delete(id)` |
| `GET /api/submissions/mine` | My submissions | `pb.collection('submissions').getList(...)` |
| `GET /api/submissions/:id` | Get submission | `pb.collection('submissions').getOne(id)` |
| `PUT /api/submissions/:id` | Update submission | **Needs custom logic** for PDF regeneration |
| `DELETE /api/submissions/:id` | Delete submission | `pb.collection('submissions').delete(id)` + PDF cleanup |
| `GET /api/submissions/:id/pdf` | Download PDF | Serve from PocketBase file field or sidecar |
| `POST /api/events/:id/attachments` | Upload file | `pb.collection('event_attachments').create(formData)` |
| `DELETE /api/events/:id/attachments/:aid` | Delete file | `pb.collection('event_attachments').delete(id)` |
| `GET /api/events/:id/attachments/:aid` | Download file | PocketBase file URL |
| Admin routes | CRUD users | PocketBase admin API or custom hooks |

**Routes that CANNOT be pure PocketBase calls:**

1. **`POST /api/events/:id/submit`** -- This is the most complex route. It:
   - Validates input
   - Computes age from DOB
   - Inserts submission
   - Generates PDF using pdf-lib with the church template
   - Sends email notification with PDF attachment
   - Sends SMS notification via carrier gateway
   
2. **`PUT /api/submissions/:id`** -- Regenerates PDF after update

3. **`PUT /api/auth/password`** -- Requires verifying current password first

**Effort: MEDIUM.** Most routes map cleanly. The 2-3 complex routes need a sidecar or PocketBase hooks.

### 2.4 Frontend Layer

**Current state:** `frontend/src/lib/api.ts` is a thin REST client with 40+ methods that call Express endpoints. The auth store in `frontend/src/lib/stores/auth.ts` uses the `api` module.

**What changes:**
- Every `apiFetch('/api/...')` call becomes a PocketBase SDK call
- Auth flow changes from cookie-based to token-based
- File URLs change from Express static serving to PocketBase file URLs
- Real-time subscriptions become available (currently not used)

**Effort: MEDIUM.** The `api.ts` file is the primary touchpoint. If we use the adapter pattern (Section 3), only the adapter implementation changes.

### 2.5 Docker Layer

**Current:** 2 containers (backend, frontend) + 3 volumes (db-data, pdf-storage, uploads-storage).

**PocketBase:** Replace `backend` container with PocketBase binary. PocketBase stores its SQLite database and uploaded files in `pb_data/`.

**Effort: LOW.** Docker Compose changes are minimal.

---

## 3. Repository/Adapter Pattern

### 3.1 Architecture Overview

```
+-----------------+     +--------------------+     +------------------+
|                 |     |                    |     |                  |
|  SvelteKit      |---->|  Repository Layer  |---->|  PocketBase      |
|  Pages/         |     |  (interfaces)      |     |  Adapter         |
|  Components     |     |                    |     |  (concrete impl) |
|                 |     +--------------------+     +------------------+
+-----------------+            |
                               |                   +------------------+
                               +------------------>|  Express Adapter |
                                (future swap)      |  (current impl)  |
                                                   +------------------+
```

### 3.2 Interface Definitions

Create `frontend/src/lib/data/types.ts` defining the domain types (these never change regardless of backend):

```typescript
// frontend/src/lib/data/types.ts

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'super' | 'planner' | 'parent';
  phone?: string;
  address?: string;
  city?: string;
  state_province?: string;
  guardian_signature?: string;
  guardian_signature_type?: 'drawn' | 'typed' | 'hand';
}

export interface Event {
  id: string;
  created_by: string;
  event_name: string;
  event_dates: string;
  event_start?: string;
  event_end?: string;
  event_description: string;
  ward: string;
  stake: string;
  leader_name: string;
  leader_phone: string;
  leader_email: string;
  notify_email?: string;
  notify_phone?: string;
  notify_carrier?: string;
  organizations: string; // JSON array
  additional_details?: string;
  is_active: boolean;
  is_past?: boolean;
  created_at: string;
  submission_count?: number;
}

export interface ChildProfile {
  id: string;
  user_id: string;
  participant_name: string;
  participant_dob: string;
  participant_phone?: string;
  address?: string;
  city?: string;
  state_province?: string;
  emergency_contact?: string;
  emergency_phone_primary?: string;
  emergency_phone_secondary?: string;
  special_diet: boolean;
  special_diet_details?: string;
  allergies: boolean;
  allergies_details?: string;
  medications?: string;
  can_self_administer_meds?: boolean;
  chronic_illness: boolean;
  chronic_illness_details?: string;
  recent_surgery: boolean;
  recent_surgery_details?: string;
  activity_limitations?: string;
  other_accommodations?: string;
  youth_program?: string;
}

export interface Submission {
  id: string;
  event_id: string;
  submitted_by?: string;
  participant_name: string;
  participant_dob: string;
  participant_age: number;
  // ... all 30 fields from schema.js
  submitted_at: string;
  pdf_path?: string;
}

export interface Attachment {
  id: string;
  event_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  display_order: number;
}

export interface SystemStats {
  userCount: number;
  eventCount: number;
  activeEventCount: number;
  submissionCount: number;
  profileCount: number;
}
```

### 3.3 Repository Interfaces

Create `frontend/src/lib/data/repository.ts`:

```typescript
// frontend/src/lib/data/repository.ts

import type {
  User, Event, ChildProfile, Submission, Attachment, SystemStats
} from './types';

export interface AuthRepository {
  register(email: string, password: string, name: string, role: string): Promise<User>;
  login(email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
  getProfile(): Promise<User>;
  updateProfile(data: Partial<User>): Promise<User>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  isAuthenticated(): boolean;
  onAuthChange(callback: (user: User | null) => void): () => void;
}

export interface EventRepository {
  create(data: Omit<Event, 'id' | 'created_by' | 'created_at'>): Promise<{ event: Event; formUrl: string }>;
  list(options?: { all?: boolean }): Promise<Event[]>;
  getById(id: string): Promise<Event>;
  update(id: string, data: Partial<Event>): Promise<Event>;
  deactivate(id: string): Promise<void>;
  getSubmissions(eventId: string): Promise<Submission[]>;
  getAllSubmissions(): Promise<(Submission & { event_name: string; event_dates: string; organizations: string })[]>;
}

export interface ProfileRepository {
  list(): Promise<ChildProfile[]>;
  create(data: Omit<ChildProfile, 'id' | 'user_id'>): Promise<ChildProfile>;
  update(id: string, data: Partial<ChildProfile>): Promise<ChildProfile>;
  delete(id: string): Promise<void>;
}

export interface SubmissionRepository {
  getFormEvent(eventId: string): Promise<{ event: Event; attachments: Attachment[] }>;
  submit(eventId: string, data: Record<string, unknown>): Promise<Submission>;
  getMine(): Promise<Submission[]>;
  getById(id: string): Promise<Submission>;
  update(id: string, data: Record<string, unknown>): Promise<Submission>;
  delete(id: string): Promise<void>;
  getPdfUrl(submissionId: string): string;
}

export interface AttachmentRepository {
  list(eventId: string): Promise<Attachment[]>;
  upload(eventId: string, file: File): Promise<Attachment>;
  delete(eventId: string, attachmentId: string): Promise<void>;
  getUrl(eventId: string, attachmentId: string): string;
}

export interface AdminRepository {
  getStats(): Promise<SystemStats>;
  listUsers(): Promise<User[]>;
  getUser(id: string): Promise<User>;
  createUser(data: { email: string; password: string; name: string; role: string }): Promise<User>;
  updateRole(id: string, role: string): Promise<User>;
  resetPassword(id: string, newPassword: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
}

// Composite interface for convenience
export interface DataRepository {
  auth: AuthRepository;
  events: EventRepository;
  profiles: ProfileRepository;
  submissions: SubmissionRepository;
  attachments: AttachmentRepository;
  admin: AdminRepository;
}
```

### 3.4 Express Adapter (Current Backend -- Keep Working)

Create `frontend/src/lib/data/adapters/express.ts` that wraps the existing `api.ts` logic:

```typescript
// frontend/src/lib/data/adapters/express.ts

import type { DataRepository, AuthRepository, EventRepository, /* ... */ } from '../repository';
import type { User, Event, ChildProfile } from '../types';

const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';

async function apiFetch(path: string, options: RequestInit = {}) {
  const { headers: customHeaders, ...restOptions } = options;
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...restOptions,
    headers: { 'Content-Type': 'application/json', ...customHeaders },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

class ExpressAuthRepository implements AuthRepository {
  async register(email: string, password: string, name: string, role: string): Promise<User> {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ email, password, name, role })
    });
    return data.user;
  }

  async login(email: string, password: string): Promise<User> {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password })
    });
    return data.user;
  }

  // ... remaining methods follow same pattern as current api.ts
}

// ... ExpressEventRepository, ExpressProfileRepository, etc.

export function createExpressRepository(): DataRepository {
  return {
    auth: new ExpressAuthRepository(),
    events: new ExpressEventRepository(),
    profiles: new ExpressProfileRepository(),
    submissions: new ExpressSubmissionRepository(),
    attachments: new ExpressAttachmentRepository(),
    admin: new ExpressAdminRepository(),
  };
}
```

### 3.5 PocketBase Adapter

Create `frontend/src/lib/data/adapters/pocketbase.ts`:

```typescript
// frontend/src/lib/data/adapters/pocketbase.ts

import PocketBase from 'pocketbase';
import type { DataRepository, AuthRepository, EventRepository } from '../repository';
import type { User, Event } from '../types';

const PB_URL = import.meta.env.PUBLIC_PB_URL || 'http://localhost:8090';
const pb = new PocketBase(PB_URL);

// Map PocketBase record to our domain User type
function mapUser(record: any): User {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    role: record.role,
    phone: record.phone || undefined,
    address: record.address || undefined,
    city: record.city || undefined,
    state_province: record.state_province || undefined,
    guardian_signature: record.guardian_signature || undefined,
    guardian_signature_type: record.guardian_signature_type || undefined,
  };
}

// Map PocketBase record to our domain Event type
function mapEvent(record: any): Event {
  return {
    id: record.id,
    created_by: record.created_by,
    event_name: record.event_name,
    event_dates: record.event_dates,
    event_start: record.event_start || undefined,
    event_end: record.event_end || undefined,
    event_description: record.event_description,
    ward: record.ward,
    stake: record.stake,
    leader_name: record.leader_name,
    leader_phone: record.leader_phone,
    leader_email: record.leader_email,
    notify_email: record.notify_email || undefined,
    notify_phone: record.notify_phone || undefined,
    notify_carrier: record.notify_carrier || undefined,
    organizations: record.organizations || '[]',
    additional_details: record.additional_details || undefined,
    is_active: record.is_active,
    created_at: record.created,
    submission_count: record.expand?.submissions_count || 0,
  };
}

class PocketBaseAuthRepository implements AuthRepository {
  async register(email: string, password: string, name: string, role: string): Promise<User> {
    const record = await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      name,
      role,
    });
    // Auto-login after registration
    await pb.collection('users').authWithPassword(email, password);
    return mapUser(record);
  }

  async login(email: string, password: string): Promise<User> {
    const authData = await pb.collection('users').authWithPassword(email, password);
    return mapUser(authData.record);
  }

  async logout(): Promise<void> {
    pb.authStore.clear();
  }

  async getCurrentUser(): Promise<User | null> {
    if (!pb.authStore.isValid) return null;
    try {
      const record = await pb.collection('users').getOne(pb.authStore.record!.id);
      return mapUser(record);
    } catch {
      pb.authStore.clear();
      return null;
    }
  }

  isAuthenticated(): boolean {
    return pb.authStore.isValid;
  }

  onAuthChange(callback: (user: User | null) => void): () => void {
    return pb.authStore.onChange((token, model) => {
      callback(model ? mapUser(model) : null);
    });
  }

  async getProfile(): Promise<User> {
    const record = await pb.collection('users').getOne(pb.authStore.record!.id);
    return mapUser(record);
  }

  async updateProfile(data: Partial<User>): Promise<User> {
    const record = await pb.collection('users').update(pb.authStore.record!.id, data);
    return mapUser(record);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await pb.collection('users').update(pb.authStore.record!.id, {
      oldPassword: currentPassword,
      password: newPassword,
      passwordConfirm: newPassword,
    });
  }

  async forgotPassword(email: string): Promise<void> {
    await pb.collection('users').requestPasswordReset(email);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await pb.collection('users').confirmPasswordReset(token, newPassword, newPassword);
  }
}

class PocketBaseEventRepository implements EventRepository {
  async create(data: any): Promise<{ event: Event; formUrl: string }> {
    const record = await pb.collection('events').create({
      ...data,
      created_by: pb.authStore.record!.id,
      organizations: JSON.stringify(data.organizations || []),
    });
    const event = mapEvent(record);
    const formUrl = `${window.location.origin}/form/${event.id}`;
    return { event, formUrl };
  }

  async list(options?: { all?: boolean }): Promise<Event[]> {
    const filter = options?.all
      ? `created_by = "${pb.authStore.record!.id}"`
      : `created_by = "${pb.authStore.record!.id}" && is_active = true`;
    const records = await pb.collection('events').getFullList({
      filter,
      sort: '-created',
    });
    return records.map(mapEvent);
  }

  async getById(id: string): Promise<Event> {
    const record = await pb.collection('events').getOne(id);
    return mapEvent(record);
  }

  async update(id: string, data: Partial<Event>): Promise<Event> {
    const record = await pb.collection('events').update(id, data);
    return mapEvent(record);
  }

  async deactivate(id: string): Promise<void> {
    await pb.collection('events').update(id, { is_active: false });
  }

  async getSubmissions(eventId: string): Promise<any[]> {
    const records = await pb.collection('submissions').getFullList({
      filter: `event_id = "${eventId}"`,
      sort: '-created',
    });
    return records;
  }

  async getAllSubmissions(): Promise<any[]> {
    const records = await pb.collection('submissions').getFullList({
      filter: `event_id.created_by = "${pb.authStore.record!.id}"`,
      sort: '-created',
      expand: 'event_id',
    });
    return records.map(r => ({
      ...r,
      event_name: r.expand?.event_id?.event_name,
      event_dates: r.expand?.event_id?.event_dates,
      organizations: r.expand?.event_id?.organizations,
    }));
  }
}

// PocketBaseSubmissionRepository -- the critical one
class PocketBaseSubmissionRepository implements SubmissionRepository {
  async getFormEvent(eventId: string): Promise<{ event: Event; attachments: Attachment[] }> {
    // This uses a public API rule (no auth required)
    const record = await pb.collection('events').getOne(eventId);
    if (!record.is_active) throw new Error('This form is no longer accepting submissions');
    const attachments = await pb.collection('event_attachments').getFullList({
      filter: `event_id = "${eventId}"`,
      sort: 'display_order',
    });
    return { event: mapEvent(record), attachments };
  }

  async submit(eventId: string, data: Record<string, unknown>): Promise<any> {
    // IMPORTANT: This cannot be a pure PocketBase call.
    // It must go through the sidecar service for PDF generation + notifications.
    // See Section 4 for the sidecar architecture.
    const res = await fetch(`${SIDECAR_URL}/api/events/${eventId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': pb.authStore.token ? `Bearer ${pb.authStore.token}` : '',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || res.statusText);
    }
    return res.json();
  }

  // ... remaining methods use pb.collection('submissions')
}

export function createPocketBaseRepository(): DataRepository {
  return {
    auth: new PocketBaseAuthRepository(),
    events: new PocketBaseEventRepository(),
    profiles: new PocketBaseProfileRepository(),
    submissions: new PocketBaseSubmissionRepository(),
    attachments: new PocketBaseAttachmentRepository(),
    admin: new PocketBaseAdminRepository(),
  };
}
```

### 3.6 Repository Provider

Create `frontend/src/lib/data/index.ts`:

```typescript
// frontend/src/lib/data/index.ts

import type { DataRepository } from './repository';

let repo: DataRepository;

export function getRepository(): DataRepository {
  if (!repo) {
    const backend = import.meta.env.PUBLIC_BACKEND || 'express';
    if (backend === 'pocketbase') {
      // Dynamic import to avoid bundling unused adapter
      throw new Error('Call initRepository() first');
    }
  }
  return repo;
}

export async function initRepository(): Promise<DataRepository> {
  const backend = import.meta.env.PUBLIC_BACKEND || 'express';
  if (backend === 'pocketbase') {
    const { createPocketBaseRepository } = await import('./adapters/pocketbase');
    repo = createPocketBaseRepository();
  } else {
    const { createExpressRepository } = await import('./adapters/express');
    repo = createExpressRepository();
  }
  return repo;
}

// Re-export types
export type * from './types';
export type * from './repository';
```

### 3.7 Usage in SvelteKit Pages

Before (current):
```typescript
// frontend/src/routes/dashboard/+page.svelte
import { api } from '$lib/api';
const { events } = await api.listEvents();
```

After:
```typescript
// frontend/src/routes/dashboard/+page.svelte
import { getRepository } from '$lib/data';
const repo = getRepository();
const events = await repo.events.list();
```

The change is mechanical. Every `api.xxx()` call becomes `repo.xxx.yyy()`. The `api.ts` file is eventually deprecated and removed.

---

## 4. Service Layer Architecture

### 4.1 The Problem

Three services contain custom business logic that PocketBase cannot handle:

1. **PDF generation** (`services/pdf.js`): Uses pdf-lib to fill the official church PDF template. This requires Node.js, the template file, and the pdf-lib library. PocketBase is Go -- it cannot run pdf-lib.

2. **Email notifications** (`services/email.js`): Sends emails with PDF attachments on form submission. PocketBase has basic email but not custom notification emails with file attachments.

3. **SMS notifications** (`services/sms.js`): Sends SMS via carrier email gateways using Nodemailer. Entirely custom.

### 4.2 Options

#### Option A: PocketBase Hooks (Go)

PocketBase supports Go hooks that run inside the PocketBase process. You could:
- Rewrite PDF generation in Go (using a Go PDF library like `pdfcpu` or `gofpdf`)
- Rewrite email sending in Go (using `net/smtp` or a Go email library)
- Rewrite SMS in Go

**Pros:** Single binary, no sidecar, lowest operational complexity.
**Cons:** Rewriting pdf-lib logic in Go is significant effort. The church PDF template filling (form fields, signature images, checkbox widget manipulation) is complex. Go PDF libraries are less mature for form-filling. Tight coupling to PocketBase.

**Verdict: NOT recommended.** The PDF form-filling logic in `services/pdf.js` is intricate (dual-widget checkbox handling, signature image embedding at field coordinates, form flattening). Rewriting in Go would be error-prone and hard to maintain.

#### Option B: Node.js Sidecar Service (RECOMMENDED)

Keep a lightweight Node.js service that handles only the business logic PocketBase cannot:

```
+-------------------+     +--------------------+     +-----------------+
|                   |     |                    |     |                 |
|  SvelteKit        |---->|  PocketBase        |     |  Node Sidecar   |
|  Frontend         |     |  (data + auth)     |     |  (PDF + notify) |
|                   |     |                    |     |                 |
+-------------------+     +--------------------+     +-----------------+
         |                         |                        ^
         |                         |  hook: afterCreate     |
         |                         +----------------------->|
         |                                                  |
         +--- submit form ----------------------------------+
```

The sidecar service is a stripped-down version of the current Express backend containing only:
- `services/pdf.js` (unchanged)
- `services/email.js` (unchanged)  
- `services/sms.js` (unchanged)
- A single route: `POST /api/events/:id/submit`
- A single route: `PUT /api/submissions/:id` (for PDF regeneration)
- PocketBase SDK client (to read/write records)

```javascript
// sidecar/src/index.js
const express = require('express');
const PocketBase = require('pocketbase/cjs');
const { generatePdf } = require('./services/pdf');
const { createTransport, sendNotification } = require('./services/email');
const { sendSmsNotification } = require('./services/sms');

const pb = new PocketBase(process.env.PB_URL || 'http://pocketbase:8090');
const app = express();
app.use(express.json({ limit: '2mb' }));

app.post('/api/events/:id/submit', async (req, res) => {
  // 1. Validate auth (optional -- verify PB token from header)
  // 2. Fetch event from PocketBase
  const event = await pb.collection('events').getOne(req.params.id);
  if (!event.is_active) return res.status(410).json({ error: 'Form closed' });

  // 3. Create submission record in PocketBase
  const submission = await pb.collection('submissions').create({
    event_id: req.params.id,
    ...req.body,
    participant_age: computeAge(req.body.participant_dob),
  });

  // 4. Generate PDF (exact same code as current pdf.js)
  try {
    const pdfPath = await generatePdf({ event, submission }, config.pdfDir);
    await pb.collection('submissions').update(submission.id, { pdf_path: pdfPath });
    
    // 5. Send notifications (exact same code)
    if (event.notify_email) { /* ... */ }
    if (event.notify_phone && event.notify_carrier) { /* ... */ }
  } catch (err) {
    console.error('PDF generation failed:', err.message);
  }

  res.status(201).json({ submission });
});
```

**Pros:** Reuses existing Node.js services unchanged. PDF template logic preserved exactly. Easy to test. Clear separation of concerns.
**Cons:** An additional container to manage. One more network hop for form submissions.

**Verdict: RECOMMENDED.** This is the pragmatic choice. The PDF logic is too specialized to rewrite.

#### Option C: PocketBase Hook that calls Node Sidecar

A hybrid: PocketBase's `OnRecordAfterCreateRequest` hook for the submissions collection calls the Node sidecar via HTTP to generate the PDF. The submission is created directly in PocketBase, and the hook triggers async processing.

```go
// pb_hooks/main.go
app.OnRecordAfterCreateRequest("submissions").Add(func(e *core.RecordCreateEvent) error {
    go func() {
        resp, _ := http.Post(
            "http://sidecar:3002/process-submission/" + e.Record.Id,
            "application/json", nil,
        )
        // PDF generation happens in sidecar
    }()
    return nil
})
```

**Pros:** Submission creation is a pure PocketBase operation (benefits from API rules). PDF generation is truly async.
**Cons:** More moving parts. Error handling is harder (what if sidecar is down?). The frontend needs to poll for PDF readiness.

**Verdict: Good alternative if you want submissions to use PocketBase API rules directly.** Slightly more complex than Option B but architecturally cleaner.

### 4.3 Recommendation

**Go with Option B (Node.js Sidecar)** for the initial migration. The form submission route is the only critical path. Everything else goes through PocketBase directly.

After migration stabilizes, you can optionally move to Option C (PocketBase hook triggering sidecar) for a cleaner data flow.

---

## 5. Auth Abstraction

### 5.1 Current Auth Flow

```
Browser -> POST /api/auth/login -> Express validates -> sets HttpOnly cookie -> 200
Browser -> GET /api/events -> Express reads cookie -> jwt.verify -> req.user -> query DB
```

The JWT payload contains `{ id, email, role, name }`. The cookie is `HttpOnly`, `SameSite=Strict`, `Secure` in production.

### 5.2 PocketBase Auth Flow

```
Browser -> pb.collection('users').authWithPassword(email, pwd)
        -> PocketBase returns token + record
        -> pb.authStore saves token to localStorage (default)
Browser -> pb.collection('events').getList(...)
        -> SDK auto-attaches Authorization header
```

### 5.3 Security Concern: localStorage vs HttpOnly Cookies

**This is the single biggest security consideration in the migration.**

Current approach (HttpOnly cookies) is resistant to XSS because JavaScript cannot read the cookie. PocketBase's default `localStorage` approach is vulnerable -- any XSS exploit can steal the auth token.

### 5.4 Recommended Auth Architecture

Use **SvelteKit server-side auth proxy** to maintain HttpOnly cookie security:

```
Browser                    SvelteKit Server            PocketBase
  |                             |                          |
  |-- POST /auth/login -------->|                          |
  |                             |-- authWithPassword ----->|
  |                             |<---- token + record -----|
  |                             |                          |
  |<-- Set-Cookie: HttpOnly ----|  (stores token in        |
  |    (encrypted token)        |   server-side session)   |
  |                             |                          |
  |-- GET /dashboard ---------->|                          |
  |                             |-- reads cookie           |
  |                             |-- pb.authStore.save(tok) |
  |                             |-- pb.collection(...)---->|
  |                             |<---- data ---------------|
  |<---- rendered page ---------|                          |
```

Implementation using SvelteKit hooks:

```typescript
// frontend/src/hooks.server.ts
import PocketBase from 'pocketbase';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Create a PocketBase instance per request
  const pb = new PocketBase(PB_URL);
  
  // Load auth from encrypted cookie
  const cookie = event.cookies.get('pb_auth');
  if (cookie) {
    try {
      const { token, model } = JSON.parse(
        Buffer.from(cookie, 'base64').toString()
      );
      pb.authStore.save(token, model);
    } catch {
      event.cookies.delete('pb_auth', { path: '/' });
    }
  }

  // Make pb available to server load functions and API routes
  event.locals.pb = pb;
  event.locals.user = pb.authStore.isValid ? pb.authStore.record : null;

  const response = await resolve(event);

  // Sync auth state back to cookie
  if (pb.authStore.isValid) {
    const cookieValue = Buffer.from(JSON.stringify({
      token: pb.authStore.token,
      model: pb.authStore.record,
    })).toString('base64');
    
    response.headers.set('set-cookie', 
      `pb_auth=${cookieValue}; Path=/; HttpOnly; SameSite=Strict; ${
        event.url.protocol === 'https:' ? 'Secure; ' : ''
      }Max-Age=86400`
    );
  }

  return response;
};
```

This approach:
- Maintains **HttpOnly cookie** security (no XSS token theft)
- Uses PocketBase SDK server-side for data access
- The frontend never touches PocketBase directly for authenticated requests
- Auth state syncs via encrypted cookie

### 5.5 Auth Repository with Cookie Proxy

The `AuthRepository` for PocketBase would work differently in this model -- login/logout go through SvelteKit API routes that manage the cookie:

```typescript
// frontend/src/routes/api/auth/login/+server.ts
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const { email, password } = await request.json();
  
  try {
    const authData = await locals.pb.collection('users').authWithPassword(email, password);
    
    // Set HttpOnly cookie
    const cookieValue = Buffer.from(JSON.stringify({
      token: locals.pb.authStore.token,
      model: authData.record,
    })).toString('base64');
    
    cookies.set('pb_auth', cookieValue, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      maxAge: 86400,
    });
    
    return new Response(JSON.stringify({ 
      user: mapUser(authData.record) 
    }));
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
  }
};
```

### 5.6 Role-Based Access

Currently enforced by Express middleware (`requirePlanner`, `requireSuper`). With PocketBase:

**Server-side (API rules on collections):**
```
// events collection - create rule
@request.auth.role = "planner" || @request.auth.role = "super"

// events collection - list/view rule  
@request.auth.id = created_by

// submissions collection - view rule
@request.auth.id = submitted_by || @request.auth.id = event_id.created_by

// child_profiles collection - list/view/create/update/delete rule
@request.auth.id = user_id
```

**Client-side (for UI display):**
```typescript
// In SvelteKit layout or guard
const user = locals.user;
if (user?.role !== 'planner' && user?.role !== 'super') {
  throw redirect(303, '/dashboard');
}
```

---

## 6. Frontend API Client Refactor

### 6.1 Migration Path for api.ts

The current `frontend/src/lib/api.ts` has 40+ methods. The migration path:

**Phase 1: Introduce repository interfaces** (Section 3.2-3.3). No functional changes.

**Phase 2: Create Express adapter** that wraps existing `api.ts` methods. All pages switch from `api.xxx()` to `repo.xxx.yyy()`. Verify nothing breaks.

**Phase 3: Create PocketBase adapter** implementing same interfaces. Switch `PUBLIC_BACKEND=pocketbase`. Test thoroughly.

**Phase 4: Remove Express adapter and `api.ts`** once PocketBase is stable.

### 6.2 Specific Refactors by Page

| Page | Current Import | New Import | Change Complexity |
|---|---|---|---|
| `routes/login/+page.svelte` | `api.login()` | `repo.auth.login()` | LOW |
| `routes/register/+page.svelte` | `api.register()` | `repo.auth.register()` | LOW |
| `routes/dashboard/+page.svelte` | `api.listEvents()`, `api.getMySubmissions()` | `repo.events.list()`, `repo.submissions.getMine()` | LOW |
| `routes/create/+page.svelte` | `api.createEvent()` | `repo.events.create()` | LOW |
| `routes/event/[id]/+page.svelte` | `api.getEvent()` | `repo.events.getById()` | LOW |
| `routes/event/[id]/edit/+page.svelte` | `api.updateEvent()` | `repo.events.update()` | LOW |
| `routes/event/[id]/submissions/+page.svelte` | `api.getSubmissions()` | `repo.events.getSubmissions()` | LOW |
| `routes/form/[id]/+page.svelte` | `api.getFormEvent()`, `api.submitForm()` | `repo.submissions.getFormEvent()`, `repo.submissions.submit()` | MEDIUM (largest form) |
| `routes/profiles/+page.svelte` | `api.listProfiles()`, etc. | `repo.profiles.list()`, etc. | LOW |
| `routes/account/+page.svelte` | `api.getUserProfile()`, `api.updateUserProfile()` | `repo.auth.getProfile()`, `repo.auth.updateProfile()` | LOW |

### 6.3 Auth Store Refactor

Current `frontend/src/lib/stores/auth.ts` uses `api` directly. Refactor to use repository:

```typescript
// frontend/src/lib/stores/auth.ts (refactored)
import { writable } from 'svelte/store';
import { getRepository } from '$lib/data';
import type { User } from '$lib/data/types';

export const user = writable<User | null>(null);
export const authLoading = writable(true);

export async function checkAuth() {
  try {
    const repo = getRepository();
    const currentUser = await repo.auth.getCurrentUser();
    user.set(currentUser);
  } catch {
    user.set(null);
  } finally {
    authLoading.set(false);
  }
}

export async function login(email: string, password: string) {
  const repo = getRepository();
  const loggedInUser = await repo.auth.login(email, password);
  user.set(loggedInUser);
  return loggedInUser;
}

export async function register(email: string, password: string, name: string, role: string) {
  const repo = getRepository();
  const newUser = await repo.auth.register(email, password, name, role);
  user.set(newUser);
  return newUser;
}

export async function logout() {
  const repo = getRepository();
  await repo.auth.logout();
  user.set(null);
}
```

---

## 7. Real-Time Abstraction

### 7.1 Current State

The app currently has **no real-time features**. All data is fetched on page load or via user-triggered actions.

### 7.2 PocketBase Real-Time Capabilities

PocketBase provides SSE (Server-Sent Events) subscriptions per collection:

```typescript
pb.collection('submissions').subscribe('*', (e) => {
  console.log(e.action); // 'create', 'update', 'delete'
  console.log(e.record); // the affected record
});
```

### 7.3 Abstraction for Future Use

Add an optional `subscribe` method to repository interfaces:

```typescript
// In repository.ts
export interface EventRepository {
  // ... existing methods
  
  onSubmissionCreated?(eventId: string, callback: (submission: Submission) => void): () => void;
}

export interface SubscriptionManager {
  subscribe(collection: string, filter: string, callback: (event: RealtimeEvent) => void): () => void;
  unsubscribeAll(): void;
}

export interface RealtimeEvent {
  action: 'create' | 'update' | 'delete';
  record: Record<string, unknown>;
}
```

The Express adapter returns a no-op for subscriptions. The PocketBase adapter wires up SSE:

```typescript
// In PocketBase adapter
class PocketBaseSubscriptionManager implements SubscriptionManager {
  private unsubscribers: (() => void)[] = [];

  subscribe(collection: string, filter: string, callback: (event: RealtimeEvent) => void): () => void {
    const unsub = pb.collection(collection).subscribe('*', (e) => {
      callback({ action: e.action, record: e.record });
    });
    this.unsubscribers.push(() => unsub);
    return () => unsub;
  }

  unsubscribeAll(): void {
    this.unsubscribers.forEach(fn => fn());
    this.unsubscribers = [];
  }
}
```

### 7.4 Practical Use Case

Real-time notifications for planners when a form is submitted:

```svelte
<!-- routes/event/[id]/submissions/+page.svelte -->
<script>
  import { getRepository } from '$lib/data';
  import { onDestroy } from 'svelte';
  
  const repo = getRepository();
  let submissions = $state([]);
  
  // Load initial data
  submissions = await repo.events.getSubmissions(eventId);
  
  // Subscribe to new submissions (no-op if Express adapter)
  const unsub = repo.events.onSubmissionCreated?.(eventId, (newSub) => {
    submissions = [newSub, ...submissions];
  });
  
  onDestroy(() => unsub?.());
</script>
```

---

## 8. Docker Compose Design

### 8.1 Current Docker Compose

```yaml
services:
  backend:    # Express + better-sqlite3
    build: ./backend
    ports: ["3001:3001"]
    volumes: [db-data, pdf-storage, uploads-storage]
  frontend:   # SvelteKit
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]
```

### 8.2 Proposed Docker Compose

```yaml
services:
  pocketbase:
    image: ghcr.io/muchobien/pocketbase:latest
    # OR build from custom Dockerfile if using Go hooks
    ports:
      - "8090:8090"
    volumes:
      - pb-data:/pb/pb_data
      - ./pb_migrations:/pb/pb_migrations
    command: serve --http=0.0.0.0:8090
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8090/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  sidecar:
    build: ./sidecar
    ports:
      - "3002:3002"
    volumes:
      - pdf-storage:/app/pdfs
    depends_on:
      pocketbase:
        condition: service_healthy
    environment:
      - PB_URL=http://pocketbase:8090
      - PB_ADMIN_EMAIL=${PB_ADMIN_EMAIL}
      - PB_ADMIN_PASSWORD=${PB_ADMIN_PASSWORD}
      - PDF_DIR=/app/pdfs
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
      - EMAIL_FROM_NAME=${EMAIL_FROM_NAME}
      - EMAIL_FROM_ADDRESS=${EMAIL_FROM_ADDRESS}

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      pocketbase:
        condition: service_healthy
    environment:
      - PUBLIC_PB_URL=http://pocketbase:8090
      - PUBLIC_SIDECAR_URL=http://sidecar:3002
      - PUBLIC_BACKEND=pocketbase

volumes:
  pb-data:
  pdf-storage:
```

### 8.3 Key Changes

1. **`backend` container eliminated.** Replaced by `pocketbase` (pre-built image) and `sidecar` (minimal Node.js).
2. **`db-data` and `uploads-storage` volumes eliminated.** PocketBase stores everything in `pb-data`.
3. **`pdf-storage` volume retained** for the sidecar's generated PDFs. Alternatively, PDFs could be uploaded to PocketBase as file fields on the submissions collection.
4. **Migrations** stored in `pb_migrations/` directory, mounted into the PocketBase container.

### 8.4 PDF Storage Decision

Two options for where generated PDFs live:

**Option A: File system (current approach)**
- Sidecar generates PDF, stores on disk at `pdf-storage` volume
- Frontend downloads via sidecar: `GET /api/submissions/:id/pdf`
- Simple, works exactly like current setup

**Option B: PocketBase file field**
- Sidecar generates PDF, uploads to PocketBase via SDK: `pb.collection('submissions').update(id, { pdf_file: fileBlob })`
- Frontend downloads via PocketBase file URL: `pb.files.getUrl(record, 'pdf_file')`
- Eliminates the `pdf-storage` volume
- Better for S3-backed PocketBase deployments

**Recommendation:** Start with Option A for simplicity. Migrate to Option B later if you want single-source file management.

---

## 9. Migration Steps

### Phase 0: Preparation (1-2 days)

1. **Set up PocketBase locally.** Download binary, run `./pocketbase serve`.
2. **Create collections** matching current schema via admin UI (`http://localhost:8090/_/`).
3. **Write data migration script** to export current SQLite data and import into PocketBase collections.
4. **Set up API rules** for each collection (replaces Express middleware auth checks).

### Phase 1: Repository Layer (2-3 days)

5. **Create `frontend/src/lib/data/types.ts`** with domain types.
6. **Create `frontend/src/lib/data/repository.ts`** with interfaces.
7. **Create `frontend/src/lib/data/adapters/express.ts`** wrapping current `api.ts`.
8. **Create `frontend/src/lib/data/index.ts`** with provider.
9. **Refactor all pages** from `api.xxx()` to `repo.xxx.yyy()`.
10. **Refactor `auth.ts` store** to use repository.
11. **Test thoroughly** -- everything should work identically with the Express adapter.

### Phase 2: PocketBase Adapter (3-4 days)

12. **Create `frontend/src/lib/data/adapters/pocketbase.ts`**.
13. **Implement auth flow** with SvelteKit server hooks (HttpOnly cookie proxy).
14. **Implement all repository methods** against PocketBase SDK.
15. **Set `PUBLIC_BACKEND=pocketbase`** and test each page.

### Phase 3: Sidecar Service (2-3 days)

16. **Create `sidecar/` directory** with stripped-down Express server.
17. **Copy `services/pdf.js`, `services/email.js`, `services/sms.js`** unchanged.
18. **Implement form submission route** that creates PocketBase record + generates PDF.
19. **Implement submission update route** that regenerates PDF.
20. **Wire PocketBase adapter's `submit()` method** to call sidecar.

### Phase 4: Docker and Deployment (1-2 days)

21. **Create PocketBase Dockerfile** (or use pre-built image).
22. **Create sidecar Dockerfile**.
23. **Update `docker-compose.yml`** per Section 8.
24. **Create `pb_migrations/`** directory with collection definitions.
25. **Test full Docker Compose stack**.

### Phase 5: Data Migration and Cutover (1 day)

26. **Write migration script** (Node.js) that reads current SQLite, creates PocketBase records.
27. **Handle ID mapping** (PocketBase generates 15-char IDs, current UUIDs are 36-char).
28. **Migrate user passwords** -- this is tricky, see Risk Assessment.
29. **Run migration** on staging.
30. **Smoke test** all features.
31. **Cut over** production.

### Phase 6: Cleanup (1 day)

32. **Remove `backend/` directory** entirely.
33. **Remove Express adapter** from frontend.
34. **Remove `api.ts`**.
35. **Update `CLAUDE.md`** with new architecture.
36. **Update `.env.example`** with PocketBase variables.

**Total estimated effort: 10-16 days** for a single developer.

### Dependency Graph

```
Phase 0 (PocketBase setup)
    |
    v
Phase 1 (Repository layer) -- can be done in parallel with Phase 0
    |
    v
Phase 2 (PocketBase adapter) -- depends on Phase 0 + Phase 1
    |
    v
Phase 3 (Sidecar) -- depends on Phase 0, can partially parallel Phase 2
    |
    v
Phase 4 (Docker) -- depends on Phase 2 + Phase 3
    |
    v
Phase 5 (Data migration) -- depends on Phase 4
    |
    v
Phase 6 (Cleanup) -- depends on Phase 5
```

---

## 10. Risk Assessment

### 10.1 HIGH Risk

#### Password Migration

**Problem:** Current system stores bcrypt hashes (`bcryptjs`, 10 rounds). PocketBase uses bcrypt internally but with its own format. You cannot simply INSERT bcrypt hashes into PocketBase's auth records.

**Mitigation options:**
1. Force all users to reset passwords after migration. Simple but bad UX.
2. Write a PocketBase Go hook that accepts pre-hashed bcrypt passwords during migration import. This requires custom Go code.
3. Run a "shadow auth" period where login attempts try PocketBase first, then fall back to verifying the old bcrypt hash and re-creating the PocketBase record.

**Recommendation:** Option 1 (force reset) for simplicity. The user base is likely small (church ward/stake level). Send a bulk "please reset your password" email before cutover.

#### Auth Token Security Regression

**Problem:** Moving from HttpOnly cookies to PocketBase's default localStorage exposes auth tokens to XSS.

**Mitigation:** Use the SvelteKit server-side cookie proxy described in Section 5.4. This adds complexity but preserves security.

### 10.2 MEDIUM Risk

#### PocketBase SDK API Stability

**Problem:** PocketBase is maintained primarily by one developer (Gani Georgiev). SDK breaking changes have occurred between major versions.

**Mitigation:** Pin PocketBase version. The repository pattern means SDK changes only affect the PocketBase adapter file, not the entire frontend.

#### ID Format Change

**Problem:** Current app uses UUID v4 (36 chars, e.g., `550e8400-e29b-41d4-a716-446655440000`). PocketBase generates 15-char alphanumeric IDs (e.g., `abc123def456ghi`).

**Mitigation options:**
1. Let PocketBase generate new IDs. Update all foreign key references during migration. Frontend URLs change.
2. PocketBase allows setting custom IDs on record creation. During migration, preserve existing UUIDs.

**Recommendation:** Option 2 (preserve UUIDs). PocketBase accepts custom `id` values.

#### Complex Queries

**Problem:** Current backend has JOIN queries with subqueries, e.g., the events list with submission count:
```sql
SELECT e.*, COALESCE(sc.count, 0) AS submission_count
FROM events e
LEFT JOIN (SELECT event_id, COUNT(*) AS count FROM submissions GROUP BY event_id) sc
  ON sc.event_id = e.id
WHERE e.created_by = ?
```

PocketBase's filter syntax is limited. It supports basic filtering and `expand` for relations but not arbitrary JOINs with aggregates.

**Mitigation:** 
1. Use PocketBase's `back-relation` counting: fetch events, then batch-fetch submission counts.
2. Create a PocketBase Go hook that adds a computed `submission_count` view.
3. Accept N+1 queries for the small scale of this app (each ward has maybe 5-20 events).

#### Rate Limiting

**Problem:** Current app has rate limiters (`registerLimiter`, `loginLimiter`, `submitLimiter`, `formLoadLimiter`). PocketBase has no built-in rate limiting.

**Mitigation:** Add rate limiting at the reverse proxy level (nginx, Caddy) or in SvelteKit server routes if using the cookie proxy approach.

### 10.3 LOW Risk

#### File Upload Migration

**Problem:** Current `event_attachments` stores files on disk with multer. PocketBase handles file uploads natively.

**Mitigation:** During migration, upload existing files to PocketBase using the SDK. Straightforward.

#### Soft Delete Pattern

**Problem:** Events use `is_active` for soft delete. PocketBase has no built-in soft delete.

**Mitigation:** Keep `is_active` as a bool field. API rules filter on it. No real risk.

#### Super Admin Bootstrap

**Problem:** `bootstrapSuperAdmin()` creates a default super admin on first run. PocketBase has its own admin accounts (separate from collection auth records).

**Mitigation:** Create PocketBase admin via `./pocketbase admin create`. Create the super user record in the users collection separately. Different concern.

---

## 11. Alternative Patterns Comparison

### 11.1 Repository Pattern (RECOMMENDED)

```
Frontend --> Repository Interface --> PocketBase Adapter
                                  --> Express Adapter (fallback)
```

**How it works:** TypeScript interfaces define the data contract. Concrete adapters implement the interfaces for each backend. A factory function selects the adapter at startup.

**Pros:**
- Backend is swappable via environment variable
- Domain types are backend-agnostic
- Each adapter is independently testable
- Minimal abstraction overhead (~300 lines of interface code)
- Pages never import PocketBase SDK directly
- Works with both client-side and server-side rendering

**Cons:**
- Two adapters to maintain during transition period
- Slight indirection cost (one more function call per operation)
- New features must be added to interface + all adapters

**Best for:** This project. Small-to-medium app where the team wants backend flexibility without over-engineering.

### 11.2 API Gateway / BFF (Backend for Frontend)

```
Frontend --> SvelteKit API Routes --> PocketBase
                                 --> Sidecar
```

**How it works:** SvelteKit server routes act as a proxy layer. The frontend calls SvelteKit API routes (e.g., `/api/events`), which internally call PocketBase or the sidecar. The frontend never talks to PocketBase directly.

**Pros:**
- Complete control over the API surface -- frontend sees the same REST API regardless of backend
- HttpOnly cookie auth is natural (SvelteKit handles cookies)
- Can add validation, rate limiting, logging at the BFF layer
- Frontend code changes are minimal (same API shape)
- Can aggregate multiple PocketBase calls into one BFF endpoint

**Cons:**
- More server-side code to write and maintain (30+ SvelteKit API routes)
- Every PocketBase query goes through an extra hop
- Duplicates logic that PocketBase already handles (filtering, pagination)
- SvelteKit API routes are tied to SvelteKit -- if you switch frontend frameworks, you lose the BFF

**Best for:** Teams that want to keep the frontend API contract identical to today's Express API. Useful if you might switch from PocketBase to Supabase/Firebase later and don't want the frontend to know.

### 11.3 Direct PocketBase SDK Usage (No Abstraction)

```
Frontend --> PocketBase JS SDK (direct)
         --> Sidecar (for PDF/email)
```

**How it works:** Every SvelteKit page imports `PocketBase` directly and calls the SDK. No interfaces, no adapters.

**Pros:**
- Fastest to implement
- No abstraction overhead
- Full access to PocketBase features (real-time, auto-pagination, file URLs)
- Least amount of code

**Cons:**
- **Tight coupling to PocketBase** -- every page, component, and store imports the PocketBase SDK
- Switching backends later means rewriting every page
- PocketBase SDK version changes affect the entire codebase
- Cannot unit test pages without mocking the PocketBase SDK
- Auth token in localStorage (unless you also do the cookie proxy, which partially negates the "no abstraction" benefit)

**Best for:** If you are fully committed to PocketBase long-term and never plan to switch. Not recommended given the explicit requirement for loose coupling.

### 11.4 Comparison Matrix

| Criterion | Repository Pattern | BFF (SvelteKit API Routes) | Direct PocketBase SDK |
|---|---|---|---|
| **Loose coupling** | HIGH | HIGH | LOW |
| **Implementation effort** | MEDIUM (10-16 days) | HIGH (14-20 days) | LOW (5-8 days) |
| **Ongoing maintenance** | MEDIUM | HIGH | LOW |
| **Backend swappability** | YES (env var) | YES (rewrite BFF routes) | NO (rewrite everything) |
| **Performance** | Good (1 hop) | Fair (2 hops) | Best (direct) |
| **Auth security** | Needs cookie proxy | Natural (server handles auth) | Needs cookie proxy |
| **Real-time support** | Good (via interface) | Fair (BFF must proxy SSE) | Best (native) |
| **Testing** | Easy (mock interfaces) | Easy (mock fetch) | Hard (mock SDK) |
| **Framework lock-in** | None (interfaces are JS) | SvelteKit | PocketBase SDK |

### 11.5 Final Recommendation

**Use the Repository Pattern (11.1)** with the SvelteKit server-side cookie proxy from Section 5.4 for auth. This gives you:

1. Loose coupling (backend swappable via `PUBLIC_BACKEND` env var)
2. HttpOnly cookie security (no localStorage tokens)
3. Clean domain types (frontend code speaks in `User`, `Event`, `Submission`, not PocketBase records)
4. Minimal overhead (interfaces are thin, adapters are ~150 lines each)
5. Natural migration path (Express adapter works today, PocketBase adapter drops in)

The BFF approach is also viable but adds too much server-side code for the size of this app. Direct SDK usage violates the stated requirement of loose coupling.

---

## Appendix A: PocketBase Collection Definitions

For reference, here are the PocketBase collection definitions matching the current schema. These would be created via the admin UI or as migration files in `pb_migrations/`.

### users (Auth Collection)

| Field | Type | Required | Options |
|---|---|---|---|
| name | text | yes | max: 200 |
| role | select | yes | values: super, planner, parent |
| phone | text | no | max: 20 |
| address | text | no | max: 500 |
| city | text | no | max: 100 |
| state_province | text | no | max: 100 |
| guardian_signature | text | no | max: 800000 |
| guardian_signature_type | select | no | values: drawn, typed, hand |

### events (Base Collection)

| Field | Type | Required | Options |
|---|---|---|---|
| created_by | relation | yes | collection: users, single |
| event_name | text | yes | max: 200 |
| event_dates | text | yes | max: 200 |
| event_start | date | no | |
| event_end | date | no | |
| event_description | text | yes | max: 1000 |
| ward | text | yes | max: 200 |
| stake | text | yes | max: 200 |
| leader_name | text | yes | max: 200 |
| leader_phone | text | yes | max: 20 |
| leader_email | email | yes | |
| notify_email | email | no | |
| notify_phone | text | no | max: 20 |
| notify_carrier | select | no | values: att, verizon, tmobile, uscellular, cricket, boost, metropcs |
| organizations | json | no | |
| additional_details | text | no | max: 5000 |
| is_active | bool | no | default: true |

### event_attachments (Base Collection)

| Field | Type | Required | Options |
|---|---|---|---|
| event_id | relation | yes | collection: events, single |
| file | file | yes | maxSize: 10MB, mimeTypes: pdf,jpg,png,gif,webp,doc,docx,xls,xlsx,txt |
| original_name | text | yes | max: 500 |
| display_order | number | no | default: 0 |

### child_profiles (Base Collection)

| Field | Type | Required | Options |
|---|---|---|---|
| user_id | relation | yes | collection: users, single |
| participant_name | text | yes | max: 200 |
| participant_dob | date | yes | |
| participant_phone | text | no | max: 20 |
| address | text | no | max: 500 |
| city | text | no | max: 100 |
| state_province | text | no | max: 100 |
| emergency_contact | text | no | max: 200 |
| emergency_phone_primary | text | no | max: 20 |
| emergency_phone_secondary | text | no | max: 20 |
| special_diet | bool | no | default: false |
| special_diet_details | text | no | max: 500 |
| allergies | bool | no | default: false |
| allergies_details | text | no | max: 500 |
| medications | text | no | max: 500 |
| can_self_administer_meds | bool | no | |
| chronic_illness | bool | no | default: false |
| chronic_illness_details | text | no | max: 500 |
| recent_surgery | bool | no | default: false |
| recent_surgery_details | text | no | max: 500 |
| activity_limitations | text | no | max: 1000 |
| other_accommodations | text | no | max: 1000 |
| youth_program | text | no | max: 100 |

### submissions (Base Collection)

| Field | Type | Required | Options |
|---|---|---|---|
| event_id | relation | yes | collection: events, single |
| submitted_by | relation | no | collection: users, single |
| participant_name | text | yes | max: 200 |
| participant_dob | date | yes | |
| participant_age | number | yes | |
| participant_phone | text | no | max: 20 |
| address | text | no | max: 500 |
| city | text | no | max: 100 |
| state_province | text | no | max: 100 |
| emergency_contact | text | no | max: 200 |
| emergency_phone_primary | text | no | max: 20 |
| emergency_phone_secondary | text | no | max: 20 |
| special_diet | bool | no | default: false |
| special_diet_details | text | no | max: 500 |
| allergies | bool | no | default: false |
| allergies_details | text | no | max: 500 |
| medications | text | no | max: 500 |
| can_self_administer_meds | bool | no | |
| chronic_illness | bool | no | default: false |
| chronic_illness_details | text | no | max: 500 |
| recent_surgery | bool | no | default: false |
| recent_surgery_details | text | no | max: 500 |
| activity_limitations | text | no | max: 1000 |
| other_accommodations | text | no | max: 1000 |
| participant_signature | text | no | max: 800000 |
| participant_signature_type | select | yes | values: drawn, typed, hand |
| participant_signature_date | date | yes | |
| guardian_signature | text | no | max: 800000 |
| guardian_signature_type | select | no | values: drawn, typed, hand |
| guardian_signature_date | date | no | |
| pdf_path | text | no | max: 500 |

---

## Appendix B: API Rules Quick Reference

PocketBase API rules use a filter syntax. Here are the rules for each collection:

```
// users (auth collection)
List:   @request.auth.id != "" && (@request.auth.role = "super" || id = @request.auth.id)
View:   @request.auth.id != "" && (@request.auth.role = "super" || id = @request.auth.id)
Create: "" (open for registration)
Update: @request.auth.id = id
Delete: @request.auth.role = "super" && id != @request.auth.id

// events
List:   @request.auth.id != "" && created_by = @request.auth.id
View:   @request.auth.id != "" && created_by = @request.auth.id
Create: @request.auth.id != "" && (@request.auth.role = "planner" || @request.auth.role = "super")
Update: @request.auth.id != "" && created_by = @request.auth.id
Delete: @request.auth.id != "" && created_by = @request.auth.id

// events (public form view -- separate view rule or use a custom endpoint)
// NOTE: The /:id/form route serves a subset of fields to unauthenticated users.
// PocketBase does not support field-level visibility per rule.
// Options: (a) Create a "public_events" view collection, or (b) handle in sidecar/BFF.

// child_profiles
List:   @request.auth.id = user_id
View:   @request.auth.id = user_id
Create: @request.auth.id != "" && @request.data.user_id = @request.auth.id
Update: @request.auth.id = user_id
Delete: @request.auth.id = user_id

// submissions
List:   @request.auth.id != "" && (submitted_by = @request.auth.id || event_id.created_by = @request.auth.id)
View:   @request.auth.id != "" && (submitted_by = @request.auth.id || event_id.created_by = @request.auth.id)
Create: ""  (handled by sidecar, not direct PB access)
Update: @request.auth.id != "" && (submitted_by = @request.auth.id || event_id.created_by = @request.auth.id)
Delete: @request.auth.id != "" && event_id.created_by = @request.auth.id

// event_attachments
List:   ""  (public, for form view)
View:   ""  (public, for form view)
Create: @request.auth.id != "" && (@request.auth.role = "planner" || @request.auth.role = "super")
Update: @request.auth.id != "" && event_id.created_by = @request.auth.id
Delete: @request.auth.id != "" && event_id.created_by = @request.auth.id
```

**Important limitation:** The current `GET /api/events/:id/form` route returns only a subset of event fields to unauthenticated users (no `created_by`, no `is_active` in response). PocketBase does not support field-level visibility. Workarounds:
1. Create a PocketBase "view collection" called `public_events` that selects only the public fields.
2. Accept that the full event record is exposed to unauthenticated users (low risk -- event details are not sensitive).
3. Use the BFF/sidecar to proxy this specific endpoint.

Recommendation: Option 2 -- the event fields (name, dates, description, ward, stake, leader contact) are intended to be shared with form fillers anyway.

---

## Summary Decision Matrix

| Decision | Choice | Rationale |
|---|---|---|
| Architecture pattern | Repository Pattern | Loose coupling without over-engineering |
| Business logic services | Node.js Sidecar | Reuses existing pdf-lib/nodemailer code unchanged |
| Auth security | SvelteKit cookie proxy | Preserves HttpOnly cookie security |
| Frontend migration | Phased (Express adapter first) | Zero-downtime, testable at each step |
| Password migration | Force reset | Small user base, simplest approach |
| ID format | Preserve UUIDs | PocketBase supports custom IDs |
| PDF storage | File system initially | Migrate to PocketBase files later |
| Real-time | Abstract behind interface | Ready for PocketBase SSE, no-op for Express |
| Public form data | Expose full event record | Event details are not sensitive |

---

## 12. Offline-First Architecture

The repository pattern established in Section 3 is the key enabler for offline-first. The same `EventRepository`, `SubmissionRepository`, etc. interfaces get a third adapter implementation: a **local SQLite adapter** that reads and writes to an on-device SQLite database. No new abstractions are needed -- the existing interface contract covers all operations.

### 12.1 Local SQLite Adapter

The local adapter implements the same repository interfaces as the Express and PocketBase adapters:

```
frontend/src/lib/data/adapters/
  express.ts        # existing -- talks to Express API
  pocketbase.ts     # Phase 2 -- talks to PocketBase API
  local.ts          # NEW -- reads/writes local SQLite directly
```

**Implementation approach by platform:**

| Platform | SQLite Library | Notes |
|---|---|---|
| Tauri desktop | `@tauri-apps/plugin-sql` (uses rusqlite) | Native Rust SQLite via Tauri plugin, fastest option |
| Capacitor mobile | `@capacitor-community/sqlite` | Native iOS/Android SQLite wrapper |
| Web browser (fallback) | `sql.js` (Wasm) or `wa-sqlite` | SQLite compiled to WebAssembly, works in any browser |

The local adapter wraps the platform-specific SQLite driver behind a thin `LocalDatabase` interface:

```typescript
interface LocalDatabase {
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
```

Each platform provides its own `LocalDatabase` implementation. The local adapter only depends on this interface, not on any specific SQLite library.

**Schema management:** The local database uses the same schema as the PocketBase collections, translated to SQLite DDL. A `local_meta` table tracks the schema version for migrations:

```sql
CREATE TABLE IF NOT EXISTS local_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- schema_version stored here, checked on app startup
```

### 12.2 Sync Queue

When the app is in hybrid mode and offline, mutations are queued for later sync. A `pending_changes` table in the local SQLite database tracks all mutations that have not yet been pushed to the server:

```sql
CREATE TABLE IF NOT EXISTS pending_changes (
  id TEXT PRIMARY KEY,         -- UUID
  collection TEXT NOT NULL,    -- 'events', 'submissions', 'child_profiles', etc.
  record_id TEXT NOT NULL,     -- ID of the affected record
  operation TEXT NOT NULL,     -- 'create', 'update', 'delete'
  payload TEXT NOT NULL,       -- JSON of the full record (for create/update) or empty (for delete)
  created_at TEXT NOT NULL,    -- ISO 8601 timestamp
  synced_at TEXT,              -- NULL until successfully synced
  retry_count INTEGER DEFAULT 0,
  last_error TEXT              -- last sync error message, if any
);
CREATE INDEX idx_pending_unsynced ON pending_changes(synced_at) WHERE synced_at IS NULL;
```

**Sync flow:**

1. User performs a mutation (create event, submit form, update profile).
2. Local adapter writes to local SQLite immediately (user sees instant result).
3. Local adapter inserts a row into `pending_changes`.
4. A `SyncManager` service runs on a timer (every 30 seconds when online) or is triggered manually.
5. `SyncManager` reads unsynced rows ordered by `created_at`, replays them against the PocketBase adapter.
6. On success: sets `synced_at`. On failure: increments `retry_count`, stores `last_error`.
7. After 5 consecutive failures for the same record, the change is flagged for manual resolution (shown in UI).

**Reads are always local.** When online, a background pull syncs server changes to the local database. This is a simple "fetch all records updated since last sync" query using PocketBase's `updated > :lastSync` filter.

### 12.3 Conflict Resolution

**Strategy: Last-write-wins (LWW) by field timestamp.**

This app's data model is well suited to last-write-wins because:

- Events are created and managed by a single planner (no concurrent edits).
- Submissions are created by a single parent per child (no concurrent edits).
- Child profiles belong to a single user.
- The only realistic conflict scenario is a user editing the same record on two devices while both are offline, then syncing. LWW is acceptable here because the user is the same person -- they know which edit is "correct."

**Implementation:** Each record carries an `updated` timestamp (already present in PocketBase). During sync push, if the server record has a newer `updated` timestamp than the pending change's `created_at`, the server version wins and the local change is discarded. The local database is then updated with the server version.

For the rare case where this produces an unexpected result, the app shows a toast: "Your local changes to [record] were overwritten by a newer version from another device." No merge UI is needed.

### 12.4 Operating Modes

The app supports three operating modes, selectable by the user in Settings:

| Mode | Behavior | Use Case |
|---|---|---|
| **Local-only** | All data stays on device. No network calls. PocketBase adapter is never used. | Privacy-focused users, no internet areas, single-device use |
| **Hybrid** | Local SQLite is primary. Syncs to PocketBase when online. | Default for Tauri/mobile. Best of both worlds. |
| **Online** | PocketBase is primary. No local SQLite. Current behavior. | Default for web browser. Simplest model. |

**Mode storage:** Stored in `localStorage` (web) or platform-specific preferences (Tauri: `@tauri-apps/plugin-store`, Capacitor: `@capacitor/preferences`) under the key `permish_data_mode`.

**Mode selection UI:** A radio group in Settings > Data Storage:

```
Data Storage Mode
(*) Online only     -- All data stored on server. Requires internet.
( ) Hybrid          -- Works offline, syncs when connected. [Recommended for desktop/mobile]
( ) Local only      -- Data never leaves this device. No sync.

[i] Switching from local-only to hybrid will upload all local data to the server.
[i] Switching from online to hybrid will download all your data for offline use.
```

**Switching modes triggers a one-time sync:**
- Local-only to hybrid: push all local records to server.
- Online to hybrid: pull all user records to local database.
- Hybrid to local-only: stop sync, keep local data, pending changes remain pending (warn user).
- Hybrid to online: push pending changes first, then drop local database.

### 12.5 Repository Provider Changes

The existing repository provider (`frontend/src/lib/data/index.ts`) gains mode awareness:

```typescript
function createRepository(): Repository {
  const mode = getDataMode(); // reads from storage
  switch (mode) {
    case 'local':
      return new LocalAdapter(getLocalDatabase());
    case 'hybrid':
      return new HybridAdapter(
        new LocalAdapter(getLocalDatabase()),    // reads + writes go here
        new PocketBaseAdapter(getPocketBase()),   // sync target
        new SyncManager(...)
      );
    case 'online':
    default:
      return new PocketBaseAdapter(getPocketBase());
  }
}
```

The `HybridAdapter` delegates reads and writes to the `LocalAdapter`, then queues sync operations. It implements the same repository interface -- no page-level code changes are needed.

---

## 13. Tauri Desktop Integration

### 13.1 Project Setup

Tauri v2 integrates with SvelteKit using `adapter-static` for the frontend build. The desktop app bundles the SvelteKit output as static files served from the Tauri webview.

```
permish-desktop/
  src-tauri/
    Cargo.toml                # Tauri Rust project
    tauri.conf.json           # App config, window settings, sidecar declarations
    capabilities/
      default.json            # Tauri permission capabilities
    icons/                    # App icons for all platforms
    sidecars/
      pocketbase-x86_64-*     # PocketBase binary per platform
      node-sidecar-x86_64-*   # Compiled Node.js sidecar per platform
    src/
      main.rs                 # Tauri entry point, sidecar management
  src/                        # Symlink or copy of frontend/src (shared SvelteKit app)
  static/                     # Symlink or copy of frontend/static
  svelte.config.js            # Uses adapter-static for desktop builds
  package.json
```

**Key configuration in `tauri.conf.json`:**

```json
{
  "build": {
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../build"
  },
  "app": {
    "windows": [
      {
        "title": "Permish",
        "width": 1024,
        "height": 768,
        "minWidth": 375,
        "minHeight": 600
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "msi", "appimage"],
    "icon": ["icons/icon.png"],
    "externalBin": ["sidecars/pocketbase", "sidecars/node-sidecar"]
  }
}
```

### 13.2 PocketBase as Tauri Sidecar

PocketBase runs as a Tauri sidecar process -- a child process managed by the Tauri app lifecycle.

**Startup sequence:**

1. Tauri `main.rs` spawns PocketBase sidecar: `pocketbase serve --http=127.0.0.1:8090 --dir={app_data_dir}/pb_data`
2. Tauri waits for PocketBase to be ready (poll `http://127.0.0.1:8090/api/health` with 100ms interval, 10s timeout).
3. Once healthy, Tauri loads the SvelteKit frontend in the webview.
4. Frontend's PocketBase adapter points to `http://127.0.0.1:8090`.

**Shutdown sequence:**

1. User closes window or quits app.
2. Tauri `on_event` handler catches `CloseRequested` or `ExitRequested`.
3. Sends SIGTERM to PocketBase sidecar process.
4. Waits up to 5 seconds for graceful shutdown.
5. If still running, sends SIGKILL.
6. App exits.

**Data directory:** PocketBase stores its database in the platform-specific app data directory:
- macOS: `~/Library/Application Support/com.permish.app/pb_data/`
- Windows: `%APPDATA%/com.permish.app/pb_data/`
- Linux: `~/.local/share/com.permish.app/pb_data/`

### 13.3 Node.js Sidecar for PDF/Email/SMS

The existing Node.js sidecar service (Section 4.3) is compiled into a standalone binary using `bun build --compile` (preferred for single-binary output) or `pkg` (alternative).

**Build command:**

```bash
cd sidecar/
bun build --compile --target=bun-darwin-x64 ./src/index.js --outfile dist/node-sidecar-x86_64-apple-darwin
bun build --compile --target=bun-windows-x64 ./src/index.js --outfile dist/node-sidecar-x86_64-pc-windows-msvc.exe
bun build --compile --target=bun-linux-x64 ./src/index.js --outfile dist/node-sidecar-x86_64-unknown-linux-gnu
```

**Startup:** Spawned by Tauri immediately after PocketBase is healthy. Listens on `http://127.0.0.1:3001`. Same shutdown sequence as PocketBase.

**Sidecar management in Rust (`main.rs`):**

```rust
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Spawn PocketBase sidecar
            let pb = app.shell().sidecar("pocketbase")?
                .args(["serve", "--http=127.0.0.1:8090", &format!("--dir={}", data_dir)])
                .spawn()?;

            // Wait for PocketBase health check...

            // Spawn Node sidecar
            let node = app.shell().sidecar("node-sidecar")?
                .args(["--port=3001", &format!("--pb-url=http://127.0.0.1:8090")])
                .spawn()?;

            // Store handles for shutdown
            app.manage(SidecarState { pb, node });
            Ok(())
        })
        .on_event(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Gracefully shutdown sidecars
                let state = app.state::<SidecarState>();
                state.pb.kill();
                state.node.kill();
            }
        })
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}
```

### 13.4 App Signing and Packaging

**macOS (.dmg):**
- Requires Apple Developer certificate ($99/year).
- Tauri's built-in `tauri build` handles code signing when `APPLE_SIGNING_IDENTITY` and `APPLE_ID` env vars are set.
- Notarization via `xcrun notarytool` is automated by Tauri.
- Without signing: users must right-click > Open to bypass Gatekeeper.

**Windows (.msi):**
- Tauri uses WiX Toolset for MSI generation.
- Code signing requires an EV or OV certificate.
- Without signing: Windows SmartScreen shows a warning on first run.

**Linux (.AppImage):**
- No signing required. AppImage is self-contained.
- Alternative: `.deb` and `.rpm` packages also supported by Tauri.

**CI/CD:** GitHub Actions workflow builds all three platforms:

```yaml
# .github/workflows/desktop-build.yml
jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 13.5 Desktop-Specific Features

**System tray:**
- App minimizes to system tray on close (configurable in settings).
- Tray icon shows sync status: green (synced), yellow (syncing), red (offline/error).
- Right-click menu: Open, Sync Now, Quit.

**File dialogs:**
- PDF export uses Tauri's `dialog.save` to let users choose save location.
- Currently PDFs are downloaded via browser; desktop can save directly to filesystem.

**Auto-update:**
- Tauri's built-in updater checks for new versions on startup.
- Updates are downloaded and applied with user confirmation.
- Update server: GitHub Releases (Tauri supports this natively).

---

## 14. Mobile (Capacitor) Integration

### 14.1 Project Setup

Capacitor wraps the SvelteKit static build into a native iOS/Android app. The same `adapter-static` output used for Tauri works for Capacitor.

```
permish-mobile/
  capacitor.config.ts         # Capacitor configuration
  ios/                        # Xcode project (auto-generated)
  android/                    # Android Studio project (auto-generated)
  src/                        # Shared SvelteKit source (symlink or monorepo)
  package.json
```

**Capacitor config:**

```typescript
// capacitor.config.ts
const config: CapacitorConfig = {
  appId: 'com.permish.app',
  appName: 'Permish',
  webDir: 'build',
  server: {
    // In production, serves from bundled files (no URL needed)
    // In dev, can point to local SvelteKit dev server
    url: process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : undefined,
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      androidDatabaseLocation: 'default',
    },
  },
};
```

### 14.2 Local Database with @capacitor-community/sqlite

The `@capacitor-community/sqlite` plugin provides native SQLite access on iOS and Android. This is the `LocalDatabase` implementation for mobile (see Section 12.1).

```typescript
// frontend/src/lib/data/drivers/capacitor-sqlite.ts
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const sqlite = new SQLiteConnection(CapacitorSQLite);

export async function getCapacitorDatabase(): Promise<LocalDatabase> {
  const db = await sqlite.createConnection('permish', false, 'no-encryption', 1, false);
  await db.open();

  return {
    async execute(sql, params = []) {
      const result = await db.run(sql, params);
      return { rowsAffected: result.changes?.changes ?? 0 };
    },
    async query(sql, params = []) {
      const result = await db.query(sql, params);
      return result.values ?? [];
    },
    async transaction(fn) {
      await db.beginTransaction();
      try {
        const result = await fn();
        await db.commitTransaction();
        return result;
      } catch (e) {
        await db.rollbackTransaction();
        throw e;
      }
    },
  };
}
```

### 14.3 Offline-First by Default

Mobile apps default to **hybrid mode** (Section 12.4) because:

- Mobile connectivity is unreliable.
- Users expect apps to work without internet.
- Local SQLite on mobile is fast and well-supported.

On first launch, the app:
1. Creates the local SQLite database with full schema.
2. If the user logs in, pulls their data from PocketBase to local storage.
3. All subsequent reads come from local SQLite.
4. Mutations write locally and queue for sync.
5. Sync runs when connectivity is detected (using Capacitor's `Network` plugin).

```typescript
import { Network } from '@capacitor/network';

Network.addListener('networkStatusChange', (status) => {
  if (status.connected) {
    syncManager.syncNow();
  }
});
```

### 14.4 Push Notifications

Push notifications alert event planners when new submissions are received.

**Implementation:**

- **Service:** Firebase Cloud Messaging (FCM) for both iOS and Android.
- **Capacitor plugin:** `@capacitor/push-notifications`.
- **Flow:**
  1. On login, mobile app registers for push notifications, gets a device token.
  2. Device token is stored on the user's PocketBase record (new `push_tokens` JSON field).
  3. When a form is submitted, the Node.js sidecar (or a PocketBase hook) sends a push notification to the event planner's registered tokens via FCM HTTP API.
  4. Notification payload: `{ title: "New Submission", body: "{participant_name} submitted for {event_name}" }`.

**Fallback:** If push notifications are not configured or the user declines permission, email notifications remain the primary channel (already implemented).

### 14.5 Camera Integration for Signature Capture (Optional Enhancement)

An optional enhancement for mobile: allow users to sign on paper and photograph the signature.

- **Plugin:** `@capacitor/camera`.
- **Flow:** User taps "Photo Signature" button, takes a photo, app crops and converts to base64 PNG.
- **Priority:** Low. The existing `SignaturePad` component works well on touchscreens. This is a nice-to-have for users who prefer pen-on-paper signatures.

### 14.6 App Store Distribution

**iOS (App Store):**
- Requires Apple Developer Program ($99/year).
- Build with Xcode: `npx cap sync ios && xcodebuild`.
- Submit via App Store Connect or Transporter.
- Review typically 1-3 days for new apps.

**Android (Google Play):**
- Requires Google Play Developer account ($25 one-time).
- Build with Gradle: `npx cap sync android && cd android && ./gradlew assembleRelease`.
- Submit via Google Play Console.
- Review typically under 24 hours.

**Alternative:** Both platforms support ad-hoc/TestFlight/internal testing distribution for initial rollout.

---

## 15. Cloud Backup (iCloud / Google Drive)

### 15.1 Backup Strategy

Cloud backup provides a safety net for local-only and hybrid users. The approach is simple: copy the SQLite database file to a cloud storage folder. SQLite databases are single files, making file-based backup straightforward.

**What gets backed up:**
- The local SQLite database file (contains all user data: events, submissions, profiles, pending sync queue).
- Does NOT back up PocketBase server data (that has its own backup strategy).
- Does NOT back up the PocketBase binary or sidecar binary (those ship with the app).

**Backup is opt-in.** Users enable it in Settings > Backup.

### 15.2 macOS / iOS: iCloud Drive

**Tauri (macOS):**
- The SQLite database file is copied to the iCloud Drive container: `~/Library/Mobile Documents/iCloud~com~permish~app/Documents/backups/`.
- Tauri can write to this path directly via Rust `std::fs::copy`.
- iCloud Drive handles upload to Apple's servers automatically.
- Requires the `com.apple.developer.icloud-container-identifiers` entitlement in the app's provisioning profile.

**Capacitor (iOS):**
- Uses the same iCloud Drive container.
- Access via `@capacitor/filesystem` plugin writing to the `Documents` directory with iCloud enabled in Xcode capabilities.
- Alternatively, use CloudKit for more structured backup (higher complexity, not needed for file copy).

### 15.3 Android: Google Drive

**Capacitor (Android):**
- Uses Google Drive REST API v3 to upload the SQLite file to the user's Drive.
- Plugin: `@nickvdyck/capacitor-google-drive` or custom implementation using `@codetrix-studio/capacitor-google-auth` + fetch.
- File is stored in the app's hidden `appDataFolder` (not visible to user in Drive UI, only accessible by the app).
- Requires Google Sign-In and `drive.appdata` OAuth scope.

**Flow:**
1. User enables backup in Settings.
2. Google Sign-In prompt (one-time).
3. On each backup trigger, the app:
   a. Calls `PRAGMA wal_checkpoint(TRUNCATE)` to flush the WAL file.
   b. Copies the SQLite file to a temp location.
   c. Uploads the temp file to Google Drive `appDataFolder`.
   d. Deletes the temp file.

### 15.4 Backup Scheduling

| Trigger | Behavior |
|---|---|
| **Manual** | User taps "Backup Now" in Settings. Always available. |
| **On significant change** | After a form submission or event creation, queue a backup (debounced to at most once per hour). |
| **Daily** | If enabled, backup runs once per day when the app is foregrounded. Uses `@capacitor/background-task` or Tauri's timer. |
| **Before mode switch** | Automatically backs up before switching data storage modes (Section 12.4). |

### 15.5 Restore Flow

1. User navigates to Settings > Backup > Restore.
2. App lists available backups from iCloud/Google Drive (filename includes ISO timestamp: `permish-backup-2026-04-04T10-30-00.sqlite`).
3. User selects a backup to restore.
4. App downloads the file, verifies it is a valid SQLite database (`PRAGMA integrity_check`).
5. App warns: "This will replace all local data. Pending unsynced changes will be lost. Continue?"
6. On confirmation: close current database, replace with restored file, reopen.
7. If in hybrid mode: trigger a full sync to reconcile with server.

### 15.6 Encryption at Rest

The backup file contains personal information (names, addresses, medical details, signatures). It must be encrypted before upload.

**Approach:** AES-256-GCM encryption using a key derived from the user's app password (or a randomly generated key stored in the platform keychain).

**Implementation:**

| Platform | Encryption Library | Key Storage |
|---|---|---|
| Tauri (Rust) | `aes-gcm` crate | macOS Keychain via `security-framework` crate |
| Capacitor (iOS) | `CryptoKit` (native) | iOS Keychain via `@capacitor-community/secure-storage` |
| Capacitor (Android) | `javax.crypto` (native) | Android Keystore via `@capacitor-community/secure-storage` |

**Flow:**
1. On first backup enable, generate a random 256-bit key.
2. Store the key in the platform keychain/keystore.
3. Before upload: encrypt SQLite file with AES-256-GCM, producing `permish-backup-{timestamp}.enc`.
4. Upload the `.enc` file.
5. On restore: download `.enc` file, decrypt with key from keychain, then proceed with restore.

**Key loss:** If the keychain entry is lost (device wipe without keychain restore), the backup is unrecoverable. The app warns users about this when enabling backup.

---

## 16. Updated Phase Plan

The original 6-phase plan (Section 9) is expanded to accommodate offline-first, desktop, and mobile capabilities. Phases 0-4a correspond to the original phases. New phases are interleaved based on dependency order.

### Phase 0: PocketBase Setup (1-2 days)

*Unchanged from Section 9.* Download PocketBase, create collections, set up API rules.

### Phase 1: Repository Interfaces + Express Adapter (2-3 days)

*Unchanged from Section 9.* Create domain types, repository interfaces, Express adapter, refactor pages.

### Phase 2: PocketBase Adapter (3-4 days)

*Unchanged from Section 9.* Implement PocketBase adapter, auth flow with SvelteKit hooks.

### Phase 3: Node.js Sidecar (2-3 days)

*Unchanged from Section 9.* Create sidecar service for PDF/email/SMS.

### Phase 4a: Docker Compose (1-2 days)

*Unchanged from Section 9 Phase 4.* PocketBase + sidecar + SvelteKit in Docker Compose.

### Phase 4b: Tauri Desktop Scaffolding (2-3 days)

**Dependencies:** Phase 2 (PocketBase adapter), Phase 3 (sidecar)

1. Initialize Tauri v2 project with SvelteKit (`adapter-static`).
2. Configure PocketBase as Tauri sidecar (binary bundling, health check, lifecycle).
3. Compile Node.js sidecar with `bun build --compile` for each target platform.
4. Configure Node sidecar as second Tauri sidecar.
5. Implement sidecar startup/shutdown in `main.rs`.
6. Test full desktop flow: app starts, sidecars launch, frontend connects, sidecars shut down on quit.
7. Set up CI/CD for cross-platform builds.

**Exit criteria:** Desktop app launches, creates an event, submits a form, generates a PDF -- all running locally.

### Phase 5: Local SQLite Adapter + Offline Mode (3-4 days)

**Dependencies:** Phase 1 (repository interfaces)

1. Define `LocalDatabase` interface and platform-specific drivers (Tauri plugin-sql, Capacitor SQLite, sql.js).
2. Create local SQLite schema matching PocketBase collections.
3. Implement `LocalAdapter` (same repository interface, backed by local SQLite).
4. Implement mode selection UI in Settings.
5. Implement mode storage (localStorage / platform preferences).
6. Update repository provider to select adapter based on mode.
7. Test local-only mode end-to-end: create event, submit form, view submissions -- all without network.

**Exit criteria:** App works fully offline in local-only mode on all target platforms.

### Phase 6: Sync Queue + Hybrid Mode (4-5 days)

**Dependencies:** Phase 2 (PocketBase adapter), Phase 5 (local adapter)

1. Create `pending_changes` table in local SQLite schema.
2. Implement `SyncManager` service (queue writes, replay to PocketBase, handle errors).
3. Implement `HybridAdapter` that delegates to local adapter + queues sync.
4. Implement background pull (fetch server changes since last sync).
5. Implement conflict resolution (last-write-wins).
6. Implement network status detection (Capacitor `Network` plugin, browser `navigator.onLine`).
7. Add sync status indicator to UI (synced/syncing/offline/error).
8. Implement mode switching logic (local-to-hybrid, online-to-hybrid, etc.).
9. Test conflict scenarios: edit same record on two devices offline, sync both, verify LWW.

**Exit criteria:** App works in hybrid mode, syncs reliably, handles conflicts gracefully.

### Phase 7: iCloud / Google Drive Backup (2-3 days)

**Dependencies:** Phase 5 (local SQLite adapter)

1. Implement encryption module (AES-256-GCM with platform keychain key storage).
2. Implement iCloud Drive backup for macOS/iOS (file copy to iCloud container).
3. Implement Google Drive backup for Android (REST API upload to appDataFolder).
4. Implement backup scheduling (manual, on-change debounced, daily).
5. Implement restore flow (list backups, download, decrypt, integrity check, replace).
6. Implement backup settings UI.

**Exit criteria:** User can back up and restore their local database on each platform.

### Phase 8: Mobile with Capacitor (3-5 days)

**Dependencies:** Phase 5 (local adapter), Phase 6 (hybrid mode)

1. Initialize Capacitor project, configure iOS and Android.
2. Integrate `@capacitor-community/sqlite` as `LocalDatabase` driver.
3. Test offline-first flow on iOS simulator and Android emulator.
4. Implement push notifications (FCM registration, token storage, sidecar sends push).
5. Implement network-aware sync (auto-sync on reconnect).
6. Test on physical devices.
7. Prepare App Store and Google Play submissions.

**Exit criteria:** App runs on iOS and Android, works offline, syncs when online, receives push notifications.

### Phase 9: Data Migration + Cleanup (2 days)

*Expanded from Section 9 Phases 5 and 6.*

1. Write migration script to export current SQLite data to PocketBase.
2. Handle ID mapping and password migration (force reset).
3. Run migration on staging, smoke test all features on all platforms.
4. Remove `backend/` directory.
5. Remove Express adapter.
6. Update `CLAUDE.md` with new architecture.
7. Cut over production.

### Updated Dependency Graph

```
Phase 0 (PocketBase setup)
    |
    v
Phase 1 (Repository interfaces + Express adapter)
    |
    +---------------------------+
    |                           |
    v                           v
Phase 2 (PocketBase adapter)   Phase 5 (Local SQLite adapter + offline)
    |                           |
    +---> Phase 3 (Sidecar) <--+
    |         |                 |
    |         v                 |
    |    Phase 4a (Docker)      |
    |         |                 |
    |    Phase 4b (Tauri) <-----+
    |                           |
    +---------------------------+
                |
                v
         Phase 6 (Sync queue + hybrid mode)
                |
         +------+------+
         |             |
         v             v
  Phase 7 (Backup)   Phase 8 (Mobile/Capacitor)
         |             |
         +------+------+
                |
                v
         Phase 9 (Migration + cleanup)
```

### Updated Effort Estimate

| Phase | Effort | Running Total |
|---|---|---|
| Phase 0: PocketBase setup | 1-2 days | 1-2 days |
| Phase 1: Repository + Express adapter | 2-3 days | 3-5 days |
| Phase 2: PocketBase adapter | 3-4 days | 6-9 days |
| Phase 3: Node.js sidecar | 2-3 days | 8-12 days |
| Phase 4a: Docker Compose | 1-2 days | 9-14 days |
| Phase 4b: Tauri desktop | 2-3 days | 11-17 days |
| Phase 5: Local SQLite + offline | 3-4 days | 14-21 days |
| Phase 6: Sync queue + hybrid | 4-5 days | 18-26 days |
| Phase 7: Cloud backup | 2-3 days | 20-29 days |
| Phase 8: Mobile (Capacitor) | 3-5 days | 23-34 days |
| Phase 9: Migration + cleanup | 2 days | 25-36 days |
| **Total** | **25-36 days** | |

This is roughly 5-7 weeks for a single developer. Phases 2 and 5 can run in parallel (reducing wall time by 3-4 days). Phases 7 and 8 can also run in parallel (reducing by another 2-3 days). Realistic wall time: **4-5 weeks**.
