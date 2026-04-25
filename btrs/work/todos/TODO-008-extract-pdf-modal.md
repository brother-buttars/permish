---
id: TODO-008
title: "Extract PdfPreviewModal into shared component"
status: completed
created: 2026-03-22
updated: 2026-04-24
priority: high
tags:
  - refactor
  - frontend
  - accessibility
---

# Extract PdfPreviewModal into shared component

## Description

The PDF preview modal is copy-pasted across 4 pages (~240 lines of duplication). It also lacks keyboard Escape handling and focus trapping (accessibility issue).

Affected pages: `event/[id]/+page.svelte`, `dashboard/+page.svelte`, `submissions/+page.svelte`, `event/[id]/submissions/+page.svelte`

## Acceptance criteria

- [x] `PdfPreviewModal.svelte` component extracted to `$lib/components/`
- [x] All 4 pages use the shared component
- [x] Escape key closes the modal
- [x] Focus is trapped within the modal when open

## Resolution (2026-04-24)

- Component already extracted as `$lib/components/PdfModal.svelte` and consumed by all 4 pages.
- Added Tab/Shift+Tab focus trap, initial focus on first focusable element, and focus restoration on close.
- Escape handling was already present.
