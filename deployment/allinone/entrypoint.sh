#!/bin/bash
# TimeTiles All-in-One Container Entrypoint
# Initializes PostgreSQL, generates SSL certs, and starts supervisord

set -eo pipefail

echo "=== TimeTiles All-in-One Container Starting ==="

# Everything that must survive a container recreate lives under /data — that is
# the only path declared as a VOLUME in Dockerfile.allinone.
DATA_EXPORT_DIR="${DATA_EXPORT_DIR:-/data/exports}"

# Create required directories
echo "Creating directories..."
mkdir -p /data/postgresql
mkdir -p /data/uploads
mkdir -p /data/ssl
mkdir -p /data/config
mkdir -p "${DATA_EXPORT_DIR}"
mkdir -p /var/log/supervisor
mkdir -p /var/www/certbot

# Set directory ownership
chown -R postgres:postgres /data/postgresql
chown -R nextjs:nodejs /data/uploads
# Exports are written by the worker and read back by the web process, both as
# nextjs. Left on the container layer (the ".exports" default resolves to
# /app/apps/web/.exports) every generated export is silently lost on recreate.
chown -R nextjs:nodejs "${DATA_EXPORT_DIR}"
chown nextjs:nodejs /data/config

# Operator config overrides have to reach getAppConfig(), which resolves
# "config/timetiles.yml" against the app's cwd (/app/apps/web) — a container-layer
# path with no way to get a file into it. Link that one file out to the volume.
# Only the file, not the whole config/ directory: the directory also carries the
# image's data-package manifests, and replacing it would hide them.
# A dangling link is the expected steady state — existsSync() reports false and
# the app uses its built-in defaults, exactly as when no file is present.
ln -sfn /data/config/timetiles.yml /app/apps/web/config/timetiles.yml

# ── Security: require secrets to be explicitly set ──────────────────────────
# DB_PASSWORD (or POSTGRES_PASSWORD) must be provided — no fallback
if [ -z "${DB_PASSWORD:-${POSTGRES_PASSWORD:-}}" ]; then
    echo "ERROR: DB_PASSWORD (or POSTGRES_PASSWORD) must be set. Refusing to start with no database password." >&2
    exit 1
fi

# PAYLOAD_SECRET must be provided and must not be the old placeholder
if [ -z "${PAYLOAD_SECRET:-}" ]; then
    echo "ERROR: PAYLOAD_SECRET must be set. Refusing to start without an application secret." >&2
    exit 1
fi
if [ "${PAYLOAD_SECRET}" = "default_secret_change_me" ]; then
    echo "ERROR: PAYLOAD_SECRET is still set to the placeholder value 'default_secret_change_me'. Generate a real secret (e.g. openssl rand -base64 32)." >&2
    exit 1
fi

# Initialize PostgreSQL if not already initialized
if [ ! -f /data/postgresql/PG_VERSION ]; then
    echo "Initializing PostgreSQL database..."

    # Initialize the database cluster
    su - postgres -c "/usr/lib/postgresql/17/bin/initdb -D /data/postgresql"

    # Configure authentication
    # Local socket: peer auth (OS user identity, no password needed for setup)
    # TCP connections: scram-sha-256 (used by the Next.js app via DATABASE_URL)
    echo "Configuring PostgreSQL authentication..."
    cat > /data/postgresql/pg_hba.conf << 'EOF'
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     peer
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
EOF

    # Configure PostgreSQL to listen on localhost
    {
        echo "listen_addresses = 'localhost'"
        echo "password_encryption = scram-sha-256"
        echo "port = 5432"
    } >> /data/postgresql/postgresql.conf

    # Start PostgreSQL temporarily to create user and database
    echo "Starting PostgreSQL temporarily for setup..."
    su - postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D /data/postgresql -w start"

    # Create database user and database
    # Use DB_USER/DB_PASSWORD/DB_NAME for consistency with docker-compose.prod.yml
    # Fall back to POSTGRES_* for backwards compatibility
    echo "Creating database user and database..."
    DB_USER="${DB_USER:-${POSTGRES_USER:-timetiles}}"
    DB_PASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD}}"
    DB_NAME="${DB_NAME:-${POSTGRES_DB:-timetiles}}"

    # Escape single quotes in password to prevent SQL injection (standard PG escaping)
    ESCAPED_DB_PASSWORD="${DB_PASSWORD//\'/\'\'}"

    # Create user and database — heredoc is quoted ('EOSQL') so only the
    # pre-escaped password variable is expanded via the explicit eval below.
    su - postgres -c "psql" << EOSQL || { echo "Failed to create database user/database"; exit 1; }
CREATE USER "${DB_USER}" WITH PASSWORD '${ESCAPED_DB_PASSWORD}';
CREATE DATABASE "${DB_NAME}" OWNER "${DB_USER}";
\\c "${DB_NAME}"
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS h3;
CREATE SCHEMA IF NOT EXISTS payload;
GRANT ALL PRIVILEGES ON DATABASE "${DB_NAME}" TO "${DB_USER}";
GRANT ALL ON SCHEMA public TO "${DB_USER}";
GRANT ALL ON SCHEMA payload TO "${DB_USER}";
EOSQL

    # Stop PostgreSQL (supervisord will start it properly)
    echo "Stopping temporary PostgreSQL..."
    su - postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D /data/postgresql -w stop"

    echo "PostgreSQL initialization complete."
else
    echo "PostgreSQL already initialized, skipping."
fi

# Generate self-signed SSL certificate if not present
if [ ! -f /data/ssl/fullchain.pem ]; then
    echo "Generating self-signed SSL certificate..."

    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /data/ssl/privkey.pem \
        -out /data/ssl/fullchain.pem \
        -subj "/C=US/ST=State/L=City/O=TimeTiles/CN=${DOMAIN_NAME:-localhost}"

    chmod 600 /data/ssl/privkey.pem
    chmod 644 /data/ssl/fullchain.pem

    echo "Self-signed SSL certificate generated."
else
    echo "SSL certificate already exists, skipping generation."
fi

# Build DATABASE_URL from components
# Use DB_* for consistency, fall back to POSTGRES_* for backwards compatibility
DB_USER="${DB_USER:-${POSTGRES_USER:-timetiles}}"
DB_PASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD}}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-timetiles}}"

# Export environment variables for the Next.js app
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
export UPLOAD_DIR="/data/uploads"

# Write environment to file for the Next.js wrapper script.
# The wrappers run as nextjs (uid 1001) via supervisord, so the file must be
# readable by that user. It used to be written root-owned 0600, which made every
# `source /etc/timetiles.env` fail with "Permission denied" — silently, because
# the wrappers had no `set -e`. Nothing broke only because the same values also
# reached the process via supervisord's inherited environment; the next variable
# added here would have had no effect at all.
#
# Notes on the values below — kept out here because the heredoc is unquoted, so
# anything inside it is expanded, backticks included:
#
# TRUSTED_PROXY_CIDRS: nginx sits in this same container and reaches the app
#   over the loopback interface, so the loopback ranges are the entire trust
#   boundary. Unset, the app refuses to read X-Forwarded-For in production (the
#   header is client-spoofable until a proxy is declared) and every visitor
#   collapses into one rate-limit bucket keyed "unknown". Override to add the
#   CIDR of an outer proxy or CDN when one fronts this container.
# RUN_AUTO_ACTIVATIONS: only one process may run the data-package
#   auto-activator; start-worker.sh unsets it so the worker cannot race web.
# LOG_FILE: deliberately absent. Supervisord forwards every service's output to
#   the container's stdout, so docker logs is the one place to look and the
#   Docker log driver handles rotation. A file would need a logrotate install to
#   stay bounded and pino would write every line twice.
#
# Every value is written single-quoted, with any embedded single quote escaped.
# The wrappers read this file back with `source`, so the file is shell code, not
# data: an unquoted space splits the line into a bogus command, a dollar sign
# interpolates, and a backtick executes. This used to quote only some of the
# values and left DATABASE_URL and PAYLOAD_SECRET bare -- the two that carry
# operator-chosen secrets and are therefore the most likely to contain a
# character that matters. A password with a space in it broke the boot; one with
# a backtick in it would have run whatever it enclosed, as root, at startup.
env_line() {
    local name="$1" value="$2"
    # '\'' closes the quote, emits a literal quote, and reopens it -- the only
    # way to get a single quote through a single-quoted shell string.
    printf "%s='%s'\n" "$name" "${value//\'/\'\\\'\'}"
}
umask 077
{
    env_line DATABASE_URL "${DATABASE_URL}"
    env_line UPLOAD_DIR "${UPLOAD_DIR}"
    env_line PAYLOAD_SECRET "${PAYLOAD_SECRET}"
    env_line NEXT_PUBLIC_PAYLOAD_URL "${NEXT_PUBLIC_PAYLOAD_URL:-http://localhost}"
    env_line NODE_ENV production
    env_line DEPLOYMENT_ENVIRONMENT "${DEPLOYMENT_ENVIRONMENT:-production}"
    env_line PORT 3000
    env_line HOSTNAME 0.0.0.0
    env_line NEXT_TELEMETRY_DISABLED 1
    env_line DATA_EXPORT_DIR "${DATA_EXPORT_DIR}"
    env_line TRUSTED_PROXY_CIDRS "${TRUSTED_PROXY_CIDRS:-127.0.0.1/32,::1/128}"
    env_line RUN_AUTO_ACTIVATIONS "${RUN_AUTO_ACTIVATIONS:-true}"
    env_line LOG_LEVEL "${LOG_LEVEL:-info}"
} > /etc/timetiles.env
# root:nodejs 0640 — readable by the nextjs user (member of nodejs) and by no
# one else. Still keeps DATABASE_URL/PAYLOAD_SECRET off world-readable paths.
chown root:nodejs /etc/timetiles.env
chmod 640 /etc/timetiles.env

# Create wrapper script that loads environment and starts Next.js
# This replaces fragile sed-based env injection into supervisord.conf — the wrapper
# sources /etc/timetiles.env so any value (including special chars) is handled safely.
cat > /app/start-nextjs.sh << 'WRAPPER'
#!/bin/bash
# set -e so an unreadable/broken /etc/timetiles.env aborts the process instead of
# starting Next.js with the environment silently missing.
set -eo pipefail
if [ ! -r /etc/timetiles.env ]; then
    echo "FATAL: /etc/timetiles.env is not readable by $(id -un) — refusing to start Next.js without its environment." >&2
    exit 1
fi
set -a
source /etc/timetiles.env
set +a
cd /app/apps/web && exec node ../../node_modules/.pnpm/node_modules/next/dist/bin/next start
WRAPPER
chmod +x /app/start-nextjs.sh
chown nextjs:nodejs /app/start-nextjs.sh

# Same wrapper approach for the job worker, which needs the identical
# environment. --all-queues rather than a queue list: Payload matches --queue
# with `equals`, so a comma-separated value matches nothing and the jobs sit
# untouched without raising anything.
cat > /app/start-worker.sh << 'WRAPPER'
#!/bin/bash
# set -e so an unreadable/broken /etc/timetiles.env aborts the process instead of
# starting the worker with the environment silently missing.
set -eo pipefail
if [ ! -r /etc/timetiles.env ]; then
    echo "FATAL: /etc/timetiles.env is not readable by $(id -un) — refusing to start the job worker without its environment." >&2
    exit 1
fi
set -a
source /etc/timetiles.env
set +a
# Both processes read the same env file, but only one of them may run the
# data-package auto-activator: two concurrent onInits would race the same
# idempotency check. Web keeps it; the worker drops it (the app defaults to off).
unset RUN_AUTO_ACTIVATIONS
# Same reasoning, higher stakes: Payload applies prodMigrations during init
# without taking a lock, so a worker that migrates would run the same DDL as
# Next.js against the same database. Supervisord's priority only orders the
# *starts* -- it moves on after startsecs, which is ten seconds, while a
# migration can take much longer -- so ordering alone guarantees nothing.
# Next.js owns migrations; the worker never applies them.
export RUN_MIGRATIONS=false
cd /app/apps/web && exec node ../../node_modules/.pnpm/node_modules/payload/bin.js \
  jobs:run --cron '*/10 * * * * *' --all-queues --limit 10 --handle-schedules
WRAPPER
chmod +x /app/start-worker.sh
chown nextjs:nodejs /app/start-worker.sh

# Admin bootstrap. `timetiles create-admin` speaks `docker compose exec web`, so
# it cannot reach this image at all — and self-registration is no substitute:
# the users collection forces role "user" on every unauthenticated REST create,
# leaving an all-in-one operator locked out of their own installation.
#   docker exec -it <container> /app/create-admin.sh you@example.com
cat > /app/create-admin.sh << 'WRAPPER'
#!/bin/bash
set -eo pipefail

ADMIN_EMAIL="${1:-${TIMETILES_ADMIN_EMAIL:-}}"
if [ -z "$ADMIN_EMAIL" ]; then
    echo "Usage: docker exec -it <container> /app/create-admin.sh <email>" >&2
    exit 1
fi

# Prompted rather than read from argv, which would expose the password in the
# process list and the caller's shell history. TIMETILES_ADMIN_PASSWORD stays
# honoured so non-interactive callers (provisioning, tests) still work.
if [ -z "${TIMETILES_ADMIN_PASSWORD:-}" ]; then
    read -rsp "Password for ${ADMIN_EMAIL}: " TIMETILES_ADMIN_PASSWORD
    echo ""
    read -rsp "Repeat password: " ADMIN_PASSWORD_REPEAT
    echo ""
    if [ "$TIMETILES_ADMIN_PASSWORD" != "$ADMIN_PASSWORD_REPEAT" ]; then
        echo "Passwords do not match." >&2
        exit 1
    fi
fi

if [ ! -r /etc/timetiles.env ]; then
    echo "FATAL: /etc/timetiles.env is not readable by $(id -un) — the container has not finished starting, or this was run as the wrong user." >&2
    exit 1
fi
set -a
source /etc/timetiles.env
set +a
export TIMETILES_ADMIN_EMAIL="$ADMIN_EMAIL"
export TIMETILES_ADMIN_PASSWORD

# The script talks to the DB through the Local API, which is the only path that
# can set role "admin" — the REST hooks that force "user" key off req.payloadAPI.
CMD='cd /app/apps/web && exec node /app/node_modules/.pnpm/node_modules/payload/bin.js run scripts/create-admin.ts'

# `docker exec` defaults to root; run as the app user anyway so this can never
# leave root-owned files behind in /app. The credentials travel in the
# environment, which su preserves, and never through the command line.
if [ "$(id -u)" -eq 0 ]; then
    exec su nextjs -s /bin/bash -c "$CMD"
fi
exec bash -c "$CMD"
WRAPPER
chmod 755 /app/create-admin.sh

echo "=== Starting Supervisord ==="
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
