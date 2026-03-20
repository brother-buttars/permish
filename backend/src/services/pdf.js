const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

const templatePath = path.join(__dirname, '../templates/permission-form.html');
function getTemplate() {
  // Always read fresh in development, cached in production
  const html = fs.readFileSync(templatePath, 'utf-8');
  return Handlebars.compile(html);
}

Handlebars.registerHelper('checked', (val) => val ? '&#9746;' : '&#9744;');
Handlebars.registerHelper('unchecked', (val) => val ? '&#9744;' : '&#9746;');
Handlebars.registerHelper('eq', (a, b) => a === b);

async function generatePdf({ event, submission }, pdfDir) {
  fs.mkdirSync(pdfDir, { recursive: true });

  const template = getTemplate();
  const html = template({ ...event, ...submission, event_prefix: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const fileName = `${submission.id}.pdf`;
    const pdfPath = path.join(pdfDir, fileName);
    await page.pdf({
      path: pdfPath,
      format: 'Letter',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return pdfPath;
  } finally {
    await browser.close();
  }
}

module.exports = { generatePdf };
