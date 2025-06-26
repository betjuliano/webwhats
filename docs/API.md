# WebWhats API Documentation

## Overview

WebWhats provides a RESTful API for managing WhatsApp messages, summaries, and system monitoring. All API endpoints return JSON responses and use standard HTTP status codes.

## Base URL

```
https://your-domain.com/api
```

## Authentication

Currently, the API uses basic rate limiting. For production deployments, implement proper authentication using JWT tokens or API keys.

## Rate Limiting

- API endpoints: 100 requests per 15 minutes per IP
- Webhook endpoints: 3000 requests per 15 minutes per IP

## Response Format

All API responses follow this format:

```json
{
  "status": "success|error",
  "message": "Human readable message",
  "data": {
    // Response data
  }
}
```

## Error Codes

- `400` - Bad Request (validation errors)
- `401` - Unauthorized
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `429` - Too Many Requests
- `500` - Internal Server Error
- `503` - Service Unavailable

---

## Messages API

### Get Messages for Chat

Retrieve messages for a specific chat with pagination and filtering options.

```http
GET /api/messages/{chatId}
```

**Parameters:**
- `chatId` (path, required) - WhatsApp chat ID
- `limit` (query, optional) - Number of messages to return (1-100, default: 50)
- `offset` (query, optional) - Number of messages to skip (default: 0)
- `startDate` (query, optional) - Filter messages from this date (ISO 8601)
- `endDate` (query, optional) - Filter messages until this date (ISO 8601)

**Example:**
```bash
curl "https://your-domain.com/api/messages/5511999999999@s.whatsapp.net?limit=20&offset=0"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "messages": [
      {
        "id": 1,
        "message_id": "3EB0C767D82A1E90D212",
        "chat_id": "5511999999999@s.whatsapp.net",
        "sender_id": "5511999999999@s.whatsapp.net",
        "sender_name": "John Doe",
        "message_type": "text",
        "content": "Hello, world!",
        "media_url": null,
        "media_type": null,
        "is_group": false,
        "processed": true,
        "created_at": "2023-12-01T10:30:00Z",
        "transcription": null,
        "description": null,
        "summary": null,
        "processing_status": null
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

### Get Message by ID

Retrieve a specific message by its ID.

```http
GET /api/messages/message/{messageId}
```

**Parameters:**
- `messageId` (path, required) - Message ID

### Search Messages

Search messages in a chat using full-text search.

```http
GET /api/messages/{chatId}/search
```

**Parameters:**
- `chatId` (path, required) - WhatsApp chat ID
- `q` (query, required) - Search query
- `limit` (query, optional) - Number of results (1-50, default: 20)
- `messageType` (query, optional) - Filter by message type

**Example:**
```bash
curl "https://your-domain.com/api/messages/5511999999999@g.us/search?q=meeting&limit=10"
```

### Get Chat Statistics

Get statistics for a chat including message counts and activity patterns.

```http
GET /api/messages/{chatId}/stats
```

**Parameters:**
- `chatId` (path, required) - WhatsApp chat ID
- `period` (query, optional) - Time period (24h, 48h, 1week, 1month, default: 24h)

**Response:**
```json
{
  "status": "success",
  "data": {
    "period": "24h",
    "statistics": {
      "total_messages": 45,
      "text_messages": 30,
      "image_messages": 10,
      "audio_messages": 3,
      "video_messages": 1,
      "document_messages": 1,
      "unique_senders": 8,
      "first_message": "2023-12-01T00:15:00Z",
      "last_message": "2023-12-01T23:45:00Z"
    },
    "topSenders": [
      {
        "sender_id": "5511999999999@s.whatsapp.net",
        "sender_name": "John Doe",
        "message_count": 15
      }
    ],
    "hourlyDistribution": [
      {"hour": 9, "message_count": 5},
      {"hour": 10, "message_count": 8}
    ]
  }
}
```

### Get Recent Chats

Get list of recent chats with last message information.

```http
GET /api/messages
```

**Parameters:**
- `limit` (query, optional) - Number of chats (1-50, default: 20)
- `type` (query, optional) - Chat type (individual, group, all, default: all)

---

## Summaries API

### Get Summaries for Chat

Retrieve summaries for a specific group chat.

```http
GET /api/summaries/{chatId}
```

**Parameters:**
- `chatId` (path, required) - WhatsApp group chat ID
- `period` (query, optional) - Summary period (24h, 48h, 1week)
- `limit` (query, optional) - Number of summaries (1-50, default: 10)
- `offset` (query, optional) - Number of summaries to skip (default: 0)

**Response:**
```json
{
  "status": "success",
  "data": {
    "summaries": [
      {
        "id": 1,
        "chat_id": "5511999999999@g.us",
        "summary_period": "24h",
        "summary_text": "The group discussed the upcoming project deadline...",
        "message_count": 45,
        "start_date": "2023-12-01T00:00:00Z",
        "end_date": "2023-12-01T23:59:59Z",
        "created_at": "2023-12-02T06:00:00Z"
      }
    ],
    "pagination": {
      "total": 5,
      "limit": 10,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

### Generate New Summary

Request generation of a new summary for a group chat.

```http
POST /api/summaries/{chatId}/generate
```

**Parameters:**
- `chatId` (path, required) - WhatsApp group chat ID

**Body:**
```json
{
  "period": "24h",
  "force": false
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Summary generation started",
  "data": {
    "jobId": "12345",
    "chatId": "5511999999999@g.us",
    "period": "24h",
    "messageCount": 45,
    "estimatedTime": 5
  }
}
```

### Get Cached Summary

Retrieve a cached summary if available.

```http
GET /api/summaries/{chatId}/cached
```

**Parameters:**
- `chatId` (path, required) - WhatsApp group chat ID
- `period` (query, required) - Summary period (24h, 48h, 1week)

### Search Summaries

Search through summaries using full-text search.

```http
GET /api/summaries/search
```

**Parameters:**
- `q` (query, required) - Search query
- `period` (query, optional) - Filter by period
- `limit` (query, optional) - Number of results (1-50, default: 20)
- `chatId` (query, optional) - Filter by specific chat

### Get Summary Statistics

Get overview statistics for summaries.

```http
GET /api/summaries/stats/overview
```

**Parameters:**
- `period` (query, optional) - Time period for stats (24h, 48h, 1week, 1month, default: 1week)

---

## Health and Monitoring

### Basic Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2023-12-01T12:00:00Z",
  "uptime": 3600,
  "environment": "production",
  "version": "1.0.0"
}
```

### Detailed Health Check

```http
GET /health/detailed
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2023-12-01T12:00:00Z",
  "uptime": 3600,
  "environment": "production",
  "version": "1.0.0",
  "dependencies": {
    "database": {
      "status": "healthy",
      "responseTime": 5
    },
    "redis": {
      "status": "healthy",
      "responseTime": 2
    }
  },
  "memory": {
    "rss": "150 MB",
    "heapTotal": "120 MB",
    "heapUsed": "85 MB",
    "external": "10 MB"
  }
}
```

### Metrics (Prometheus Format)

```http
GET /metrics
```

Returns Prometheus-formatted metrics for monitoring.

---

## Webhook Endpoints

### EvolutionAPI Webhook

Receives webhook events from EvolutionAPI.

```http
POST /webhook/evolution
```

**Headers:**
- `X-Webhook-Signature` or `X-Hub-Signature-256` - Webhook signature (if configured)

**Body:** EvolutionAPI webhook payload

### Test Webhook

Test endpoint for webhook functionality.

```http
POST /webhook/test
```

---

## Error Handling

### Validation Errors

```json
{
  "status": "error",
  "message": "Validation failed: Chat ID is required, Limit must be between 1 and 100"
}
```

### Rate Limit Errors

```json
{
  "status": "error",
  "message": "Too many requests from this IP, please try again later."
}
```

### Server Errors

```json
{
  "status": "error",
  "message": "Internal server error"
}
```

---

## SDKs and Examples

### JavaScript/Node.js Example

```javascript
const axios = require('axios');

const webwhatsAPI = axios.create({
  baseURL: 'https://your-domain.com/api',
  timeout: 10000
});

// Get messages for a chat
async function getMessages(chatId, limit = 50) {
  try {
    const response = await webwhatsAPI.get(`/messages/${chatId}`, {
      params: { limit }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching messages:', error.response?.data || error.message);
    throw error;
  }
}

// Generate summary
async function generateSummary(chatId, period = '24h') {
  try {
    const response = await webwhatsAPI.post(`/summaries/${chatId}/generate`, {
      period
    });
    return response.data;
  } catch (error) {
    console.error('Error generating summary:', error.response?.data || error.message);
    throw error;
  }
}
```

### Python Example

```python
import requests

class WebWhatsAPI:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.timeout = 10
    
    def get_messages(self, chat_id, limit=50, offset=0):
        """Get messages for a chat"""
        url = f"{self.base_url}/api/messages/{chat_id}"
        params = {'limit': limit, 'offset': offset}
        
        response = self.session.get(url, params=params)
        response.raise_for_status()
        return response.json()
    
    def generate_summary(self, chat_id, period='24h', force=False):
        """Generate summary for a group chat"""
        url = f"{self.base_url}/api/summaries/{chat_id}/generate"
        data = {'period': period, 'force': force}
        
        response = self.session.post(url, json=data)
        response.raise_for_status()
        return response.json()

# Usage
api = WebWhatsAPI('https://your-domain.com')
messages = api.get_messages('5511999999999@s.whatsapp.net')
```

### cURL Examples

```bash
# Get messages
curl -X GET "https://your-domain.com/api/messages/5511999999999@s.whatsapp.net?limit=20" \
  -H "Accept: application/json"

# Generate summary
curl -X POST "https://your-domain.com/api/summaries/5511999999999@g.us/generate" \
  -H "Content-Type: application/json" \
  -d '{"period": "24h", "force": false}'

# Search messages
curl -X GET "https://your-domain.com/api/messages/5511999999999@g.us/search?q=meeting" \
  -H "Accept: application/json"
```

---

## Best Practices

1. **Rate Limiting**: Respect rate limits and implement exponential backoff
2. **Error Handling**: Always handle errors gracefully and check status codes
3. **Pagination**: Use pagination for large datasets
4. **Caching**: Cache responses when appropriate to reduce API calls
5. **Webhooks**: Use webhooks for real-time updates instead of polling
6. **Security**: Always use HTTPS in production and validate webhook signatures

---

## Support

For API support and questions:
- Check the logs: `docker-compose logs webwhats-app`
- Monitor health: `GET /health/detailed`
- Review metrics: `GET /metrics`