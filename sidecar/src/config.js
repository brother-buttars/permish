require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3002,
  pbUrl: process.env.PB_URL || 'http://localhost:8090',
  pbAdminEmail: process.env.PB_ADMIN_EMAIL || '',
  pbAdminPassword: process.env.PB_ADMIN_PASSWORD || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  email: {
    provider: process.env.EMAIL_PROVIDER || 'gmail',
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromName: process.env.EMAIL_FROM_NAME || 'Permish',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || '',
  },
  pdfDir: process.env.PDF_DIR || './pdfs',
};
