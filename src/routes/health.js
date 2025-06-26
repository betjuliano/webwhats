const express = require('express');
const database = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

const router = express.Router();

// Basic health check
router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0'
    };

    res.status(200).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Detailed health check with dependencies
router.get('/detailed', async (req, res) => {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    dependencies: {}
  };

  let overallStatus = 'healthy';

  // Check database connection
  try {
    const dbStart = Date.now();
    await database.query('SELECT 1');
    checks.dependencies.database = {
      status: 'healthy',
      responseTime: Date.now() - dbStart
    };
  } catch (error) {
    checks.dependencies.database = {
      status: 'unhealthy',
      error: error.message
    };
    overallStatus = 'unhealthy';
  }

  // Check Redis connection
  try {
    const redisStart = Date.now();
    await redis.set('health_check', 'ok', 10);
    const value = await redis.get('health_check');
    await redis.del('health_check');
    
    checks.dependencies.redis = {
      status: value === 'ok' ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - redisStart
    };
  } catch (error) {
    checks.dependencies.redis = {
      status: 'unhealthy',
      error: error.message
    };
    overallStatus = 'unhealthy';
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  checks.memory = {
    rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
  };

  // Check disk space (if available)
  try {
    const fs = require('fs');
    const stats = fs.statSync('./');
    checks.disk = {
      available: 'N/A' // Would need additional package for disk space
    };
  } catch (error) {
    // Disk check not critical
  }

  checks.status = overallStatus;

  const statusCode = overallStatus === 'healthy' ? 200 : 503;
  res.status(statusCode).json(checks);
});

// Readiness probe (for Kubernetes)
router.get('/ready', async (req, res) => {
  try {
    // Check if application is ready to serve requests
    await database.query('SELECT 1');
    await redis.get('readiness_check');

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Liveness probe (for Kubernetes)
router.get('/live', (req, res) => {
  // Simple liveness check - if the process is running, it's alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Metrics endpoint (basic)
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      eventLoop: {
        // Would need additional monitoring for detailed event loop metrics
        delay: 'N/A'
      },
      requests: {
        // Would be populated by request counter middleware
        total: 'N/A',
        active: 'N/A'
      }
    };

    res.status(200).json(metrics);
  } catch (error) {
    logger.error('Metrics collection failed:', error);
    res.status(500).json({
      error: 'Failed to collect metrics',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;