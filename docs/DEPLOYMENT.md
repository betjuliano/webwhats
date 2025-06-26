# WebWhats Deployment Guide

## Overview

This guide covers deploying WebWhats in different environments, from development to production.

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Git
- SSL certificates (for production)
- EvolutionAPI instance
- OpenAI API key

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd webwhats
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### 2. Configure Environment

Copy and edit the environment file:

```bash
cp .env.example .env
# Edit .env with your configuration
```

Required environment variables:
- `POSTGRES_PASSWORD` - Database password
- `REDIS_PASSWORD` - Redis password
- `EVOLUTION_API_URL` - EvolutionAPI endpoint
- `EVOLUTION_API_KEY` - EvolutionAPI key
- `OPENAI_API_KEY` - OpenAI API key
- `WEBHOOK_SECRET` - Webhook security secret

### 3. Start Services

```bash
docker-compose up -d
```

## Environment Configurations

### Development Environment

For local development with hot reload:

```bash
# Install dependencies
npm install

# Start only infrastructure services
docker-compose up -d postgres redis

# Start application in development mode
npm run dev
```

Development features:
- Hot reload with nodemon
- Detailed error messages
- Debug logging
- No SSL requirement

### Staging Environment

Staging environment mimics production:

```bash
# Use staging environment file
cp .env.example .env.staging
# Configure staging-specific values

# Deploy to staging
DEPLOY_ENV=staging ./scripts/deploy.sh deploy
```

### Production Environment

#### Server Requirements

**Minimum Requirements:**
- 2 CPU cores
- 4GB RAM
- 50GB storage
- Ubuntu 20.04+ or similar

**Recommended:**
- 4 CPU cores
- 8GB RAM
- 100GB SSD storage
- Load balancer (for high availability)

#### Production Setup

1. **Server Preparation**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Reboot to apply group changes
sudo reboot
```

2. **SSL Certificates**

For production, use proper SSL certificates:

```bash
# Using Let's Encrypt with Certbot
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates to nginx directory
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem docker/nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem docker/nginx/ssl/key.pem
```

3. **Production Environment File**

```bash
# Create production environment
cp .env.example .env

# Configure production values
NODE_ENV=production
LOG_LEVEL=info
ENABLE_METRICS=true

# Database (use strong passwords)
POSTGRES_PASSWORD=your_very_secure_password
DATABASE_URL=postgresql://webwhats:your_very_secure_password@postgres:5432/webwhats

# Redis (use strong password)
REDIS_PASSWORD=your_very_secure_redis_password
REDIS_URL=redis://:your_very_secure_redis_password@redis:6379

# EvolutionAPI
EVOLUTION_API_URL=https://your-evolution-api.com
EVOLUTION_API_KEY=your_evolution_api_key
EVOLUTION_INSTANCE_NAME=webwhats_production
EVOLUTION_WEBHOOK_URL=https://your-domain.com/webhook/evolution

# OpenAI
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=2000

# Security
JWT_SECRET=your_very_secure_jwt_secret
WEBHOOK_SECRET=your_very_secure_webhook_secret

# Admin notifications
ADMIN_PHONE=5511999999999
```

4. **Deploy to Production**

```bash
# Deploy
./scripts/deploy.sh deploy

# Verify deployment
./scripts/deploy.sh status
```

## High Availability Setup

### Load Balancer Configuration

Use Nginx or HAProxy as a load balancer:

```nginx
upstream webwhats_backend {
    server webwhats-1:3000;
    server webwhats-2:3000;
    server webwhats-3:3000;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://webwhats_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Database Clustering

For high availability, consider PostgreSQL clustering:

```yaml
# docker-compose.ha.yml
services:
  postgres-primary:
    image: postgres:15-alpine
    environment:
      POSTGRES_REPLICATION_MODE: master
      POSTGRES_REPLICATION_USER: replicator
      POSTGRES_REPLICATION_PASSWORD: replication_password
    
  postgres-replica:
    image: postgres:15-alpine
    environment:
      POSTGRES_REPLICATION_MODE: slave
      POSTGRES_MASTER_HOST: postgres-primary
      POSTGRES_REPLICATION_USER: replicator
      POSTGRES_REPLICATION_PASSWORD: replication_password
```

### Redis Clustering

```yaml
# Redis Sentinel for high availability
redis-sentinel:
  image: redis:7-alpine
  command: redis-sentinel /etc/redis/sentinel.conf
  volumes:
    - ./redis/sentinel.conf:/etc/redis/sentinel.conf
```

## Monitoring and Observability

### Prometheus + Grafana

```yaml
# monitoring/docker-compose.yml
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      
  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
```

### Log Aggregation

Use ELK stack or similar:

```yaml
# logging/docker-compose.yml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.5.0
    
  logstash:
    image: docker.elastic.co/logstash/logstash:8.5.0
    
  kibana:
    image: docker.elastic.co/kibana/kibana:8.5.0
    ports:
      - "5601:5601"
```

## Backup and Recovery

### Automated Backups

Set up automated backups using cron:

```bash
# Add to crontab
0 2 * * * /path/to/webwhats/scripts/deploy.sh backup
0 4 * * 0 /path/to/webwhats/scripts/deploy.sh cleanup
```

### Backup Strategy

1. **Database Backups**: Daily PostgreSQL dumps
2. **File Backups**: Weekly backup of uploads and logs
3. **Configuration Backups**: Version control for configurations
4. **Retention**: Keep 30 daily, 12 weekly, 12 monthly backups

### Recovery Procedures

```bash
# Restore from backup
./scripts/deploy.sh restore /path/to/backup.sql.gz

# Rollback deployment
./scripts/deploy.sh rollback
```

## Security Considerations

### Network Security

1. **Firewall Configuration**

```bash
# UFW firewall rules
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

2. **Docker Security**

```yaml
# docker-compose.yml security settings
services:
  webwhats-app:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    user: "1000:1000"
```

### Application Security

1. **Environment Variables**: Never commit secrets to version control
2. **Webhook Signatures**: Always validate webhook signatures
3. **Rate Limiting**: Implement proper rate limiting
4. **Input Validation**: Validate all inputs
5. **HTTPS Only**: Force HTTPS in production

### Database Security

```sql
-- Create read-only user for monitoring
CREATE USER monitoring WITH PASSWORD 'monitoring_password';
GRANT CONNECT ON DATABASE webwhats TO monitoring;
GRANT USAGE ON SCHEMA public TO monitoring;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO monitoring;
```

## Performance Optimization

### Database Optimization

```sql
-- Optimize PostgreSQL settings
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
SELECT pg_reload_conf();
```

### Redis Optimization

```conf
# redis.conf optimizations
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### Application Optimization

1. **Connection Pooling**: Configure proper database connection pools
2. **Caching**: Implement Redis caching for frequently accessed data
3. **Queue Processing**: Optimize queue worker concurrency
4. **Memory Management**: Monitor and optimize memory usage

## Troubleshooting

### Common Issues

1. **Service Won't Start**

```bash
# Check logs
docker-compose logs webwhats-app

# Check health
curl http://localhost:3000/health/detailed
```

2. **Database Connection Issues**

```bash
# Test database connection
docker-compose exec postgres psql -U webwhats -d webwhats -c "SELECT 1;"
```

3. **Redis Connection Issues**

```bash
# Test Redis connection
docker-compose exec redis redis-cli ping
```

4. **Webhook Not Receiving Events**

```bash
# Test webhook endpoint
curl -X POST http://localhost:3000/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### Performance Issues

1. **High Memory Usage**

```bash
# Check memory usage
docker stats

# Analyze heap dump (if needed)
docker-compose exec webwhats-app node --inspect
```

2. **Slow Database Queries**

```sql
-- Enable query logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();
```

3. **Queue Backlog**

```bash
# Check queue status
curl http://localhost:3000/api/queue/stats
```

## Maintenance

### Regular Maintenance Tasks

1. **Weekly**:
   - Review logs for errors
   - Check disk space
   - Verify backups
   - Update dependencies

2. **Monthly**:
   - Security updates
   - Performance review
   - Capacity planning
   - Backup testing

3. **Quarterly**:
   - Full security audit
   - Disaster recovery testing
   - Performance optimization
   - Documentation updates

### Update Procedures

```bash
# Update to latest version
git pull origin main
./scripts/deploy.sh deploy

# Rollback if needed
./scripts/deploy.sh rollback
```

## Support and Resources

### Monitoring Dashboards

- Application: `http://your-domain.com/health/detailed`
- Metrics: `http://your-domain.com/metrics`
- Database: PostgreSQL monitoring tools
- Logs: Centralized logging system

### Documentation

- [API Documentation](./API.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Development Guide](./DEVELOPMENT.md)

### Getting Help

1. Check application logs
2. Review health endpoints
3. Consult documentation
4. Check GitHub issues
5. Contact support team

---

**Remember**: Always test deployments in staging before production!