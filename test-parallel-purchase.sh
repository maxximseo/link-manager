#!/bin/bash

# Test parallel purchase of 3 placements
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEwNzIsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NjMzMjM2OTUsImV4cCI6MTc2MzkyODQ5NX0.xqqcLQIPyJYdjxekEimzbIOU7g4zFMZqpqZJMyI0VA4"

echo "🚀 Starting parallel purchase test (3 placements)..."
echo "Project: sevenchickens.com (ID: 1216)"
echo "Sites: jetsowner.com, cabofriense.com, mammothgayski.com"
echo ""

# Start timing
START_TIME=$(python3 -c "import time; print(time.time())")

# Purchase 1: Site 1089 + Link 2153
(
  echo "📦 Purchase 1: jetsowner.com + 'chicken road' (link 2153)"
  RESULT=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3003/api/billing/purchase \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"projectId":1216,"siteId":1089,"type":"link","contentIds":[2153]}')
  HTTP_CODE=$(echo "$RESULT" | tail -1)
  BODY=$(echo "$RESULT" | head -n -1)
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✅ Purchase 1 SUCCESS (HTTP $HTTP_CODE)"
  else
    echo "❌ Purchase 1 FAILED (HTTP $HTTP_CODE)"
    echo "Response: $BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  fi
) &

# Purchase 2: Site 1013 + Link 2154
(
  echo "📦 Purchase 2: cabofriense.com + 'chicken road game download' (link 2154)"
  RESULT=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3003/api/billing/purchase \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"projectId":1216,"siteId":1013,"type":"link","contentIds":[2154]}')
  HTTP_CODE=$(echo "$RESULT" | tail -1)
  BODY=$(echo "$RESULT" | head -n -1)
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✅ Purchase 2 SUCCESS (HTTP $HTTP_CODE)"
  else
    echo "❌ Purchase 2 FAILED (HTTP $HTTP_CODE)"
    echo "Response: $BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  fi
) &

# Purchase 3: Site 1090 + Link 2155
(
  echo "📦 Purchase 3: mammothgayski.com + 'chicken road app' (link 2155)"
  RESULT=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3003/api/billing/purchase \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"projectId":1216,"siteId":1090,"type":"link","contentIds":[2155]}')
  HTTP_CODE=$(echo "$RESULT" | tail -1)
  BODY=$(echo "$RESULT" | head -n -1)
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✅ Purchase 3 SUCCESS (HTTP $HTTP_CODE)"
  else
    echo "❌ Purchase 3 FAILED (HTTP $HTTP_CODE)"
    echo "Response: $BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  fi
) &

# Wait for all background jobs
wait

# End timing
END_TIME=$(python3 -c "import time; print(time.time())")
DURATION=$(python3 -c "print(f'{$END_TIME - $START_TIME:.2f}')")

echo ""
echo "⏱️  Total time: ${DURATION} seconds"
echo ""
echo "=== Checking results in database ==="

# Check placements created
curl -s "http://localhost:3003/api/placements?project_id=1216&limit=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if isinstance(data, dict) and 'data' in data:
    placements = data['data']
else:
    placements = data if isinstance(data, list) else []
print(f'Recent placements for project 1216: {len(placements)}')
for p in placements[:3]:
    print(f'  - Placement #{p[\"id\"]}: Site #{p[\"site_id\"]}, Status: {p[\"status\"]}')
"
