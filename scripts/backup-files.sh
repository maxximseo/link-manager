#!/bin/bash
#
# Encrypted Files Backup to DigitalOcean Spaces
#
# Features:
# - Archives project files (code, configs, assets)
# - AES-256 encryption with OpenSSL
# - Upload to DigitalOcean Spaces via s3cmd
# - Excludes: node_modules, .git, logs, backups, .env
#
# Usage:
#   ./scripts/backup-files.sh
#   ./scripts/backup-files.sh --local-only    # Skip upload to Spaces
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
BACKUP_NAME="files_${TIMESTAMP}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
LOCAL_ONLY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --local-only)
      LOCAL_ONLY=true
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

  # Encryption key
  if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
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
  if [ ${#BACKUP_ENCRYPTION_KEY} -lt 32 ]; then
    echo -e "${RED}Error: BACKUP_ENCRYPTION_KEY must be at least 32 characters${NC}"
    exit 1
  fi
}

# Create backup directory
setup_backup_dir() {
  mkdir -p "$BACKUP_DIR"
  echo -e "${GREEN}Backup directory: $BACKUP_DIR${NC}"
}

# Create files archive
create_archive() {
  echo -e "${YELLOW}Creating files archive...${NC}"

  ARCHIVE_FILE="$BACKUP_DIR/${BACKUP_NAME}.tar.gz"

  # Create tar archive excluding unnecessary files
  tar -czf "$ARCHIVE_FILE" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='logs' \
    --exclude='backups' \
    --exclude='.env' \
    --exclude='*.log' \
    --exclude='*.dump' \
    --exclude='*.dump.enc' \
    --exclude='*.tar.gz' \
    --exclude='*.tar.gz.enc' \
    --exclude='.DS_Store' \
    -C "$(dirname "$PROJECT_DIR")" \
    "$(basename "$PROJECT_DIR")"

  if [ ! -f "$ARCHIVE_FILE" ]; then
    echo -e "${RED}Error: Archive file was not created${NC}"
    exit 1
  fi

  local size
  size=$(du -h "$ARCHIVE_FILE" | cut -f1)
  echo -e "${GREEN}Archive created: $ARCHIVE_FILE ($size)${NC}"
}

# Encrypt backup
encrypt_backup() {
  local input_file="$1"
  BACKUP_FILE="${input_file}.enc"

  echo -e "${YELLOW}Encrypting backup with AES-256...${NC}"

  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
    -in "$input_file" \
    -out "$BACKUP_FILE" \
    -pass pass:"$BACKUP_ENCRYPTION_KEY"

  # Remove unencrypted archive
  rm -f "$input_file"

  local size=$(du -h "$BACKUP_FILE" | cut -f1)
  echo -e "${GREEN}Encrypted: $BACKUP_FILE ($size)${NC}"
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
  local s3_path="s3://${DO_SPACES_BUCKET}/backups/files/${filename}"

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
  echo -e "${YELLOW}Cleaning up local file backups older than $RETENTION_DAYS days...${NC}"

  local count=$(find "$BACKUP_DIR" -name "files_*.tar.gz*" -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)

  if [ "$count" -gt 0 ]; then
    find "$BACKUP_DIR" -name "files_*.tar.gz*" -mtime +$RETENTION_DAYS -delete
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

  echo -e "${YELLOW}Cleaning up remote file backups older than $RETENTION_DAYS days...${NC}"

  local s3cfg=$(configure_s3cmd)
  local cutoff_date=$(date -v-${RETENTION_DAYS}d +%Y%m%d 2>/dev/null || date -d "-$RETENTION_DAYS days" +%Y%m%d)

  # List and delete old backups
  s3cmd -c "$s3cfg" ls "s3://${DO_SPACES_BUCKET}/backups/files/" 2>/dev/null | while read -r line; do
    local file_date=$(echo "$line" | grep -oE 'files_[0-9]{8}' | sed 's/files_//')
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
  echo "  Files Backup Script"
  echo "  $(date)"
  echo "=========================================="
  echo ""

  # Validate environment
  validate_env

  # Setup
  setup_backup_dir

  # Create archive
  create_archive

  # Encrypt
  encrypt_backup "$ARCHIVE_FILE"

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
  echo -e "${GREEN}  Files backup completed successfully!${NC}"
  echo "  File: $BACKUP_FILE"
  echo "=========================================="
  echo ""
}

# Run main
main
