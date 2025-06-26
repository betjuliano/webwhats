#!/bin/bash

# Deploy WebWhats to VPS
# Usage: ./scripts/deploy-to-vps.sh [VPS_IP] [USER]

set -e

# Configuration
VPS_IP=${1:-"207.180.254.250"}
VPS_USER=${2:-"root"}
PROJECT_NAME="webwhats"
REMOTE_PATH="/opt/$PROJECT_NAME"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if we're in the right directory
check_project_directory() {
    if [ ! -f "package.json" ] || [ ! -f "docker-compose.yml" ]; then
        print_error "This script must be run from the WebWhats project root directory"
        exit 1
    fi
    print_success "Project directory verified"
}

# Test SSH connection
test_ssh_connection() {
    print_status "Testing SSH connection to $VPS_USER@$VPS_IP..."
    
    if ssh -o ConnectTimeout=10 -o BatchMode=yes "$VPS_USER@$VPS_IP" "echo 'SSH connection successful'" 2>/dev/null; then
        print_success "SSH connection established"
    else
        print_error "Cannot connect to VPS. Please check:"
        echo "  - VPS IP address: $VPS_IP"
        echo "  - SSH user: $VPS_USER"
        echo "  - SSH key authentication"
        echo "  - VPS is running and accessible"
        exit 1
    fi
}

# Install Docker on VPS if not present
install_docker_on_vps() {
    print_status "Checking Docker installation on VPS..."
    
    if ssh "$VPS_USER@$VPS_IP" "command -v docker >/dev/null 2>&1"; then
        print_success "Docker is already installed"
    else
        print_warning "Docker not found. Installing Docker..."
        
        ssh "$VPS_USER@$VPS_IP" "
            # Update system
            apt update && apt upgrade -y
            
            # Install Docker
            curl -fsSL https://get.docker.com -o get-docker.sh
            sh get-docker.sh
            
            # Install Docker Compose
            curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)\" -o /usr/local/bin/docker-compose
            chmod +x /usr/local/bin/docker-compose
            
            # Start Docker service
            systemctl enable docker
            systemctl start docker
            
            # Clean up
            rm get-docker.sh
        "
        
        print_success "Docker installed successfully"
    fi
}

# Create project directory on VPS
create_remote_directory() {
    print_status "Creating project directory on VPS..."
    
    ssh "$VPS_USER@$VPS_IP" "
        mkdir -p $REMOTE_PATH
        cd $REMOTE_PATH
        
        # Create necessary directories
        mkdir -p logs uploads temp whatsapp_auth docker/nginx/ssl
        
        # Set permissions
        chmod 755 logs uploads temp whatsapp_auth
    "
    
    print_success "Remote directory structure created"
}

# Create .env file on VPS
create_env_file() {
    print_status "Creating environment file on VPS..."
    
    # Create a production .env file
    cat > /tmp/webwhats.env << 'EOF'
# Node.js Environment
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database Configuration
POSTGRES_DB=webwhats
POSTGRES_USER=webwhats
POSTGRES_PASSWORD=WebWhats2024!SecurePassword
DATABASE_URL=postgresql://webwhats:WebWhats2024!SecurePassword@postgres:5432/webwhats

# Redis Configuration
REDIS_PASSWORD=Redis2024!SecurePassword
REDIS_URL=redis://:Redis2024!SecurePassword@redis:6379

# WhatsApp Web Configuration
WHATSAPP_CLIENT_ID=webwhats_production
WHATSAPP_AUTH_PATH=./whatsapp_auth

# OpenAI Configuration (REQUIRED - UPDATE WITH YOUR KEY)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=2000

# Security
JWT_SECRET=WebWhats2024!JWTSecretKey!ChangeThis
WEBHOOK_SECRET=WebWhats2024!WebhookSecret!ChangeThis

# Features
ENABLE_METRICS=true
ENABLE_CRON=true

# File Upload
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=50MB

# Admin Configuration (UPDATE WITH YOUR PHONE)
ADMIN_PHONE=5511999999999

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
WEBHOOK_RATE_LIMIT_MAX=3000
EOF

    # Copy .env file to VPS
    scp /tmp/webwhats.env "$VPS_USER@$VPS_IP:$REMOTE_PATH/.env"
    rm /tmp/webwhats.env
    
    print_success "Environment file created"
    print_warning "IMPORTANT: Update the .env file on VPS with your actual API keys!"
    print_warning "SSH to VPS and edit: $REMOTE_PATH/.env"
}

# Sync project files to VPS
sync_project_files() {
    print_status "Syncing project files to VPS..."
    
    # Create list of files to exclude
    cat > /tmp/rsync_exclude << 'EOF'
node_modules/
.git/
.env
logs/
uploads/
temp/
whatsapp_auth/
*.log
.DS_Store
Thumbs.db
EOF

    # Sync files using rsync
    rsync -avz --progress --delete \
        --exclude-from=/tmp/rsync_exclude \
        ./ "$VPS_USER@$VPS_IP:$REMOTE_PATH/"
    
    rm /tmp/rsync_exclude
    
    print_success "Project files synced successfully"
}

# Start services on VPS
start_services() {
    print_status "Starting services on VPS..."
    
    ssh "$VPS_USER@$VPS_IP" "
        cd $REMOTE_PATH
        
        # Pull latest images
        docker-compose pull
        
        # Build and start services
        docker-compose up -d --build
        
        # Wait for services to start
        sleep 15
        
        # Check service status
        docker-compose ps
    "
    
    print_success "Services started on VPS"
}

# Check service health
check_service_health() {
    print_status "Checking service health..."
    
    # Wait a bit more for services to fully start
    sleep 10
    
    if ssh "$VPS_USER@$VPS_IP" "curl -s -f http://localhost:3000/health >/dev/null"; then
        print_success "WebWhats service is healthy!"
        
        # Get service status
        ssh "$VPS_USER@$VPS_IP" "
            cd $REMOTE_PATH
            echo '=== Service Status ==='
            docker-compose ps
            echo ''
            echo '=== Health Check ==='
            curl -s http://localhost:3000/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3000/health
        "
    else
        print_error "Service health check failed"
        print_status "Checking logs..."
        ssh "$VPS_USER@$VPS_IP" "
            cd $REMOTE_PATH
            docker-compose logs --tail=50 webwhats-app
        "
        return 1
    fi
}

# Setup firewall
setup_firewall() {
    print_status "Setting up firewall..."
    
    ssh "$VPS_USER@$VPS_IP" "
        # Install ufw if not present
        apt install -y ufw
        
        # Reset firewall
        ufw --force reset
        
        # Default policies
        ufw default deny incoming
        ufw default allow outgoing
        
        # Allow SSH
        ufw allow 22/tcp
        
        # Allow HTTP and HTTPS
        ufw allow 80/tcp
        ufw allow 443/tcp
        
        # Allow WebWhats port
        ufw allow 3000/tcp
        
        # Enable firewall
        ufw --force enable
        
        # Show status
        ufw status
    "
    
    print_success "Firewall configured"
}

# Display final information
display_final_info() {
    print_success "🎉 WebWhats deployed successfully to VPS!"
    echo ""
    echo "🌐 Access URLs:"
    echo "  - Application: http://$VPS_IP:3000"
    echo "  - Health Check: http://$VPS_IP:3000/health"
    echo "  - WhatsApp Status: http://$VPS_IP:3000/api/whatsapp/status"
    echo "  - QR Code: http://$VPS_IP:3000/api/whatsapp/qr"
    echo ""
    echo "📋 Next Steps:"
    echo "  1. Update .env file with your OpenAI API key:"
    echo "     ssh $VPS_USER@$VPS_IP"
    echo "     nano $REMOTE_PATH/.env"
    echo ""
    echo "  2. Restart services after updating .env:"
    echo "     cd $REMOTE_PATH && docker-compose restart"
    echo ""
    echo "  3. Get QR Code for WhatsApp authentication:"
    echo "     curl http://$VPS_IP:3000/api/whatsapp/qr"
    echo ""
    echo "  4. Monitor logs:"
    echo "     ssh $VPS_USER@$VPS_IP"
    echo "     cd $REMOTE_PATH && docker-compose logs -f"
    echo ""
    echo "🔧 Management Commands:"
    echo "  - View logs: docker-compose logs -f"
    echo "  - Restart: docker-compose restart"
    echo "  - Stop: docker-compose down"
    echo "  - Update: git pull && docker-compose up -d --build"
    echo ""
    print_warning "Remember to configure SSL certificates for production use!"
}

# Main deployment function
main() {
    echo "🚀 WebWhats VPS Deployment Script"
    echo "=================================="
    echo "Target: $VPS_USER@$VPS_IP"
    echo "Remote Path: $REMOTE_PATH"
    echo ""
    
    check_project_directory
    test_ssh_connection
    install_docker_on_vps
    create_remote_directory
    create_env_file
    sync_project_files
    start_services
    
    if check_service_health; then
        setup_firewall
        display_final_info
    else
        print_error "Deployment completed but service is not healthy"
        print_status "Please check the logs and configuration"
        exit 1
    fi
}

# Run main function
main "$@"