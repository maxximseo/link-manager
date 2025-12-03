#!/bin/bash
#
# Pre-Deployment Backup Script
#
# Run this before any deployment to ensure you have a recovery point
#
# Usage:
#   ./scripts/backup-before-deploy.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "=========================================="
echo "  Pre-Deployment Backup"
echo "  $(date)"
echo "=========================================="
echo ""

# Run the main backup script
"$SCRIPT_DIR/backup-database.sh"

echo ""
echo "=========================================="
echo "  Pre-deployment backup complete!"
echo "  You can now safely deploy."
echo "=========================================="
echo ""
