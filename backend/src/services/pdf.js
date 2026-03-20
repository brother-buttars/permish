const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

const templatePath = path.join(__dirname, '../templates/permission-form.html');
let compiledTemplate;

function getTemplate() {
  if (!compiledTemplate) {
    const html = fs.readFileSync(templatePath, 'utf-8');
    compiledTemplate = Handlebars.compile(html);
  }
  return compiledTemplate;
}

Handlebars.registerHelper('checked', (val) => val ? '&#9746;' : '&#9744;');
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
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });
    return pdfPath;
  } finally {
    await browser.close();
  }
}

module.exports = { generatePdf };
