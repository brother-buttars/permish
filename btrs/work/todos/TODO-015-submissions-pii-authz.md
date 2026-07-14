---
id: TODO-015
title: "Close PII exposure: group members can list children's submission data"
status: completed
created: 2026-07-14
updated: 2026-07-14
priority: critical
tags:
  - security
  - backend
  - privacy
---

# Close PII exposure: group members can list children's submission data

## Description

`server/src/routes/events.ts:359` — `GET /api/events/:id/submissions` calls `accessibleEvent(c, id)` with `adminOnly` defaulting to false (verified: the member JOIN has no role clause). Any parent who joined a group via the shared invite code can list every child's `participant_name`, `participant_dob`, `emergency_contact`, `emergency_phone_primary` for group events. Invite codes are only 32 bits and `POST /api/groups/join` is unthrottled, so membership itself is brute-forceable.

Related inconsistencies to resolve in the same pass: group admins can list submissions via the events route but get 403 on `GET /api/submissions/:id`/`/pdf`; attachments check `created_by` only while event edit/delete honor group admins. Centralize one access model in `lib/`.

Found by 2026-07-14 Fable audit ([[evidence/reviews/2026-07-14-fable-full-audit]]), verified in code.

## Acceptance criteria

- [ ] `GET /events/:id/submissions` requires event owner, group admin, or super (`adminOnly = true` at minimum)
- [ ] `POST /api/groups/join` rate-limited; invite codes lengthened (12+ chars)
- [ ] Access model unified between events/submissions/attachments routes (single helper in `lib/`)
- [ ] Tests for the 403 branches (plain member, non-member, group admin)
