#!/bin/bash
# Background job runner for development
# Polls the jobs API every 10 seconds to process queued jobs
# Authenticates via JWT login with the seeded admin user

BASE_URL="http://localhost:3000"
EMAIL="${JOB_RUNNER_EMAIL:-admin@example.com}"
PASSWORD="${JOB_RUNNER_PASSWORD:-admin123}"
TOKEN=""

# Wait for server to be healthy
echo "⚙️  Job runner waiting for server..."
for _i in $(seq 1 30); do
  if curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/health" 2>/dev/null | grep -q 200; then
    break
  fi
  sleep 2
done

login() {
  local RESPONSE
  RESPONSE=$(curl -s -X POST "$BASE_URL/api/users/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
  TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$TOKEN" ]; then
    echo "⚙️  Job runner authenticated"
  else
    echo "⚙️  Job runner auth failed, retrying next cycle..."
  fi
}

login
echo "⚙️  Job runner started (polling every 10s)"

while true; do
  if [ -z "$TOKEN" ]; then
    login
  else
    STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/admin/jobs/run" \
      -H "Authorization: JWT $TOKEN")
    if [ "$STATUS" = "401" ]; then
      TOKEN=""
      login
    fi
  fi
  sleep 10
done
