# Permission & Medical Release Form App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-friendly web app that lets event planners create pre-filled permission/medical release forms and share unique URLs with parents who complete, sign, and submit them.

**Architecture:** SvelteKit frontend with shadcn-svelte components communicates with a Node.js/Express backend via REST API. SQLite stores all data. Puppeteer generates PDFs matching the official church form layout. Nodemailer handles optional email/SMS notifications. JWT cookies handle authentication. Docker Compose packages everything.

**Tech Stack:** SvelteKit, shadcn-svelte, Node.js, Express, SQLite (better-sqlite3), Puppeteer, Nodemailer, bcrypt, jsonwebtoken, express-rate-limit, Docker Compose

**Spec:** `docs/superpowers/specs/2026-03-19-permission-form-app-design.md`

---

## File Structure

### Backend (`backend/`)

```
backend/
  package.json
  .env.example
  Dockerfile
  src/
    index.js                    - Express app setup, middleware, route mounting
    config.js                   - Environment variable loading and defaults
    db/
      connection.js             - SQLite connection via better-sqlite3
      schema.js                 - Table creation DDL
    middleware/
      auth.js                   - JWT cookie verification, requireAuth, requirePlanner
      rateLimiter.js            - express-rate-limit configs per endpoint group
      validate.js               - Input validation/sanitization helpers
    routes/
      auth.js                   - POST register/login/logout, GET me
      events.js                 - CRUD + submissions list (planner only)
      profiles.js               - CRUD child profiles (auth required)
      form.js                   - GET form data (public), POST submit (public)
      submissions.js            - GET pdf download (auth, owner check)
      health.js                 - GET health check
    services/
      email.js                  - Email transport abstraction (gmail/resend)
      sms.js                    - SMS via carrier email gateways
      pdf.js                    - Puppeteer PDF generation
    templates/
      permission-form.html      - HTML template for PDF generation
  tests/
    setup.js                    - Test database setup/teardown helpers
    auth.test.js
    events.test.js
    profiles.test.js
    form.test.js
    submissions.test.js
    services/
      email.test.js
      pdf.test.js
```

### Frontend (`frontend/`)

```
frontend/
  package.json
  svelte.config.js
  vite.config.js
  Dockerfile
  src/
    app.html
    lib/
      api.ts                    - Fetch wrapper for backend API calls
      stores/
        auth.ts                 - Auth state store (user, loading, login/logout)
      components/
        SignaturePad.svelte     - Draw + type-to-sign signature component
        ProfileSelector.svelte  - Dropdown to select/prefill child profile
      utils/
        carriers.ts             - Carrier gateway list for dropdown
        validation.ts           - Client-side validation helpers
        age.ts                  - Compute age from DOB
    routes/
      +layout.svelte            - App shell, nav, auth check
      +layout.ts                - Layout load function (fetch auth state)
      +page.svelte              - Landing page
      login/
        +page.svelte            - Login form
      register/
        +page.svelte            - Registration form (role selection)
      dashboard/
        +page.svelte            - Role-based dashboard (planner or parent)
      create/
        +page.svelte            - Event creation form
      event/
        [id]/
          +page.svelte          - Event dashboard with submissions
          +page.ts              - Load event data
      form/
        [id]/
          +page.svelte          - Parent-facing permission form
          +page.ts              - Load event details for form
          success/
            +page.svelte        - Submission confirmation
      profiles/
        +page.svelte            - Child profile management
```

### Root

```
docker-compose.yml
.env.example
.gitignore
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `backend/package.json`
- Create: `backend/src/index.js`
- Create: `backend/src/config.js`
- Create: `backend/.env.example`
- Create: `frontend/package.json` (via `pnpm create svelte`)
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `.nvmrc`

- [ ] **Step 1: Create .nvmrc for Node version management**

```bash
cd /Users/brandonbuttars/PERSONAL/PermissionForm
echo "20" > .nvmrc
nvm use
```

- [ ] **Step 2: Initialize backend project**

```bash
cd /Users/brandonbuttars/PERSONAL/PermissionForm
mkdir -p backend/src backend/tests
cd backend
pnpm init
pnpm install express cors cookie-parser better-sqlite3 bcryptjs jsonwebtoken uuid express-rate-limit helmet nodemailer puppeteer dotenv
pnpm install -D jest supertest
```

- [ ] **Step 2: Create backend config.js**

Create `backend/src/config.js`:
```js
require('dotenv').config();

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
    fromName: process.env.EMAIL_FROM_NAME || 'Permission Forms',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || '',
  },
  dataDir: process.env.DATA_DIR || './data',
  pdfDir: process.env.PDF_DIR || './pdfs',
};
```

- [ ] **Step 3: Create backend entry point**

Create `backend/src/index.js`:
```js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const config = require('./config');

const app = express();

app.use(helmet());
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Backend running on port ${config.port}`);
  });
}

module.exports = app;
```

- [ ] **Step 4: Create .env.example files**

Create `backend/.env.example`:
```env
NODE_ENV=development
PORT=3001
JWT_SECRET=change-this-to-a-random-string
JWT_EXPIRY=24h
FRONTEND_URL=http://localhost:3000

EMAIL_PROVIDER=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password

EMAIL_FROM_NAME=Permission Forms
EMAIL_FROM_ADDRESS=your@gmail.com

DATA_DIR=./data
PDF_DIR=./pdfs
```

Create root `.env.example` with the same content plus Docker-specific vars.

- [ ] **Step 5: Configure backend test runner**

Add to `backend/package.json` scripts:
```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "jest --forceExit --detectOpenHandles"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 6: Write and run health check test**

Create `backend/tests/health.test.js`:
```js
const request = require('supertest');
const app = require('../src/index');

describe('GET /api/health', () => {
  test('returns ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

Run: `cd backend && pnpm test -- tests/health.test.js`
Expected: PASS

- [ ] **Step 7: Initialize SvelteKit frontend**

```bash
cd /Users/brandonbuttars/PERSONAL/PermissionForm
pnpm create svelte frontend --template minimal --types ts --no-add-ons
cd frontend
pnpm install
pnpm dlx shadcn-svelte@latest init
```

Follow shadcn-svelte init prompts (select default style, base color, CSS variables).

- [ ] **Step 8: Create .gitignore**

Create `.gitignore`:
```
node_modules/
.env
*.db
data/
pdfs/
.svelte-kit/
build/
dist/
```

- [ ] **Step 9: Create docker-compose.yml**

Create `docker-compose.yml`:
```yaml
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    volumes:
      - db-data:/app/data
      - pdf-storage:/app/pdfs
    env_file:
      - .env
    environment:
      - DATA_DIR=/app/data
      - PDF_DIR=/app/pdfs

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
    environment:
      - PUBLIC_API_URL=http://backend:3001

volumes:
  db-data:
  pdf-storage:
```

- [ ] **Step 10: Commit scaffolding**

```bash
git add -A
git commit -m "feat: scaffold backend and frontend projects with Docker Compose"
```

---

## Task 2: Database Schema & Connection

**Files:**
- Create: `backend/src/db/connection.js`
- Create: `backend/src/db/schema.js`
- Create: `backend/tests/setup.js`
- Create: `backend/tests/db.test.js`

- [ ] **Step 1: Write failing test for database initialization**

Create `backend/tests/setup.js`:
```js
const Database = require('better-sqlite3');
const { createTables } = require('../src/db/schema');

function createTestDb() {
  const db = new Database(':memory:');
  createTables(db);
  return db;
}

module.exports = { createTestDb };
```

Create `backend/tests/db.test.js`:
```js
const { createTestDb } = require('./setup');

describe('Database schema', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  test('creates users table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").all();
    expect(tables).toHaveLength(1);
  });

  test('creates events table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").all();
    expect(tables).toHaveLength(1);
  });

  test('creates child_profiles table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='child_profiles'").all();
    expect(tables).toHaveLength(1);
  });

  test('creates submissions table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='submissions'").all();
    expect(tables).toHaveLength(1);
  });

  test('enforces unique email on users', () => {
    const insert = db.prepare("INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))");
    insert.run('id1', 'test@test.com', 'hash', 'Test', 'parent');
    expect(() => insert.run('id2', 'test@test.com', 'hash', 'Test2', 'parent')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test -- tests/db.test.js`
Expected: FAIL — `Cannot find module '../src/db/schema'`

- [ ] **Step 3: Implement schema.js**

Create `backend/src/db/schema.js`:
```js
function createTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('planner', 'parent')),
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      created_by TEXT NOT NULL REFERENCES users(id),
      event_name TEXT NOT NULL,
      event_dates TEXT NOT NULL,
      event_description TEXT NOT NULL,
      ward TEXT NOT NULL,
      stake TEXT NOT NULL,
      leader_name TEXT NOT NULL,
      leader_phone TEXT NOT NULL,
      leader_email TEXT NOT NULL,
      notify_email TEXT,
      notify_phone TEXT,
      notify_carrier TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS child_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      participant_name TEXT NOT NULL,
      participant_dob TEXT NOT NULL,
      participant_phone TEXT,
      address TEXT,
      city TEXT,
      state_province TEXT,
      emergency_contact TEXT,
      emergency_phone_primary TEXT,
      emergency_phone_secondary TEXT,
      special_diet INTEGER DEFAULT 0,
      special_diet_details TEXT,
      allergies INTEGER DEFAULT 0,
      allergies_details TEXT,
      medications TEXT,
      can_self_administer_meds INTEGER,
      chronic_illness INTEGER DEFAULT 0,
      chronic_illness_details TEXT,
      recent_surgery INTEGER DEFAULT 0,
      recent_surgery_details TEXT,
      activity_limitations TEXT,
      other_accommodations TEXT,
      guardian_signature TEXT,
      guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', NULL)),
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id),
      submitted_by TEXT REFERENCES users(id),
      participant_name TEXT NOT NULL,
      participant_dob TEXT NOT NULL,
      participant_age INTEGER NOT NULL,
      participant_phone TEXT,
      address TEXT,
      city TEXT,
      state_province TEXT,
      emergency_contact TEXT,
      emergency_phone_primary TEXT,
      emergency_phone_secondary TEXT,
      special_diet INTEGER DEFAULT 0,
      special_diet_details TEXT,
      allergies INTEGER DEFAULT 0,
      allergies_details TEXT,
      medications TEXT,
      can_self_administer_meds INTEGER,
      chronic_illness INTEGER DEFAULT 0,
      chronic_illness_details TEXT,
      recent_surgery INTEGER DEFAULT 0,
      recent_surgery_details TEXT,
      activity_limitations TEXT,
      other_accommodations TEXT,
      participant_signature TEXT NOT NULL,
      participant_signature_type TEXT NOT NULL CHECK(participant_signature_type IN ('drawn', 'typed')),
      participant_signature_date TEXT NOT NULL,
      guardian_signature TEXT,
      guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', NULL)),
      guardian_signature_date TEXT,
      submitted_at DATETIME DEFAULT (datetime('now')),
      pdf_path TEXT
    );
  `);
}

module.exports = { createTables };
```

- [ ] **Step 4: Implement connection.js**

Create `backend/src/db/connection.js`:
```js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { createTables } = require('./schema');

let db;

function getDb() {
  if (db) return db;

  fs.mkdirSync(config.dataDir, { recursive: true });
  const dbPath = path.join(config.dataDir, 'permission-forms.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables(db);
  return db;
}

module.exports = { getDb };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pnpm test -- tests/db.test.js`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/ backend/tests/setup.js backend/tests/db.test.js
git commit -m "feat: add SQLite database schema and connection"
```

---

## Task 3: Auth Middleware & Routes

**Files:**
- Create: `backend/src/middleware/auth.js`
- Create: `backend/src/middleware/validate.js`
- Create: `backend/src/routes/auth.js`
- Create: `backend/tests/auth.test.js`
- Modify: `backend/src/index.js` (mount auth routes)

- [ ] **Step 1: Write failing auth tests**

Create `backend/tests/auth.test.js`:
```js
const request = require('supertest');
const app = require('../src/index');
const { createTestDb } = require('./setup');

// Patch app to use in-memory DB for tests
let db;
beforeEach(() => {
  db = createTestDb();
  app.locals.db = db;
});
afterEach(() => db.close());

describe('POST /api/auth/register', () => {
  test('registers a new planner', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'planner@test.com', password: 'Password123!', name: 'Test Planner', role: 'planner' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('planner@test.com');
    expect(res.body.user.role).toBe('planner');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  test('registers a new parent', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'parent@test.com', password: 'Password123!', name: 'Test Parent', role: 'parent' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('parent');
  });

  test('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@test.com', password: 'Password123!', name: 'User1', role: 'parent' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@test.com', password: 'Password123!', name: 'User2', role: 'parent' });
    expect(res.status).toBe(409);
  });

  test('rejects invalid role', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bad@test.com', password: 'Password123!', name: 'Bad', role: 'admin' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@test.com', password: 'Password123!', name: 'Login User', role: 'planner' });
  });

  test('logs in with correct credentials and sets cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.body.user.email).toBe('login@test.com');
  });

  test('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'WrongPassword!' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('returns user when authenticated', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'me@test.com', password: 'Password123!', name: 'Me User', role: 'parent' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'me@test.com', password: 'Password123!' });
    const cookie = loginRes.headers['set-cookie'];

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@test.com');
  });

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  test('clears the auth cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/token=;/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pnpm test -- tests/auth.test.js`
Expected: FAIL

- [ ] **Step 3: Implement auth middleware**

Create `backend/src/middleware/auth.js`:
```js
const jwt = require('jsonwebtoken');
const config = require('../config');

function extractUser(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = payload;
    next();
  } catch {
    req.user = null;
    next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requirePlanner(req, res, next) {
  if (!req.user || req.user.role !== 'planner') {
    return res.status(403).json({ error: 'Planner access required' });
  }
  next();
}

function setAuthCookie(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

module.exports = { extractUser, requireAuth, requirePlanner, setAuthCookie };
```

- [ ] **Step 4: Implement validation middleware**

Create `backend/src/middleware/validate.js`:
```js
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  if (!phone) return true;
  const cleaned = phone.replace(/[\s\-().]/g, '');
  return /^\+?\d{7,15}$/.test(cleaned);
}

function validateDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return str;
  return str.slice(0, maxLength).replace(/[<>]/g, '');
}

function validateRegistration(req, res, next) {
  const { email, password, name, role } = req.body;
  const errors = [];
  if (!email || !validateEmail(email)) errors.push('Valid email is required');
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters');
  if (!name || name.trim().length === 0) errors.push('Name is required');
  if (!['planner', 'parent'].includes(role)) errors.push('Role must be "planner" or "parent"');
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });
  req.body.name = sanitizeString(name);
  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  next();
}

module.exports = {
  validateEmail, validatePhone, validateDate, sanitizeString,
  validateRegistration, validateLogin,
};
```

- [ ] **Step 5: Implement auth routes**

Create `backend/src/routes/auth.js`:
```js
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { requireAuth, setAuthCookie } = require('../middleware/auth');
const { validateRegistration, validateLogin } = require('../middleware/validate');

const router = Router();

router.post('/register', validateRegistration, async (req, res) => {
  const db = req.app.locals.db;
  const { email, password, name, role } = req.body;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = uuid();
  const password_hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, password_hash, name, role);

  const user = { id, email, name, role };
  setAuthCookie(res, user);
  res.status(201).json({ user });
});

router.post('/login', validateLogin, async (req, res) => {
  const db = req.app.locals.db;
  const { email, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  setAuthCookie(res, safeUser);
  res.json({ user: safeUser });
});

router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
```

- [ ] **Step 6: Mount auth routes in index.js**

Update `backend/src/index.js` to add:
```js
const { extractUser } = require('./middleware/auth');
const { getDb } = require('./db/connection');
const authRoutes = require('./routes/auth');

// After existing middleware:
app.use(extractUser);

// Set db on app.locals (if not set by tests)
if (!app.locals.db) {
  app.locals.db = getDb();
}

app.use('/api/auth', authRoutes);
```

- [ ] **Step 7: Run auth tests to verify they pass**

Run: `cd backend && pnpm test -- tests/auth.test.js`
Expected: PASS (all tests)

- [ ] **Step 8: Commit**

```bash
git add backend/src/middleware/ backend/src/routes/auth.js backend/tests/auth.test.js backend/src/index.js
git commit -m "feat: add JWT auth with register, login, logout, me endpoints"
```

---

## Task 4: Rate Limiting Middleware

**Files:**
- Create: `backend/src/middleware/rateLimiter.js`
- Modify: `backend/src/index.js` (apply rate limiters)

- [ ] **Step 1: Implement rate limiter configs**

Create `backend/src/middleware/rateLimiter.js`:
```js
const rateLimit = require('express-rate-limit');

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many registration attempts, try again later' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, try again later' },
});

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many submissions, try again later' },
});

const formLoadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests, try again later' },
});

module.exports = { registerLimiter, loginLimiter, submitLimiter, formLoadLimiter };
```

- [ ] **Step 2: Apply rate limiters in index.js**

Import and apply to appropriate routes when they are mounted. For now, apply to auth routes:
```js
const { registerLimiter, loginLimiter } = require('./middleware/rateLimiter');

// Before auth routes mount:
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/login', loginLimiter);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/middleware/rateLimiter.js backend/src/index.js
git commit -m "feat: add rate limiting for public endpoints"
```

---

## Task 5: Events CRUD Routes

**Files:**
- Create: `backend/src/routes/events.js`
- Create: `backend/tests/events.test.js`
- Modify: `backend/src/index.js` (mount events routes)

- [ ] **Step 1: Write failing events tests**

Create `backend/tests/events.test.js`:
```js
const request = require('supertest');
const app = require('../src/index');
const { createTestDb } = require('./setup');

let db;
let plannerCookie;
let parentCookie;

const plannerData = { email: 'planner@test.com', password: 'Password123!', name: 'Planner', role: 'planner' };
const parentData = { email: 'parent@test.com', password: 'Password123!', name: 'Parent', role: 'parent' };

const eventData = {
  event_name: 'Youth Camp',
  event_dates: 'June 15-18, 2026',
  event_description: 'Annual youth camp at Lake Powell',
  ward: 'Maple Ward',
  stake: 'Cedar Stake',
  leader_name: 'John Smith',
  leader_phone: '555-123-4567',
  leader_email: 'john@example.com',
  notify_email: 'notify@example.com',
};

beforeEach(async () => {
  db = createTestDb();
  app.locals.db = db;

  const plannerRes = await request(app).post('/api/auth/register').send(plannerData);
  plannerCookie = plannerRes.headers['set-cookie'];
  const parentRes = await request(app).post('/api/auth/register').send(parentData);
  parentCookie = parentRes.headers['set-cookie'];
});
afterEach(() => db.close());

describe('POST /api/events', () => {
  test('planner creates event', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Cookie', plannerCookie)
      .send(eventData);
    expect(res.status).toBe(201);
    expect(res.body.event.event_name).toBe('Youth Camp');
    expect(res.body.event.id).toBeDefined();
    expect(res.body.formUrl).toContain(res.body.event.id);
  });

  test('parent cannot create event', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Cookie', parentCookie)
      .send(eventData);
    expect(res.status).toBe(403);
  });

  test('unauthenticated cannot create event', async () => {
    const res = await request(app).post('/api/events').send(eventData);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/events', () => {
  test('planner lists own events', async () => {
    await request(app).post('/api/events').set('Cookie', plannerCookie).send(eventData);
    const res = await request(app).get('/api/events').set('Cookie', plannerCookie);
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
  });
});

describe('GET /api/events/:id', () => {
  test('planner gets event details', async () => {
    const createRes = await request(app).post('/api/events').set('Cookie', plannerCookie).send(eventData);
    const id = createRes.body.event.id;
    const res = await request(app).get(`/api/events/${id}`).set('Cookie', plannerCookie);
    expect(res.status).toBe(200);
    expect(res.body.event.event_name).toBe('Youth Camp');
  });
});

describe('PUT /api/events/:id', () => {
  test('planner updates event', async () => {
    const createRes = await request(app).post('/api/events').set('Cookie', plannerCookie).send(eventData);
    const id = createRes.body.event.id;
    const res = await request(app)
      .put(`/api/events/${id}`)
      .set('Cookie', plannerCookie)
      .send({ ...eventData, event_name: 'Updated Camp' });
    expect(res.status).toBe(200);
    expect(res.body.event.event_name).toBe('Updated Camp');
  });
});

describe('DELETE /api/events/:id', () => {
  test('soft-deletes event (sets is_active to false)', async () => {
    const createRes = await request(app).post('/api/events').set('Cookie', plannerCookie).send(eventData);
    const id = createRes.body.event.id;
    const res = await request(app).delete(`/api/events/${id}`).set('Cookie', plannerCookie);
    expect(res.status).toBe(200);

    // Should not appear in list
    const listRes = await request(app).get('/api/events').set('Cookie', plannerCookie);
    expect(listRes.body.events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pnpm test -- tests/events.test.js`
Expected: FAIL

- [ ] **Step 3: Implement events routes**

Create `backend/src/routes/events.js`:
```js
const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { requireAuth, requirePlanner } = require('../middleware/auth');
const { sanitizeString } = require('../middleware/validate');
const config = require('../config');

const router = Router();

router.use(requireAuth, requirePlanner);

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const id = uuid();
  const {
    event_name, event_dates, event_description, ward, stake,
    leader_name, leader_phone, leader_email,
    notify_email, notify_phone, notify_carrier,
  } = req.body;

  if (!event_name || !event_dates || !event_description || !ward || !stake || !leader_name || !leader_phone || !leader_email) {
    return res.status(400).json({ error: 'All event detail fields are required' });
  }

  db.prepare(`INSERT INTO events (id, created_by, event_name, event_dates, event_description, ward, stake,
    leader_name, leader_phone, leader_email, notify_email, notify_phone, notify_carrier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id,
      sanitizeString(event_name), sanitizeString(event_dates),
      sanitizeString(event_description, 1000), sanitizeString(ward), sanitizeString(stake),
      sanitizeString(leader_name), sanitizeString(leader_phone), sanitizeString(leader_email),
      notify_email || null, notify_phone || null, notify_carrier || null);

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  const formUrl = `${config.frontendUrl}/form/${id}`;
  res.status(201).json({ event, formUrl });
});

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const events = db.prepare('SELECT * FROM events WHERE created_by = ? AND is_active = 1 ORDER BY created_at DESC').all(req.user.id);

  const eventsWithCounts = events.map(event => {
    const count = db.prepare('SELECT COUNT(*) as count FROM submissions WHERE event_id = ?').get(event.id);
    return { ...event, submission_count: count.count };
  });

  res.json({ events: eventsWithCounts });
});

router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT * FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json({ event });
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT * FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const {
    event_name, event_dates, event_description, ward, stake,
    leader_name, leader_phone, leader_email,
    notify_email, notify_phone, notify_carrier, is_active,
  } = req.body;

  db.prepare(`UPDATE events SET event_name = ?, event_dates = ?, event_description = ?, ward = ?, stake = ?,
    leader_name = ?, leader_phone = ?, leader_email = ?,
    notify_email = ?, notify_phone = ?, notify_carrier = ?, is_active = ?
    WHERE id = ?`)
    .run(
      sanitizeString(event_name || event.event_name),
      sanitizeString(event_dates || event.event_dates),
      sanitizeString(event_description || event.event_description, 1000),
      sanitizeString(ward || event.ward),
      sanitizeString(stake || event.stake),
      sanitizeString(leader_name || event.leader_name),
      sanitizeString(leader_phone || event.leader_phone),
      sanitizeString(leader_email || event.leader_email),
      notify_email !== undefined ? notify_email : event.notify_email,
      notify_phone !== undefined ? notify_phone : event.notify_phone,
      notify_carrier !== undefined ? notify_carrier : event.notify_carrier,
      is_active !== undefined ? (is_active ? 1 : 0) : event.is_active,
      req.params.id);

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  res.json({ event: updated });
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT * FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  db.prepare('UPDATE events SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Event deactivated' });
});

router.get('/:id/submissions', (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT * FROM events WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const submissions = db.prepare('SELECT id, participant_name, emergency_contact, emergency_phone_primary, submitted_at FROM submissions WHERE event_id = ? ORDER BY submitted_at DESC').all(req.params.id);
  res.json({ submissions });
});

module.exports = router;
```

- [ ] **Step 4: Mount events routes in index.js**

Add to `backend/src/index.js`:
```js
const eventsRoutes = require('./routes/events');
app.use('/api/events', eventsRoutes);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pnpm test -- tests/events.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/events.js backend/tests/events.test.js backend/src/index.js
git commit -m "feat: add events CRUD with soft-delete and submission listing"
```

---

## Task 6: Child Profiles CRUD Routes

**Files:**
- Create: `backend/src/routes/profiles.js`
- Create: `backend/tests/profiles.test.js`
- Modify: `backend/src/index.js` (mount profiles routes)

- [ ] **Step 1: Write failing profiles tests**

Create `backend/tests/profiles.test.js`:
```js
const request = require('supertest');
const app = require('../src/index');
const { createTestDb } = require('./setup');

let db, parentCookie;

const profileData = {
  participant_name: 'Jane Doe',
  participant_dob: '2014-05-15',
  participant_phone: '555-111-2222',
  address: '123 Main St',
  city: 'Springfield',
  state_province: 'UT',
  emergency_contact: 'John Doe',
  emergency_phone_primary: '555-333-4444',
  emergency_phone_secondary: '555-555-6666',
  special_diet: false,
  allergies: true,
  allergies_details: 'Peanuts',
  medications: 'None',
  can_self_administer_meds: true,
  chronic_illness: false,
  recent_surgery: false,
  activity_limitations: null,
  other_accommodations: null,
};

beforeEach(async () => {
  db = createTestDb();
  app.locals.db = db;
  const res = await request(app).post('/api/auth/register')
    .send({ email: 'parent@test.com', password: 'Password123!', name: 'Parent', role: 'parent' });
  parentCookie = res.headers['set-cookie'];
});
afterEach(() => db.close());

describe('POST /api/profiles', () => {
  test('creates a child profile', async () => {
    const res = await request(app).post('/api/profiles').set('Cookie', parentCookie).send(profileData);
    expect(res.status).toBe(201);
    expect(res.body.profile.participant_name).toBe('Jane Doe');
  });

  test('requires auth', async () => {
    const res = await request(app).post('/api/profiles').send(profileData);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/profiles', () => {
  test('lists own profiles', async () => {
    await request(app).post('/api/profiles').set('Cookie', parentCookie).send(profileData);
    const res = await request(app).get('/api/profiles').set('Cookie', parentCookie);
    expect(res.status).toBe(200);
    expect(res.body.profiles).toHaveLength(1);
  });
});

describe('PUT /api/profiles/:id', () => {
  test('updates a profile', async () => {
    const createRes = await request(app).post('/api/profiles').set('Cookie', parentCookie).send(profileData);
    const id = createRes.body.profile.id;
    const res = await request(app).put(`/api/profiles/${id}`).set('Cookie', parentCookie)
      .send({ ...profileData, participant_name: 'Jane Updated' });
    expect(res.status).toBe(200);
    expect(res.body.profile.participant_name).toBe('Jane Updated');
  });
});

describe('DELETE /api/profiles/:id', () => {
  test('deletes a profile', async () => {
    const createRes = await request(app).post('/api/profiles').set('Cookie', parentCookie).send(profileData);
    const id = createRes.body.profile.id;
    const res = await request(app).delete(`/api/profiles/${id}`).set('Cookie', parentCookie);
    expect(res.status).toBe(200);
    const listRes = await request(app).get('/api/profiles').set('Cookie', parentCookie);
    expect(listRes.body.profiles).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pnpm test -- tests/profiles.test.js`
Expected: FAIL

- [ ] **Step 3: Implement profiles routes**

Create `backend/src/routes/profiles.js`:
```js
const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { sanitizeString } = require('../middleware/validate');

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const profiles = db.prepare('SELECT * FROM child_profiles WHERE user_id = ? ORDER BY participant_name').all(req.user.id);
  res.json({ profiles });
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const id = uuid();
  const d = req.body;

  db.prepare(`INSERT INTO child_profiles (id, user_id, participant_name, participant_dob, participant_phone,
    address, city, state_province, emergency_contact, emergency_phone_primary, emergency_phone_secondary,
    special_diet, special_diet_details, allergies, allergies_details, medications, can_self_administer_meds,
    chronic_illness, chronic_illness_details, recent_surgery, recent_surgery_details,
    activity_limitations, other_accommodations, guardian_signature, guardian_signature_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id,
      sanitizeString(d.participant_name), d.participant_dob, sanitizeString(d.participant_phone),
      sanitizeString(d.address), sanitizeString(d.city), sanitizeString(d.state_province),
      sanitizeString(d.emergency_contact), sanitizeString(d.emergency_phone_primary),
      sanitizeString(d.emergency_phone_secondary),
      d.special_diet ? 1 : 0, sanitizeString(d.special_diet_details),
      d.allergies ? 1 : 0, sanitizeString(d.allergies_details),
      sanitizeString(d.medications), d.can_self_administer_meds == null ? null : (d.can_self_administer_meds ? 1 : 0),
      d.chronic_illness ? 1 : 0, sanitizeString(d.chronic_illness_details),
      d.recent_surgery ? 1 : 0, sanitizeString(d.recent_surgery_details),
      sanitizeString(d.activity_limitations, 1000), sanitizeString(d.other_accommodations, 1000),
      d.guardian_signature || null, d.guardian_signature_type || null);

  const profile = db.prepare('SELECT * FROM child_profiles WHERE id = ?').get(id);
  res.status(201).json({ profile });
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const existing = db.prepare('SELECT * FROM child_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Profile not found' });

  const d = req.body;
  db.prepare(`UPDATE child_profiles SET participant_name = ?, participant_dob = ?, participant_phone = ?,
    address = ?, city = ?, state_province = ?, emergency_contact = ?, emergency_phone_primary = ?,
    emergency_phone_secondary = ?, special_diet = ?, special_diet_details = ?, allergies = ?,
    allergies_details = ?, medications = ?, can_self_administer_meds = ?,
    chronic_illness = ?, chronic_illness_details = ?, recent_surgery = ?, recent_surgery_details = ?,
    activity_limitations = ?, other_accommodations = ?, guardian_signature = ?, guardian_signature_type = ?,
    updated_at = datetime('now')
    WHERE id = ?`)
    .run(
      sanitizeString(d.participant_name), d.participant_dob, sanitizeString(d.participant_phone),
      sanitizeString(d.address), sanitizeString(d.city), sanitizeString(d.state_province),
      sanitizeString(d.emergency_contact), sanitizeString(d.emergency_phone_primary),
      sanitizeString(d.emergency_phone_secondary),
      d.special_diet ? 1 : 0, sanitizeString(d.special_diet_details),
      d.allergies ? 1 : 0, sanitizeString(d.allergies_details),
      sanitizeString(d.medications), d.can_self_administer_meds == null ? null : (d.can_self_administer_meds ? 1 : 0),
      d.chronic_illness ? 1 : 0, sanitizeString(d.chronic_illness_details),
      d.recent_surgery ? 1 : 0, sanitizeString(d.recent_surgery_details),
      sanitizeString(d.activity_limitations, 1000), sanitizeString(d.other_accommodations, 1000),
      d.guardian_signature || null, d.guardian_signature_type || null,
      req.params.id);

  const profile = db.prepare('SELECT * FROM child_profiles WHERE id = ?').get(req.params.id);
  res.json({ profile });
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const existing = db.prepare('SELECT * FROM child_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Profile not found' });

  db.prepare('DELETE FROM child_profiles WHERE id = ?').run(req.params.id);
  res.json({ message: 'Profile deleted' });
});

module.exports = router;
```

- [ ] **Step 4: Mount profiles routes in index.js**

Add to `backend/src/index.js`:
```js
const profilesRoutes = require('./routes/profiles');
app.use('/api/profiles', profilesRoutes);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pnpm test -- tests/profiles.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/profiles.js backend/tests/profiles.test.js backend/src/index.js
git commit -m "feat: add child profiles CRUD routes"
```

---

## Task 7: Email & SMS Services

**Files:**
- Create: `backend/src/services/email.js`
- Create: `backend/src/services/sms.js`
- Create: `backend/tests/services/email.test.js`

- [ ] **Step 1: Write failing email service test**

Create `backend/tests/services/email.test.js`:
```js
const { createTransport, sendNotification } = require('../../src/services/email');

describe('Email service', () => {
  test('createTransport returns a transporter for gmail provider', () => {
    const transport = createTransport({
      provider: 'gmail',
      smtp: { host: 'smtp.gmail.com', port: 587, user: 'test@gmail.com', pass: 'pass' },
    });
    expect(transport).toBeDefined();
    expect(transport.sendMail).toBeDefined();
  });

  test('sendNotification constructs correct email options', async () => {
    let sentOptions;
    const mockTransport = {
      sendMail: async (opts) => { sentOptions = opts; return { messageId: 'test-id' }; },
    };
    await sendNotification(mockTransport, {
      to: 'recipient@test.com',
      participantName: 'Jane Doe',
      eventName: 'Youth Camp',
      pdfPath: '/path/to/file.pdf',
      fromName: 'Permission Forms',
      fromAddress: 'noreply@test.com',
    });
    expect(sentOptions.to).toBe('recipient@test.com');
    expect(sentOptions.subject).toContain('Jane Doe');
    expect(sentOptions.attachments).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test -- tests/services/email.test.js`
Expected: FAIL

- [ ] **Step 3: Implement email service**

Create `backend/src/services/email.js`:
```js
const nodemailer = require('nodemailer');

function createTransport(emailConfig) {
  if (emailConfig.provider === 'resend') {
    return nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: emailConfig.resendApiKey },
    });
  }

  // Default: Gmail / generic SMTP
  return nodemailer.createTransport({
    host: emailConfig.smtp.host,
    port: emailConfig.smtp.port,
    secure: emailConfig.smtp.port === 465,
    auth: { user: emailConfig.smtp.user, pass: emailConfig.smtp.pass },
  });
}

async function sendNotification(transport, { to, participantName, eventName, pdfPath, fromName, fromAddress }) {
  const mailOptions = {
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: `Permission Form Submitted: ${participantName} - ${eventName}`,
    text: `A permission form has been submitted for ${participantName} for ${eventName}.`,
    html: `<p>A permission form has been submitted for <strong>${participantName}</strong> for <strong>${eventName}</strong>.</p>`,
    attachments: [{
      filename: `permission-form-${participantName.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      path: pdfPath,
    }],
  };
  return transport.sendMail(mailOptions);
}

module.exports = { createTransport, sendNotification };
```

- [ ] **Step 4: Implement SMS service**

Create `backend/src/services/sms.js`:
```js
const CARRIER_GATEWAYS = {
  att: 'txt.att.net',
  verizon: 'vtext.com',
  tmobile: 'tmomail.net',
  uscellular: 'email.uscc.net',
  cricket: 'sms.cricketwireless.net',
  boost: 'smsmyboostmobile.com',
  metropcs: 'mymetropcs.com',
};

const CARRIER_LABELS = {
  att: 'AT&T',
  verizon: 'Verizon',
  tmobile: 'T-Mobile',
  uscellular: 'US Cellular',
  cricket: 'Cricket',
  boost: 'Boost',
  metropcs: 'Metro PCS',
};

function getCarrierList() {
  return Object.entries(CARRIER_GATEWAYS).map(([key, gateway]) => ({
    value: key,
    label: CARRIER_LABELS[key] || key,
    gateway,
  }));
}

function buildSmsEmail(phone, carrier) {
  const gateway = CARRIER_GATEWAYS[carrier];
  if (!gateway) return null;
  const cleanPhone = phone.replace(/\D/g, '');
  return `${cleanPhone}@${gateway}`;
}

async function sendSmsNotification(transport, { phone, carrier, participantName, eventName, fromName, fromAddress }) {
  const to = buildSmsEmail(phone, carrier);
  if (!to) return null;

  return transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: '',
    text: `${participantName} submitted a permission form for ${eventName}.`,
  });
}

module.exports = { CARRIER_GATEWAYS, getCarrierList, buildSmsEmail, sendSmsNotification };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pnpm test -- tests/services/email.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/ backend/tests/services/
git commit -m "feat: add email transport abstraction and SMS carrier gateway service"
```

---

## Task 8: PDF Generation Service

**Files:**
- Create: `backend/src/services/pdf.js`
- Create: `backend/src/templates/permission-form.html`
- Create: `backend/tests/services/pdf.test.js`

- [ ] **Step 1: Write failing PDF test**

Create `backend/tests/services/pdf.test.js`:
```js
const fs = require('fs');
const path = require('path');
const { generatePdf } = require('../../src/services/pdf');

describe('PDF generation', () => {
  const testPdfDir = path.join(__dirname, '../../test-pdfs');

  beforeAll(() => {
    fs.mkdirSync(testPdfDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(testPdfDir, { recursive: true, force: true });
  });

  test('generates a PDF file from submission data', async () => {
    const data = {
      event: {
        event_name: 'Youth Camp',
        event_dates: 'June 15-18, 2026',
        event_description: 'Annual youth camp',
        ward: 'Maple Ward',
        stake: 'Cedar Stake',
        leader_name: 'John Smith',
        leader_phone: '555-123-4567',
        leader_email: 'john@example.com',
      },
      submission: {
        id: 'test-submission-id',
        participant_name: 'Jane Doe',
        participant_dob: '2014-05-15',
        participant_age: 12,
        participant_phone: '555-111-2222',
        address: '123 Main St',
        city: 'Springfield',
        state_province: 'UT',
        emergency_contact: 'John Doe',
        emergency_phone_primary: '555-333-4444',
        emergency_phone_secondary: '555-555-6666',
        special_diet: 0,
        special_diet_details: null,
        allergies: 1,
        allergies_details: 'Peanuts',
        medications: 'None',
        can_self_administer_meds: 1,
        chronic_illness: 0,
        chronic_illness_details: null,
        recent_surgery: 0,
        recent_surgery_details: null,
        activity_limitations: null,
        other_accommodations: null,
        participant_signature: 'data:image/png;base64,iVBORw0KGgo=',
        participant_signature_type: 'drawn',
        participant_signature_date: '2026-06-10',
        guardian_signature: 'John Doe',
        guardian_signature_type: 'typed',
        guardian_signature_date: '2026-06-10',
      },
    };

    const pdfPath = await generatePdf(data, testPdfDir);
    expect(fs.existsSync(pdfPath)).toBe(true);
    const stats = fs.statSync(pdfPath);
    expect(stats.size).toBeGreaterThan(0);
  }, 30000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test -- tests/services/pdf.test.js`
Expected: FAIL

- [ ] **Step 3: Create HTML template for PDF**

Create `backend/src/templates/permission-form.html` — a full HTML template that mirrors the official church form layout with placeholders like `{{event_name}}`, `{{participant_name}}`, etc. The template should include:
- Church logo header area
- "Permission and Medical Release Form" title
- Event Details section (pre-filled, read-only look)
- Contact Information section
- Medical Information section with checkbox visuals
- Conditions That Limit Activity section
- Other Accommodations section
- Permission text block (exact text from the original form)
- Signature lines with rendered signature images
- "Conduct at Church Activities" second page (static boilerplate)
- Print-friendly CSS, letter-size page formatting

Use `{{variable}}` Handlebars-style placeholders. Use `{{#if variable}}` for conditional sections. Style to match the official form as closely as possible with CSS.

- [ ] **Step 4: Implement PDF generation service**

Create `backend/src/services/pdf.js`:
```js
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

// Register helpers
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
```

**Important:** First install Handlebars:
```bash
cd backend && pnpm install handlebars
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pnpm test -- tests/services/pdf.test.js`
Expected: PASS (generates a PDF file on disk)

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/pdf.js backend/src/templates/ backend/tests/services/pdf.test.js backend/package.json backend/pnpm-lock.yaml
git commit -m "feat: add PDF generation service with church form HTML template"
```

---

## Task 9: Form Submission & Notification Routes

**Files:**
- Create: `backend/src/routes/form.js`
- Create: `backend/src/routes/submissions.js`
- Create: `backend/tests/form.test.js`
- Modify: `backend/src/index.js` (mount routes, apply rate limiters)

- [ ] **Step 1: Write failing form tests**

Create `backend/tests/form.test.js`:
```js
const request = require('supertest');
const app = require('../src/index');
const { createTestDb } = require('./setup');

let db, plannerCookie, parentCookie, eventId;

beforeEach(async () => {
  db = createTestDb();
  app.locals.db = db;

  const plannerRes = await request(app).post('/api/auth/register')
    .send({ email: 'planner@test.com', password: 'Password123!', name: 'Planner', role: 'planner' });
  plannerCookie = plannerRes.headers['set-cookie'];

  const parentRes = await request(app).post('/api/auth/register')
    .send({ email: 'parent@test.com', password: 'Password123!', name: 'Parent', role: 'parent' });
  parentCookie = parentRes.headers['set-cookie'];

  const eventRes = await request(app).post('/api/events').set('Cookie', plannerCookie).send({
    event_name: 'Youth Camp', event_dates: 'June 15-18', event_description: 'Camp',
    ward: 'Maple', stake: 'Cedar', leader_name: 'John', leader_phone: '555-1234', leader_email: 'john@test.com',
  });
  eventId = eventRes.body.event.id;
});
afterEach(() => db.close());

describe('GET /api/events/:id/form', () => {
  test('returns event details for active event', async () => {
    const res = await request(app).get(`/api/events/${eventId}/form`);
    expect(res.status).toBe(200);
    expect(res.body.event.event_name).toBe('Youth Camp');
    expect(res.body.event).not.toHaveProperty('notify_email');
  });

  test('returns 410 for inactive event', async () => {
    db.prepare('UPDATE events SET is_active = 0 WHERE id = ?').run(eventId);
    const res = await request(app).get(`/api/events/${eventId}/form`);
    expect(res.status).toBe(410);
  });
});

describe('POST /api/events/:id/submit', () => {
  const submissionData = {
    participant_name: 'Jane Doe',
    participant_dob: '2014-05-15',
    participant_phone: '555-111-2222',
    address: '123 Main St',
    city: 'Springfield',
    state_province: 'UT',
    emergency_contact: 'John Doe',
    emergency_phone_primary: '555-333-4444',
    special_diet: false,
    allergies: false,
    chronic_illness: false,
    recent_surgery: false,
    participant_signature: 'Jane Doe',
    participant_signature_type: 'typed',
    participant_signature_date: '2026-06-10',
    guardian_signature: 'John Doe',
    guardian_signature_type: 'typed',
    guardian_signature_date: '2026-06-10',
  };

  test('anonymous user submits form', async () => {
    const res = await request(app).post(`/api/events/${eventId}/submit`).send(submissionData);
    expect(res.status).toBe(201);
    expect(res.body.submission.participant_name).toBe('Jane Doe');
    expect(res.body.submission.participant_age).toBeDefined();
  });

  test('authenticated parent submits form', async () => {
    const res = await request(app).post(`/api/events/${eventId}/submit`)
      .set('Cookie', parentCookie).send(submissionData);
    expect(res.status).toBe(201);
    expect(res.body.submission.submitted_by).toBeDefined();
  });

  test('rejects submission on inactive event', async () => {
    db.prepare('UPDATE events SET is_active = 0 WHERE id = ?').run(eventId);
    const res = await request(app).post(`/api/events/${eventId}/submit`).send(submissionData);
    expect(res.status).toBe(410);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pnpm test -- tests/form.test.js`
Expected: FAIL

- [ ] **Step 3: Implement form routes**

Create `backend/src/routes/form.js`:
```js
const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { sanitizeString } = require('../middleware/validate');
const { generatePdf } = require('../services/pdf');
const { createTransport, sendNotification } = require('../services/email');
const { sendSmsNotification } = require('../services/sms');
const config = require('../config');

const router = Router();

function computeAge(dob) {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

router.get('/:id/form', (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT id, event_name, event_dates, event_description, ward, stake, leader_name, leader_phone, leader_email, is_active FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!event.is_active) return res.status(410).json({ error: 'This form is no longer accepting submissions' });

  const { is_active, ...publicEvent } = event;
  res.json({ event: publicEvent });
});

router.post('/:id/submit', async (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!event.is_active) return res.status(410).json({ error: 'This form is no longer accepting submissions' });

  const d = req.body;
  const id = uuid();
  const age = computeAge(d.participant_dob);
  const submittedBy = req.user?.id || null;

  // Validate required fields
  if (!d.participant_name || !d.participant_dob || !d.participant_signature || !d.participant_signature_type || !d.participant_signature_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate signature size (base64, max 500KB)
  if (d.participant_signature && d.participant_signature.length > 700000) {
    return res.status(400).json({ error: 'Signature too large' });
  }
  if (d.guardian_signature && d.guardian_signature.length > 700000) {
    return res.status(400).json({ error: 'Guardian signature too large' });
  }

  db.prepare(`INSERT INTO submissions (id, event_id, submitted_by, participant_name, participant_dob, participant_age,
    participant_phone, address, city, state_province, emergency_contact, emergency_phone_primary,
    emergency_phone_secondary, special_diet, special_diet_details, allergies, allergies_details,
    medications, can_self_administer_meds, chronic_illness, chronic_illness_details,
    recent_surgery, recent_surgery_details, activity_limitations, other_accommodations,
    participant_signature, participant_signature_type, participant_signature_date,
    guardian_signature, guardian_signature_type, guardian_signature_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.params.id, submittedBy,
      sanitizeString(d.participant_name), d.participant_dob, age,
      sanitizeString(d.participant_phone), sanitizeString(d.address),
      sanitizeString(d.city), sanitizeString(d.state_province),
      sanitizeString(d.emergency_contact), sanitizeString(d.emergency_phone_primary),
      sanitizeString(d.emergency_phone_secondary),
      d.special_diet ? 1 : 0, sanitizeString(d.special_diet_details),
      d.allergies ? 1 : 0, sanitizeString(d.allergies_details),
      sanitizeString(d.medications), d.can_self_administer_meds == null ? null : (d.can_self_administer_meds ? 1 : 0),
      d.chronic_illness ? 1 : 0, sanitizeString(d.chronic_illness_details),
      d.recent_surgery ? 1 : 0, sanitizeString(d.recent_surgery_details),
      sanitizeString(d.activity_limitations, 1000), sanitizeString(d.other_accommodations, 1000),
      d.participant_signature, d.participant_signature_type, d.participant_signature_date,
      d.guardian_signature || null, d.guardian_signature_type || null, d.guardian_signature_date || null);

  const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);

  // Generate PDF (async, don't block response if it fails)
  try {
    const pdfPath = await generatePdf({ event, submission }, config.pdfDir);
    db.prepare('UPDATE submissions SET pdf_path = ? WHERE id = ?').run(pdfPath, id);
    submission.pdf_path = pdfPath;

    // Send notifications if configured (fire and forget)
    if (event.notify_email || event.notify_phone) {
      const transport = createTransport(config.email);

      if (event.notify_email) {
        sendNotification(transport, {
          to: event.notify_email,
          participantName: submission.participant_name,
          eventName: event.event_name,
          pdfPath,
          fromName: config.email.fromName,
          fromAddress: config.email.fromAddress,
        }).catch(err => console.error('Email notification failed:', err.message));
      }

      if (event.notify_phone && event.notify_carrier) {
        sendSmsNotification(transport, {
          phone: event.notify_phone,
          carrier: event.notify_carrier,
          participantName: submission.participant_name,
          eventName: event.event_name,
          fromName: config.email.fromName,
          fromAddress: config.email.fromAddress,
        }).catch(err => console.error('SMS notification failed:', err.message));
      }
    }
  } catch (err) {
    console.error('PDF generation failed:', err.message);
  }

  res.status(201).json({ submission });
});

module.exports = router;
```

- [ ] **Step 4: Implement submissions routes (PDF download)**

Create `backend/src/routes/submissions.js`:
```js
const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');

const router = Router();
router.use(requireAuth);

// Parent's own submissions (for parent dashboard)
// IMPORTANT: This route MUST be defined BEFORE /:id/pdf to prevent Express from matching "mine" as an :id parameter
router.get('/mine', (req, res) => {
  const db = req.app.locals.db;
  const submissions = db.prepare(`
    SELECT s.id, s.participant_name, s.submitted_at, s.pdf_path, e.event_name
    FROM submissions s
    JOIN events e ON s.event_id = e.id
    WHERE s.submitted_by = ?
    ORDER BY s.submitted_at DESC
  `).all(req.user.id);
  res.json({ submissions });
});

router.get('/:id/pdf', (req, res) => {
  const db = req.app.locals.db;
  const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  if (!submission) return res.status(404).json({ error: 'Submission not found' });

  // Authorization: planner who owns the event OR parent who submitted
  const event = db.prepare('SELECT created_by FROM events WHERE id = ?').get(submission.event_id);
  const isPlanner = event && event.created_by === req.user.id;
  const isSubmitter = submission.submitted_by === req.user.id;

  if (!isPlanner && !isSubmitter) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!submission.pdf_path || !fs.existsSync(submission.pdf_path)) {
    return res.status(404).json({ error: 'PDF not available' });
  }

  const fileName = `permission-form-${submission.participant_name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
  res.download(submission.pdf_path, fileName);
});

module.exports = router;
```

- [ ] **Step 5: Mount routes and apply rate limiters in index.js**

Add to `backend/src/index.js`. **Important:** Mount form routes BEFORE events routes since form routes are public and events routes apply `requireAuth` + `requirePlanner` via `router.use()`. Apply rate limiters as inline middleware on specific routes within the routers, not via `app.use()`.

Here is the complete route mounting section for `backend/src/index.js`, showing the full correct order:

```js
const { extractUser } = require('./middleware/auth');
const { getDb } = require('./db/connection');
const { registerLimiter, loginLimiter, submitLimiter, formLoadLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./routes/auth');
const formRoutes = require('./routes/form');
const eventsRoutes = require('./routes/events');
const profilesRoutes = require('./routes/profiles');
const submissionsRoutes = require('./routes/submissions');

app.use(extractUser);

// Initialize DB (tests override this via app.locals.db)
if (!app.locals.db) {
  app.locals.db = getDb();
}

// Auth routes (with rate limiters applied inline)
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);

// Public form routes — MUST be before events routes (which require planner auth)
app.use('/api/events', formRoutes);

// Planner events routes (requireAuth + requirePlanner applied inside the router)
app.use('/api/events', eventsRoutes);

// Authenticated routes
app.use('/api/profiles', profilesRoutes);
app.use('/api/submissions', submissionsRoutes);
```

Apply rate limiters for form routes inside `backend/src/routes/form.js` as inline middleware:
```js
const { formLoadLimiter, submitLimiter } = require('../middleware/rateLimiter');

router.get('/:id/form', formLoadLimiter, (req, res) => { ... });
router.post('/:id/submit', submitLimiter, async (req, res) => { ... });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pnpm test -- tests/form.test.js`
Expected: PASS

- [ ] **Step 7: Run all backend tests**

Run: `cd backend && pnpm test`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/form.js backend/src/routes/submissions.js backend/tests/form.test.js backend/src/index.js
git commit -m "feat: add form submission, PDF generation, notification delivery, and PDF download routes"
```

---

## Task 10: Frontend — Project Setup & Layout

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/stores/auth.ts`
- Create: `frontend/src/lib/utils/carriers.ts`
- Create: `frontend/src/lib/utils/age.ts`
- Create: `frontend/src/lib/utils/validation.ts`
- Modify: `frontend/src/routes/+layout.svelte`
- Create: `frontend/src/routes/+layout.ts`
- Modify: `frontend/src/routes/+page.svelte`

- [ ] **Step 1: Create API client**

Create `frontend/src/lib/api.ts`:
```ts
const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Auth
  register: (data: any) => apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: any) => apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),
  me: () => apiFetch('/api/auth/me'),

  // Events
  createEvent: (data: any) => apiFetch('/api/events', { method: 'POST', body: JSON.stringify(data) }),
  listEvents: () => apiFetch('/api/events'),
  getEvent: (id: string) => apiFetch(`/api/events/${id}`),
  updateEvent: (id: string, data: any) => apiFetch(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEvent: (id: string) => apiFetch(`/api/events/${id}`, { method: 'DELETE' }),
  getSubmissions: (eventId: string) => apiFetch(`/api/events/${eventId}/submissions`),

  // Profiles
  listProfiles: () => apiFetch('/api/profiles'),
  createProfile: (data: any) => apiFetch('/api/profiles', { method: 'POST', body: JSON.stringify(data) }),
  updateProfile: (id: string, data: any) => apiFetch(`/api/profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProfile: (id: string) => apiFetch(`/api/profiles/${id}`, { method: 'DELETE' }),

  // Form
  getFormEvent: (id: string) => apiFetch(`/api/events/${id}/form`),
  submitForm: (eventId: string, data: any) => apiFetch(`/api/events/${eventId}/submit`, { method: 'POST', body: JSON.stringify(data) }),

  // PDF
  // Submissions
  getMySubmissions: () => apiFetch('/api/submissions/mine'),
  getPdfUrl: (submissionId: string) => `${API_URL}/api/submissions/${submissionId}/pdf`,
};
```

- [ ] **Step 2: Create auth store**

Create `frontend/src/lib/stores/auth.ts`:
```ts
import { writable } from 'svelte/store';
import { api } from '$lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'planner' | 'parent';
}

export const user = writable<User | null>(null);
export const authLoading = writable(true);

export async function checkAuth() {
  try {
    const data = await api.me();
    user.set(data.user);
  } catch {
    user.set(null);
  } finally {
    authLoading.set(false);
  }
}

export async function login(email: string, password: string) {
  const data = await api.login({ email, password });
  user.set(data.user);
  return data.user;
}

export async function register(email: string, password: string, name: string, role: string) {
  const data = await api.register({ email, password, name, role });
  user.set(data.user);
  return data.user;
}

export async function logout() {
  await api.logout();
  user.set(null);
}
```

- [ ] **Step 3: Create utility modules**

Create `frontend/src/lib/utils/carriers.ts`:
```ts
export const carriers = [
  { value: 'att', label: 'AT&T' },
  { value: 'verizon', label: 'Verizon' },
  { value: 'tmobile', label: 'T-Mobile' },
  { value: 'uscellular', label: 'US Cellular' },
  { value: 'cricket', label: 'Cricket' },
  { value: 'boost', label: 'Boost' },
  { value: 'metropcs', label: 'Metro PCS' },
];
```

Create `frontend/src/lib/utils/age.ts`:
```ts
export function computeAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
```

Create `frontend/src/lib/utils/validation.ts`:
```ts
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
  if (!phone) return true;
  return /^[\d\s\-().+]{7,15}$/.test(phone);
}

export function validateDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}
```

- [ ] **Step 4: Create app layout with nav**

Create `frontend/src/routes/+layout.ts`:
```ts
import { checkAuth } from '$lib/stores/auth';

export async function load() {
  await checkAuth();
}
```

Update `frontend/src/routes/+layout.svelte` with a responsive nav bar that shows:
- App title/logo
- When logged in: Dashboard, Profiles (if parent), Create Event (if planner), Logout
- When logged out: Login, Register
- Mobile hamburger menu

Use shadcn-svelte Button and Sheet components for mobile nav.

- [ ] **Step 5: Create landing page**

Update `frontend/src/routes/+page.svelte` — simple landing page with:
- App title and brief description
- Login/Register buttons (if not logged in)
- Dashboard link (if logged in)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/ frontend/src/routes/+layout.svelte frontend/src/routes/+layout.ts frontend/src/routes/+page.svelte
git commit -m "feat: add frontend API client, auth store, utilities, layout, and landing page"
```

---

## Task 11: Frontend — Auth Pages

**Files:**
- Create: `frontend/src/routes/login/+page.svelte`
- Create: `frontend/src/routes/register/+page.svelte`

- [ ] **Step 1: Create login page**

Create `frontend/src/routes/login/+page.svelte`:
- Email and password inputs using shadcn-svelte Input component
- Submit button using shadcn-svelte Button
- Error display for invalid credentials
- On success, redirect to `/dashboard`
- Link to register page
- Mobile-friendly single-column layout

- [ ] **Step 2: Create register page**

Create `frontend/src/routes/register/+page.svelte`:
- Name, email, password inputs
- Role selection: radio buttons for "Event Planner" and "Parent"
- Submit button
- Error display for validation failures / duplicate email
- On success, redirect to `/dashboard`
- Link to login page

- [ ] **Step 3: Test manually**

Start both backend and frontend in dev mode:
```bash
cd backend && pnpm dev &
cd frontend && pnpm dev &
```
Verify: register a planner, log out, log in, verify `/api/auth/me` returns user.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/login/ frontend/src/routes/register/
git commit -m "feat: add login and registration pages"
```

---

## Task 12: Frontend — Dashboard

**Files:**
- Create: `frontend/src/routes/dashboard/+page.svelte`
- Create: `frontend/src/routes/dashboard/+page.ts`

- [ ] **Step 1: Create dashboard page**

Create `frontend/src/routes/dashboard/+page.ts`:
```ts
import { redirect } from '@sveltejs/kit';
import { get } from 'svelte/store';
import { user } from '$lib/stores/auth';

export async function load() {
  const u = get(user);
  if (!u) throw redirect(302, '/login');
}
```

Create `frontend/src/routes/dashboard/+page.svelte`:
- Check user role from auth store
- **Planner view:**
  - "Create New Event" button linking to `/create`
  - Table/list of events: event name, dates, submission count, link to `/event/:id`
  - Load events via `api.listEvents()`
- **Parent view:**
  - "Manage Profiles" button linking to `/profiles`
  - Child profiles list (name, DOB, computed age)
  - Past submissions table: event name, participant name, date, download PDF link
  - Load profiles via `api.listProfiles()`

Use shadcn-svelte Card, Table, and Button components. Mobile-responsive.

- [ ] **Step 2: Test manually**

Verify planner sees event list, parent sees profiles/submissions.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/dashboard/
git commit -m "feat: add role-based dashboard for planners and parents"
```

---

## Task 13: Frontend — Event Creation

**Files:**
- Create: `frontend/src/routes/create/+page.svelte`

- [ ] **Step 1: Create event creation page**

Create `frontend/src/routes/create/+page.svelte`:
- Redirect to login if not planner
- Form sections matching Event Details from spec:
  - Event name, dates (text input), description (textarea)
  - Ward, stake
  - Leader name, phone, email
- Notification settings (optional, collapsible section):
  - Notify email
  - Notify phone + carrier dropdown (using `carriers` list)
- Submit button
- On success, show the generated form URL with a copy-to-clipboard button, link to event dashboard
- Validation: all event detail fields required, email/phone validated client-side

Use shadcn-svelte Input, Textarea, Select, Button, Card components.

- [ ] **Step 2: Test manually**

Create an event, verify URL is generated, verify it appears on dashboard.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/create/
git commit -m "feat: add event creation page with notification settings"
```

---

## Task 14: Frontend — Event Dashboard

**Files:**
- Create: `frontend/src/routes/event/[id]/+page.svelte`
- Create: `frontend/src/routes/event/[id]/+page.ts`

- [ ] **Step 1: Create event dashboard page**

Create `frontend/src/routes/event/[id]/+page.ts`:
```ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  return { eventId: params.id };
};
```

Create `frontend/src/routes/event/[id]/+page.svelte`:
- Load event details via `api.getEvent(eventId)`
- Load submissions via `api.getSubmissions(eventId)`
- **Event header:** name, dates, description, ward/stake, leader info
- **Shareable URL** with copy button
- **Active/Inactive toggle** — calls `api.updateEvent` with `is_active`
- **Submissions table:** participant name, emergency contact, date submitted
- **Per-row actions:** View PDF (opens in new tab), Download PDF, Print
- **Bulk actions:** Download all as ZIP (construct from individual PDFs client-side using JSZip), Print all
- Empty state: "No submissions yet. Share the form URL with parents to get started."

Install JSZip in frontend: `pnpm install jszip file-saver` and `pnpm install -D @types/file-saver`

- [ ] **Step 2: Test manually**

View event dashboard, verify submissions appear, test PDF download.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/event/
git commit -m "feat: add event dashboard with submissions list and PDF actions"
```

---

## Task 15: Frontend — Signature Component

**Files:**
- Create: `frontend/src/lib/components/SignaturePad.svelte`

- [ ] **Step 1: Create SignaturePad component**

Create `frontend/src/lib/components/SignaturePad.svelte`:

Props:
- `label: string` — "Participant Signature" or "Parent/Guardian Signature"
- `value: string` — bound signature data (base64 for drawn, text for typed)
- `type: 'drawn' | 'typed'` — bound signature type
- `initialValue?: string` — pre-filled from profile
- `initialType?: 'drawn' | 'typed'`

Features:
- Toggle between "Draw" and "Type" modes using shadcn-svelte Tabs
- **Draw mode:**
  - HTML5 Canvas element, touch-friendly (handles touch and mouse events)
  - Clear button to reset
  - Canvas sized appropriately for mobile (full width, ~150px height)
  - Exports as base64 PNG data URL
- **Type mode:**
  - Text input
  - Preview of typed name in cursive font (use a Google Font like "Dancing Script" or "Great Vibes")
  - Stores the typed text as the value
- Date input alongside the signature (auto-filled with today's date)
- Bind `value` and `type` to parent component for form submission

- [ ] **Step 2: Test manually**

Import into a test page, verify draw and type modes work on mobile and desktop.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/components/SignaturePad.svelte
git commit -m "feat: add SignaturePad component with draw and type-to-sign modes"
```

---

## Task 16: Frontend — Parent Permission Form

**Files:**
- Create: `frontend/src/routes/form/[id]/+page.svelte`
- Create: `frontend/src/routes/form/[id]/+page.ts`
- Create: `frontend/src/routes/form/[id]/success/+page.svelte`
- Create: `frontend/src/lib/components/ProfileSelector.svelte`

- [ ] **Step 1: Create ProfileSelector component**

Create `frontend/src/lib/components/ProfileSelector.svelte`:
- Dropdown of user's child profiles (loaded from `api.listProfiles()`)
- "Fill out manually" option
- On selection, dispatches event with profile data to parent component
- Only shown when user is authenticated

- [ ] **Step 2: Create form page load function**

Create `frontend/src/routes/form/[id]/+page.ts`:
```ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  return { eventId: params.id };
};
```

- [ ] **Step 3: Create the parent permission form page**

Create `frontend/src/routes/form/[id]/+page.svelte`:

This is the core page. Structure:
1. Load event details via `api.getFormEvent(eventId)`
2. If event not found or inactive, show appropriate message
3. **Event Details header** (read-only, styled to match official form):
   - Event name, dates, description
   - Ward, stake
   - Leader name, phone, email
4. **Profile selector** (if logged in) or login prompt
5. **Contact Information section:**
   - Participant name, DOB (auto-computes age), phone
   - Address, city, state/province
   - Emergency contact, primary phone, secondary phone
6. **Medical Information section:**
   - Special diet (yes/no toggle + details)
   - Allergies (yes/no toggle + details)
   - Medications list
   - Can self-administer (yes/no)
7. **Conditions That Limit Activity:**
   - Chronic illness (yes/no + details)
   - Surgery/illness past year (yes/no + details)
   - Activity limitations (textarea)
8. **Other Accommodations** (textarea)
9. **Permission text block** (read-only, matches official form text)
10. **Signatures:**
    - Participant SignaturePad + date
    - Guardian SignaturePad + date (pre-filled if profile has saved signature)
11. **Submit button** (sticky on mobile)
12. Client-side validation before submit
13. On submit, call `api.submitForm(eventId, data)`
14. If logged in and no matching profile, prompt to save as profile
15. Redirect to success page

Use shadcn-svelte Input, Textarea, Switch, Button, Card, Separator components. Mobile-first single-column layout.

- [ ] **Step 4: Create success page**

Create `frontend/src/routes/form/[id]/success/+page.svelte`:
- Confirmation message: "Your permission form has been submitted successfully!"
- Participant name and event name displayed
- If logged in, link to dashboard
- If not logged in, simple thank-you message

- [ ] **Step 5: Test manually**

Open a form URL, fill out all fields, test with profile pre-fill, submit, verify submission appears in event dashboard.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/form/ frontend/src/lib/components/ProfileSelector.svelte
git commit -m "feat: add parent permission form with profile pre-fill and signature"
```

---

## Task 17: Frontend — Child Profiles Management

**Files:**
- Create: `frontend/src/routes/profiles/+page.svelte`

- [ ] **Step 1: Create profiles management page**

Create `frontend/src/routes/profiles/+page.svelte`:
- Redirect to login if not authenticated
- List of child profiles as cards
- Each card shows: name, DOB, computed age, emergency contact
- Edit button → opens inline edit form or modal with all profile fields
- Delete button → confirmation dialog, then delete
- "Add New Profile" button → opens empty profile form
- Profile form includes all fields from child_profiles table
- Guardian signature section with SignaturePad component
- Save/cancel buttons
- Mobile-friendly card layout

Use shadcn-svelte Card, Dialog, Button, Input, Switch components.

- [ ] **Step 2: Test manually**

Create, edit, delete profiles. Verify saved guardian signature loads in profile form.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/profiles/
git commit -m "feat: add child profiles management page with CRUD"
```

---

## Task 18: PDF HTML Template

**Files:**
- Modify: `backend/src/templates/permission-form.html`

- [ ] **Step 1: Build the full HTML template**

Create a detailed HTML template that mirrors the official church form. The template should use Handlebars syntax and include:

**Page 1:**
- Header with "Permission and Medical Release Form" title
- Introductory paragraph (exact text from official form)
- Event Details section with filled values
- Contact Information section with filled values
- Medical Information section with checkboxes (checked/unchecked) and details
- Conditions That Limit Activity section
- Other Accommodations section
- Permission text block (exact legal text from official form)
- Signature lines with:
  - For drawn signatures: `<img>` tag with base64 src
  - For typed signatures: name rendered in cursive font
  - Date next to each signature

**Page 2:**
- "Conduct at Church Activities" — full static text from the official form
- Footer: "© 2024 by Intellectual Reserve, Inc. All rights reserved."

CSS should:
- Use `@page` rules for Letter size
- Match the official form's visual structure
- Use professional, clean typography
- Print cleanly in black and white

- [ ] **Step 2: Test PDF generation**

Run: `cd backend && pnpm test -- tests/services/pdf.test.js`
Open the generated test PDF to verify layout matches the official form.

- [ ] **Step 3: Commit**

```bash
git add backend/src/templates/permission-form.html
git commit -m "feat: create PDF HTML template matching official church form layout"
```

---

## Task 19: Dockerfiles

**Files:**
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Create backend Dockerfile**

Create `backend/Dockerfile`:
```dockerfile
FROM node:20-slim

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install Chromium dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY . .

RUN mkdir -p /app/data /app/pdfs

EXPOSE 3001
CMD ["node", "src/index.js"]
```

- [ ] **Step 2: Create frontend Dockerfile**

Create `frontend/Dockerfile`:
```dockerfile
FROM node:20-slim AS build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-slim
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
EXPOSE 3000
CMD ["node", "build"]
```

Note: SvelteKit adapter-node must be configured. Install it: `cd frontend && pnpm install -D @sveltejs/adapter-node` and update `svelte.config.js` to use `adapter-node`.

- [ ] **Step 3: Update docker-compose.yml if needed**

Verify the existing `docker-compose.yml` works with these Dockerfiles.

- [ ] **Step 4: Test Docker build**

```bash
docker compose build
docker compose up -d
```

Verify both services start and the app is accessible at `http://localhost:3000`.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile frontend/Dockerfile docker-compose.yml frontend/svelte.config.js
git commit -m "feat: add Dockerfiles and finalize Docker Compose configuration"
```

---

## Task 20: End-to-End Smoke Test

**Files:** None (manual testing)

- [ ] **Step 1: Start the app**

```bash
docker compose up -d
```

- [ ] **Step 2: Test planner flow**

1. Register as planner at `http://localhost:3000/register`
2. Create an event at `/create` with all fields filled
3. Copy the generated form URL
4. View the event dashboard at `/event/:id`

- [ ] **Step 3: Test parent flow (anonymous)**

1. Open the form URL in an incognito/private window
2. Fill out all fields
3. Draw a participant signature
4. Type a guardian signature
5. Submit
6. Verify success page

- [ ] **Step 4: Test parent flow (authenticated with profile)**

1. Register as parent
2. Create a child profile at `/profiles`
3. Open the form URL
4. Select the child profile from the dropdown
5. Verify all fields pre-fill including guardian signature
6. Submit
7. Verify "Save as profile?" prompt if it's a new child

- [ ] **Step 5: Test planner dashboard**

1. Log in as planner
2. Go to event dashboard
3. Verify submissions appear
4. Download a PDF — verify it matches the official form layout
5. Test bulk download (ZIP)

- [ ] **Step 6: Test email notification (if SMTP configured)**

1. Create an event with notify_email set
2. Submit a form
3. Verify email arrives with PDF attachment

- [ ] **Step 7: Test edge cases**

1. Try submitting on an inactive event (should show error)
2. Try accessing PDF without auth (should get 401)
3. Try creating event as parent (should get 403)
4. Test on mobile device or mobile emulator

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "chore: finalize app and clean up any remaining issues"
```
