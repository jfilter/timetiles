#!/usr/bin/env bash
# Usage: assert-containers-stable.sh <seconds> <container>...
#
# Waits <seconds>, then fails unless every container is running and has never
# restarted. For containers without a healthcheck (the Payload job workers), a
# crash loop under `restart: unless-stopped` shows up only as restarts.

set -uo pipefail

window=${1:?usage: assert-containers-stable.sh <seconds> <container>...}
shift
if [ "$#" -eq 0 ]; then
  echo "no containers given" >&2
  exit 2
fi

sleep "$window"

failed=0
for container in "$@"; do
  state=$(docker inspect --format '{{.State.Status}} restarts={{.RestartCount}}' "$container" 2>&1) || state="missing"
  echo "$container: $state"
  if [ "$state" != "running restarts=0" ]; then
    failed=1
    docker logs --tail 80 "$container" 2>&1 || true
  fi
done

exit "$failed"
