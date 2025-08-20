#!/bin/bash

# TimeTiles Production Deployment Script
# Usage: ./deploy.sh [command]

set -e

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ENV_FILE="$SCRIPT_DIR/.env.production"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
DC_CMD="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

# Change to project root for build context
cd "$SCRIPT_DIR/.."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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
    echo "  migrate   - Run database migrations"
    echo "  backup    - Backup management (db|full|auto|list|clean)"
    echo "  restore   - Restore from backup"
    echo "  status    - Check service status"
    echo "  ssl       - Initialize Let's Encrypt SSL certificate"
    echo "  update    - Pull latest code and redeploy"
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
    $DC_CMD run --rm certbot certonly --webroot \
        --webroot-path=/var/www/certbot \
        --email "$LETSENCRYPT_EMAIL" \
        --agree-tos \
        --no-eff-email \
        -d "$DOMAIN_NAME" \
        -d "www.$DOMAIN_NAME"
    
    if [ $? -eq 0 ]; then
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
            PAYLOAD_SECRET=$(openssl rand -base64 32)
            sed -i.bak "s/PAYLOAD_SECRET=.*/PAYLOAD_SECRET=$PAYLOAD_SECRET/" "$ENV_FILE"
            echo -e "${GREEN}Generated PAYLOAD_SECRET${NC}"
            
            echo -e "${YELLOW}Please edit $ENV_FILE and set:${NC}"
            echo "  - DB_PASSWORD"
            echo "  - DOMAIN_NAME (your domain)"
            echo "  - LETSENCRYPT_EMAIL"
            echo "  - GOOGLE_MAPS_API_KEY (optional)"
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
        
    migrate)
        check_env
        echo -e "${YELLOW}Running database migrations...${NC}"
        $DC_CMD exec web pnpm payload:migrate
        echo -e "${GREEN}Migrations complete!${NC}"
        ;;
        
    backup)
        check_env
        BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
        mkdir -p "$BACKUP_DIR"
        
        # Parse sub-command
        case "${2:-db}" in
            db|database)
                echo -e "${YELLOW}Backing up database...${NC}"
                BACKUP_FILE="$BACKUP_DIR/db-$(date +%Y%m%d-%H%M%S).sql.gz"
                $DC_CMD exec -T postgres pg_dump -U timetiles_user timetiles | gzip > "$BACKUP_FILE"
                echo -e "${GREEN}Database backup saved to $BACKUP_FILE${NC}"
                
                # Keep only last 30 backups
                ls -t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
                ;;
                
            full)
                echo -e "${YELLOW}Creating full backup (database + uploads)...${NC}"
                TIMESTAMP=$(date +%Y%m%d-%H%M%S)
                
                # Backup database
                echo "Backing up database..."
                $DC_CMD exec -T postgres pg_dump -U timetiles_user timetiles | gzip > "$BACKUP_DIR/db-$TIMESTAMP.sql.gz"
                
                # Backup uploads
                echo "Backing up uploads..."
                UPLOAD_VOL=$(docker volume ls -q | grep -E 'timetiles.*uploads' | head -1)
                if [ -n "$UPLOAD_VOL" ]; then
                    docker run --rm -v "$UPLOAD_VOL:/data" -v "$BACKUP_DIR:/backup" alpine \
                        tar czf "/backup/uploads-$TIMESTAMP.tar.gz" -C /data .
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
                echo -e "${YELLOW}Cleaning old backups (keeping last 30 days)...${NC}"
                find "$BACKUP_DIR" -name "db-*.sql.gz" -mtime +30 -delete
                find "$BACKUP_DIR" -name "uploads-*.tar.gz" -mtime +30 -delete
                echo -e "${GREEN}Cleanup complete${NC}"
                ;;
                
            *)
                echo "Usage: $0 backup [db|full|auto|list|clean]"
                echo "  db    - Backup database only (default)"
                echo "  full  - Backup database and uploads"
                echo "  auto  - Setup automatic daily backups"
                echo "  list  - List available backups"
                echo "  clean - Remove backups older than 30 days"
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
            ls -1 "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -10 || echo "No backups found"
            exit 1
        fi
        
        BACKUP_FILE="$2"
        if [ ! -f "$BACKUP_FILE" ]; then
            # Try in backup directory
            BACKUP_FILE="$BACKUP_DIR/$2"
            if [ ! -f "$BACKUP_FILE" ]; then
                echo -e "${RED}Error: Backup file not found: $2${NC}"
                exit 1
            fi
        fi
        
        echo -e "${RED}WARNING: This will replace the current database!${NC}"
        read -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "Restore cancelled"
            exit 0
        fi
        
        echo -e "${YELLOW}Restoring database from $BACKUP_FILE...${NC}"
        gunzip < "$BACKUP_FILE" | $DC_CMD exec -T postgres psql -U timetiles_user timetiles
        
        if [ -n "$3" ] && [ -f "$3" ]; then
            echo -e "${YELLOW}Restoring uploads from $3...${NC}"
            UPLOAD_VOL=$(docker volume ls -q | grep -E 'timetiles.*uploads' | head -1)
            if [ -n "$UPLOAD_VOL" ]; then
                docker run --rm -v "$UPLOAD_VOL:/data" -v "$(dirname "$3"):/backup" alpine \
                    sh -c "rm -rf /data/* && tar xzf /backup/$(basename "$3") -C /data"
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
        $DC_CMD exec web pnpm payload:migrate
        echo -e "${GREEN}Update complete!${NC}"
        ;;
        
    *)
        print_usage
        exit 1
        ;;
esac