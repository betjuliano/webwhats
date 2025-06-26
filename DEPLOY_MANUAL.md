# Manual Deployment Guide for VPS

## Quick Deploy Instructions

### Option 1: Using PowerShell Script (Recommended)

1. **Open PowerShell as Administrator**
2. **Navigate to project directory**:
   ```powershell
   cd d:\PROJETOS\webwhats
   ```
3. **Run deployment script**:
   ```powershell
   .\scripts\deploy-windows.ps1
   ```

### Option 2: Manual Upload and Setup

If the automated script doesn't work, follow these manual steps:

## Step 1: Prepare Files for Upload

Create a ZIP file with the project (excluding unnecessary files):

```bash
# Files to include:
- src/
- docker/
- scripts/
- docs/
- package.json
- docker-compose.yml
- Dockerfile
- .env.example
- README.md

# Files to exclude:
- node_modules/
- .git/
- logs/
- uploads/
- temp/
- whatsapp_auth/
```

## Step 2: Connect to VPS

```bash
ssh root@207.180.254.250
```

## Step 3: Install Docker (if not installed)

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Start Docker
systemctl enable docker
systemctl start docker
```

## Step 4: Create Project Directory

```bash
mkdir -p /opt/webwhats
cd /opt/webwhats

# Create necessary directories
mkdir -p logs uploads temp whatsapp_auth docker/nginx/ssl
chmod 755 logs uploads temp whatsapp_auth
```

## Step 5: Upload Project Files

### Using SCP (from Windows):
```bash
scp webwhats.zip root@207.180.254.250:/opt/webwhats/
```

### Or upload via web interface/FTP and then:
```bash
cd /opt/webwhats
unzip webwhats.zip
rm webwhats.zip
```

## Step 6: Create Environment File

```bash
cd /opt/webwhats
nano .env
```

Copy this content to `.env`:

```env
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
```

**IMPORTANT**: Replace `your_openai_api_key_here` with your actual OpenAI API key!

## Step 7: Start Services

```bash
cd /opt/webwhats

# Pull images and start services
docker-compose pull
docker-compose up -d --build

# Check status
docker-compose ps
```

## Step 8: Setup Firewall

```bash
# Install UFW
apt install -y ufw

# Configure firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 3000/tcp  # WebWhats

# Enable firewall
ufw --force enable
ufw status
```

## Step 9: Verify Installation

### Check service health:
```bash
curl http://localhost:3000/health
```

### Check WhatsApp status:
```bash
curl http://localhost:3000/api/whatsapp/status
```

### Get QR Code for authentication:
```bash
curl http://localhost:3000/api/whatsapp/qr
```

## Step 10: WhatsApp Authentication

1. **Get QR Code**:
   ```bash
   curl http://207.180.254.250:3000/api/whatsapp/qr
   ```

2. **Or check logs**:
   ```bash
   docker-compose logs -f webwhats-app
   ```

3. **Scan QR Code** with your WhatsApp mobile app

4. **Verify connection**:
   ```bash
   curl http://207.180.254.250:3000/api/whatsapp/status
   ```

## Access URLs

After successful deployment:

- **Application**: http://207.180.254.250:3000
- **Health Check**: http://207.180.254.250:3000/health
- **WhatsApp Status**: http://207.180.254.250:3000/api/whatsapp/status
- **QR Code**: http://207.180.254.250:3000/api/whatsapp/qr

## Management Commands

```bash
# View logs
cd /opt/webwhats
docker-compose logs -f

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Update application
git pull  # if using git
docker-compose up -d --build

# Check resource usage
docker stats

# Backup WhatsApp session
tar -czf whatsapp_session_backup.tar.gz whatsapp_auth/
```

## Troubleshooting

### Service not starting:
```bash
docker-compose logs webwhats-app
```

### Database issues:
```bash
docker-compose logs postgres
```

### Redis issues:
```bash
docker-compose logs redis
```

### WhatsApp connection issues:
```bash
# Check QR code
curl http://localhost:3000/api/whatsapp/qr

# Restart WhatsApp service
curl -X POST http://localhost:3000/api/whatsapp/restart

# Clear session and re-authenticate
rm -rf whatsapp_auth/session-*
docker-compose restart webwhats-app
```

### Memory issues:
```bash
# Check memory usage
free -h
docker stats

# If needed, add swap
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## Security Recommendations

1. **Change default passwords** in `.env` file
2. **Setup SSL certificates** for HTTPS
3. **Regular backups** of database and WhatsApp session
4. **Monitor logs** for suspicious activity
5. **Keep system updated**: `apt update && apt upgrade`

## Support

If you encounter issues:

1. Check application logs: `docker-compose logs -f`
2. Verify all services are running: `docker-compose ps`
3. Test connectivity: `curl http://localhost:3000/health`
4. Check firewall: `ufw status`
5. Monitor resources: `htop` or `docker stats`

---

**Note**: This deployment guide assumes Ubuntu/Debian VPS. Adjust commands for other Linux distributions as needed.