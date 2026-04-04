require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required in production');
  process.exit(1);
}

module.exports = {
  port: process.env.PORT || 3001,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiry: process.env.JWT_EXPIRY || '24h',
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
  dataDir: process.env.DATA_DIR || './data',
  pdfDir: process.env.PDF_DIR || './pdfs',
  uploadsDir: process.env.UPLOADS_DIR || './uploads',
};
