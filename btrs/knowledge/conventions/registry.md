---
title: "Component and utility registry"
created: 2026-03-22
updated: 2026-04-24
tags:
  - conventions
  - registry
---

# Component and utility registry

Existing components, utilities, hooks, and types in this project. Agents MUST check this registry before creating new code to avoid duplication.

Components are organized by atomic layer (atoms / molecules / organisms / composables). See [[conventions/ui]] for the layering rules. Items marked **PLANNED** do not exist yet and are tracked by the atomic-design refactor.

## Atoms — shadcn primitives (`lib/components/ui/`)

| Component | Path |
|-----------|------|
| Badge | frontend/src/lib/components/ui/badge/ |
| Button | frontend/src/lib/components/ui/button/ |
| Card (+ Header, Title, Description, Content, Footer) | frontend/src/lib/components/ui/card/ |
| Input | frontend/src/lib/components/ui/input/ |
| Label | frontend/src/lib/components/ui/label/ |
| Select | frontend/src/lib/components/ui/select/ |
| Separator | frontend/src/lib/components/ui/separator/ |
| Sheet (+ Content, Header, Title, Trigger, Close) | frontend/src/lib/components/ui/sheet/ |
| Textarea | frontend/src/lib/components/ui/textarea/ |

## Atoms — project-specific (`lib/components/atoms/` and legacy `lib/components/`)

| Component | Path | Notes |
|-----------|------|-------|
| OrgBadge | frontend/src/lib/components/atoms/OrgBadge.svelte | Wraps `orgBadgeClass()` from `utils/organizations.ts` |
| YouthClassBadge | frontend/src/lib/components/atoms/YouthClassBadge.svelte | Wraps `youthClassBadgeClass()` from `utils/youthClass.ts` |
| Spinner | frontend/src/lib/components/Spinner.svelte | sm / md / lg sizes (legacy location) |
| ThemeToggle | frontend/src/lib/components/ThemeToggle.svelte | Dark/light toggle (legacy location) |
| YouthIcon | frontend/src/lib/components/YouthIcon.svelte | Icon for youth programs (legacy location) |
| SyncStatusIndicator | frontend/src/lib/components/SyncStatusIndicator.svelte | Hybrid-mode-only sync dot (legacy location) |
| **NavItem** | _PLANNED_ | Header nav link with active-state logic (currently inlined in AppHeader) |

Imports: `import { OrgBadge, YouthClassBadge } from "$lib/components/atoms";`

## Molecules (`lib/components/molecules/` and legacy `lib/components/`)

| Component | Path | Notes |
|-----------|------|-------|
| PageContainer | frontend/src/lib/components/molecules/PageContainer.svelte | Standard page wrapper (`container mx-auto px-4 py-8`) with `size: sm/md/default/lg/full` |
| PageHeader | frontend/src/lib/components/molecules/PageHeader.svelte | Title + optional subtitle + `titleSuffix` snippet + `actions` snippet |
| SegmentedTabs | frontend/src/lib/components/molecules/SegmentedTabs.svelte | Generic-typed tab strip; `bind:value`, `tabs: { value, label }[]` |
| FilterPanel | frontend/src/lib/components/molecules/FilterPanel.svelte | Card wrapper with optional bound search input + slot for filter UI |
| ListCard | frontend/src/lib/components/molecules/ListCard.svelte | Clickable card row with title, description, `trailing`/`footer` snippets |
| EventStatusBadges | frontend/src/lib/components/molecules/EventStatusBadges.svelte | Active / Inactive / Past badge cluster for an event |
| Modal | frontend/src/lib/components/molecules/Modal.svelte | Generic backdrop + dialog with `size: sm/md/lg/fullscreen`, escape-to-close, `header` and `children` snippets each receive a `close` callback |
| AlertBox | frontend/src/lib/components/AlertBox.svelte | Error / warning / info alert (legacy location) |
| ConfirmModal | frontend/src/lib/components/ConfirmModal.svelte | Confirmation dialog with focus trap (legacy location) |
| EmptyState | frontend/src/lib/components/EmptyState.svelte | Empty list card with `message`, optional `description`, optional action (legacy location) |
| FormField | frontend/src/lib/components/FormField.svelte | Snippet-based label + error wrapper (legacy location) |
| FormProgress | frontend/src/lib/components/FormProgress.svelte | Sticky progress + step indicators (legacy location) |
| InstallPrompt | frontend/src/lib/components/InstallPrompt.svelte | PWA install prompt (legacy location) |
| LoadingState | frontend/src/lib/components/LoadingState.svelte | Full-page loader + message (legacy location) |
| NotificationSettings | frontend/src/lib/components/NotificationSettings.svelte | Email + SMS carrier picker (legacy location) |
| OfflineBanner | frontend/src/lib/components/OfflineBanner.svelte | Top banner for offline mode (legacy location) |
| OrganizationPicker | frontend/src/lib/components/OrganizationPicker.svelte | Hierarchical org checkbox groups (legacy location) |
| PresetPicker | frontend/src/lib/components/PresetPicker.svelte | Toggleable preset pills (legacy location) |
| ProfileSelector | frontend/src/lib/components/ProfileSelector.svelte | Profile dropdown filtered by event orgs (legacy location) |

Imports: `import { PageContainer, PageHeader, SegmentedTabs, FilterPanel, ListCard, EventStatusBadges, Modal } from "$lib/components/molecules";`

## Organisms (`lib/components/organisms/` and legacy `lib/components/`)

| Component | Path | Notes |
|-----------|------|-------|
| AppHeader | frontend/src/lib/components/organisms/AppHeader.svelte | Top nav + mobile sheet (consumed by `routes/+layout.svelte`) |
| SubmissionListView | frontend/src/lib/components/organisms/SubmissionListView.svelte | Mobile cards + desktop table for submissions; configurable columns + actions (consumed by event/[id], submissions) |
| MedicalInfoSection | frontend/src/lib/components/MedicalInfoSection.svelte | Multi-field medical questionnaire (legacy location) |
| PdfModal | frontend/src/lib/components/PdfModal.svelte | PDF viewer modal (legacy location) |
| PdfViewer | frontend/src/lib/components/PdfViewer.svelte | PDF.js renderer (legacy location) |
| SignaturePad | frontend/src/lib/components/SignaturePad.svelte | Canvas signature with drawn/typed/hand modes (legacy location) |
| ToastContainer | frontend/src/lib/components/ToastContainer.svelte | Toast notification host (legacy location) |
| UserMenu | frontend/src/lib/components/UserMenu.svelte | Avatar → popover menu (legacy location) |
| **EventListView** | _PLANNED_ | Event list block (could consolidate dashboard + events; not yet extracted because each callsite has distinct trailing/footer needs) |

Imports: `import { AppHeader, SubmissionListView } from "$lib/components/organisms";`

## Per-route components (`routes/{path}/_components/`)

Components used by exactly one route. Underscore prefix tells SvelteKit to ignore them as routes.

| Component | Path |
|-----------|------|
| EventDetailsCard | frontend/src/routes/event/[id]/_components/EventDetailsCard.svelte |
| EventQrModal | frontend/src/routes/event/[id]/_components/EventQrModal.svelte |
| EventAttachmentPreviewModal | frontend/src/routes/event/[id]/_components/EventAttachmentPreviewModal.svelte |
| DataModeSection | frontend/src/routes/account/_components/DataModeSection.svelte |
| BackupRestoreSection | frontend/src/routes/account/_components/BackupRestoreSection.svelte |
| SyncSection | frontend/src/routes/account/_components/SyncSection.svelte |

## Composables (`lib/components/composables/`)

Each is a `.svelte.ts` module exporting a function that returns runes-backed state. Pages call them at the top of `<script>` and consume reactive getters.

| Composable | Path | Notes |
|------------|------|-------|
| useDeleteConfirm | frontend/src/lib/components/composables/useDeleteConfirm.svelte.ts | Modal lifecycle + `ask(id, name)` + `run(action)` |
| usePdfPreview | frontend/src/lib/components/composables/usePdfPreview.svelte.ts | Wraps `getSubmissionPdfUrl()` with full open/close lifecycle |
| useAttachmentPreview | frontend/src/lib/components/composables/useAttachmentPreview.svelte.ts | Generic blob-fetch + preview lifecycle for event attachments |
| useAuthRequired | frontend/src/lib/components/composables/useAuthRequired.svelte.ts | Auth guard with optional role gating + `onReady` callback |

Imports: `import { useDeleteConfirm, usePdfPreview, useAttachmentPreview, useAuthRequired } from "$lib/components/composables";`

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

## Data access (frontend)

| Export | Path | Description |
|--------|------|-------------|
| getRepository / initRepository | frontend/src/lib/data/index.ts | Provider factory; selects adapter by data mode |
| createHttpRepository | frontend/src/lib/data/adapters/http.ts | REST client for the Bun server (online mode) |
| createLocalRepository | frontend/src/lib/data/adapters/local.ts | Offline sql.js adapter (local mode) |

## Server lib (auth, validation, rate limiting)

| Function | Path | Description |
|----------|------|-------------|
| authMiddleware | server/src/lib/auth.ts | Populate `c.get('user')` from the JWT cookie on every request |
| requireAuth | server/src/lib/auth.ts | Require an authenticated user |
| currentUser | server/src/lib/auth.ts | Read the authed user off the context |
| setAuthCookie / clearAuthCookie | server/src/lib/auth.ts | Set/clear the JWT cookie on the response |
| validateEmail / validatePhone / validateDate / sanitizeString | server/src/lib/validate.ts | Input validation + sanitization |
| rateLimit | server/src/lib/rateLimit.ts | In-memory fixed-window limiter factory |
| registerLimiter / loginLimiter / submitLimiter / formLoadLimiter | server/src/lib/rateLimit.ts | Configured rate limiters |

## Server services

| Service | Path | Description |
|---------|------|-------------|
| createTransport / sendNotification / sendGroupInvite / sendRemovalNotice | server/src/services/email.ts | Email sending via Nodemailer |
| buildSmsEmail / sendSmsNotification / CARRIER_GATEWAYS | server/src/services/sms.ts | SMS via carrier email gateways |
| generatePdf | server/src/services/pdf.ts | PDF generation via pdf-lib |

## Types

| Type/Interface | Path |
|---------------|------|
| App.Locals | frontend/src/app.d.ts |
| OrgGroup | frontend/src/lib/utils/organizations.ts |
| Toast | frontend/src/lib/stores/toast.ts |
| ButtonVariant / ButtonSize / ButtonProps | frontend/src/lib/components/ui/button/index.ts |

## Hooks

None detected.
