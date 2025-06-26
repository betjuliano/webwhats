const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : process.env.LOG_LEVEL || 'info';
};

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define format for file logs (without colors)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports array
const transports = [
  // Console transport
  new winston.transports.Console({
    level: level(),
    format: format
  }),
  
  // Error log file
  new DailyRotateFile({
    filename: path.join('logs', 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: fileFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  }),
  
  // Combined log file
  new DailyRotateFile({
    filename: path.join('logs', 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: fileFormat,
    maxSize: '20m',
    maxFiles: '30d',
    zippedArchive: true
  }),
  
  // HTTP requests log file
  new DailyRotateFile({
    filename: path.join('logs', 'http-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'http',
    format: fileFormat,
    maxSize: '20m',
    maxFiles: '7d',
    zippedArchive: true
  })
];

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format: fileFormat,
  transports,
  exitOnError: false
});

// Create a stream object for Morgan HTTP logger
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

// Add custom methods for structured logging
logger.logRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.url,
    status: res.statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    timestamp: new Date().toISOString()
  };
  
  if (res.statusCode >= 400) {
    logger.warn('HTTP Request', logData);
  } else {
    logger.http('HTTP Request', logData);
  }
};

logger.logError = (error, context = {}) => {
  const errorData = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    context,
    timestamp: new Date().toISOString()
  };
  
  logger.error('Application Error', errorData);
};

logger.logMessageProcessing = (messageId, action, status, details = {}) => {
  const logData = {
    messageId,
    action,
    status,
    details,
    timestamp: new Date().toISOString()
  };
  
  if (status === 'error') {
    logger.error('Message Processing', logData);
  } else if (status === 'warning') {
    logger.warn('Message Processing', logData);
  } else {
    logger.info('Message Processing', logData);
  }
};

logger.logAIService = (service, operation, status, details = {}) => {
  const logData = {
    service,
    operation,
    status,
    details,
    timestamp: new Date().toISOString()
  };
  
  if (status === 'error') {
    logger.error('AI Service', logData);
  } else if (status === 'warning') {
    logger.warn('AI Service', logData);
  } else {
    logger.info('AI Service', logData);
  }
};

logger.logWebhook = (source, event, status, data = {}) => {
  const logData = {
    source,
    event,
    status,
    data,
    timestamp: new Date().toISOString()
  };
  
  if (status === 'error') {
    logger.error('Webhook', logData);
  } else {
    logger.info('Webhook', logData);
  }
};

logger.logDatabase = (operation, table, status, details = {}) => {
  const logData = {
    operation,
    table,
    status,
    details,
    timestamp: new Date().toISOString()
  };
  
  if (status === 'error') {
    logger.error('Database', logData);
  } else {
    logger.debug('Database', logData);
  }
};

logger.logQueue = (queueName, jobId, status, details = {}) => {
  const logData = {
    queueName,
    jobId,
    status,
    details,
    timestamp: new Date().toISOString()
  };
  
  if (status === 'failed') {
    logger.error('Queue Job', logData);
  } else if (status === 'stalled') {
    logger.warn('Queue Job', logData);
  } else {
    logger.info('Queue Job', logData);
  }
};

// Handle logger errors
logger.on('error', (error) => {
  console.error('Logger error:', error);
});

module.exports = logger;