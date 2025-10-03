#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check requirements
command -v psql >/dev/null 2>&1 || { print_error "PostgreSQL not installed"; exit 1; }
command -v node >/dev/null 2>&1 || { print_error "Node.js not installed"; exit 1; }

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js 16+ required (you have v$NODE_VERSION)"
    exit 1
fi

print_status "Requirements met"

# Install dependencies first
print_info "Installing dependencies..."
npm install >/dev/null 2>&1 || { print_error "npm install failed"; exit 1; }
print_status "Dependencies installed"

# Generate bcrypt hash for admin password
print_info "Generating password hash..."
ADMIN_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('admin123', 10).then(h => console.log(h))")

# Database setup
print_info "Setting up database..."
dropdb --if-exists linkmanager 2>/dev/null
createdb linkmanager || { print_error "Database creation failed"; exit 1; }

# Update seed.sql with generated hash
sed -i.bak "s/\$2b\$10\$YourBcryptHashHere/$ADMIN_HASH/" database/seed.sql

psql -d linkmanager -f database/init.sql >/dev/null || { print_error "Schema creation failed"; exit 1; }
psql -d linkmanager -f database/seed.sql >/dev/null || { print_error "Data seeding failed"; exit 1; }

print_status "Database ready"

# Start server
print_info "Starting server..."
npm run dev > /dev/null 2>&1 &
SERVER_PID=$!

# Wait for server
for i in {1..30}; do
    if curl -s http://localhost:3003/api/health > /dev/null 2>&1; then
        print_status "Server running on http://localhost:3003 (PID: $SERVER_PID)"
        break
    fi
    sleep 2
done

# Test API
print_info "Testing API..."
TOKEN=$(curl -s -X POST http://localhost:3003/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

if [ "$TOKEN" != "null" ]; then
    print_status "Login successful (token: ${TOKEN:0:20}...)"

    PROJECTS=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3003/api/projects | jq -r '.pagination.total')
    SITES=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3003/api/sites | jq -r '.pagination.total')

    print_status "Projects: $PROJECTS"
    print_status "Sites: $SITES"
else
    print_error "Login failed"
fi

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🚀 LINK MANAGER READY${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "📍 URL:        ${BLUE}http://localhost:3003${NC}"
echo -e "👤 Username:   ${BLUE}admin${NC}"
echo -e "🔑 Password:   ${BLUE}admin123${NC}"
echo -e "🆔 Server PID: ${BLUE}$SERVER_PID${NC}"
echo ""
echo -e "Stop server:   ${YELLOW}kill $SERVER_PID${NC}"
echo ""
