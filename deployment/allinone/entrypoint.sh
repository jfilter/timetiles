#!/bin/bash
# TimeTiles All-in-One Container Entrypoint
# Initializes PostgreSQL, generates SSL certs, and starts supervisord

set -e

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

# Initialize PostgreSQL if not already initialized
if [ ! -f /data/postgresql/PG_VERSION ]; then
    echo "Initializing PostgreSQL database..."

    # Initialize the database cluster
    su - postgres -c "/usr/lib/postgresql/17/bin/initdb -D /data/postgresql"

    # Configure authentication
    echo "Configuring PostgreSQL authentication..."
    cat > /data/postgresql/pg_hba.conf << 'EOF'
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
EOF

    # Configure PostgreSQL to listen on localhost
    echo "listen_addresses = 'localhost'" >> /data/postgresql/postgresql.conf
    echo "port = 5432" >> /data/postgresql/postgresql.conf

    # Start PostgreSQL temporarily to create user and database
    echo "Starting PostgreSQL temporarily for setup..."
    su - postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D /data/postgresql -w start"

    # Create database user and database
    echo "Creating database user and database..."
    POSTGRES_USER="${POSTGRES_USER:-timetiles}"
    POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-timetiles}"
    POSTGRES_DB="${POSTGRES_DB:-timetiles}"

    su - postgres -c "psql -c \"CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';\""
    su - postgres -c "psql -c \"CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};\""
    su - postgres -c "psql -d ${POSTGRES_DB} -c \"CREATE EXTENSION IF NOT EXISTS postgis;\""
    su - postgres -c "psql -d ${POSTGRES_DB} -c \"CREATE SCHEMA IF NOT EXISTS payload;\""
    su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${POSTGRES_USER};\""
    su - postgres -c "psql -d ${POSTGRES_DB} -c \"GRANT ALL ON SCHEMA public TO ${POSTGRES_USER};\""
    su - postgres -c "psql -d ${POSTGRES_DB} -c \"GRANT ALL ON SCHEMA payload TO ${POSTGRES_USER};\""

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
        -subj "/C=US/ST=State/L=City/O=TimeTiles/CN=localhost"

    chmod 600 /data/ssl/privkey.pem
    chmod 644 /data/ssl/fullchain.pem

    echo "Self-signed SSL certificate generated."
else
    echo "SSL certificate already exists, skipping generation."
fi

# Build DATABASE_URL from components
POSTGRES_USER="${POSTGRES_USER:-timetiles}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-timetiles}"
POSTGRES_DB="${POSTGRES_DB:-timetiles}"

# Export environment variables for the Next.js app
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"
export UPLOAD_DIR="/data/uploads"

# Write environment to file for supervisord child processes
cat > /etc/environment << EOF
DATABASE_URL=${DATABASE_URL}
UPLOAD_DIR=${UPLOAD_DIR}
PAYLOAD_SECRET=${PAYLOAD_SECRET:-default_secret_change_me}
NEXT_PUBLIC_PAYLOAD_URL=${NEXT_PUBLIC_PAYLOAD_URL:-http://localhost}
NODE_ENV=production
EOF

# Update supervisord config with environment variables
# Replace the nextjs program environment line to include all vars
sed -i "s|environment=NODE_ENV=\"production\",PORT=\"3000\",HOSTNAME=\"0.0.0.0\"|environment=NODE_ENV=\"production\",PORT=\"3000\",HOSTNAME=\"0.0.0.0\",DATABASE_URL=\"${DATABASE_URL}\",UPLOAD_DIR=\"${UPLOAD_DIR}\",PAYLOAD_SECRET=\"${PAYLOAD_SECRET:-default_secret_change_me}\",NEXT_PUBLIC_PAYLOAD_URL=\"${NEXT_PUBLIC_PAYLOAD_URL:-http://localhost}\"|" /etc/supervisor/conf.d/supervisord.conf

echo "=== Starting Supervisord ==="
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
