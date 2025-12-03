#!/bin/bash
#
# Full System Backup - Database + Files
#
# Runs both backup scripts and uploads to DigitalOcean Spaces
#
# Usage:
#   ./scripts/backup-all.sh
#   ./scripts/backup-all.sh --local-only
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "============================================"
echo "  FULL SYSTEM BACKUP"
echo "  $(date)"
echo "============================================"
echo ""

# Run database backup
echo ">>> Starting DATABASE backup..."
"$SCRIPT_DIR/backup-database.sh" "$@"

echo ""
echo ">>> Starting FILES backup..."
"$SCRIPT_DIR/backup-files.sh" "$@"

echo ""
echo "============================================"
echo "  ✅ FULL BACKUP COMPLETED!"
echo "============================================"
echo ""
