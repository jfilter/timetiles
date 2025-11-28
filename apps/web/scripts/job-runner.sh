#!/bin/bash
# Background job runner for development
# Polls the jobs API every 10 seconds to process queued jobs

# Wait for dev server to start
sleep 5

echo "⚙️  Job runner started (polling every 10s)"

while true; do
  curl -s -X POST http://localhost:3000/api/admin/jobs/run > /dev/null 2>&1
  sleep 10
done
