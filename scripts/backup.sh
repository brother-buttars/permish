#!/usr/bin/env bash
# Permish — automated SQLite backup
#
# Usage:
#   scripts/backup.sh [BACKUP_DIR] [RETENTION_DAYS]
#
# Defaults:
#   BACKUP_DIR=/var/backups/permish
#   RETENTION_DAYS=30
#
# Example crontab entry (daily at 3am, retain 30 days):
#   0 3 * * * /path/to/permish/scripts/backup.sh /var/backups/permish 30 >> /var/log/permish-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${1:-/var/backups/permish}"
RETENTION_DAYS="${2:-30}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +%F-%H%M%S)"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

if docker compose ps --services --filter status=running 2>/dev/null | grep -q '^backend$'; then
  OUT="$BACKUP_DIR/permish-$TIMESTAMP.db"
  docker compose cp backend:/app/data/permish.db "$OUT"
  echo "[$(date -Iseconds)] Express backup -> $OUT"
fi

if docker compose ps --services --filter status=running 2>/dev/null | grep -q '^pocketbase$'; then
  OUT="$BACKUP_DIR/pb_data-$TIMESTAMP.tar.gz"
  docker compose cp pocketbase:/pb/pb_data - | gzip > "$OUT"
  echo "[$(date -Iseconds)] PocketBase backup -> $OUT"
fi

find "$BACKUP_DIR" -type f \( -name 'permish-*.db' -o -name 'pb_data-*.tar.gz' \) -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -Iseconds)] Pruned backups older than $RETENTION_DAYS days"
