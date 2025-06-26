# WebWhats - WhatsApp Chatbot with WhatsApp Web

A comprehensive WhatsApp chatbot that differentiates between individual and group messages, automatically processes media content, and provides intelligent summaries.

## Features

### Individual Messages
- **Media Classification**: Automatically detects and classifies media types (text, audio, image, documents)
- **Automatic Processing**:
  - Audio transcription using Whisper
  - Image description using BLIP
  - Document summarization using OpenAI
  - Text analysis and response

### Group Messages
- **Smart Summaries**: Request summaries for different time periods
  - Last 24 hours
  - Last 48 hours
  - Last week
- **Context-aware responses**

### Technical Stack
- **API**: WhatsApp Web for WhatsApp integration
- **AI Services**: OpenAI GPT, Whisper, BLIP
- **Database**: PostgreSQL for data persistence
- **Cache**: Redis for performance optimization
- **Infrastructure**: Docker containers for 24/7 operation
- **Monitoring**: Comprehensive logging and health checks

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WhatsApp      │    │   WhatsApp Web  │    │   WebWhats      │
│   Messages      │───▶│   Direct Conn.  │───▶│   Processor     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                       ┌─────────────────┐            │
                       │   AI Services   │◀───────────┘
                       │ OpenAI/Whisper  │
                       │     /BLIP       │
                       └─────────────────┘
                                │
                       ┌─────────────────┐
                       │   PostgreSQL    │
                       │   + Redis       │
                       └─────────────────┘
```

## Quick Start

1. Clone the repository
2. Copy `.env.example` to `.env` and configure your API keys
3. Run with Docker Compose: `docker-compose up -d`
4. Scan the QR code displayed in logs to authenticate with WhatsApp Web

## Project Structure

```
webwhats/
├── src/
│   ├── controllers/     # API controllers
│   ├── services/        # Business logic
│   ├── models/          # Database models
│   ├── utils/           # Utility functions
│   ├── middleware/      # Express middleware
│   └── config/          # Configuration files
├── docker/              # Docker configurations
├── scripts/             # Utility scripts
├── tests/               # Test files
└── docs/                # Documentation