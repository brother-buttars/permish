# Deployment Guide

This guide covers all deployment targets for Permish: Docker Compose on a VPS, desktop apps via Tauri, and mobile apps via Tauri Mobile.

## Table of Contents

- [Docker Compose (VPS / Server)](#docker-compose-vps--server)
  - [Prerequisites](#prerequisites)
  - [Express Mode (Default)](#express-mode-default)
  - [PocketBase Mode](#pocketbase-mode)
  - [Production HTTPS with Caddy](#production-https-with-caddy)
  - [Combined: PocketBase + HTTPS](#combined-pocketbase--https)
  - [Environment Variables](#environment-variables)
  - [SSL/TLS Certificates](#ssltls-certificates)
  - [Data Backup](#data-backup)
  - [Updating and Upgrading](#updating-and-upgrading)
- [Desktop App (Tauri)](#desktop-app-tauri)
  - [Prerequisites](#prerequisites-1)
  - [Sidecar Binaries](#sidecar-binaries)
  - [Building](#building)
  - [Platform Targets](#platform-targets)
  - [Code Signing](#code-signing)
  - [Distribution](#distribution)
  - [Auto-Update](#auto-update)
- [Mobile App (Tauri Mobile)](#mobile-app-tauri-mobile)
  - [iOS](#ios)
  - [Android](#android)
  - [App Store Submission Notes](#app-store-submission-notes)
- [Data Migration (SQLite to PocketBase)](#data-migration-sqlite-to-pocketbase)

---

## Docker Compose (VPS / Server)

### Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A Linux VPS (Ubuntu 22.04+ recommended) with at least 1 GB RAM
- A domain name with DNS A record pointing to the server IP (for HTTPS)
- Ports 80 and 443 open in the firewall (for HTTPS)

### Express Mode (Default)

The simplest deployment. Uses the Express backend with SQLite for data storage.

```bash
git clone https://github.com/your-org/PermissionForm.git
cd PermissionForm
cp .env.example .env
# Edit .env with your values (JWT_SECRET, email settings, etc.)

docker compose up -d
```

This starts:

| Service    | Port | Description                     |
|------------|------|---------------------------------|
| `backend`  | 3001 | Express API server              |
| `frontend` | 3000 | SvelteKit app (server-rendered) |

Access the app at `http://your-server-ip:3000`.

### PocketBase Mode

Replaces the Express backend with PocketBase for data storage. A Node.js sidecar service handles PDF generation, email, and SMS since PocketBase cannot do those natively.

```bash
PUBLIC_BACKEND=pocketbase docker compose --profile pocketbase up -d
```

This starts:

| Service     | Port | Description                              |
|-------------|------|------------------------------------------|
| `pocketbase`| 8090 | PocketBase (auth, CRUD, realtime)        |
| `sidecar`   | 3002 | Node.js service (PDF, email, SMS)        |
| `frontend`  | 3000 | SvelteKit app                            |
| `backend`   | 3001 | Express (still runs, but frontend bypasses it) |

> **Note:** The `backend` container still starts because the frontend depends on it for healthchecks. You can safely ignore it in PocketBase mode.

### Production HTTPS with Caddy

Caddy acts as a reverse proxy and automatically obtains Let's Encrypt TLS certificates for your domain.

```bash
DOMAIN=permish.app docker compose --profile production up -d
```

This adds the `caddy` service:

| Service  | Ports    | Description                         |
|----------|----------|-------------------------------------|
| `caddy`  | 80, 443  | Reverse proxy with auto HTTPS       |

Caddy routes traffic as follows:
- `/api/*` requests go to the Express backend on port 3001
- All other requests go to the SvelteKit frontend on port 3000

With this profile active, you do not need to expose ports 3000 or 3001 to the internet. Caddy handles everything on ports 80 and 443.

### Combined: PocketBase + HTTPS

For production PocketBase deployments with automatic HTTPS:

```bash
DOMAIN=permish.app PUBLIC_BACKEND=pocketbase \
  docker compose --profile pocketbase --profile production up -d
```

### Environment Variables

Copy `.env.example` and fill in the values:

```bash
cp .env.example .env
```

| Variable              | Required | Default                | Description                           |
|-----------------------|----------|------------------------|---------------------------------------|
| `JWT_SECRET`          | Yes      | -                      | Secret key for signing JWT tokens     |
| `DOMAIN`              | HTTPS    | `localhost`            | Your domain (enables Caddy HTTPS)     |
| `PUBLIC_BACKEND`      | No       | `express`              | `express` or `pocketbase`             |
| `PUBLIC_API_URL`      | No       | `http://localhost:3001` | Backend API URL seen by the browser  |
| `PUBLIC_PB_URL`       | No       | `http://localhost:8090` | PocketBase URL (PocketBase mode)     |
| `PUBLIC_SIDECAR_URL`  | No       | `http://localhost:3002` | Sidecar URL (PocketBase mode)        |
| `BACKEND_PORT`        | No       | `3001`                 | Host port for Express backend         |
| `FRONTEND_PORT`       | No       | `3000`                 | Host port for SvelteKit frontend      |
| `PB_PORT`             | No       | `8090`                 | Host port for PocketBase              |
| `SIDECAR_PORT`        | No       | `3002`                 | Host port for Node.js sidecar         |
| `PB_ADMIN_EMAIL`      | PB mode  | -                      | PocketBase superuser email            |
| `PB_ADMIN_PASSWORD`   | PB mode  | -                      | PocketBase superuser password         |
| `EMAIL_HOST`          | Email    | -                      | SMTP server hostname                  |
| `EMAIL_PORT`          | Email    | `587`                  | SMTP server port                      |
| `EMAIL_USER`          | Email    | -                      | SMTP username                         |
| `EMAIL_PASS`          | Email    | -                      | SMTP password or app password         |
| `EMAIL_FROM`          | Email    | -                      | Sender email address                  |

> **Warning:** Always set a strong, unique `JWT_SECRET` in production. Never use the default or leave it empty.

### SSL/TLS Certificates

When using the `production` profile, Caddy handles TLS automatically:

- Certificates are obtained from Let's Encrypt on the first request
- Certificates renew automatically 30 days before expiry (90-day lifetime)
- HTTP/3 (QUIC) is enabled by default on UDP port 443
- HSTS headers are set with a one-year max-age and `includeSubDomains`
- Certificate data is persisted in the `caddy_data` Docker volume

No manual certificate management is needed. Just set `DOMAIN` to your domain and ensure DNS points to the server.

### Data Backup

All persistent data is stored in Docker volumes:

| Volume            | Contents                           | Mode    |
|-------------------|------------------------------------|---------|
| `db-data`         | SQLite database (`permish.db`)     | Express |
| `pdf-storage`     | Generated PDF files                | Both    |
| `uploads-storage` | Uploaded event attachments         | Express |
| `pb-data`         | PocketBase database and files      | PB      |
| `caddy_data`      | TLS certificates                   | HTTPS   |
| `caddy_config`    | Caddy configuration state          | HTTPS   |

**Backup the database volume:**

```bash
# Express mode — copy SQLite file out of the volume
docker compose cp backend:/app/data/permish.db ./backup-permish.db

# PocketBase mode — copy PB data directory
docker compose cp pocketbase:/pb/pb_data ./backup-pb-data
```

**Automated daily backup (cron example):**

```bash
# Add to crontab: crontab -e
0 3 * * * docker compose -f /path/to/docker-compose.yml cp backend:/app/data/permish.db /backups/permish-$(date +\%F).db
```

> **Tip:** SQLite supports hot backups since it uses WAL mode. You can safely copy the `.db` file while the application is running.

### Updating and Upgrading

```bash
cd /path/to/PermissionForm

# Pull latest code
git pull

# Rebuild and restart containers
docker compose build
docker compose up -d

# Or, rebuild a single service
docker compose build frontend
docker compose up -d frontend
```

Docker Compose preserves volumes across rebuilds, so your data is safe.

---

## Desktop App (Tauri)

The Tauri desktop app bundles the SvelteKit frontend with embedded PocketBase and a Node.js sidecar for PDF/email/SMS. It runs fully offline on the user's machine.

### Prerequisites

- **Rust:** Install via rustup
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **Node.js 24 LTS:** Managed via nvm (see `.nvmrc`)
- **pnpm:** Package manager
- **Bun:** Required to compile the Node sidecar binary
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **Platform-specific:**
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Visual Studio C++ Build Tools, WebView2
  - Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`

### Sidecar Binaries

The desktop app ships two sidecar binaries that must be placed in `frontend/src-tauri/sidecars/`. These are not checked into git.

**PocketBase sidecar:**

Download from [pocketbase.io/docs](https://pocketbase.io/docs/) and rename to match Tauri's target triple convention:

| Platform             | Filename                                     |
|----------------------|----------------------------------------------|
| macOS Intel          | `pocketbase-x86_64-apple-darwin`             |
| macOS Apple Silicon  | `pocketbase-aarch64-apple-darwin`            |
| Windows              | `pocketbase-x86_64-pc-windows-msvc.exe`     |
| Linux                | `pocketbase-x86_64-unknown-linux-gnu`        |

**Node sidecar:**

Build from the `sidecar/` directory using Bun:

```bash
cd sidecar
npm install
bun build --compile --target=bun-darwin-arm64 ./src/index.js \
  --outfile ../frontend/src-tauri/sidecars/node-sidecar-aarch64-apple-darwin
```

Bun compile targets:

| Platform             | Bun target           |
|----------------------|----------------------|
| macOS Intel          | `bun-darwin-x64`     |
| macOS Apple Silicon  | `bun-darwin-arm64`   |
| Windows              | `bun-windows-x64`    |
| Linux                | `bun-linux-x64`      |

### Building

```bash
cd frontend
pnpm tauri:build
```

This runs `pnpm build:desktop` first (sets `PUBLIC_BACKEND=pocketbase` and local PocketBase/sidecar URLs), then compiles the Tauri app.

The build output appears in `frontend/src-tauri/target/release/bundle/`.

### Platform Targets

Configured in `frontend/src-tauri/tauri.conf.json`:

| Platform | Format      | File                     |
|----------|-------------|--------------------------|
| macOS    | `.dmg`      | `Permish_0.1.0_aarch64.dmg` |
| Windows  | `.nsis`     | `Permish_0.1.0_x64-setup.exe` |
| Linux    | `.appimage` | `Permish_0.1.0_amd64.AppImage` |

### Code Signing

**macOS:**
- Requires an Apple Developer account ($99/year)
- Set `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, and `APPLE_SIGNING_IDENTITY` environment variables
- Notarization: set `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID`

**Windows:**
- Requires an EV code signing certificate
- Set `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Without code signing, users will see "unidentified developer" warnings on macOS and SmartScreen warnings on Windows.

### Distribution

Recommended: GitHub Releases via CI/CD.

A GitHub Actions workflow can build for all platforms on push to a release tag:

```yaml
# .github/workflows/release.yml (simplified)
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: pnpm install
        working-directory: frontend
      # Download and place sidecar binaries here
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: frontend
```

### Auto-Update

Tauri supports built-in auto-update via the updater plugin. Configure an update endpoint that returns the latest version metadata. Users are prompted to update when a new version is available.

---

## Mobile App (Tauri Mobile)

Tauri 2 supports iOS and Android builds using the same SvelteKit frontend.

### iOS

**Prerequisites:**
- macOS with Xcode 15+ installed (includes iOS SDK)
- Apple Developer account (for device testing and App Store submission)

**Setup and build:**

```bash
cd frontend

# One-time initialization
pnpm tauri ios init

# Development (runs in iOS Simulator)
pnpm tauri:ios

# Release build
pnpm tauri:ios:build
```

### Android

**Prerequisites:**
- Android Studio with:
  - Android SDK (API 33+)
  - Android NDK
  - Java JDK 17+
- `ANDROID_HOME` and `NDK_HOME` environment variables set

**Setup and build:**

```bash
cd frontend

# One-time initialization
pnpm tauri android init

# Development (runs in Android Emulator or connected device)
pnpm tauri:android

# Release build
pnpm tauri:android:build
```

### App Store Submission Notes

**Apple App Store:**
- App must be signed with a distribution certificate (not development)
- Requires App Store Connect setup: app listing, screenshots, privacy policy
- Review process typically takes 1-3 business days
- The app uses local data storage only, which simplifies privacy review

**Google Play Store:**
- Requires a Google Play Developer account ($25 one-time)
- App bundle (`.aab`) format required for Play Store
- Closed testing track recommended before production release

---

## Data Migration (SQLite to PocketBase)

If you are switching from Express mode to PocketBase mode on an existing deployment, use the migration script to transfer all data.

### What Gets Migrated

| SQLite Table      | PocketBase Collection | Notes                                      |
|-------------------|-----------------------|--------------------------------------------|
| `users`           | `users` (auth)        | Temporary passwords assigned; users must reset |
| `events`          | `events`              | Preserves UUIDs and all fields             |
| `event_attachments` | `event_attachments` | Uploads files from disk into PocketBase    |
| `child_profiles`  | `child_profiles`      | Boolean conversion (0/1 to true/false)     |
| `submissions`     | `submissions`         | Full field mapping with boolean conversion |

Migration respects foreign key relationships: users, then events, then attachments, then child profiles, then submissions.

### Prerequisites

1. PocketBase running with collections already created (via `pb_migrations/`)
2. PocketBase superuser account created
3. Access to the existing SQLite database file
4. If migrating attachments: access to the `backend/uploads/` directory

### Run the Migration

```bash
cd scripts
npm install
```

**Dry run first (preview only, writes nothing):**

```bash
SQLITE_PATH=../backend/data/permish.db \
PB_URL=http://localhost:8090 \
DRY_RUN=true \
node migrate-to-pocketbase.js
```

**Execute the migration:**

```bash
SQLITE_PATH=../backend/data/permish.db \
PB_URL=http://localhost:8090 \
PB_ADMIN_EMAIL=admin@example.com \
PB_ADMIN_PASSWORD=your-password \
node migrate-to-pocketbase.js
```

**Execute and send password reset emails:**

```bash
SQLITE_PATH=../backend/data/permish.db \
PB_URL=http://localhost:8090 \
PB_ADMIN_EMAIL=admin@example.com \
PB_ADMIN_PASSWORD=your-password \
SEND_RESET_EMAILS=true \
node migrate-to-pocketbase.js
```

### Migration Environment Variables

| Variable             | Default                     | Description                            |
|----------------------|-----------------------------|----------------------------------------|
| `SQLITE_PATH`       | `./backend/data/permish.db` | Path to existing SQLite database       |
| `PB_URL`            | `http://localhost:8090`     | PocketBase server URL                  |
| `PB_ADMIN_EMAIL`    | *(required)*                | PocketBase superuser email             |
| `PB_ADMIN_PASSWORD` | *(required)*                | PocketBase superuser password          |
| `UPLOADS_DIR`       | `./backend/uploads`         | Directory containing uploaded files    |
| `DRY_RUN`           | `false`                     | Preview without writing                |
| `SEND_RESET_EMAILS` | `false`                     | Send password reset emails after migration |

### Password Handling

bcrypt password hashes from SQLite cannot be transferred into PocketBase. The migration script:

1. Creates each user with a random 64-character temporary password
2. Logs all migrated users who need a password reset
3. Optionally sends PocketBase password reset emails (`SEND_RESET_EMAILS=true`)

All migrated users must use the "Forgot Password" flow to set a new password.

### Re-running the Migration

The script does not delete existing PocketBase records. If you need to re-run, either clear the PocketBase collections first or expect duplicate-ID errors for records that already exist.
