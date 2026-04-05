const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const config = require('./config');
const { extractUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const formRoutes = require('./routes/form');
const eventsRoutes = require('./routes/events');
const profilesRoutes = require('./routes/profiles');
const submissionsRoutes = require('./routes/submissions');
const groupsRoutes = require('./routes/groups');
const adminRoutes = require('./routes/admin');
const { registerLimiter, loginLimiter, submitLimiter, formLoadLimiter } = require('./middleware/rateLimiter');

const app = express();

app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = [config.frontendUrl];
    if (process.env.CORS_ORIGINS) {
      allowed.push(...process.env.CORS_ORIGINS.split(',').map(s => s.trim()));
    }
    if (allowed.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(extractUser);

// Initialize database (tests override via app.locals.db)
if (!app.locals.db) {
  const { getDb } = require('./db/connection');
  app.locals.db = getDb();
}

// Health check + version info
const pkg = require('../package.json');
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: pkg.version });
});

// Auth rate limiters + auth routes
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);

// Form routes FIRST (public: /:id/form, /:id/submit)
app.use('/api/events', formRoutes);

// Events routes SECOND (planner-only: uses requireAuth + requirePlanner)
app.use('/api/events', eventsRoutes);

// Profiles routes
app.use('/api/profiles', profilesRoutes);

// Submissions routes
app.use('/api/submissions', submissionsRoutes);

// Groups routes
app.use('/api/groups', groupsRoutes);

// Admin routes (super admin only)
app.use('/api/admin', adminRoutes);

// Global error handler — must be last middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Backend running on port ${config.port}`);
  });
}

module.exports = app;
