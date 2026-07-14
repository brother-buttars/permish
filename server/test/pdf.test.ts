import { describe, it, expect } from 'bun:test';
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Proves pdf-lib fills the actual official church permission form under the Bun
// runtime — the one server-only job PocketBase couldn't do without a Node sidecar.
// Phase 1 moves the canonical template into server/ and wires the submit route.
const templatePath = fileURLToPath(new URL('../src/templates/permission-form.pdf', import.meta.url));

describe('PDF generation under Bun', () => {
  it('loads the church template and reports fillable form fields', async () => {
    const bytes = readFileSync(templatePath);
    const doc = await PDFDocument.load(bytes);
    const fields = doc.getForm().getFields();
    expect(fields.length).toBeGreaterThan(0);
  });

  it('fills a text field, flattens, and emits a valid PDF', async () => {
    const doc = await PDFDocument.load(readFileSync(templatePath));
    const form = doc.getForm();

    const textField = form.getFields().find((f) => f.constructor.name === 'PDFTextField');
    expect(textField).toBeDefined();
    form.getTextField(textField!.getName()).setText('Jane Doe');
    form.flatten();

    const out = await doc.save();
    expect(out.byteLength).toBeGreaterThan(1000);
    // Valid PDF header: %PDF
    expect([out[0], out[1], out[2], out[3]]).toEqual([0x25, 0x50, 0x44, 0x46]);
  });
});
