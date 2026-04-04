---
id: ADR-001
title: "PDF generation via pdf-lib filling official church form"
status: accepted
created: 2026-03-19
updated: 2026-03-22
tags:
  - architecture
  - pdf
---

# PDF generation via pdf-lib filling official church form

## Context

The app needs to generate PDFs that match the official LDS Church permission and medical release form. Two approaches were considered.

## Decision

Use **pdf-lib** to fill in the actual official church PDF form fields directly, rather than rendering an HTML template to PDF with Puppeteer.

## Rationale

- The official church PDF has form fields that can be programmatically filled
- Produces output identical to the official form (not a recreation)
- pdf-lib is lightweight (~200KB) with no headless browser dependency
- Puppeteer was originally specified but replaced early in development due to binary size (~300MB) and reliability issues
- Drawn signatures are embedded as PNG images at field positions
- Typed signatures are set as text in form fields
- Form is flattened after filling (fields become static, uneditable)

## Consequences

- Template PDF stored at `backend/src/templates/permission-form.pdf`
- Must maintain the template if the church updates their form
- Puppeteer remains as a dependency (listed in package.json) but is no longer used for PDF generation — could be removed

## See also

- [[code-map/api-layer|API layer]] -- PDF service implementation
- [[specs/SPEC-001-permission-form-app-design|Original design spec]]
