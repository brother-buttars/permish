const isProduction = process.env.NODE_ENV === 'production';
const DEFAULT_JWT_SECRET = 'dev-secret-change-me';

if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_JWT_SECRET)) {
  console.error('FATAL: JWT_SECRET must be set to a non-default value in production');
  process.exit(1);
}

export const config = {
  isProduction,
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  /** JWT lifetime in seconds (matches the old Express default of 24h). */
  jwtExpirySeconds: Number(process.env.JWT_EXPIRY_SECONDS || 24 * 60 * 60),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  /** Optional fixed bootstrap password for the initial super admin; random if unset. */
  adminBootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD || '',
  /** Only trust X-Forwarded-For when explicitly behind a proxy (e.g. Caddy). */
  trustProxy: process.env.TRUST_PROXY === 'true',
  dbPath: process.env.DB_PATH || './data/permish.sqlite',
  pdfDir: process.env.PDF_DIR || './pdfs',
  uploadsDir: process.env.UPLOADS_DIR || './uploads',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
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
};

export type EmailConfig = typeof config.email;
