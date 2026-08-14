#!/usr/bin/env bash

# TimeTiles macOS Developer Machine Setup
# Provisions the toolchain a fresh Mac needs, then hands over to scripts/setup.sh
# for the repo-level setup. Docker-free: PostgreSQL runs from Homebrew on port 5433.
# It is idempotent - safe to run multiple times.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✅${NC} $1"; }
print_exists() { echo -e "  ✓ $1"; }
print_warning() { echo -e "${YELLOW}⚠️${NC}  $1"; }
print_error() { echo -e "${RED}❌${NC} $1"; }

WARNINGS=0
warn() {
  print_warning "$1"
  WARNINGS=$((WARNINGS + 1))
}

# Everything below assumes the repo root
cd "$(dirname "$0")/.."

PG_FORMULA="postgresql@17"
PG_PORT=5433
DB_NAME="timetiles"
DB_USER="timetiles_user"
DB_PASSWORD="timetiles_password"
# Node major the repo requires; `.node-version` pins the exact patch for fnm/nodenv users.
NODE_MAJOR=24

echo "🍎 TimeTiles macOS Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ============================================================================
# Step 1: Prerequisites
# ============================================================================
check_prerequisites() {
  echo "🔎 Prerequisites"

  if [ "$(uname -s)" != "Darwin" ]; then
    print_error "This script is macOS-only. On Linux, install node/pnpm/PostgreSQL+PostGIS by hand, then run 'make setup'."
    exit 1
  fi

  if ! command -v brew >/dev/null 2>&1; then
    print_error "Homebrew not found. Install it first (it needs an interactive sudo):"
    # Printed for the user to run, not expanded here.
    # shellcheck disable=SC2016
    echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
  fi
  print_exists "Homebrew at $(brew --prefix)"

  # Homebrew shared between accounts: git refuses to read a prefix owned by someone
  # else, which makes brew misreport its own state and blocks `brew update`.
  local repo
  repo="$(brew --repo 2>/dev/null || true)"
  if [ -n "$repo" ] && ! git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
    warn "git cannot read $repo — it belongs to another account. Installs into it may fail or silently do nothing, and 'brew update' will not run. Either install from the owning account, or claim it: git config --global --add safe.directory $repo"
  fi

  echo ""
}

# ============================================================================
# Step 2: Homebrew formulas
# ============================================================================
install_formulas() {
  echo "🍺 Homebrew Formulas"

  # postgis pulls its own postgresql; install it after the pinned server so the
  # extension is built against the version we actually run.
  for formula in git-lfs "$PG_FORMULA" postgis; do
    if brew list --formula "$formula" >/dev/null 2>&1; then
      print_exists "$formula already installed"
    else
      echo "  Installing $formula..."
      brew install "$formula" || true
      # A prefix owned by another account can swallow the install and still exit 0,
      # which would otherwise surface much later as a missing binary.
      if brew list --formula "$formula" >/dev/null 2>&1; then
        print_success "Installed $formula"
      else
        print_error "$formula did not install. Is $(brew --prefix) owned by another account?"
        echo "    ls -ld $(brew --prefix)/Cellar   # check the owner, then install from that account"
        exit 1
      fi
    fi
  done

  echo ""
}

# ============================================================================
# Step 3: Node and pnpm (via mise, which reads .mise.toml)
# ============================================================================
setup_node() {
  echo "⬢ Node & pnpm"

  local current_major=0
  if command -v node >/dev/null 2>&1; then
    current_major="$(node -v | sed 's/^v\([0-9]*\).*/\1/')"
  fi

  # .mise.toml pins the exact node/pnpm the repo expects, so mise is the path that
  # cannot drift from CI. Install it unless a node of the right major is already here.
  if ! command -v mise >/dev/null 2>&1 && [ "$current_major" -lt "$NODE_MAJOR" ]; then
    echo "  Installing mise..."
    brew install mise
  fi

  if command -v mise >/dev/null 2>&1; then
    # A checkout's .mise.toml is untrusted until confirmed; running this script IS
    # that confirmation. Without it `mise install` refuses to read the pins.
    mise trust >/dev/null 2>&1 || true
    if mise install; then
      print_success "mise installed the versions from .mise.toml"
    else
      warn "mise install failed — falling back to whatever node is on PATH"
    fi
    if ! command -v node >/dev/null 2>&1; then
      # Without activation the pinned node is installed but invisible to this shell,
      # so the steps below would silently use a different one - or none.
      warn "mise is not activated in this shell. Add it to your profile, then re-run:"
      # Printed for the user to run, not expanded here.
      # shellcheck disable=SC2016
      echo '    eval "$(mise activate zsh)"'
      return
    fi
  elif [ "$current_major" -ge "$NODE_MAJOR" ]; then
    print_exists "node $(node -v) (repo needs >= $NODE_MAJOR); mise not installed, skipping the pin"
  else
    warn "No node >= $NODE_MAJOR and mise unavailable — install one, then re-run"
    return
  fi

  # pnpm follows the same pin. With mise active it is already provided; otherwise
  # corepack activates the version from package.json rather than a drifting global.
  local pinned
  pinned="$(node -p "require('./package.json').packageManager" 2>/dev/null || echo "")"
  if [ -z "$pinned" ]; then
    warn "No packageManager field in package.json; skipping pnpm activation"
  elif command -v pnpm >/dev/null 2>&1 && [ "pnpm@$(pnpm --version)" = "$pinned" ]; then
    print_exists "$pinned already active"
  else
    corepack enable >/dev/null 2>&1 || warn "corepack enable failed (may need sudo for the node prefix)"
    if corepack prepare "$pinned" --activate >/dev/null 2>&1; then
      print_success "Activated $pinned"
    else
      warn "corepack could not activate $pinned"
    fi
  fi

  echo ""
}

# ============================================================================
# Step 4: PostgreSQL on port 5433
# ============================================================================
setup_postgres() {
  echo "🐘 PostgreSQL (local, port $PG_PORT)"

  local conf
  conf="$(brew --prefix)/var/${PG_FORMULA}/postgresql.conf"
  if [ ! -f "$conf" ]; then
    warn "No config at $conf — was $PG_FORMULA initialized?"
    return
  fi

  # Port 5433 keeps this cluster clear of a Docker Postgres on the default port,
  # which is what PG_MODE distinguishes.
  if grep -qE "^[[:space:]]*port[[:space:]]*=[[:space:]]*$PG_PORT" "$conf"; then
    print_exists "Port already $PG_PORT"
  else
    printf '\n# TimeTiles: keep clear of a Docker Postgres on 5432\nport = %s\n' "$PG_PORT" >>"$conf"
    print_success "Set port to $PG_PORT"
    pg_ctl restart -D "$(brew --prefix)/var/${PG_FORMULA}" -l /tmp/pg.log >/dev/null 2>&1 || true
  fi

  # pg_ctl rather than `brew services`: the latter goes through `launchctl gui/<uid>`,
  # which does not exist in an SSH session, and this is the same call `make dev` makes.
  if pg_isready -h localhost -p "$PG_PORT" >/dev/null 2>&1; then
    print_exists "Already running"
  else
    local data_dir
    data_dir="$(brew --prefix)/var/${PG_FORMULA}"
    if LC_ALL=en_US.UTF-8 pg_ctl start -D "$data_dir" -l /tmp/pg.log >/dev/null 2>&1; then
      print_success "Started PostgreSQL"
    else
      warn "pg_ctl could not start PostgreSQL — see /tmp/pg.log"
    fi
  fi

  # pg_isready returns non-zero while the server is still coming up.
  local ready=0
  for _ in $(seq 1 20); do
    if pg_isready -h localhost -p "$PG_PORT" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "$ready" -eq 0 ]; then
    warn "PostgreSQL not accepting connections on $PG_PORT — check $(brew --prefix)/var/log/${PG_FORMULA}.log"
    return
  fi
  print_success "Accepting connections"

  echo ""
}

# ============================================================================
# Step 5: Role, database, PostGIS
# ============================================================================
setup_database() {
  echo "🗄️  Database"

  if ! pg_isready -h localhost -p "$PG_PORT" >/dev/null 2>&1; then
    warn "Skipping — PostgreSQL is not reachable"
    return
  fi

  local psql_super=(psql -h localhost -p "$PG_PORT" -d postgres -tA)

  if [ "$("${psql_super[@]}" -c "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'")" = "1" ]; then
    print_exists "Role $DB_USER exists"
  else
    # Superuser because the test harness creates and drops databases per worker.
    "${psql_super[@]}" -c "CREATE ROLE $DB_USER WITH LOGIN SUPERUSER CREATEDB PASSWORD '$DB_PASSWORD'" >/dev/null
    print_success "Created role $DB_USER"
  fi

  if [ "$("${psql_super[@]}" -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")" = "1" ]; then
    print_exists "Database $DB_NAME exists"
  else
    "${psql_super[@]}" -c "CREATE DATABASE $DB_NAME OWNER $DB_USER" >/dev/null
    print_success "Created database $DB_NAME"
  fi

  # Payload keeps its tables in their own schema; PostGIS backs every spatial query.
  # client_min_messages silences the "already exists, skipping" notices on a re-run.
  PGOPTIONS='-c client_min_messages=warning' psql -h localhost -p "$PG_PORT" -d "$DB_NAME" -q \
    -c "CREATE SCHEMA IF NOT EXISTS payload AUTHORIZATION $DB_USER" \
    -c "CREATE EXTENSION IF NOT EXISTS postgis"
  print_success "Schema 'payload' and PostGIS ready"

  echo ""
}

# ============================================================================
# Step 6: Repo setup (env files, dependencies, Git LFS)
# ============================================================================
run_repo_setup() {
  echo "📦 Repository"

  if ! command -v pnpm >/dev/null 2>&1; then
    warn "Skipping — pnpm is not on PATH yet (see the Node step above)"
    return
  fi

  ./scripts/setup.sh

  echo ""
}

# ============================================================================
# Step 7: Point the env files at the local cluster
# ============================================================================
configure_env_for_local() {
  echo "⚙️  Environment"

  local local_url="postgresql://$DB_USER:$DB_PASSWORD@localhost:$PG_PORT/$DB_NAME"

  for env_file in .env apps/web/.env.local; do
    if [ ! -f "$env_file" ]; then
      warn "$env_file missing — run 'make setup' first"
      continue
    fi

    # sed -i '' is the BSD form; this script is macOS-only by definition.
    if grep -q "^PG_MODE=" "$env_file"; then
      sed -i '' "s|^PG_MODE=.*|PG_MODE=local|" "$env_file"
    elif [ "$env_file" = ".env" ]; then
      printf '\nPG_MODE=local\n' >>"$env_file"
    fi

    if grep -q "^DATABASE_URL=" "$env_file"; then
      sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=$local_url|" "$env_file"
    fi

    print_success "$env_file points at port $PG_PORT"
  done

  echo ""
}

# ============================================================================
# Step 8: Playwright browsers
# ============================================================================
install_browsers() {
  echo "🎭 Playwright"

  if ! command -v pnpm >/dev/null 2>&1; then
    warn "Skipping — pnpm is not on PATH yet"
    return
  fi

  # Chromium only: playwright.config.ts runs the suite in a single chromium project.
  if pnpm --filter web exec playwright install chromium >/dev/null 2>&1; then
    print_success "Chromium installed"
  else
    warn "playwright install failed — run 'pnpm --filter web exec playwright install chromium' by hand"
  fi

  echo ""
}

check_prerequisites
install_formulas
setup_node
setup_postgres
setup_database
run_repo_setup
configure_env_for_local
install_browsers

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$WARNINGS" -eq 0 ]; then
  echo "✅ macOS setup complete! (no warnings)"
else
  echo "✅ macOS setup complete! ($WARNINGS warnings - see above)"
fi
echo ""
echo "📋 Next Steps:"
echo "  1. make migrate      - Apply database migrations"
echo "  2. make seed         - Seed development data"
echo "  3. make dev          - Start the development server"
echo ""
echo "💡 Verify anytime with 'make selftest' or 'make status'."
echo ""
