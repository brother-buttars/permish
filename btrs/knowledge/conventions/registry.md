---
title: "Component and utility registry"
created: 2026-03-22
updated: 2026-03-22
tags:
  - conventions
  - registry
---

# Component and utility registry

Existing components, utilities, hooks, and types in this project. Agents MUST check this registry before creating new code to avoid duplication.

## UI components (primitives)

| Component | Path | Type |
|-----------|------|------|
| Button | frontend/src/lib/components/ui/button/ | primitive |
| Input | frontend/src/lib/components/ui/input/ | primitive |
| Label | frontend/src/lib/components/ui/label/ | primitive |
| Textarea | frontend/src/lib/components/ui/textarea/ | primitive |
| Card (+ Header, Title, Description, Content, Footer) | frontend/src/lib/components/ui/card/ | primitive |
| Separator | frontend/src/lib/components/ui/separator/ | primitive |
| Sheet (+ Content, Header, Title, Trigger, Close) | frontend/src/lib/components/ui/sheet/ | primitive |

## Feature components

| Component | Path | Type |
|-----------|------|------|
| ConfirmModal | frontend/src/lib/components/ConfirmModal.svelte | feature |
| SignaturePad | frontend/src/lib/components/SignaturePad.svelte | feature |
| ProfileSelector | frontend/src/lib/components/ProfileSelector.svelte | feature |
| ThemeToggle | frontend/src/lib/components/ThemeToggle.svelte | feature |
| ToastContainer | frontend/src/lib/components/ToastContainer.svelte | feature |

## Utilities

| Function | Path | Description |
|----------|------|-------------|
| cn | frontend/src/lib/utils.ts | Class name merger (clsx + twMerge) |
| computeAge | frontend/src/lib/utils/age.ts | Calculate age from DOB |
| formatDate | frontend/src/lib/utils/formatDate.ts | Format dates for display |
| formatEventDates | frontend/src/lib/utils/formatDate.ts | Format event date ranges |
| validateEmail | frontend/src/lib/utils/validation.ts | Email validation |
| validatePhone | frontend/src/lib/utils/validation.ts | Phone validation |
| validateDate | frontend/src/lib/utils/validation.ts | Date validation |
| carriers | frontend/src/lib/utils/carriers.ts | SMS carrier gateway list |
| orgGroups | frontend/src/lib/utils/organizations.ts | Organization group definitions |
| getOrgDisplayLabels | frontend/src/lib/utils/organizations.ts | Display labels for org selections |
| matchesOrgFilter | frontend/src/lib/utils/organizations.ts | Filter events by organization |
| allOrgKeys | frontend/src/lib/utils/organizations.ts | All organization key values |

## Stores

| Store/Function | Path | Description |
|----------------|------|-------------|
| user | frontend/src/lib/stores/auth.ts | Current user writable store |
| authLoading | frontend/src/lib/stores/auth.ts | Auth loading state |
| checkAuth / login / register / logout | frontend/src/lib/stores/auth.ts | Auth action functions |
| toasts | frontend/src/lib/stores/toast.ts | Toast notification store |
| toast / toastSuccess / toastError | frontend/src/lib/stores/toast.ts | Toast helper functions |
| theme / setTheme | frontend/src/lib/stores/theme.ts | Theme management |

## API client

| Export | Path | Description |
|--------|------|-------------|
| api | frontend/src/lib/api.ts | Fetch wrapper for backend API |

## Backend middleware

| Function | Path | Description |
|----------|------|-------------|
| extractUser | backend/src/middleware/auth.js | Extract JWT user from cookie |
| requireAuth | backend/src/middleware/auth.js | Require authenticated user |
| requirePlanner | backend/src/middleware/auth.js | Require planner role |
| setAuthCookie | backend/src/middleware/auth.js | Set JWT cookie on response |
| validateRegistration | backend/src/middleware/validate.js | Registration input validation |
| validateLogin | backend/src/middleware/validate.js | Login input validation |
| registerLimiter / loginLimiter / submitLimiter / formLoadLimiter | backend/src/middleware/rateLimiter.js | Rate limiters |

## Backend services

| Service | Path | Description |
|---------|------|-------------|
| createTransport / sendNotification | backend/src/services/email.js | Email sending via Nodemailer |
| sms | backend/src/services/sms.js | SMS via carrier email gateways |
| pdf | backend/src/services/pdf.js | PDF generation via pdf-lib |

## Types

| Type/Interface | Path |
|---------------|------|
| App.Locals | frontend/src/app.d.ts |
| OrgGroup | frontend/src/lib/utils/organizations.ts |
| Toast | frontend/src/lib/stores/toast.ts |
| ButtonVariant / ButtonSize / ButtonProps | frontend/src/lib/components/ui/button/index.ts |

## Hooks

None detected.
