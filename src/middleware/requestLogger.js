const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request start
  logger.http(`${req.method} ${req.url} - ${req.ip}`);
  
  // Override res.end to capture response time
  const originalEnd = res.end;
  
  res.end = function(chunk, encoding) {
    const responseTime = Date.now() - start;
    
    // Log request completion
    logger.logRequest(req, res, responseTime);
    
    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

module.exports = {
  requestLogger
};