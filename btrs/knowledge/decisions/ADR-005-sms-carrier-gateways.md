---
id: ADR-005
title: "SMS via carrier email gateways instead of Twilio"
status: accepted
created: 2026-03-19
updated: 2026-03-22
tags:
  - architecture
  - notifications
---

# SMS via carrier email gateways instead of Twilio

## Context

Planners may want SMS notifications when forms are submitted. A zero-cost approach was preferred over paid SMS APIs.

## Decision

Send SMS via carrier email gateways (e.g., `number@txt.att.net`) using the existing Nodemailer transport.

## Rationale

- Zero cost — reuses existing email infrastructure
- No API keys or paid service accounts needed
- Covers major US carriers: AT&T, Verizon, T-Mobile, US Cellular, Cricket, Boost, Metro PCS

## Consequences

- US-only coverage
- MVNOs (Google Fi, Mint Mobile, Visible) not supported
- Planner must know their carrier
- Some carriers are deprecating/throttling these gateways
- If reliability becomes an issue, Twilio can be added as another transport option
- SMS is best-effort — the planner dashboard is the primary way to track submissions

## See also

- [[specs/SPEC-001-permission-form-app-design|Design spec]] -- carrier gateway table
