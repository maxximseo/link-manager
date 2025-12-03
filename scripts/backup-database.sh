#!/bin/bash
#
# Encrypted Database Backup to DigitalOcean Spaces
#
# Features:
# - PostgreSQL dump with pg_dump
# - AES-256 encryption with OpenSSL
# - Upload to DigitalOcean Spaces via s3cmd
# - Automatic cleanup of old backups (local + remote)
# - Slack/email notification support (optional)
#
# Required environment variables:
# - DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (or DATABASE_URL)
# - BACKUP_ENCRYPTION_KEY (min 32 characters)
# - DO_SPACES_KEY, DO_SPACES_SECRET
# - DO_SPACES_BUCKET, DO_SPACES_REGION
#
# Usage:
#   ./scripts/backup-database.sh
#   ./scripts/backup-database.sh --local-only    # Skip upload to Spaces
#   ./scripts/backup-database.sh --no-encrypt    # Skip encryption (NOT recommended)
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
else
  echo -e "${RED}Error: .env file not found at $PROJECT_DIR/.env${NC}"
  exit 1
fi

# Configuration
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="backup_${TIMESTAMP}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
LOCAL_ONLY=false
ENCRYPT=true

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --local-only)
      LOCAL_ONLY=true
      shift
      ;;
    --no-encrypt)
      ENCRYPT=false
      echo -e "${YELLOW}Warning: Encryption disabled. Backup will be stored unencrypted.${NC}"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required variables
validate_env() {
  local missing=()

  # Database connection
  if [ -z "${DATABASE_URL:-}" ]; then
    [ -z "${DB_HOST:-}" ] && missing+=("DB_HOST")
    [ -z "${DB_PORT:-}" ] && missing+=("DB_PORT")
    [ -z "${DB_USER:-}" ] && missing+=("DB_USER")
    [ -z "${DB_PASSWORD:-}" ] && missing+=("DB_PASSWORD")
    [ -z "${DB_NAME:-}" ] && missing+=("DB_NAME")
  fi

  # Encryption key
  if [ "$ENCRYPT" = true ] && [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    missing+=("BACKUP_ENCRYPTION_KEY")
  fi

  # DigitalOcean Spaces (only if not local-only)
  if [ "$LOCAL_ONLY" = false ]; then
    [ -z "${DO_SPACES_KEY:-}" ] && missing+=("DO_SPACES_KEY")
    [ -z "${DO_SPACES_SECRET:-}" ] && missing+=("DO_SPACES_SECRET")
    [ -z "${DO_SPACES_BUCKET:-}" ] && missing+=("DO_SPACES_BUCKET")
    [ -z "${DO_SPACES_REGION:-}" ] && missing+=("DO_SPACES_REGION")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${RED}Error: Missing required environment variables:${NC}"
    printf '  - %s\n' "${missing[@]}"
    exit 1
  fi

  # Validate encryption key length
  if [ "$ENCRYPT" = true ] && [ ${#BACKUP_ENCRYPTION_KEY} -lt 32 ]; then
    echo -e "${RED}Error: BACKUP_ENCRYPTION_KEY must be at least 32 characters${NC}"
    exit 1
  fi
}

# Parse DATABASE_URL if provided
parse_database_url() {
  if [ -n "${DATABASE_URL:-}" ]; then
    # Extract components from DATABASE_URL
    # Format: postgresql://user:password@host:port/database?sslmode=require

    # Remove protocol
    local url="${DATABASE_URL#postgresql://}"
    url="${url#postgres://}"

    # Extract user:password
    local userpass="${url%%@*}"
    DB_USER="${userpass%%:*}"
    DB_PASSWORD="${userpass#*:}"

    # Extract host:port/database
    local hostportdb="${url#*@}"
    local hostport="${hostportdb%%/*}"
    DB_HOST="${hostport%%:*}"
    DB_PORT="${hostport#*:}"

    # Extract database (remove query params)
    local dbname="${hostportdb#*/}"
    DB_NAME="${dbname%%\?*}"
  fi
}

# Create backup directory
setup_backup_dir() {
  mkdir -p "$BACKUP_DIR"
  echo -e "${GREEN}Backup directory: $BACKUP_DIR${NC}"
}

# Find pg_dump binary
find_pg_dump() {
  # Check common locations
  local locations=(
    "/opt/homebrew/opt/postgresql@17/bin/pg_dump"
    "/opt/homebrew/opt/postgresql@16/bin/pg_dump"
    "/opt/homebrew/bin/pg_dump"
    "/usr/local/bin/pg_dump"
    "/usr/bin/pg_dump"
  )

  for loc in "${locations[@]}"; do
    if [ -x "$loc" ]; then
      echo "$loc"
      return 0
    fi
  done

  # Try which as fallback
  if command -v pg_dump &> /dev/null; then
    which pg_dump
    return 0
  fi

  echo ""
}

# Create database dump
# Sets global DUMP_FILE variable with the path
create_dump() {
  echo -e "${YELLOW}Creating database dump...${NC}"

  local pg_dump_bin
  pg_dump_bin=$(find_pg_dump)
  if [ -z "$pg_dump_bin" ]; then
    echo -e "${RED}Error: pg_dump not found. Install PostgreSQL or add to PATH${NC}"
    exit 1
  fi

  echo "Using pg_dump: $pg_dump_bin"

  DUMP_FILE="$BACKUP_DIR/${BACKUP_NAME}.dump"

  PGPASSWORD="$DB_PASSWORD" "$pg_dump_bin" \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -F c \
    -b \
    -f "$DUMP_FILE"

  if [ ! -f "$DUMP_FILE" ]; then
    echo -e "${RED}Error: Dump file was not created${NC}"
    exit 1
  fi

  local size
  size=$(du -h "$DUMP_FILE" | cut -f1)
  echo -e "${GREEN}Dump created: $DUMP_FILE ($size)${NC}"
}

# Encrypt backup
# Updates global BACKUP_FILE variable with encrypted file path
encrypt_backup() {
  local input_file="$1"
  BACKUP_FILE="${input_file}.enc"

  echo -e "${YELLOW}Encrypting backup with AES-256...${NC}"

  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
    -in "$input_file" \
    -out "$BACKUP_FILE" \
    -pass pass:"$BACKUP_ENCRYPTION_KEY"

  # Remove unencrypted dump
  rm -f "$input_file"

  local size=$(du -h "$BACKUP_FILE" | cut -f1)
  echo -e "${GREEN}Encrypted: $BACKUP_FILE ($size)${NC}"
}

# Compress backup (if not encrypted)
# Updates global BACKUP_FILE variable with compressed file path
compress_backup() {
  local input_file="$1"

  echo -e "${YELLOW}Compressing backup...${NC}"

  gzip "$input_file"
  BACKUP_FILE="${input_file}.gz"

  local size=$(du -h "$BACKUP_FILE" | cut -f1)
  echo -e "${GREEN}Compressed: $BACKUP_FILE ($size)${NC}"
}

# Configure s3cmd for DigitalOcean Spaces
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

# Upload to DigitalOcean Spaces
upload_to_spaces() {
  local file="$1"
  local filename=$(basename "$file")
  local s3_path="s3://${DO_SPACES_BUCKET}/backups/database/${filename}"

  echo -e "${YELLOW}Uploading to DigitalOcean Spaces...${NC}"

  # Check if s3cmd is installed
  if ! command -v s3cmd &> /dev/null; then
    echo -e "${RED}Error: s3cmd is not installed${NC}"
    echo "Install with: brew install s3cmd (macOS) or apt install s3cmd (Linux)"
    return 1
  fi

  local s3cfg=$(configure_s3cmd)

  s3cmd -c "$s3cfg" put "$file" "$s3_path" --acl-private

  echo -e "${GREEN}Uploaded to: $s3_path${NC}"

  # Cleanup s3cfg
  rm -f "$s3cfg"
}

# Cleanup old local backups
cleanup_local() {
  echo -e "${YELLOW}Cleaning up local backups older than $RETENTION_DAYS days...${NC}"

  local count=$(find "$BACKUP_DIR" -name "backup_*.dump*" -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)

  if [ "$count" -gt 0 ]; then
    find "$BACKUP_DIR" -name "backup_*.dump*" -mtime +$RETENTION_DAYS -delete
    echo -e "${GREEN}Removed $count old backup(s)${NC}"
  else
    echo -e "${GREEN}No old backups to remove${NC}"
  fi
}

# Cleanup old remote backups
cleanup_remote() {
  if [ "$LOCAL_ONLY" = true ]; then
    return
  fi

  echo -e "${YELLOW}Cleaning up remote backups older than $RETENTION_DAYS days...${NC}"

  local s3cfg=$(configure_s3cmd)
  local cutoff_date=$(date -v-${RETENTION_DAYS}d +%Y%m%d 2>/dev/null || date -d "-$RETENTION_DAYS days" +%Y%m%d)

  # List and delete old backups
  s3cmd -c "$s3cfg" ls "s3://${DO_SPACES_BUCKET}/backups/database/" 2>/dev/null | while read -r line; do
    local file_date=$(echo "$line" | grep -oE 'backup_[0-9]{8}' | sed 's/backup_//')
    if [ -n "$file_date" ] && [ "$file_date" -lt "$cutoff_date" ]; then
      local file_path=$(echo "$line" | awk '{print $4}')
      echo "Deleting old backup: $file_path"
      s3cmd -c "$s3cfg" del "$file_path" 2>/dev/null || true
    fi
  done

  rm -f "$s3cfg"
  echo -e "${GREEN}Remote cleanup complete${NC}"
}

# Main execution
main() {
  echo ""
  echo "=========================================="
  echo "  Database Backup Script"
  echo "  $(date)"
  echo "=========================================="
  echo ""

  # Validate environment
  parse_database_url
  validate_env

  # Setup
  setup_backup_dir

  # Create dump (sets DUMP_FILE global)
  create_dump

  # Encrypt or compress (updates BACKUP_FILE global)
  if [ "$ENCRYPT" = true ]; then
    encrypt_backup "$DUMP_FILE"
  else
    compress_backup "$DUMP_FILE"
  fi

  # Upload to Spaces
  if [ "$LOCAL_ONLY" = false ]; then
    upload_to_spaces "$BACKUP_FILE"
  else
    echo -e "${YELLOW}Skipping upload (--local-only mode)${NC}"
  fi

  # Cleanup old backups
  cleanup_local
  cleanup_remote

  echo ""
  echo "=========================================="
  echo -e "${GREEN}  Backup completed successfully!${NC}"
  echo "  File: $BACKUP_FILE"
  echo "=========================================="
  echo ""
}

# Run main
main
