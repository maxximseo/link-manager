#!/bin/bash

# Test registration token flow
echo "=== Testing Registration Token Flow ==="
echo ""

# Step 1: Login
echo "1. Logging in as admin..."
LOGIN_RESPONSE=$(curl -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  -s)

TOKEN=$(echo $LOGIN_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Logged in successfully"
echo ""

# Step 2: Generate registration token
echo "2. Generating registration token..."
GEN_RESPONSE=$(curl -X POST http://localhost:3003/api/sites/generate-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"label":"Test Token","max_uses":5,"expires_at":"2025-12-31T23:59:59Z"}' \
  -s)

REG_TOKEN=$(echo $GEN_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])" 2>/dev/null)

if [ -z "$REG_TOKEN" ]; then
  echo "❌ Token generation failed"
  echo "$GEN_RESPONSE"
  exit 1
fi

echo "✅ Token generated: ${REG_TOKEN:0:20}..."
echo ""

# Step 3: Get all tokens
echo "3. Fetching all tokens..."
TOKENS_RESPONSE=$(curl -X GET http://localhost:3003/api/sites/tokens \
  -H "Authorization: Bearer $TOKEN" \
  -s)

echo "Response: $TOKENS_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin.split('Response: ')[1])
print(f\"✅ Found {len(data.get('data', []))} token(s)\")
for token in data.get('data', []):
    print(f\"  - {token['label']}: {token['current_uses']}/{token['max_uses']} uses\")
"

echo ""

# Step 4: Test WordPress registration
echo "4. Testing WordPress site registration..."
WP_RESPONSE=$(curl -X POST http://localhost:3003/api/sites/register-from-wordpress \
  -H "Content-Type: application/json" \
  -d "{\"registration_token\":\"$REG_TOKEN\",\"site_url\":\"https://test-$(date +%s).com\",\"api_key\":\"api_test_123\"}" \
  -s)

SITE_ID=$(echo $WP_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('site_id', 'N/A'))" 2>/dev/null)

if [ "$SITE_ID" == "N/A" ]; then
  echo "❌ WordPress registration failed"
  echo "$WP_RESPONSE"
else
  echo "✅ Site registered successfully (ID: $SITE_ID)"
fi

echo ""
echo "=== Test Complete ==="
