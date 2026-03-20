const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const config = require('./config');
const { extractUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const eventsRoutes = require('./routes/events');
const profilesRoutes = require('./routes/profiles');
const { registerLimiter, loginLimiter } = require('./middleware/rateLimiter');

const app = express();

app.use(helmet());
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(extractUser);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/profiles', profilesRoutes);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Backend running on port ${config.port}`);
  });
}

module.exports = app;
