---
id: TODO-018
title: "Fable audit wave 3: minor styling/refactor backlog (3× rule, a11y, terminology)"
status: completed
created: 2026-07-14
updated: 2026-07-14
priority: medium
tags:
  - frontend
  - styling
  - atomic-design
  - a11y
---

# Fable audit wave 3 — remaining Minor backlog

## Description

The last open item from the 2026-07-14 Fable audit ([[evidence/reviews/2026-07-14-fable-full-audit]]) after waves 1+2 closed all criticals and majors. Verified-in-code remaining findings:

1. **Segmented-tab override string inlined 7×** — `account`, `admin`, `groups/[id]` layouts + 4 buttons in `SignaturePad`; `SegmentedTabs` molecule exists but lacks an onSelect/nav mode.
2. **Amber warning boxes** hand-rolled in `import-event`, `server-settings`, `account/_components/DataModeSection` diverging from `AlertBox variant="warning"`.
3. **Raw `<select>`s** recreating the Select atom on `groups/[id]/invites` and `groups/create` (focus styles missing on some).
4. **`event/[id]/submissions` atomic-design violations** — inline header, raw input with copied atom classes, inline filter Card, third drifted copy of the submission-list pattern, inline empty state.
5. **Dashboard "My Submissions"** — hand-rolled copy of `SubmissionListView`.
6. **`FormField` molecule unused** — label+input+error triplet inlined ~22×.
7. **SignaturePad canvas** — not resize-aware (rotation → offset strokes); switching mode away from Draw and back wipes the drawn signature.
8. **SubmissionListView mobile tap targets** — 28px icon buttons next to Delete.
9. **Mobile nav Sheet** — no Escape close, focus trap, or dialog semantics.
10. **Terminology/copy** — group-detail "Activity" tab is the audit log (collides with "Activities" = events); invite page uses `toLocaleString()` instead of `formatDate()` and has copy-splice errors.

## Acceptance criteria

- [x] Segmented tab strip rendered by `SegmentedTabs` everywhere (0 inline copies of the override string — verified by grep)
- [x] All warning boxes use `AlertBox variant="warning"` (AlertBox gained a children snippet for rich content)
- [x] No raw `<select>` outside the Select atom
- [x] `event/[id]/submissions` composed from PageHeader/FilterPanel/SubmissionListView (organism gained `showAge`/`showEmergencyPhone` column flags)
- [x] Dashboard "My Submissions" renders through `SubmissionListView`
- [x] `FormField` adopted for all 22 inlined label+input+error triplets (create, event edit, groups/create)
- [x] Drawn signature survives mode switches (`lastDrawnDataUrl` re-blit) and canvas resizes (ResizeObserver + redraw)
- [x] Mobile submission-row buttons h-9 with gap-2 spacing (was h-7/gap-1 next to Delete)
- [x] Sheet closes on Escape, traps focus, restores focus, `role="dialog"` + aria-modal + label
- [x] "Activity" audit-log tab renamed to "History"; invite page uses `formatDate()`; invite error copy no longer splices raw server text; anonymous success page no longer promises PDF access after login
- [x] Frontend 183/183 (4 new SegmentedTabs tests), svelte-check 0 errors, production build + doc-drift guard pass

## Links

- [[evidence/reviews/2026-07-14-fable-full-audit]]
- Branch: `fix/fable-audit-3`
