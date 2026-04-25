#!/usr/bin/env bash
# Reusable health check used by smoke-test steps in release-images.yml.
#
# Usage: wait-for-health.sh <url> <container> [max_attempts] [interval_seconds]
#
# Polls <url> with curl up to <max_attempts> times, sleeping <interval_seconds>
# between attempts. Each failed attempt prints a "waiting..." line. After
# exhausting attempts, dumps `docker logs <container>` and exits 1.
#
# Note: callers may pass an empty URL intentionally to use this as a delay
# loop (curl -f on an empty URL fails, so the loop runs to completion and
# then dumps logs); the surrounding step typically follows with `|| true`
# in that case. Behavior must match the original inline shell function.

set -uo pipefail

url=${1-}
container=${2-}
max=${3:-30}
interval=${4:-2}

for ((i=1; i<=max; i++)); do
  if curl -f --max-time 5 "$url" 2>/dev/null; then
    echo " OK"
    exit 0
  fi
  echo "  waiting... ($i/$max)"
  sleep "$interval"
done

echo "FAILED - $container logs:"
docker logs "$container"
exit 1
