# Deployment Guide

This guide covers all deployment targets for Permish: Docker Compose on a VPS, desktop apps via Tauri, and mobile apps via Tauri Mobile.

Permish has a single backend — the **Bun + Hono + SQLite** server in `server/`. One
process handles routes, auth, PDF generation, email, and SMS. There is no separate
database service, sidecar, or backend-mode switch.

## Table of Contents

- [Docker Compose (VPS / Server)](#docker-compose-vps--server)
  - [Prerequisites](#prerequisites)
  - [Basic Deployment](#basic-deployment)
  - [Production HTTPS with Caddy](#production-https-with-caddy)
  - [Environment Variables](#environment-variables)
  - [SSL/TLS Certificates](#ssltls-certificates)
  - [Data Backup](#data-backup)
  - [Updating and Upgrading](#updating-and-upgrading)
- [Desktop App (Tauri)](#desktop-app-tauri)
  - [Prerequisites](#prerequisites-1)
  - [Server Sidecar](#server-sidecar)
  - [Building](#building)
  - [Platform Targets](#platform-targets)
  - [Code Signing](#code-signing)
  - [Distribution](#distribution)
  - [Auto-Update](#auto-update)
- [Mobile App (Tauri Mobile)](#mobile-app-tauri-mobile)
  - [iOS](#ios)
  - [Android](#android)
  - [App Store Submission Notes](#app-store-submission-notes)

---

## Docker Compose (VPS / Server)

### Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A Linux VPS (Ubuntu 22.04+ recommended) with at least 1 GB RAM
- A domain name with DNS A record pointing to the server IP (for HTTPS)
- Ports 80 and 443 open in the firewall (for HTTPS)

### Basic Deployment

```bash
git clone https://github.com/your-org/permish.git
cd permish
cp .env.example .env
# Edit .env with your values (JWT_SECRET, email settings, etc.)

docker compose up -d
```

This starts two services:

| Service    | Port | Description                          |
|------------|------|--------------------------------------|
| `server`   | 3001 | Bun + Hono + SQLite backend          |
| `frontend` | 3000 | SvelteKit app (server-rendered)      |

Access the app at `http://your-server-ip:3000`. The `frontend` container waits for the
`server` healthcheck (`/api/health`) before starting.

### Production HTTPS with Caddy

Caddy acts as a reverse proxy and automatically obtains Let's Encrypt TLS certificates for your domain. It is only started under the `production` profile.

```bash
DOMAIN=permish.app docker compose --profile production up -d
```

This adds the `caddy` service:

| Service  | Ports    | Description                         |
|----------|----------|-------------------------------------|
| `caddy`  | 80, 443  | Reverse proxy with auto HTTPS       |

Caddy routes traffic as follows:
- `/api/*` requests go to the `server` on port 3001
- All other requests go to the SvelteKit frontend on port 3000

With this profile active, you do not need to expose ports 3000 or 3001 to the internet. Caddy handles everything on ports 80 and 443.

### Environment Variables

Copy `.env.example` and fill in the values:

```bash
cp .env.example .env
```

| Variable              | Required | Default                 | Description                                     |
|-----------------------|----------|-------------------------|-------------------------------------------------|
| `JWT_SECRET`          | Yes      | `dev-secret-change-me`  | Secret for signing JWTs. **Must be a non-default value in production or the server refuses to start.** |
| `JWT_EXPIRY_SECONDS`  | No       | `86400`                 | JWT lifetime in seconds (24h)                   |
| `DOMAIN`              | HTTPS    | `localhost`             | Your domain (enables Caddy HTTPS)               |
| `PUBLIC_API_URL`      | No       | `http://localhost:3001` | Server URL as seen by the browser               |
| `FRONTEND_URL`        | No       | `http://localhost:3000` | Frontend origin (links + CORS)                  |
| `BACKEND_PORT`        | No       | `3001`                  | Host port mapped to the `server` container      |
| `FRONTEND_PORT`       | No       | `3000`                  | Host port mapped to the `frontend` container    |
| `CORS_ORIGINS`        | No       | *(empty)*               | Extra allowed origins, comma-separated          |
| `EMAIL_PROVIDER`      | Email    | `gmail`                 | `gmail` (SMTP) or `resend`                       |
| `SMTP_HOST`           | Email    | `smtp.gmail.com`        | SMTP server hostname                            |
| `SMTP_PORT`           | Email    | `587`                   | SMTP server port                                |
| `SMTP_USER`           | Email    | *(empty)*               | SMTP username                                   |
| `SMTP_PASS`           | Email    | *(empty)*               | SMTP password or app password                   |
| `RESEND_API_KEY`      | Email    | *(empty)*               | API key when `EMAIL_PROVIDER=resend`            |
| `EMAIL_FROM_NAME`     | Email    | `Permish`               | Sender display name                             |
| `EMAIL_FROM_ADDRESS`  | Email    | *(empty)*               | Sender email address                            |

Inside the `server` container, `DB_PATH`, `PDF_DIR`, and `UPLOADS_DIR` are set by the
compose file to `/app/data/permish.sqlite`, `/app/pdfs`, and `/app/uploads` (each backed
by a named volume). SMS is delivered through carrier email gateways and reuses the email
transport — there are no separate SMS credentials.

> **Warning:** Always set a strong, unique `JWT_SECRET` in production. The server exits on
> startup if `JWT_SECRET` is unset or left at the default while `NODE_ENV=production`.

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

| Volume            | Contents                              | Container path   |
|-------------------|---------------------------------------|------------------|
| `db-data`         | SQLite database (`permish.sqlite`)    | `/app/data`      |
| `pdf-storage`     | Generated PDF files                   | `/app/pdfs`      |
| `uploads-storage` | Uploaded event attachments            | `/app/uploads`   |
| `caddy_data`      | TLS certificates                      | `/data` (caddy)  |
| `caddy_config`    | Caddy configuration state             | `/config` (caddy)|

**Back up the database:**

```bash
docker compose cp server:/app/data/permish.sqlite ./backup-permish.sqlite
```

**Automated daily backup:**

The repo ships with `scripts/backup.sh`, which copies the SQLite database out of the
running `server` container, timestamps each backup, and prunes old files based on a
retention window.

```bash
# Manual run
./scripts/backup.sh /var/backups/permish 30

# crontab -e — daily at 3am, keep 30 days
0 3 * * * /path/to/permish/scripts/backup.sh /var/backups/permish 30 >> /var/log/permish-backup.log 2>&1
```

> **Tip:** SQLite runs in WAL mode, so you can safely copy the `.sqlite` file while the
> application is running.

### Updating and Upgrading

```bash
cd /path/to/permish

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

The Tauri v2 desktop app wraps the SvelteKit frontend in a native window. It is
**self-contained** — no bundled backend sidecar. Local data uses native SQLite via
`@tauri-apps/plugin-sql` and PDF generation runs client-side (pdf-lib). Server-backed
(online/hybrid) modes talk to a remote Bun server over HTTP via `PUBLIC_API_URL`.

### Prerequisites

- **Rust:** Install via rustup
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **Node.js 24 LTS + pnpm:** For the frontend build
- **Platform-specific:**
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Visual Studio C++ Build Tools, WebView2
  - Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`

### Building

```bash
cd frontend
pnpm tauri:build
```

The build output appears in `frontend/src-tauri/target/release/bundle/`.

### Platform Targets

Configured in `frontend/src-tauri/tauri.conf.json`:

| Platform | Format      | File                            |
|----------|-------------|---------------------------------|
| macOS    | `.dmg`      | `Permish_0.1.0_aarch64.dmg`     |
| Windows  | `.nsis`     | `Permish_0.1.0_x64-setup.exe`   |
| Linux    | `.appimage` | `Permish_0.1.0_amd64.AppImage`  |

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
