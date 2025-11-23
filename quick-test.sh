#!/bin/bash

TOKEN=$(curl -s -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])")

echo "Token: ${TOKEN:0:20}..."

echo ""
echo "Testing site creation..."
curl -X POST http://localhost:3003/api/sites \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"site_url":"https://test-curl-static.com","site_type":"static_php","max_links":20}'
