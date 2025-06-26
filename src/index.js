const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const database = require('./config/database');
const redis = require('./config/redis');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const healthRoutes = require('./routes/health');
const webhookRoutes = require('./routes/webhook');
const messageRoutes = require('./routes/messages');
const summaryRoutes = require('./routes/summaries');
const whatsappRoutes = require('./routes/whatsapp');
const queueService = require('./services/queueService');
const cronService = require('./services/cronService');
const metricsService = require('./utils/metrics');
const whatsappService = require('./services/whatsappService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Routes
app.use('/health', healthRoutes);
app.use('/webhook', webhookRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/summaries', summaryRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

let server;

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed.');
    
    Promise.all([
      database.close(),
      redis.disconnect()
    ]).then(() => {
      logger.info('Database and Redis connections closed.');
      process.exit(0);
    }).catch(error => {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    });
  });
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Initialize application
const initializeApp = async () => {
  try {
    await database.initialize();
    logger.info('Database initialized successfully');
    
    await redis.connect();
    logger.info('Redis connected successfully');
    
    await queueService.initializeQueues();
    logger.info('Message queues initialized');
    
    if (process.env.ENABLE_METRICS === 'true') {
      metricsService.initializeMetrics(app);
      logger.info('Metrics initialized');
    }
    
    cronService.startCronJobs();
    logger.info('Cron jobs started');
    
    server = app.listen(PORT, () => {
      logger.info(`WebWhats server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info('Connected to Evolution API');
    });
    
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    process.exit(1);
  }
};

// Start the application
initializeApp();

module.exports = app;