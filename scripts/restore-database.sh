#!/bin/bash
#
# Restore Database from Encrypted Backup
#
# Usage:
#   ./scripts/restore-database.sh backup_20251203_120000.dump.enc
#   ./scripts/restore-database.sh --list                           # List available backups
#   ./scripts/restore-database.sh --latest                         # Restore latest backup
#   ./scripts/restore-database.sh --download backup_name           # Download from Spaces only
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"

# Parse DATABASE_URL
parse_database_url() {
  if [ -n "${DATABASE_URL:-}" ]; then
    local url="${DATABASE_URL#postgresql://}"
    url="${url#postgres://}"
    local userpass="${url%%@*}"
    DB_USER="${userpass%%:*}"
    DB_PASSWORD="${userpass#*:}"
    local hostportdb="${url#*@}"
    local hostport="${hostportdb%%/*}"
    DB_HOST="${hostport%%:*}"
    DB_PORT="${hostport#*:}"
    local dbname="${hostportdb#*/}"
    DB_NAME="${dbname%%\?*}"
  fi
}

# Configure s3cmd
configure_s3cmd() {
  local s3cfg="$HOME/.s3cfg-do-backup"
  cat > "$s3cfg" << EOF
[default]
access_key = $DO_SPACES_KEY
secret_key = $DO_SPACES_SECRET
host_base = ${DO_SPACES_REGION}.digitaloceanspaces.com
host_bucket = %(bucket)s.${DO_SPACES_REGION}.digitaloceanspaces.com
use_https = True
EOF
  echo "$s3cfg"
}

# List available backups
list_backups() {
  echo -e "${YELLOW}Local backups:${NC}"
  if [ -d "$BACKUP_DIR" ]; then
    ls -lh "$BACKUP_DIR"/backup_*.dump* 2>/dev/null || echo "  (none)"
  else
    echo "  (backup directory not found)"
  fi

  echo ""
  echo -e "${YELLOW}Remote backups (DigitalOcean Spaces):${NC}"

  if [ -n "${DO_SPACES_KEY:-}" ]; then
    local s3cfg=$(configure_s3cmd)
    s3cmd -c "$s3cfg" ls "s3://${DO_SPACES_BUCKET}/backups/database/" 2>/dev/null | awk '{print "  " $3 " " $4}' || echo "  (none or error)"
    rm -f "$s3cfg"
  else
    echo "  (DO_SPACES_KEY not configured)"
  fi
}

# Download backup from Spaces
download_backup() {
  local backup_name="$1"

  if [ -z "${DO_SPACES_KEY:-}" ]; then
    echo -e "${RED}Error: DO_SPACES_KEY not configured${NC}"
    exit 1
  fi

  local s3cfg=$(configure_s3cmd)
  local s3_path="s3://${DO_SPACES_BUCKET}/backups/database/${backup_name}"
  local local_path="$BACKUP_DIR/${backup_name}"

  mkdir -p "$BACKUP_DIR"

  echo -e "${YELLOW}Downloading from Spaces...${NC}"
  s3cmd -c "$s3cfg" get "$s3_path" "$local_path"

  rm -f "$s3cfg"

  echo -e "${GREEN}Downloaded: $local_path${NC}"
  echo "$local_path"
}

# Get latest backup name from Spaces
get_latest_backup() {
  if [ -z "${DO_SPACES_KEY:-}" ]; then
    echo -e "${RED}Error: DO_SPACES_KEY not configured${NC}"
    exit 1
  fi

  local s3cfg=$(configure_s3cmd)
  local latest=$(s3cmd -c "$s3cfg" ls "s3://${DO_SPACES_BUCKET}/backups/database/" 2>/dev/null | sort | tail -1 | awk '{print $4}')
  rm -f "$s3cfg"

  if [ -z "$latest" ]; then
    echo -e "${RED}Error: No backups found in Spaces${NC}"
    exit 1
  fi

  basename "$latest"
}

# Decrypt backup
decrypt_backup() {
  local encrypted_file="$1"
  local decrypted_file="${encrypted_file%.enc}"

  if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo -e "${RED}Error: BACKUP_ENCRYPTION_KEY not set${NC}"
    exit 1
  fi

  echo -e "${YELLOW}Decrypting backup...${NC}"

  openssl enc -aes-256-cbc -d -pbkdf2 -iter 100000 \
    -in "$encrypted_file" \
    -out "$decrypted_file" \
    -pass pass:"$BACKUP_ENCRYPTION_KEY"

  echo -e "${GREEN}Decrypted: $decrypted_file${NC}"
  echo "$decrypted_file"
}

# Restore database
restore_database() {
  local dump_file="$1"

  echo -e "${YELLOW}Restoring database from: $dump_file${NC}"
  echo -e "${RED}WARNING: This will overwrite the current database!${NC}"
  read -p "Are you sure? (yes/no): " confirm

  if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
  fi

  parse_database_url

  echo -e "${YELLOW}Restoring to $DB_NAME on $DB_HOST...${NC}"

  PGPASSWORD="$DB_PASSWORD" pg_restore \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c \
    -v \
    "$dump_file" 2>&1 | tail -10

  echo -e "${GREEN}Database restored successfully!${NC}"
}

# Main
main() {
  case "${1:-}" in
    --list)
      list_backups
      ;;
    --latest)
      local backup_name=$(get_latest_backup)
      echo -e "${GREEN}Latest backup: $backup_name${NC}"
      local local_file=$(download_backup "$backup_name")

      if [[ "$local_file" == *.enc ]]; then
        local_file=$(decrypt_backup "$local_file")
      fi

      restore_database "$local_file"
      ;;
    --download)
      if [ -z "${2:-}" ]; then
        echo "Usage: $0 --download <backup_name>"
        exit 1
      fi
      download_backup "$2"
      ;;
    "")
      echo "Usage: $0 <backup_file> | --list | --latest | --download <name>"
      exit 1
      ;;
    *)
      local backup_file="$1"

      # Download from Spaces if not local
      if [ ! -f "$backup_file" ] && [ ! -f "$BACKUP_DIR/$backup_file" ]; then
        backup_file=$(download_backup "$backup_file")
      elif [ -f "$BACKUP_DIR/$backup_file" ]; then
        backup_file="$BACKUP_DIR/$backup_file"
      fi

      # Decrypt if encrypted
      if [[ "$backup_file" == *.enc ]]; then
        backup_file=$(decrypt_backup "$backup_file")
      fi

      # Decompress if needed
      if [[ "$backup_file" == *.gz ]]; then
        echo -e "${YELLOW}Decompressing...${NC}"
        gunzip -k "$backup_file"
        backup_file="${backup_file%.gz}"
      fi

      restore_database "$backup_file"
      ;;
  esac
}

main "$@"
