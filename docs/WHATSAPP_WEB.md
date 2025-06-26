# WhatsApp Web Integration Guide

## Overview

WebWhats now uses a direct connection to WhatsApp Web instead of external APIs, providing a more reliable and cost-effective solution for WhatsApp automation.

## How It Works

The system uses the `whatsapp-web.js` library to connect directly to WhatsApp Web through a headless Chrome browser (Puppeteer). This approach:

- **No External Dependencies**: No need for third-party APIs like EvolutionAPI
- **Direct Connection**: Connects directly to WhatsApp Web servers
- **Session Persistence**: Maintains login sessions across restarts
- **Real-time Processing**: Immediate message processing without webhook delays

## Setup Process

### 1. Initial Authentication

When you first start the application, you'll need to authenticate with WhatsApp:

1. **Start the Application**:
   ```bash
   docker-compose up -d
   ```

2. **Check Logs for QR Code**:
   ```bash
   docker-compose logs -f webwhats-app
   ```

3. **Scan QR Code**: Use your WhatsApp mobile app to scan the QR code displayed in the terminal

4. **Authentication Complete**: Once scanned, the session will be saved and the bot will be ready

### 2. Getting QR Code via API

You can also get the QR code through the API:

```bash
curl http://localhost:3000/api/whatsapp/qr
```

Response:
```json
{
  "status": "success",
  "data": {
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "connectionStatus": {
      "state": "qr_code",
      "isReady": false,
      "retryCount": 0
    },
    "instructions": "Scan this QR code with your WhatsApp mobile app"
  }
}
```

### 3. Connection Status

Monitor the connection status:

```bash
curl http://localhost:3000/api/whatsapp/status
```

Response:
```json
{
  "status": "success",
  "data": {
    "connection": {
      "state": "ready",
      "isReady": true,
      "retryCount": 0
    },
    "health": {
      "isReady": true,
      "connectionState": "ready",
      "retryCount": 0,
      "hasQRCode": false,
      "timestamp": "2023-12-01T12:00:00.000Z"
    }
  }
}
```

## Connection States

The WhatsApp Web connection can be in various states:

- **`disconnected`**: Not connected to WhatsApp
- **`qr_code`**: Waiting for QR code scan
- **`authenticated`**: Successfully authenticated
- **`ready`**: Connected and ready to send/receive messages
- **`auth_failed`**: Authentication failed

## Session Management

### Session Persistence

Sessions are automatically saved in the `whatsapp_auth` directory:

```
whatsapp_auth/
├── session-webwhats/
│   ├── Default/
│   └── session.json
```

### Session Recovery

If the session is lost or corrupted:

1. **Delete Session Files**:
   ```bash
   rm -rf whatsapp_auth/session-webwhats
   ```

2. **Restart Application**:
   ```bash
   docker-compose restart webwhats-app
   ```

3. **Re-authenticate**: Scan the new QR code

## API Endpoints

### Send Message

```bash
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": "5511999999999@c.us",
    "message": "Hello from WebWhats!"
  }'
```

### Send Media

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-media \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": "5511999999999@c.us",
    "mediaPath": "/app/uploads/image.jpg",
    "caption": "Check out this image!"
  }'
```

### Get Chat Info

```bash
curl http://localhost:3000/api/whatsapp/chat/5511999999999@c.us
```

### Get All Chats

```bash
curl http://localhost:3000/api/whatsapp/chats?limit=20&type=all
```

### Format Phone Number

```bash
curl -X POST http://localhost:3000/api/whatsapp/format-number \
  -H "Content-Type: application/json" \
  -d '{
    "number": "11999999999"
  }'
```

## Phone Number Formatting

WhatsApp uses specific ID formats:

- **Individual Chats**: `{country_code}{number}@c.us`
  - Example: `5511999999999@c.us` (Brazilian mobile)
  
- **Group Chats**: `{group_id}@g.us`
  - Example: `120363025246125244@g.us`

### Brazilian Numbers

- **Mobile (11 digits)**: `5511999999999@c.us`
- **Landline (10 digits)**: `5511999999999@c.us`
- **With country code**: `5511999999999@c.us`

## Troubleshooting

### Common Issues

1. **QR Code Not Appearing**
   ```bash
   # Check logs
   docker-compose logs webwhats-app
   
   # Restart service
   docker-compose restart webwhats-app
   ```

2. **Authentication Failed**
   ```bash
   # Clear session and restart
   rm -rf whatsapp_auth/session-webwhats
   docker-compose restart webwhats-app
   ```

3. **Connection Lost**
   ```bash
   # Check connection status
   curl http://localhost:3000/api/whatsapp/status
   
   # Restart connection
   curl -X POST http://localhost:3000/api/whatsapp/restart
   ```

4. **Messages Not Sending**
   ```bash
   # Check if ready
   curl http://localhost:3000/api/whatsapp/health
   
   # Verify chat ID format
   curl -X POST http://localhost:3000/api/whatsapp/format-number \
     -H "Content-Type: application/json" \
     -d '{"number": "11999999999"}'
   ```

### Debug Mode

Enable debug logging by setting environment variable:

```bash
# In .env file
LOG_LEVEL=debug
```

### Memory Issues

If you encounter memory issues with Puppeteer:

```bash
# In docker-compose.yml, add memory limits
services:
  webwhats-app:
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
```

## Security Considerations

### Session Security

- **Protect Session Files**: The `whatsapp_auth` directory contains sensitive session data
- **Regular Backups**: Backup session files to avoid re-authentication
- **Access Control**: Limit access to the session directory

### Network Security

- **Firewall**: Only expose necessary ports (3000 for API)
- **HTTPS**: Use SSL certificates in production
- **Rate Limiting**: API endpoints have built-in rate limiting

### WhatsApp Terms

- **Personal Use**: Ensure compliance with WhatsApp Terms of Service
- **Business Account**: Consider WhatsApp Business API for commercial use
- **Rate Limits**: Respect WhatsApp's rate limits to avoid blocks

## Monitoring

### Health Checks

```bash
# Application health
curl http://localhost:3000/health

# WhatsApp connection health
curl http://localhost:3000/api/whatsapp/health
```

### Metrics

Monitor key metrics:

- Connection uptime
- Message processing rate
- Authentication failures
- Session recovery events

### Logs

Important log events to monitor:

- `WhatsApp client is ready!` - Successful connection
- `QR Code received` - Waiting for authentication
- `WhatsApp authentication failed` - Authentication issues
- `WhatsApp client disconnected` - Connection lost

## Best Practices

### 1. Session Management

- **Regular Backups**: Backup session files daily
- **Monitor Expiry**: Sessions can expire, monitor for re-authentication needs
- **Graceful Restarts**: Use proper shutdown procedures

### 2. Message Handling

- **Rate Limiting**: Don't send messages too quickly
- **Error Handling**: Implement retry logic for failed messages
- **Queue Management**: Use queues for high-volume messaging

### 3. Monitoring

- **Health Checks**: Regular health monitoring
- **Alert Setup**: Alerts for connection failures
- **Log Analysis**: Regular log review for issues

### 4. Scaling

- **Single Instance**: WhatsApp Web supports only one active session
- **Load Balancing**: Not applicable for WhatsApp Web connections
- **Horizontal Scaling**: Consider multiple WhatsApp accounts for scaling

## Migration from EvolutionAPI

If migrating from EvolutionAPI:

1. **Update Configuration**: Remove EvolutionAPI settings from `.env`
2. **Database**: Existing message data remains compatible
3. **Webhooks**: No longer needed, direct connection handles events
4. **Authentication**: New QR code authentication required
5. **API Changes**: Update client code to use new WhatsApp Web endpoints

## Support

For WhatsApp Web integration issues:

1. **Check Logs**: Always start with application logs
2. **Connection Status**: Verify connection state via API
3. **Session Files**: Check session file integrity
4. **Network**: Ensure proper network connectivity
5. **Resources**: Monitor memory and CPU usage

---

**Note**: WhatsApp Web integration requires a stable internet connection and sufficient system resources for the headless browser.