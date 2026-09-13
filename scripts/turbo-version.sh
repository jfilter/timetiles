#!/bin/sh
# Print the turbo version the root importer resolves in pnpm-lock.yaml, so
# image builds run `turbo prune` with the locked version instead of the newest.
set -eu

lockfile="${1:-pnpm-lock.yaml}"

version=$(awk '
    /^importers:/ { importers = 1; next }
    importers && /^[^ ]/ { exit }
    importers && /^  \.:$/ { root = 1; next }
    root && /^  [^ ]/ { exit }
    root && /^      turbo:$/ { turbo = 1; next }
    turbo && /^        version:/ { print $2; exit }
' "$lockfile")

case "$version" in
    [0-9]*.[0-9]*.[0-9]*) printf '%s\n' "$version" ;;
    *)
        echo "no turbo version in the root importer of $lockfile" >&2
        exit 1
        ;;
esac
