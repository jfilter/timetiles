#!/bin/bash
# Migrate a flat-layout TimeTiles install (everything copied directly into
# /opt/timetiles, no .git) into the new cloned-source layout that
# `timetiles update` expects:
#
#   /opt/timetiles-src/        ← real git working tree (sparse: deployment/)
#     .git/
#     deployment/
#       <tracked files>        ← refreshable via git pull
#       <operator state>       ← .gitignored, preserved during migration
#   /opt/timetiles → /opt/timetiles-src/deployment   (compat symlink)
#
# Idempotent: re-running is safe — exits cleanly if the symlink already
# points at the right place.
#
# Usage (on the production host, as root):
#   sudo bash deployment/scripts/migrate-to-source-layout.sh
# or one-shot from the network:
#   sudo curl -fsSL https://raw.githubusercontent.com/jfilter/timetiles/main/deployment/scripts/migrate-to-source-layout.sh | sudo bash

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/timetiles}"
SRC_DIR="${INSTALL_DIR}-src"
DEPLOY_USER="${DEPLOY_USER:-timetiles}"
REPO_URL="${TIMETILES_REPO_URL:-https://github.com/jfilter/timetiles.git}"
REPO_BRANCH="${TIMETILES_REPO_BRANCH:-main}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${INSTALL_DIR}.flat-backup-${TIMESTAMP}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${YELLOW}==> $*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
die()  { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

# ────────────────────────────────────────────────────────────────────────
# Pre-flight
# ────────────────────────────────────────────────────────────────────────

[[ $EUID -eq 0 ]] || die "Must run as root (use sudo)."

# Idempotency: already migrated?
if [[ -L "$INSTALL_DIR" ]]; then
    target="$(readlink -f "$INSTALL_DIR")"
    if [[ "$target" == "$SRC_DIR/deployment" ]]; then
        ok "$INSTALL_DIR already points to $SRC_DIR/deployment — nothing to do."
        exit 0
    fi
    die "$INSTALL_DIR is already a symlink to $target (unexpected target)."
fi

[[ -d "$INSTALL_DIR" ]]                     || die "$INSTALL_DIR does not exist."
[[ -f "$INSTALL_DIR/.env.production" ]]     || die "$INSTALL_DIR/.env.production missing — does not look like a TimeTiles install."
[[ -f "$INSTALL_DIR/docker-compose.prod.yml" ]] || die "$INSTALL_DIR/docker-compose.prod.yml missing."
[[ ! -d "$SRC_DIR" ]]                       || die "$SRC_DIR already exists. Move or remove it before retrying."

if ! command -v git >/dev/null;     then die "git is required."; fi
if ! command -v docker >/dev/null;  then die "docker is required."; fi

# ────────────────────────────────────────────────────────────────────────
# Stop containers (remember whether they were running)
# ────────────────────────────────────────────────────────────────────────

WAS_RUNNING="false"
if docker ps --format '{{.Names}}' | grep -q '^timetiles-'; then
    WAS_RUNNING="true"
    log "Stopping containers..."
    docker compose \
        -f "$INSTALL_DIR/docker-compose.prod.yml" \
        --env-file "$INSTALL_DIR/.env.production" \
        down
fi

# ────────────────────────────────────────────────────────────────────────
# Build new source tree alongside the flat install (atomic pivot at end)
# ────────────────────────────────────────────────────────────────────────

SRC_NEW="${SRC_DIR}.new"
rm -rf "$SRC_NEW"
mkdir -p "$SRC_NEW"

log "Cloning $REPO_URL ($REPO_BRANCH) into $SRC_NEW (sparse: deployment/) ..."
(
    cd "$SRC_NEW"
    git init -q
    git remote add origin "$REPO_URL"
    git config core.sparseCheckout true
    echo "deployment/" > .git/info/sparse-checkout
    git fetch --depth 1 -q origin "$REPO_BRANCH"
    git checkout -q -B "$REPO_BRANCH" "origin/$REPO_BRANCH"
) || die "Clone failed."

# Files we must preserve from the flat install — these are the same
# entries listed in deployment/.gitignore.
PRESERVE_FILES=(
    ".env.production"
    ".env.production.local"
    ".env.production.overrides"
    ".env.production.pre-test-backup"
    "docker-compose.override.yml"
    "docker-compose.test.yml"
    "docker-compose.ssl-override.yml"
    "credentials.txt"
    "config/timetiles.yml"
)
PRESERVE_DIRS=(
    "backups"
    "uploads"
    "ssl"
    "data"
    "logs"
    "nginx-test"
    "scraper-runner"
)

log "Preserving operator state..."
for f in "${PRESERVE_FILES[@]}"; do
    src="$INSTALL_DIR/$f"
    [[ -e "$src" ]] || continue
    dst="$SRC_NEW/deployment/$f"
    mkdir -p "$(dirname "$dst")"
    cp -a "$src" "$dst"
done
# Move dirs (often large — uploads, restic-repo, etc.); they leave the
# old install dir empty enough for the rename to be cheap.
for d in "${PRESERVE_DIRS[@]}"; do
    src="$INSTALL_DIR/$d"
    [[ -d "$src" ]] || continue
    mv "$src" "$SRC_NEW/deployment/$d"
done

# Re-apply ${DOMAIN_NAME} substitution on nginx site files (mirrors
# bootstrap step 06's configure_nginx).
DOMAIN=$(grep -E '^DOMAIN_NAME=' "$SRC_NEW/deployment/.env.production" | cut -d= -f2- || true)
if [[ -n "$DOMAIN" ]] && [[ -d "$SRC_NEW/deployment/nginx/sites-enabled" ]]; then
    find "$SRC_NEW/deployment/nginx/sites-enabled" -type f -name "*.conf" -exec \
        sed -i "s/\${DOMAIN_NAME}/$DOMAIN/g" {} \;
fi

# ────────────────────────────────────────────────────────────────────────
# Atomic pivot
# ────────────────────────────────────────────────────────────────────────

log "Renaming flat install to $BACKUP_DIR..."
mv "$INSTALL_DIR" "$BACKUP_DIR"

log "Promoting new src dir to $SRC_DIR..."
mv "$SRC_NEW" "$SRC_DIR"

log "Creating compat symlink $INSTALL_DIR -> $SRC_DIR/deployment..."
ln -sfn "$SRC_DIR/deployment" "$INSTALL_DIR"

chown -R "$DEPLOY_USER:$DEPLOY_USER" "$SRC_DIR"

# ────────────────────────────────────────────────────────────────────────
# Validate
# ────────────────────────────────────────────────────────────────────────

log "Validating..."
[[ -L "$INSTALL_DIR" ]]                 || die "Symlink missing."
[[ -d "$SRC_DIR/.git" ]]                || die ".git missing in $SRC_DIR."
[[ -f "$INSTALL_DIR/.env.production" ]] || die "Operator state lost."
[[ -x "$INSTALL_DIR/timetiles" ]]       || die "CLI not executable."

DIRTY=$(sudo -u "$DEPLOY_USER" git -C "$SRC_DIR" status --porcelain || true)
if [[ -n "$DIRTY" ]]; then
    echo -e "${YELLOW}Warning: $SRC_DIR has unexpected changes:${NC}"
    echo "$DIRTY"
    echo -e "${YELLOW}This usually means a tracked file was hand-edited; review and decide.${NC}"
fi

# ────────────────────────────────────────────────────────────────────────
# Restart (if it was running before) + closing notes
# ────────────────────────────────────────────────────────────────────────

if [[ "$WAS_RUNNING" == "true" ]]; then
    log "Bringing services back up..."
    docker compose \
        -f "$INSTALL_DIR/docker-compose.prod.yml" \
        --env-file "$INSTALL_DIR/.env.production" \
        up -d
fi

ok "Layout migrated."
cat <<EOF

  Install dir:    $INSTALL_DIR -> $SRC_DIR/deployment
  Working tree:   $SRC_DIR
  Flat backup:    $BACKUP_DIR

If anything is broken, rollback:
  sudo bash -c '
    docker compose -f $INSTALL_DIR/docker-compose.prod.yml --env-file $INSTALL_DIR/.env.production down
    rm $INSTALL_DIR
    mv $BACKUP_DIR $INSTALL_DIR
    docker compose -f $INSTALL_DIR/docker-compose.prod.yml --env-file $INSTALL_DIR/.env.production up -d
  '

Once you have verified the new layout, drop the backup:
  sudo rm -rf $BACKUP_DIR
EOF
