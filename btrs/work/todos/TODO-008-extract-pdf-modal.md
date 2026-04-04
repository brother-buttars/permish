---
id: TODO-008
title: "Extract PdfPreviewModal into shared component"
status: pending
created: 2026-03-22
updated: 2026-03-22
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

- [ ] `PdfPreviewModal.svelte` component extracted to `$lib/components/`
- [ ] All 4 pages use the shared component
- [ ] Escape key closes the modal
- [ ] Focus is trapped within the modal when open
