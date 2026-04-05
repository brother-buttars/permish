---
title: "Decisions"
created: 2026-03-22
updated: 2026-03-22
tags:
  - index
---

# Decisions

Architecture Decision Records for permish.

- [[decisions/ADR-001-pdf-generation|ADR-001: PDF generation via pdf-lib]] -- Fill official church PDF directly instead of HTML-to-PDF
- [[decisions/ADR-002-auth-strategy|ADR-002: JWT auth via HttpOnly cookies]] -- No refresh tokens, 24-hour expiry
- [[decisions/ADR-003-sqlite-raw-sql|ADR-003: SQLite with raw SQL]] -- better-sqlite3, no ORM
- [[decisions/ADR-004-shadcn-svelte-hand-built|ADR-004: Hand-built shadcn-svelte]] -- Manual components due to unreliable CLI
- [[decisions/ADR-005-sms-carrier-gateways|ADR-005: SMS via carrier email gateways]] -- Zero-cost SMS using Nodemailer
