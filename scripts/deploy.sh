#!/bin/bash

# WebWhats Deployment Script
# This script handles deployment to production environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./backups"
DEPLOY_ENV="${DEPLOY_ENV:-production}"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://localhost:3000/health}"
MAX_HEALTH_CHECKS=30
HEALTH_CHECK_INTERVAL=5

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if service is healthy
check_health() {
    local url=$1
    local max_attempts=$2
    local interval=$3
    
    print_status "Checking service health at $url..."
    
    for ((i=1; i<=max_attempts; i++)); do
        if curl -s -f "$url" > /dev/null 2>&1; then
            print_success "Service is healthy"
            return 0
        else
            print_status "Health check attempt $i/$max_attempts failed, waiting ${interval}s..."
            sleep $interval
        fi
    done
    
    print_error "Service failed health check after $max_attempts attempts"
    return 1
}

# Function to create backup
create_backup() {
    print_status "Creating backup..."
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Generate backup filename with timestamp
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="$BACKUP_DIR/webwhats_backup_$timestamp.sql"
    
    # Create database backup
    if docker-compose exec -T postgres pg_dump -U webwhats webwhats > "$backup_file"; then
        print_success "Database backup created: $backup_file"
        
        # Compress backup
        gzip "$backup_file"
        print_success "Backup compressed: ${backup_file}.gz"
        
        # Keep only last 10 backups
        ls -t "$BACKUP_DIR"/webwhats_backup_*.sql.gz | tail -n +11 | xargs -r rm
        print_status "Old backups cleaned up"
        
        return 0
    else
        print_error "Failed to create database backup"
        return 1
    fi
}

# Function to restore from backup
restore_backup() {
    local backup_file=$1
    
    if [ -z "$backup_file" ]; then
        print_error "Backup file not specified"
        return 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        print_error "Backup file not found: $backup_file"
        return 1
    fi
    
    print_warning "This will restore the database from backup: $backup_file"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Restoring database from backup..."
        
        # Stop application to prevent new connections
        docker-compose stop webwhats-app
        
        # Restore database
        if zcat "$backup_file" | docker-compose exec -T postgres psql -U webwhats webwhats; then
            print_success "Database restored successfully"
            
            # Start application
            docker-compose start webwhats-app
            
            # Check health
            if check_health "$HEALTH_CHECK_URL" 10 3; then
                print_success "Restore completed successfully"
                return 0
            else
                print_error "Application failed to start after restore"
                return 1
            fi
        else
            print_error "Failed to restore database"
            docker-compose start webwhats-app
            return 1
        fi
    else
        print_status "Restore cancelled"
        return 1
    fi
}

# Function to deploy new version
deploy() {
    print_status "Starting deployment process..."
    
    # Check if we're in the right directory
    if [ ! -f "docker-compose.yml" ]; then
        print_error "docker-compose.yml not found. Are you in the right directory?"
        exit 1
    fi
    
    # Check if .env file exists
    if [ ! -f ".env" ]; then
        print_error ".env file not found. Please create it from .env.example"
        exit 1
    fi
    
    # Create backup before deployment
    if ! create_backup; then
        print_error "Backup failed. Aborting deployment."
        exit 1
    fi
    
    # Pull latest images
    print_status "Pulling latest Docker images..."
    if docker-compose pull; then
        print_success "Images pulled successfully"
    else
        print_warning "Failed to pull some images, continuing with existing images"
    fi
    
    # Build new images
    print_status "Building application images..."
    if docker-compose build; then
        print_success "Images built successfully"
    else
        print_error "Failed to build images"
        exit 1
    fi
    
    # Stop services gracefully
    print_status "Stopping services..."
    docker-compose down --timeout 30
    
    # Start services
    print_status "Starting services..."
    docker-compose up -d
    
    # Wait for services to be ready
    print_status "Waiting for services to start..."
    sleep 10
    
    # Check health
    if check_health "$HEALTH_CHECK_URL" "$MAX_HEALTH_CHECKS" "$HEALTH_CHECK_INTERVAL"; then
        print_success "Deployment completed successfully!"
        
        # Show service status
        print_status "Service status:"
        docker-compose ps
        
        return 0
    else
        print_error "Deployment failed - service is not healthy"
        
        # Show logs for debugging
        print_status "Recent logs:"
        docker-compose logs --tail=50 webwhats-app
        
        return 1
    fi
}

# Function to rollback deployment
rollback() {
    print_warning "Rolling back to previous version..."
    
    # Find latest backup
    local latest_backup=$(ls -t "$BACKUP_DIR"/webwhats_backup_*.sql.gz 2>/dev/null | head -n 1)
    
    if [ -z "$latest_backup" ]; then
        print_error "No backup found for rollback"
        exit 1
    fi
    
    print_status "Rolling back using backup: $latest_backup"
    
    if restore_backup "$latest_backup"; then
        print_success "Rollback completed successfully"
    else
        print_error "Rollback failed"
        exit 1
    fi
}

# Function to show logs
show_logs() {
    local service=${1:-webwhats-app}
    local lines=${2:-100}
    
    print_status "Showing logs for $service (last $lines lines)..."
    docker-compose logs --tail="$lines" -f "$service"
}

# Function to show status
show_status() {
    print_status "Service status:"
    docker-compose ps
    
    echo ""
    print_status "Health check:"
    if curl -s -f "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
        print_success "Service is healthy"
        curl -s "$HEALTH_CHECK_URL" | jq . 2>/dev/null || curl -s "$HEALTH_CHECK_URL"
    else
        print_error "Service is not healthy"
    fi
    
    echo ""
    print_status "Resource usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
}

# Function to clean up old data
cleanup() {
    print_status "Cleaning up old data..."
    
    # Clean Docker images
    print_status "Removing unused Docker images..."
    docker image prune -f
    
    # Clean Docker volumes (be careful with this)
    read -p "Do you want to clean unused Docker volumes? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker volume prune -f
        print_success "Unused volumes cleaned"
    fi
    
    # Clean old logs
    print_status "Cleaning old log files..."
    find logs/ -name "*.log" -mtime +30 -delete 2>/dev/null || true
    
    # Clean old temp files
    print_status "Cleaning old temp files..."
    find temp/ -type f -mtime +1 -delete 2>/dev/null || true
    
    print_success "Cleanup completed"
}

# Function to show help
show_help() {
    echo "WebWhats Deployment Script"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  deploy              Deploy new version"
    echo "  rollback            Rollback to previous version"
    echo "  backup              Create database backup"
    echo "  restore [FILE]      Restore from backup file"
    echo "  logs [SERVICE]      Show logs for service (default: webwhats-app)"
    echo "  status              Show service status and health"
    echo "  cleanup             Clean up old data and Docker resources"
    echo "  help                Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  DEPLOY_ENV          Deployment environment (default: production)"
    echo "  HEALTH_CHECK_URL    Health check URL (default: http://localhost:3000/health)"
    echo ""
    echo "Examples:"
    echo "  $0 deploy"
    echo "  $0 rollback"
    echo "  $0 logs webwhats-app"
    echo "  $0 restore ./backups/webwhats_backup_20231201_120000.sql.gz"
}

# Main execution
main() {
    local command=${1:-help}
    
    case $command in
        deploy)
            deploy
            ;;
        rollback)
            rollback
            ;;
        backup)
            create_backup
            ;;
        restore)
            restore_backup "$2"
            ;;
        logs)
            show_logs "$2" "$3"
            ;;
        status)
            show_status
            ;;
        cleanup)
            cleanup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"