#!/bin/bash

# WebWhats Setup Script
# This script sets up the WebWhats environment

set -e

echo "🚀 Setting up WebWhats..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if Docker is installed
check_docker() {
    print_status "Checking Docker installation..."
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    print_success "Docker and Docker Compose are installed"
}

# Check if .env file exists
check_env_file() {
    print_status "Checking environment configuration..."
    if [ ! -f .env ]; then
        print_warning ".env file not found. Creating from .env.example..."
        if [ -f .env.example ]; then
            cp .env.example .env
            print_success ".env file created from .env.example"
            print_warning "Please edit .env file with your configuration before continuing"
            echo ""
            echo "Required configurations:"
            echo "- POSTGRES_PASSWORD"
            echo "- REDIS_PASSWORD"
            echo "- EVOLUTION_API_URL"
            echo "- EVOLUTION_API_KEY"
            echo "- OPENAI_API_KEY"
            echo "- WEBHOOK_SECRET"
            echo ""
            read -p "Press Enter after configuring .env file..."
        else
            print_error ".env.example file not found"
            exit 1
        fi
    else
        print_success ".env file found"
    fi
}

# Validate required environment variables
validate_env() {
    print_status "Validating environment variables..."
    
    source .env
    
    required_vars=(
        "POSTGRES_PASSWORD"
        "REDIS_PASSWORD"
        "EVOLUTION_API_URL"
        "EVOLUTION_API_KEY"
        "OPENAI_API_KEY"
        "WEBHOOK_SECRET"
    )
    
    missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        print_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        exit 1
    fi
    
    print_success "All required environment variables are set"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    
    directories=(
        "logs"
        "uploads"
        "temp"
        "docker/nginx/ssl"
    )
    
    for dir in "${directories[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            print_success "Created directory: $dir"
        fi
    done
}

# Generate SSL certificates (self-signed for development)
generate_ssl_certs() {
    print_status "Checking SSL certificates..."
    
    if [ ! -f "docker/nginx/ssl/cert.pem" ] || [ ! -f "docker/nginx/ssl/key.pem" ]; then
        print_warning "SSL certificates not found. Generating self-signed certificates..."
        
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout docker/nginx/ssl/key.pem \
            -out docker/nginx/ssl/cert.pem \
            -subj "/C=BR/ST=SP/L=SaoPaulo/O=WebWhats/CN=localhost"
        
        print_success "Self-signed SSL certificates generated"
        print_warning "For production, replace with proper SSL certificates"
    else
        print_success "SSL certificates found"
    fi
}

# Install Node.js dependencies
install_dependencies() {
    print_status "Installing Node.js dependencies..."
    
    if [ -f "package.json" ]; then
        npm install
        print_success "Node.js dependencies installed"
    else
        print_error "package.json not found"
        exit 1
    fi
}

# Build Docker images
build_images() {
    print_status "Building Docker images..."
    
    docker-compose build
    print_success "Docker images built successfully"
}

# Start services
start_services() {
    print_status "Starting services..."
    
    docker-compose up -d
    print_success "Services started"
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    sleep 10
    
    # Check service health
    check_service_health
}

# Check service health
check_service_health() {
    print_status "Checking service health..."
    
    max_attempts=30
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:3000/health > /dev/null; then
            print_success "WebWhats service is healthy"
            break
        else
            print_status "Waiting for WebWhats service... (attempt $attempt/$max_attempts)"
            sleep 2
            ((attempt++))
        fi
    done
    
    if [ $attempt -gt $max_attempts ]; then
        print_error "WebWhats service failed to start properly"
        print_status "Checking logs..."
        docker-compose logs webwhats-app
        exit 1
    fi
}

# Display final information
display_info() {
    print_success "WebWhats setup completed successfully!"
    echo ""
    echo "🌐 Service URLs:"
    echo "  - Application: http://localhost:3000"
    echo "  - Health Check: http://localhost:3000/health"
    echo "  - Metrics: http://localhost:3000/metrics"
    echo "  - Database: localhost:5432"
    echo "  - Redis: localhost:6379"
    echo ""
    echo "📋 Useful commands:"
    echo "  - View logs: docker-compose logs -f"
    echo "  - Stop services: docker-compose down"
    echo "  - Restart services: docker-compose restart"
    echo "  - Update services: docker-compose pull && docker-compose up -d"
    echo ""
    echo "📖 Next steps:"
    echo "  1. Configure your EvolutionAPI webhook to: http://your-domain:3000/webhook/evolution"
    echo "  2. Set up your WhatsApp instance in EvolutionAPI"
    echo "  3. Test the webhook integration"
    echo ""
    print_warning "Remember to configure proper SSL certificates for production!"
}

# Main execution
main() {
    echo "🤖 WebWhats - WhatsApp Chatbot Setup"
    echo "===================================="
    echo ""
    
    check_docker
    check_env_file
    validate_env
    create_directories
    generate_ssl_certs
    install_dependencies
    build_images
    start_services
    display_info
}

# Run main function
main "$@"