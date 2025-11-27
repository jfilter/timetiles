#!/bin/bash

# TimeTiles Production Deployment Script
# Usage: ./deploy.sh [command]
#
# This script should be run as the 'timetiles' user (or root, which will
# automatically switch to timetiles). Running as other users will fail.

set -e

# =============================================================================
# User & Permission Handling
# =============================================================================
# The script needs to run as 'timetiles' user with docker group access.
# If run as root, it re-executes itself as the timetiles user.

DEPLOY_USER="${DEPLOY_USER:-timetiles}"

# If running as root, re-exec as the deploy user with docker group
if [ "$(id -u)" = "0" ]; then
    # Check if deploy user exists
    if id "$DEPLOY_USER" &>/dev/null; then
        exec sg docker -c "sudo -u $DEPLOY_USER $0 $*"
    else
        echo "Warning: User '$DEPLOY_USER' not found, running as root"
    fi
fi

# Verify docker access (non-fatal warning)
if ! docker info &>/dev/null 2>&1; then
    echo "Warning: Cannot connect to Docker. You may need to:"
    echo "  1. Start Docker daemon"
    echo "  2. Add user to docker group: sudo usermod -aG docker $USER"
    echo "  3. Re-login or run: sg docker -c './deploy.sh $*'"
fi

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ENV_FILE="$SCRIPT_DIR/.env.production"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
TEST_OVERRIDE="$SCRIPT_DIR/docker-compose.test.yml"
SSL_OVERRIDE="$SCRIPT_DIR/docker-compose.ssl-override.yml"

# Build compose command with appropriate overrides
DC_CMD="docker compose -f $COMPOSE_FILE"

# Add SSL override if exists (for self-signed certs when SKIP_SSL=true)
if [ -f "$SSL_OVERRIDE" ]; then
    DC_CMD="$DC_CMD -f $SSL_OVERRIDE"
fi

# Add test override if exists (for CI/testing)
if [ -f "$TEST_OVERRIDE" ]; then
    DC_CMD="$DC_CMD -f $TEST_OVERRIDE"
fi

DC_CMD="$DC_CMD --env-file $ENV_FILE"

# Change to project root for build context
cd "$SCRIPT_DIR/.."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Alert script location
ALERT_SCRIPT="/opt/timetiles/scripts/alert.sh"

# Send alert if script exists
send_alert() {
    local subject="$1"
    local message="$2"
    if [ -x "$ALERT_SCRIPT" ]; then
        "$ALERT_SCRIPT" "$subject" "$message" 2>/dev/null || true
    fi
}

# Functions
print_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  setup     - Initial setup (copy env file, generate secrets)"
    echo "  build     - Build Docker images"
    echo "  up        - Start all services"
    echo "  down      - Stop all services"
    echo "  restart   - Restart all services"
    echo "  logs      - View logs (follow mode)"
    echo "  backup    - Backup management (full|db|uploads|auto|list|prune|verify|clean)"
    echo "  restore   - Restore from backup"
    echo "  status    - Check service status"
    echo "  ssl       - Initialize Let's Encrypt SSL certificate"
    echo "  update    - Pull latest code and redeploy"
    echo ""
    echo "Note: Database migrations run automatically on container startup."
    echo ""
}

check_env() {
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${RED}Error: $ENV_FILE not found!${NC}"
        echo "Run: $0 setup"
        exit 1
    fi
}

init_ssl() {
    echo -e "${YELLOW}Initializing SSL certificate with Let's Encrypt...${NC}"
    
    # Load domain from env file
    source "$ENV_FILE"
    
    if [ -z "$DOMAIN_NAME" ]; then
        echo -e "${RED}Error: DOMAIN_NAME not set in $ENV_FILE${NC}"
        exit 1
    fi
    
    if [ -z "$LETSENCRYPT_EMAIL" ]; then
        echo -e "${RED}Error: LETSENCRYPT_EMAIL not set in $ENV_FILE${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Requesting certificate for $DOMAIN_NAME...${NC}"
    
    # Request certificate
    if $DC_CMD run --rm certbot certonly --webroot \
        --webroot-path=/var/www/certbot \
        --email "$LETSENCRYPT_EMAIL" \
        --agree-tos \
        --no-eff-email \
        -d "$DOMAIN_NAME" \
        -d "www.$DOMAIN_NAME"; then
        echo -e "${GREEN}SSL certificate obtained successfully!${NC}"
        # Reload nginx to use new certificate
        $DC_CMD exec nginx nginx -s reload
    else
        echo -e "${RED}Failed to obtain SSL certificate${NC}"
        exit 1
    fi
}

case "$1" in
    setup)
        echo -e "${YELLOW}Setting up production environment...${NC}"
        
        # Copy env file if it doesn't exist
        if [ ! -f "$ENV_FILE" ]; then
            cp "$SCRIPT_DIR/.env.production.example" "$ENV_FILE"
            echo -e "${GREEN}Created $ENV_FILE from template${NC}"
            
            # Generate random secret for Payload
            PAYLOAD_SECRET=$(openssl rand -base64 32 | tr -d '/')
            # Use a delimiter that won't appear in base64 strings
            sed -i.bak "s|PAYLOAD_SECRET=.*|PAYLOAD_SECRET=$PAYLOAD_SECRET|" "$ENV_FILE"
            echo -e "${GREEN}Generated PAYLOAD_SECRET${NC}"
            
            echo -e "${YELLOW}Please edit $ENV_FILE and set:${NC}"
            echo "  - DB_PASSWORD"
            echo "  - DOMAIN_NAME (your domain)"
            echo "  - LETSENCRYPT_EMAIL"
        else
            echo -e "${YELLOW}$ENV_FILE already exists${NC}"
        fi
        ;;
        
    build)
        check_env
        echo -e "${YELLOW}Building Docker images...${NC}"
        $DC_CMD build
        echo -e "${GREEN}Build complete!${NC}"
        ;;
        
    up)
        check_env
        echo -e "${YELLOW}Starting services...${NC}"
        $DC_CMD up -d
        echo -e "${GREEN}Services started!${NC}"
        echo "Waiting for services to be ready..."
        sleep 10
        $0 status
        ;;
        
    down)
        check_env
        echo -e "${YELLOW}Stopping services...${NC}"
        $DC_CMD down
        echo -e "${GREEN}Services stopped!${NC}"
        ;;
        
    restart)
        check_env
        echo -e "${YELLOW}Restarting services...${NC}"
        $DC_CMD restart
        echo -e "${GREEN}Services restarted!${NC}"
        ;;
        
    logs)
        check_env
        $DC_CMD logs -f --tail=100
        ;;
        
    backup)
        check_env
        BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
        mkdir -p "$BACKUP_DIR"
        
        # Parse sub-command (default to full backup for safety)
        case "${2:-full}" in
            db|database)
                echo -e "${YELLOW}Backing up database...${NC}"
                BACKUP_FILE="$BACKUP_DIR/db-$(date +%Y%m%d-%H%M%S).sql.gz"
                # --clean adds DROP statements, --if-exists prevents errors if objects don't exist
                # -h localhost forces TCP connection (avoids peer auth issues with kartoza/postgis)
                # PGPASSWORD uses the password from the container environment
                if ! $DC_CMD exec -T postgres bash -c 'PGPASSWORD=$POSTGRES_PASS pg_dump -h localhost -U $POSTGRES_USER --clean --if-exists $POSTGRES_DBNAME' | gzip > "$BACKUP_FILE"; then
                    echo -e "${RED}Database backup FAILED${NC}"
                    send_alert "Backup Failed" "Database backup failed at $(date). Please check the backup logs."
                    exit 1
                fi
                echo -e "${GREEN}Database backup saved to $BACKUP_FILE${NC}"

                # Keep only last 30 backups
                ls -t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
                ;;

            uploads)
                echo -e "${YELLOW}Backing up uploads...${NC}"
                BACKUP_FILE="$BACKUP_DIR/uploads-$(date +%Y%m%d-%H%M%S).tar.gz"
                UPLOAD_VOL=$(docker volume ls -q | grep -E 'timetiles.*uploads' | head -1)
                if [ -n "$UPLOAD_VOL" ]; then
                    if ! docker run --rm -v "$UPLOAD_VOL:/data" -v "$BACKUP_DIR:/backup" alpine \
                        tar czf "/backup/$(basename "$BACKUP_FILE")" -C /data .; then
                        echo -e "${RED}Uploads backup FAILED${NC}"
                        send_alert "Backup Failed" "Uploads backup failed at $(date). Please check the backup logs."
                        exit 1
                    fi
                    echo -e "${GREEN}Uploads backup saved to $BACKUP_FILE${NC}"

                    # Keep only last 30 backups
                    ls -t "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
                else
                    echo -e "${RED}Error: Upload volume not found${NC}"
                    send_alert "Backup Failed" "Uploads backup failed - upload volume not found at $(date)."
                    exit 1
                fi
                ;;

            full)
                echo -e "${YELLOW}Creating full backup (database + uploads)...${NC}"
                TIMESTAMP=$(date +%Y%m%d-%H%M%S)
                BACKUP_FAILED=false

                # Backup database
                # -h localhost forces TCP connection (avoids peer auth issues with kartoza/postgis)
                # PGPASSWORD uses the password from the container environment
                echo "Backing up database..."
                if ! $DC_CMD exec -T postgres bash -c 'PGPASSWORD=$POSTGRES_PASS pg_dump -h localhost -U $POSTGRES_USER --clean --if-exists $POSTGRES_DBNAME' | gzip > "$BACKUP_DIR/db-$TIMESTAMP.sql.gz"; then
                    echo -e "${RED}Database backup FAILED${NC}"
                    BACKUP_FAILED=true
                fi

                # Backup uploads
                echo "Backing up uploads..."
                UPLOAD_VOL=$(docker volume ls -q | grep -E 'timetiles.*uploads' | head -1)
                if [ -n "$UPLOAD_VOL" ]; then
                    if ! docker run --rm -v "$UPLOAD_VOL:/data" -v "$BACKUP_DIR:/backup" alpine \
                        tar czf "/backup/uploads-$TIMESTAMP.tar.gz" -C /data .; then
                        echo -e "${RED}Uploads backup FAILED${NC}"
                        BACKUP_FAILED=true
                    fi
                fi

                if [ "$BACKUP_FAILED" = true ]; then
                    send_alert "Backup Failed" "Full backup failed at $(date). Please check the backup logs."
                    exit 1
                fi

                echo -e "${GREEN}Full backup completed:${NC}"
                echo "  Database: $BACKUP_DIR/db-$TIMESTAMP.sql.gz"
                echo "  Uploads: $BACKUP_DIR/uploads-$TIMESTAMP.tar.gz"
                ;;
                
            auto)
                echo -e "${YELLOW}Setting up automatic daily backups...${NC}"
                
                # Create cron script
                cat > "$BACKUP_DIR/auto-backup.sh" << EOF
#!/bin/bash
cd "$SCRIPT_DIR"
./deploy.sh backup db
EOF
                chmod +x "$BACKUP_DIR/auto-backup.sh"
                
                # Add to crontab (daily at 2 AM)
                CRON_CMD="0 2 * * * $BACKUP_DIR/auto-backup.sh"
                (crontab -l 2>/dev/null | grep -v "$BACKUP_DIR/auto-backup.sh"; echo "$CRON_CMD") | crontab -
                
                echo -e "${GREEN}Automatic backups configured (daily at 2 AM)${NC}"
                echo "To disable: crontab -e (and remove the TimeTiles backup line)"
                ;;
                
            list)
                echo -e "${YELLOW}Available backups:${NC}"
                echo ""
                echo "Database backups:"
                ls -lh "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -10 || echo "  No database backups found"
                echo ""
                echo "Upload backups:"
                ls -lh "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | tail -10 || echo "  No upload backups found"
                ;;
                
            clean)
                # Clean backups older than N days (default: 30)
                CLEAN_DAYS="${3:-30}"
                echo -e "${YELLOW}Cleaning old backups (keeping last $CLEAN_DAYS days)...${NC}"
                DB_DELETED=$(find "$BACKUP_DIR" -name "db-*.sql.gz" -mtime +$CLEAN_DAYS -delete -print | wc -l)
                UPLOADS_DELETED=$(find "$BACKUP_DIR" -name "uploads-*.tar.gz" -mtime +$CLEAN_DAYS -delete -print | wc -l)
                echo "  Removed $DB_DELETED database backup(s)"
                echo "  Removed $UPLOADS_DELETED uploads backup(s)"
                echo -e "${GREEN}Cleanup complete${NC}"
                ;;

            prune)
                # Keep only N most recent backups (default: 5)
                # Verifies newest backup is valid before deleting older ones
                KEEP_COUNT="${3:-5}"
                echo -e "${YELLOW}Pruning backups (keeping $KEEP_COUNT most recent)...${NC}"

                # Verify newest db backup
                NEWEST_DB=$(ls -t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | head -1)
                if [ -n "$NEWEST_DB" ]; then
                    echo -n "Verifying newest database backup... "
                    if gunzip -t "$NEWEST_DB" 2>/dev/null; then
                        echo -e "${GREEN}valid${NC}"
                        # Delete all but newest N
                        DELETED=$(ls -t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | wc -l)
                        ls -t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | xargs rm -f 2>/dev/null || true
                        echo "  Removed $DELETED old database backup(s)"
                    else
                        echo -e "${RED}CORRUPTED - skipping database backup pruning${NC}"
                    fi
                else
                    echo "  No database backups found"
                fi

                # Verify newest uploads backup
                NEWEST_UPLOADS=$(ls -t "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | head -1)
                if [ -n "$NEWEST_UPLOADS" ]; then
                    echo -n "Verifying newest uploads backup... "
                    if tar tzf "$NEWEST_UPLOADS" &>/dev/null; then
                        echo -e "${GREEN}valid${NC}"
                        # Delete all but newest N
                        DELETED=$(ls -t "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | wc -l)
                        ls -t "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | xargs rm -f 2>/dev/null || true
                        echo "  Removed $DELETED old uploads backup(s)"
                    else
                        echo -e "${RED}CORRUPTED - skipping uploads backup pruning${NC}"
                    fi
                else
                    echo "  No uploads backups found"
                fi

                echo -e "${GREEN}Prune complete${NC}"
                ;;

            verify)
                echo -e "${YELLOW}Verifying all backups...${NC}"
                echo ""
                echo "Database backups:"
                for f in "$BACKUP_DIR"/db-*.sql.gz; do
                    [ -f "$f" ] || continue
                    echo -n "  $(basename "$f"): "

                    # Check 1: gzip integrity
                    if ! gunzip -t "$f" 2>/dev/null; then
                        echo -e "${RED}CORRUPTED (gzip invalid)${NC}"
                        continue
                    fi

                    # Check 2: pg_dump header present
                    if ! gunzip -c "$f" 2>/dev/null | head -20 | grep -q "PostgreSQL database dump"; then
                        echo -e "${RED}INVALID (missing pg_dump header)${NC}"
                        continue
                    fi

                    # Check 3: pg_dump completion marker (dump wasn't truncated)
                    if ! gunzip -c "$f" 2>/dev/null | tail -20 | grep -q "PostgreSQL database dump complete"; then
                        echo -e "${YELLOW}WARNING (possibly truncated - missing completion marker)${NC}"
                        continue
                    fi

                    # Check 4: count tables for info
                    TABLE_COUNT=$(gunzip -c "$f" 2>/dev/null | grep -c "^CREATE TABLE" || echo 0)
                    echo -e "${GREEN}valid${NC} ($TABLE_COUNT tables)"
                done
                echo ""
                echo "Upload backups:"
                for f in "$BACKUP_DIR"/uploads-*.tar.gz; do
                    [ -f "$f" ] || continue
                    echo -n "  $(basename "$f"): "
                    if tar tzf "$f" &>/dev/null; then
                        FILE_COUNT=$(tar tzf "$f" 2>/dev/null | wc -l)
                        echo -e "${GREEN}valid${NC} ($FILE_COUNT files)"
                    else
                        echo -e "${RED}CORRUPTED${NC}"
                    fi
                done
                ;;

            *)
                echo "Usage: $0 backup [full|db|uploads|auto|list|prune|verify|clean]"
                echo "  full    - Backup database and uploads (default)"
                echo "  db      - Backup database only"
                echo "  uploads - Backup uploads only"
                echo "  auto    - Setup automatic daily backups"
                echo "  list    - List available backups"
                echo "  prune N - Keep only N most recent backups (default: 5), verify before deleting"
                echo "  verify  - Check integrity of all backup files"
                echo "  clean N - Remove backups older than N days (default: 30)"
                exit 1
                ;;
        esac
        ;;
        
    restore)
        check_env
        BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"

        if [ -z "$2" ]; then
            echo "Usage: $0 restore <backup-file> [uploads-file]"
            echo ""
            echo "Available backups:"
            echo "  Database:"
            ls -1 "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -10 || echo "    No database backups found"
            echo "  Uploads:"
            ls -1 "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | tail -10 || echo "    No upload backups found"
            exit 1
        fi

        # Validate database backup file
        DB_BACKUP="$2"
        if [ ! -f "$DB_BACKUP" ]; then
            # Try in backup directory
            DB_BACKUP="$BACKUP_DIR/$2"
            if [ ! -f "$DB_BACKUP" ]; then
                echo -e "${RED}Error: Database backup file not found: $2${NC}"
                exit 1
            fi
        fi

        # Validate uploads backup file if provided
        UPLOADS_BACKUP=""
        if [ -n "$3" ]; then
            UPLOADS_BACKUP="$3"
            if [ ! -f "$UPLOADS_BACKUP" ]; then
                # Try in backup directory
                UPLOADS_BACKUP="$BACKUP_DIR/$3"
                if [ ! -f "$UPLOADS_BACKUP" ]; then
                    echo -e "${RED}Error: Uploads backup file not found: $3${NC}"
                    exit 1
                fi
            fi
        fi

        # Show what will be restored
        echo ""
        echo -e "${YELLOW}Files to restore:${NC}"
        echo "  Database: $DB_BACKUP"
        if [ -n "$UPLOADS_BACKUP" ]; then
            echo "  Uploads:  $UPLOADS_BACKUP"
        fi
        echo ""

        # Warning about data loss
        echo -e "${RED}WARNING: This will REPLACE ALL EXISTING DATA!${NC}"
        echo -e "${RED}  - Database: All tables will be dropped and recreated${NC}"
        if [ -n "$UPLOADS_BACKUP" ]; then
            echo -e "${RED}  - Uploads: All uploaded files will be deleted${NC}"
        fi
        echo ""
        read -r -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "Restore cancelled"
            exit 0
        fi

        # Restore database
        # -h localhost forces TCP connection (avoids peer auth issues with kartoza/postgis)
        # PGPASSWORD uses the password from the container environment
        echo -e "${YELLOW}Restoring database from $DB_BACKUP...${NC}"
        gunzip < "$DB_BACKUP" | $DC_CMD exec -T postgres bash -c 'PGPASSWORD=$POSTGRES_PASS psql -h localhost -U $POSTGRES_USER $POSTGRES_DBNAME'

        # Restore uploads if provided
        if [ -n "$UPLOADS_BACKUP" ]; then
            echo -e "${YELLOW}Restoring uploads from $UPLOADS_BACKUP...${NC}"
            UPLOAD_VOL=$(docker volume ls -q | grep -E 'timetiles.*uploads' | head -1)
            if [ -n "$UPLOAD_VOL" ]; then
                docker run --rm -v "$UPLOAD_VOL:/data" -v "$(dirname "$UPLOADS_BACKUP"):/backup" alpine \
                    sh -c "rm -rf /data/* && tar xzf /backup/$(basename "$UPLOADS_BACKUP") -C /data"
            else
                echo -e "${YELLOW}Warning: Upload volume not found, skipping uploads restore${NC}"
            fi
        fi

        echo -e "${GREEN}Restore complete!${NC}"
        ;;
        
    status)
        check_env
        echo -e "${YELLOW}Checking service status...${NC}"
        echo ""
        
        # Check PostgreSQL
        echo -n "PostgreSQL: "
        if $DC_CMD exec postgres pg_isready -U timetiles_user -d timetiles > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Healthy${NC}"
        else
            echo -e "${RED}✗ Unhealthy${NC}"
        fi
        
        # Check Web App
        echo -n "Web App: "
        if curl -f -s http://localhost:3000/api/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Healthy${NC}"
        else
            echo -e "${RED}✗ Unhealthy${NC}"
        fi
        
        echo ""
        $DC_CMD ps
        ;;
        
    ssl)
        check_env
        init_ssl
        ;;
        
    update)
        check_env
        echo -e "${YELLOW}Updating and redeploying...${NC}"
        git pull origin main
        $DC_CMD build web
        $DC_CMD up -d --no-deps web
        # Migrations run automatically on container startup via prodMigrations
        echo -e "${GREEN}Update complete! Migrations will run automatically.${NC}"
        ;;
        
    *)
        print_usage
        exit 1
        ;;
esac