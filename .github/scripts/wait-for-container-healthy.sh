#!/usr/bin/env bash
# Reusable container-health wait used by smoke-test steps in release-images.yml.
#
# Usage: wait-for-container-healthy.sh <container> [max_attempts] [interval_seconds] [label]
#
# Polls the Docker healthcheck status of <container> up to <max_attempts> times,
# sleeping <interval_seconds> between attempts. Prints a progress line every 15th
# attempt. On the first "healthy" reading prints "<label> healthy after Ns" and
# exits 0. After exhausting attempts, dumps `docker logs --tail 80 <container>`
# and exits 1.
#
# This is the `docker inspect` analogue of the HTTP-based wait-for-health.sh:
# use this when the container declares its own HEALTHCHECK and you want to gate
# on the engine's health status rather than poll an endpoint yourself.

set -uo pipefail

container=${1-}
max=${2:-90}
interval=${3:-2}
label=${4:-$container}

health() { docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown"; }

for ((i=1; i<=max; i++)); do
  status=$(health)
  if [ "$status" = "healthy" ]; then
    echo "$label healthy after $((i * interval))s"
    exit 0
  fi
  if [ $((i % 15)) -eq 0 ]; then
    echo "  still waiting ($((i * interval))s elapsed, $label=$status)"
  fi
  sleep "$interval"
done

echo "$label did not become healthy in time"
docker logs --tail 80 "$container"
exit 1
