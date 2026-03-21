#!/bin/bash
# TimeTiles All-in-One Container Entrypoint
# Initializes PostgreSQL, generates SSL certs, and starts supervisord

set -eo pipefail

echo "=== TimeTiles All-in-One Container Starting ==="

# Create required directories
echo "Creating directories..."
mkdir -p /data/postgresql
mkdir -p /data/uploads
mkdir -p /data/ssl
mkdir -p /var/log/supervisor
mkdir -p /var/www/certbot

# Set directory ownership
chown -R postgres:postgres /data/postgresql
chown -R nextjs:nextjs /data/uploads

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
    echo "Configuring PostgreSQL authentication..."
    cat > /data/postgresql/pg_hba.conf << 'EOF'
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     scram-sha-256
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

# Write environment to file for the Next.js wrapper script
# Restrict permissions - only root can read (wrapper runs as nextjs via supervisord)
umask 077
cat > /etc/timetiles.env << EOF
DATABASE_URL=${DATABASE_URL}
UPLOAD_DIR=${UPLOAD_DIR}
PAYLOAD_SECRET=${PAYLOAD_SECRET}
NEXT_PUBLIC_PAYLOAD_URL=${NEXT_PUBLIC_PAYLOAD_URL:-http://localhost}
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
NEXT_TELEMETRY_DISABLED=1
EOF
chmod 600 /etc/timetiles.env

# Create wrapper script that loads environment and starts Next.js
# This replaces fragile sed-based env injection into supervisord.conf — the wrapper
# sources /etc/timetiles.env so any value (including special chars) is handled safely.
cat > /app/start-nextjs.sh << 'WRAPPER'
#!/bin/bash
set -a
source /etc/timetiles.env
set +a
exec node apps/web/server.js
WRAPPER
chmod +x /app/start-nextjs.sh
chown nextjs:nodejs /app/start-nextjs.sh

echo "=== Starting Supervisord ==="
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
