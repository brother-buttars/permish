---
id: TODO-014
title: "Hybrid sync correctness: id divergence, dropped groups, CHECK enum, missing pulls"
status: completed
created: 2026-07-14
updated: 2026-07-14
priority: critical
tags:
  - data-layer
  - sync
  - frontend
  - backend
---

# Hybrid sync correctness

## Description

Hybrid mode silently loses, duplicates, or strands data today. Verified defects ([[evidence/reviews/2026-07-14-fable-full-audit]]):

1. **ID divergence on create** — server create routes mint fresh UUIDs (`server/src/routes/events.ts:82`, `profiles.ts:25`, `form.ts:85`) and ignore client ids; the local row keeps its own uuid. Next pull inserts the server copy as a duplicate; queued updates/deletes for the local id 404 remotely forever.
2. **Group mutations dropped** — `sync/manager.ts:178-180` `replayChange()` default case warns and returns normally, so `groups`/`group_members`/`group_invites` changes are marked synced without reaching the server.
3. **CHECK constraint mismatch** — `pending_changes.operation` allows `('create','update','delete')` but hybrid queues `'delete-permanent'` and `'reassign'` (`hybrid.ts:83,88`) → insert throws after the local mutation ran; deletion resurrects on next pull.
4. **`events.group_id` dropped** in local INSERT/UPDATE, sync columns, and migration pull → parent "Upcoming Activities" permanently empty in local/hybrid.
5. **Pull fetches only `submissions.getMine()`** — event owners see 0 submissions to their events in hybrid.
6. **`auth.updateProfile` never queued** — guardian signature/phone changes never sync (dead `users` replay case shows intent).
7. Hybrid→online switch doesn't re-check pending count after the final sync (`sync()` never rejects) — pending changes stranded.

Consider disabling hybrid mode in the UI until this lands.

## Acceptance criteria

- [ ] Server create routes accept client-supplied UUIDs (validated), or sync maps local→remote ids after create
- [ ] `replayChange()` covers group collections; unknown collections throw instead of marking synced
- [ ] `operation` enum extended in `shared/schema.ts` + `bun run gen:schema`
- [ ] `group_id` added to local adapter INSERT/UPDATE, sync columns descriptor, migration pull
- [ ] Pull includes submissions for owned events; profile updates queued
- [ ] Mode switch aborts if pending count > 0 after final sync
- [ ] Sync tests cover offline-create→push→pull round-trip without duplication
