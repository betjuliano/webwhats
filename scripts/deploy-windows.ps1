# WebWhats VPS Deployment Script for Windows
# PowerShell script to deploy WebWhats to VPS

param(
    [string]$VpsIP = "207.180.254.250",
    [string]$VpsUser = "root",
    [string]$ProjectName = "webwhats"
)

$RemotePath = "/opt/$ProjectName"

Write-Host "🚀 WebWhats VPS Deployment Script (Windows)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Target: $VpsUser@$VpsIP" -ForegroundColor Yellow
Write-Host "Remote Path: $RemotePath" -ForegroundColor Yellow
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "package.json") -or -not (Test-Path "docker-compose.yml")) {
    Write-Host "❌ Error: This script must be run from the WebWhats project root directory" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Project directory verified" -ForegroundColor Green

# Test SSH connection
Write-Host "🔍 Testing SSH connection..." -ForegroundColor Blue
try {
    $sshTest = ssh -o ConnectTimeout=10 "$VpsUser@$VpsIP" "echo 'SSH connection successful'" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ SSH connection established" -ForegroundColor Green
    } else {
        throw "SSH connection failed"
    }
} catch {
    Write-Host "❌ Cannot connect to VPS. Please ensure:" -ForegroundColor Red
    Write-Host "  - SSH client is installed (OpenSSH)" -ForegroundColor Yellow
    Write-Host "  - SSH key is configured for $VpsUser@$VpsIP" -ForegroundColor Yellow
    Write-Host "  - VPS is running and accessible" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To setup SSH key authentication:" -ForegroundColor Cyan
    Write-Host "  1. Generate SSH key: ssh-keygen -t rsa -b 4096" -ForegroundColor White
    Write-Host "  2. Copy public key: ssh-copy-id $VpsUser@$VpsIP" -ForegroundColor White
    Write-Host "  3. Or manually add key to ~/.ssh/authorized_keys on VPS" -ForegroundColor White
    exit 1
}

# Install Docker on VPS
Write-Host "🐳 Checking Docker installation on VPS..." -ForegroundColor Blue
$dockerCheck = ssh "$VpsUser@$VpsIP" "command -v docker >/dev/null 2>&1 && echo 'installed' || echo 'not_installed'"

if ($dockerCheck -eq "installed") {
    Write-Host "✅ Docker is already installed" -ForegroundColor Green
} else {
    Write-Host "⚠️  Docker not found. Installing Docker..." -ForegroundColor Yellow
    
    $dockerInstallScript = @"
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-`$(uname -s)-`$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Start Docker service
systemctl enable docker
systemctl start docker

# Clean up
rm get-docker.sh

echo "Docker installation completed"
"@

    ssh "$VpsUser@$VpsIP" $dockerInstallScript
    Write-Host "✅ Docker installed successfully" -ForegroundColor Green
}

# Create project directory on VPS
Write-Host "📁 Creating project directory on VPS..." -ForegroundColor Blue
$createDirScript = @"
mkdir -p $RemotePath
cd $RemotePath

# Create necessary directories
mkdir -p logs uploads temp whatsapp_auth docker/nginx/ssl

# Set permissions
chmod 755 logs uploads temp whatsapp_auth

echo "Directory structure created"
"@

ssh "$VpsUser@$VpsIP" $createDirScript
Write-Host "✅ Remote directory structure created" -ForegroundColor Green

# Create .env file
Write-Host "⚙️  Creating environment file..." -ForegroundColor Blue
$envContent = @"
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
"@

# Save .env to temp file and copy to VPS
$envContent | Out-File -FilePath "temp_env_file" -Encoding UTF8
scp "temp_env_file" "$VpsUser@$VpsIP`:$RemotePath/.env"
Remove-Item "temp_env_file"

Write-Host "✅ Environment file created" -ForegroundColor Green
Write-Host "⚠️  IMPORTANT: Update the .env file on VPS with your actual OpenAI API key!" -ForegroundColor Yellow

# Sync project files
Write-Host "📤 Syncing project files to VPS..." -ForegroundColor Blue

# Create exclude file for rsync
$excludeContent = @"
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
"@

$excludeContent | Out-File -FilePath "rsync_exclude" -Encoding UTF8

# Use rsync if available, otherwise use scp
try {
    rsync -avz --progress --delete --exclude-from=rsync_exclude ./ "$VpsUser@$VpsIP`:$RemotePath/"
    Write-Host "✅ Files synced with rsync" -ForegroundColor Green
} catch {
    Write-Host "⚠️  rsync not available, using alternative method..." -ForegroundColor Yellow
    
    # Create tar archive and copy
    tar -czf webwhats_deploy.tar.gz --exclude-from=rsync_exclude .
    scp webwhats_deploy.tar.gz "$VpsUser@$VpsIP`:$RemotePath/"
    
    # Extract on VPS
    ssh "$VpsUser@$VpsIP" "cd $RemotePath && tar -xzf webwhats_deploy.tar.gz && rm webwhats_deploy.tar.gz"
    Remove-Item "webwhats_deploy.tar.gz"
    
    Write-Host "✅ Files copied and extracted" -ForegroundColor Green
}

Remove-Item "rsync_exclude"

# Start services
Write-Host "🚀 Starting services on VPS..." -ForegroundColor Blue
$startServicesScript = @"
cd $RemotePath

# Pull latest images
docker-compose pull

# Build and start services
docker-compose up -d --build

# Wait for services to start
sleep 15

# Check service status
docker-compose ps
"@

ssh "$VpsUser@$VpsIP" $startServicesScript
Write-Host "✅ Services started on VPS" -ForegroundColor Green

# Check service health
Write-Host "🏥 Checking service health..." -ForegroundColor Blue
Start-Sleep -Seconds 10

$healthCheck = ssh "$VpsUser@$VpsIP" "curl -s -f http://localhost:3000/health >/dev/null && echo 'healthy' || echo 'unhealthy'"

if ($healthCheck -eq "healthy") {
    Write-Host "✅ WebWhats service is healthy!" -ForegroundColor Green
    
    # Get service status
    Write-Host "📊 Service Status:" -ForegroundColor Cyan
    ssh "$VpsUser@$VpsIP" "cd $RemotePath && docker-compose ps"
    
    Write-Host "🏥 Health Check Response:" -ForegroundColor Cyan
    ssh "$VpsUser@$VpsIP" "curl -s http://localhost:3000/health"
} else {
    Write-Host "❌ Service health check failed" -ForegroundColor Red
    Write-Host "📋 Recent logs:" -ForegroundColor Yellow
    ssh "$VpsUser@$VpsIP" "cd $RemotePath && docker-compose logs --tail=50 webwhats-app"
}

# Setup firewall
Write-Host "🔥 Setting up firewall..." -ForegroundColor Blue
$firewallScript = @"
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
"@

ssh "$VpsUser@$VpsIP" $firewallScript
Write-Host "✅ Firewall configured" -ForegroundColor Green

# Display final information
Write-Host ""
Write-Host "🎉 WebWhats deployed successfully to VPS!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Access URLs:" -ForegroundColor Cyan
Write-Host "  - Application: http://$VpsIP`:3000" -ForegroundColor White
Write-Host "  - Health Check: http://$VpsIP`:3000/health" -ForegroundColor White
Write-Host "  - WhatsApp Status: http://$VpsIP`:3000/api/whatsapp/status" -ForegroundColor White
Write-Host "  - QR Code: http://$VpsIP`:3000/api/whatsapp/qr" -ForegroundColor White
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Update .env file with your OpenAI API key:" -ForegroundColor Yellow
Write-Host "     ssh $VpsUser@$VpsIP" -ForegroundColor White
Write-Host "     nano $RemotePath/.env" -ForegroundColor White
Write-Host ""
Write-Host "  2. Restart services after updating .env:" -ForegroundColor Yellow
Write-Host "     cd $RemotePath && docker-compose restart" -ForegroundColor White
Write-Host ""
Write-Host "  3. Get QR Code for WhatsApp authentication:" -ForegroundColor Yellow
Write-Host "     curl http://$VpsIP`:3000/api/whatsapp/qr" -ForegroundColor White
Write-Host ""
Write-Host "  4. Monitor logs:" -ForegroundColor Yellow
Write-Host "     ssh $VpsUser@$VpsIP" -ForegroundColor White
Write-Host "     cd $RemotePath && docker-compose logs -f" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Management Commands:" -ForegroundColor Cyan
Write-Host "  - View logs: docker-compose logs -f" -ForegroundColor White
Write-Host "  - Restart: docker-compose restart" -ForegroundColor White
Write-Host "  - Stop: docker-compose down" -ForegroundColor White
Write-Host "  - Update: git pull && docker-compose up -d --build" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  Remember to configure SSL certificates for production use!" -ForegroundColor Yellow