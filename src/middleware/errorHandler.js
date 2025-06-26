const logger = require('../utils/logger');

// Custom error class
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

// Handle different types of errors
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg?.match(/(["'])(\\?.)*?\1/)?.[0];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () =>
  new AppError('Your token has expired! Please log in again.', 401);

const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new AppError('File too large. Maximum size allowed is 50MB.', 400);
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return new AppError('Too many files. Maximum 10 files allowed.', 400);
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError('Unexpected file field.', 400);
  }
  return new AppError('File upload error.', 400);
};

// Send error response in development
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack
  });
};

// Send error response in production
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error('ERROR 💥', err);

    res.status(500).json({
      status: 'error',
      message: 'Something went wrong!'
    });
  }
};

// Global error handling middleware
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log the error
  logger.logError(err, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // Handle specific error types
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    if (error.name === 'MulterError') error = handleMulterError(error);

    sendErrorProd(error, res);
  }
};

// Handle 404 errors
const notFoundHandler = (req, res, next) => {
  const err = new AppError(`Can't find ${req.originalUrl} on this server!`, 404);
  next(err);
};

// Async error wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Validation error handler
const validationErrorHandler = (errors) => {
  const formattedErrors = errors.array().map(error => ({
    field: error.param,
    message: error.msg,
    value: error.value
  }));

  return new AppError(`Validation failed: ${formattedErrors.map(e => e.message).join(', ')}`, 400);
};

// Rate limit error handler
const rateLimitHandler = (req, res) => {
  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    url: req.url,
    userAgent: req.get('User-Agent')
  });

  res.status(429).json({
    status: 'error',
    message: 'Too many requests from this IP, please try again later.'
  });
};

// Webhook signature validation error
const webhookSignatureError = () => {
  return new AppError('Invalid webhook signature', 401);
};

// AI service error handler
const aiServiceErrorHandler = (service, operation, error) => {
  logger.logAIService(service, operation, 'error', {
    message: error.message,
    stack: error.stack
  });

  if (error.response?.status === 429) {
    return new AppError(`${service} rate limit exceeded. Please try again later.`, 429);
  }

  if (error.response?.status === 401) {
    return new AppError(`${service} authentication failed. Check API key.`, 401);
  }

  if (error.response?.status >= 500) {
    return new AppError(`${service} service temporarily unavailable.`, 503);
  }

  return new AppError(`${service} processing failed: ${error.message}`, 500);
};

// Database error handler
const databaseErrorHandler = (error, operation) => {
  logger.logDatabase(operation, 'unknown', 'error', {
    message: error.message,
    code: error.code
  });

  if (error.code === 'ECONNREFUSED') {
    return new AppError('Database connection failed', 503);
  }

  if (error.code === '23505') { // Unique violation
    return new AppError('Duplicate entry found', 409);
  }

  if (error.code === '23503') { // Foreign key violation
    return new AppError('Referenced record not found', 400);
  }

  return new AppError('Database operation failed', 500);
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  catchAsync,
  validationErrorHandler,
  rateLimitHandler,
  webhookSignatureError,
  aiServiceErrorHandler,
  databaseErrorHandler
};