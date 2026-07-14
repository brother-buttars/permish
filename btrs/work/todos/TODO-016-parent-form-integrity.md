---
id: TODO-016
title: "Parent form: unsigned submissions, data loss, hidden progress/errors"
status: completed
created: 2026-07-14
updated: 2026-07-14
priority: high
tags:
  - ux
  - frontend
  - forms
---

# Parent form: unsigned submissions, data loss, hidden progress/errors

## Description

The parent money path (`/form/[id]`) has verified integrity/UX defects ([[evidence/reviews/2026-07-14-fable-full-audit]]):

1. **Unsigned submissions pass validation** — `lib/utils/submissionForm.ts` defaults both signature types to `'hand'` and `validateSubmissionForm` skips signature checks when type is `'hand'`. A parent who never reaches the Signatures section submits a blank-signature medical release. Server accepts it too.
2. **Progress bar invisible** — `FormProgress` is `sticky top-0 z-30`; `AppHeader` is `sticky top-0 z-40 h-16` — the progress/step indicator sits behind the header once scrolled.
3. **Refresh/tab-close loses the whole form** — dirty guard is `beforeNavigate` only; no `beforeunload`, no draft persistence.
4. **Server-side submit failure invisible** — error summary renders at top; user is at the bottom sticky button; scroll only fires on client validation. Uses `window.confirm()` in beforeNavigate (convention violation); prefill falsely marks the form dirty.
5. **Edit form** (`form/[id]/edit/[submissionId]`) has no dirty guard and routes parents to the planner page on success.
6. Public submit 500s on malformed DOB/signature-type (server never calls `validateDate` — it's imported by no route).

## Acceptance criteria

- [ ] Signature requires an explicit choice; "sign on paper" is opt-in (confirmation or non-default), server validates signature type enum + DOB
- [ ] `FormProgress` offset below the header (`top-16`) 
- [ ] `beforeunload` guard + draft persistence (localStorage keyed by event id) for the create form; dirty guard on the edit form
- [ ] Submit failure scrolls to / toasts the error; ConfirmModal replaces `window.confirm()`
- [ ] Prefill does not mark the form dirty
