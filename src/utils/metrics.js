const promClient = require('prom-client');
const logger = require('./logger');

class MetricsService {
  constructor() {
    this.register = new promClient.Registry();
    this.metrics = {};
    this.isInitialized = false;
  }

  initializeMetrics(app) {
    try {
      // Enable default metrics collection
      promClient.collectDefaultMetrics({
        register: this.register,
        prefix: 'webwhats_',
        gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
      });

      // Custom metrics
      this.createCustomMetrics();

      // Expose metrics endpoint
      if (app) {
        app.get('/metrics', async (req, res) => {
          try {
            res.set('Content-Type', this.register.contentType);
            const metrics = await this.register.metrics();
            res.end(metrics);
          } catch (error) {
            logger.error('Failed to generate metrics:', error);
            res.status(500).end('Error generating metrics');
          }
        });
      }

      this.isInitialized = true;
      logger.info('Metrics service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize metrics service:', error);
      throw error;
    }
  }

  createCustomMetrics() {
    // HTTP request metrics
    this.metrics.httpRequestDuration = new promClient.Histogram({
      name: 'webwhats_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
      registers: [this.register]
    });

    this.metrics.httpRequestTotal = new promClient.Counter({
      name: 'webwhats_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register]
    });

    // Message processing metrics
    this.metrics.messagesProcessed = new promClient.Counter({
      name: 'webwhats_messages_processed_total',
      help: 'Total number of messages processed',
      labelNames: ['type', 'status', 'is_group'],
      registers: [this.register]
    });

    this.metrics.messageProcessingDuration = new promClient.Histogram({
      name: 'webwhats_message_processing_duration_seconds',
      help: 'Duration of message processing in seconds',
      labelNames: ['type', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.register]
    });

    // AI service metrics
    this.metrics.aiServiceRequests = new promClient.Counter({
      name: 'webwhats_ai_service_requests_total',
      help: 'Total number of AI service requests',
      labelNames: ['service', 'operation', 'status'],
      registers: [this.register]
    });

    this.metrics.aiServiceDuration = new promClient.Histogram({
      name: 'webwhats_ai_service_duration_seconds',
      help: 'Duration of AI service requests in seconds',
      labelNames: ['service', 'operation'],
      buckets: [0.5, 1, 2, 5, 10, 20, 30, 60, 120],
      registers: [this.register]
    });

    // Queue metrics
    this.metrics.queueJobsProcessed = new promClient.Counter({
      name: 'webwhats_queue_jobs_processed_total',
      help: 'Total number of queue jobs processed',
      labelNames: ['queue', 'status'],
      registers: [this.register]
    });

    this.metrics.queueJobDuration = new promClient.Histogram({
      name: 'webwhats_queue_job_duration_seconds',
      help: 'Duration of queue job processing in seconds',
      labelNames: ['queue', 'job_type'],
      buckets: [1, 5, 10, 30, 60, 120, 300, 600],
      registers: [this.register]
    });

    this.metrics.queueSize = new promClient.Gauge({
      name: 'webwhats_queue_size',
      help: 'Current size of queues',
      labelNames: ['queue', 'status'],
      registers: [this.register]
    });

    // Database metrics
    this.metrics.databaseQueries = new promClient.Counter({
      name: 'webwhats_database_queries_total',
      help: 'Total number of database queries',
      labelNames: ['operation', 'table', 'status'],
      registers: [this.register]
    });

    this.metrics.databaseQueryDuration = new promClient.Histogram({
      name: 'webwhats_database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register]
    });

    // Redis metrics
    this.metrics.redisOperations = new promClient.Counter({
      name: 'webwhats_redis_operations_total',
      help: 'Total number of Redis operations',
      labelNames: ['operation', 'status'],
      registers: [this.register]
    });

    this.metrics.redisOperationDuration = new promClient.Histogram({
      name: 'webwhats_redis_operation_duration_seconds',
      help: 'Duration of Redis operations in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.register]
    });

    // Webhook metrics
    this.metrics.webhookEvents = new promClient.Counter({
      name: 'webwhats_webhook_events_total',
      help: 'Total number of webhook events received',
      labelNames: ['source', 'event_type', 'status'],
      registers: [this.register]
    });

    // Connection metrics
    this.metrics.connectionStatus = new promClient.Gauge({
      name: 'webwhats_connection_status',
      help: 'Current connection status (1 = connected, 0 = disconnected)',
      labelNames: ['instance'],
      registers: [this.register]
    });

    // Error metrics
    this.metrics.errors = new promClient.Counter({
      name: 'webwhats_errors_total',
      help: 'Total number of errors',
      labelNames: ['type', 'component'],
      registers: [this.register]
    });

    // Business metrics
    this.metrics.activeChats = new promClient.Gauge({
      name: 'webwhats_active_chats',
      help: 'Number of active chats',
      labelNames: ['type'],
      registers: [this.register]
    });

    this.metrics.summariesGenerated = new promClient.Counter({
      name: 'webwhats_summaries_generated_total',
      help: 'Total number of summaries generated',
      labelNames: ['period', 'status'],
      registers: [this.register]
    });

    this.metrics.mediaProcessed = new promClient.Counter({
      name: 'webwhats_media_processed_total',
      help: 'Total number of media files processed',
      labelNames: ['media_type', 'status'],
      registers: [this.register]
    });
  }

  // Record HTTP request metrics
  recordHttpRequest(method, route, statusCode, duration) {
    if (!this.isInitialized) return;

    try {
      this.metrics.httpRequestTotal.inc({
        method,
        route,
        status_code: statusCode
      });

      this.metrics.httpRequestDuration.observe({
        method,
        route,
        status_code: statusCode
      }, duration / 1000); // Convert to seconds

    } catch (error) {
      logger.error('Failed to record HTTP request metrics:', error);
    }
  }

  // Record message processing metrics
  recordMessageProcessing(type, status, isGroup, duration) {
    if (!this.isInitialized) return;

    try {
      this.metrics.messagesProcessed.inc({
        type,
        status,
        is_group: isGroup ? 'true' : 'false'
      });

      if (duration) {
        this.metrics.messageProcessingDuration.observe({
          type,
          status
        }, duration / 1000);
      }

    } catch (error) {
      logger.error('Failed to record message processing metrics:', error);
    }
  }

  // Record AI service metrics
  recordAIService(service, operation, status, duration) {
    if (!this.isInitialized) return;

    try {
      this.metrics.aiServiceRequests.inc({
        service,
        operation,
        status
      });

      if (duration) {
        this.metrics.aiServiceDuration.observe({
          service,
          operation
        }, duration / 1000);
      }

    } catch (error) {
      logger.error('Failed to record AI service metrics:', error);
    }
  }

  // Record queue metrics
  recordQueueJob(queue, jobType, status, duration) {
    if (!this.isInitialized) return;

    try {
      this.metrics.queueJobsProcessed.inc({
        queue,
        status
      });

      if (duration) {
        this.metrics.queueJobDuration.observe({
          queue,
          job_type: jobType
        }, duration / 1000);
      }

    } catch (error) {
      logger.error('Failed to record queue metrics:', error);
    }
  }

  // Update queue size metrics
  updateQueueSize(queue, status, size) {
    if (!this.isInitialized) return;

    try {
      this.metrics.queueSize.set({
        queue,
        status
      }, size);

    } catch (error) {
      logger.error('Failed to update queue size metrics:', error);
    }
  }

  // Record database metrics
  recordDatabaseQuery(operation, table, status, duration) {
    if (!this.isInitialized) return;

    try {
      this.metrics.databaseQueries.inc({
        operation,
        table,
        status
      });

      if (duration) {
        this.metrics.databaseQueryDuration.observe({
          operation,
          table
        }, duration / 1000);
      }

    } catch (error) {
      logger.error('Failed to record database metrics:', error);
    }
  }

  // Record Redis metrics
  recordRedisOperation(operation, status, duration) {
    if (!this.isInitialized) return;

    try {
      this.metrics.redisOperations.inc({
        operation,
        status
      });

      if (duration) {
        this.metrics.redisOperationDuration.observe({
          operation
        }, duration / 1000);
      }

    } catch (error) {
      logger.error('Failed to record Redis metrics:', error);
    }
  }

  // Record webhook metrics
  recordWebhookEvent(source, eventType, status) {
    if (!this.isInitialized) return;

    try {
      this.metrics.webhookEvents.inc({
        source,
        event_type: eventType,
        status
      });

    } catch (error) {
      logger.error('Failed to record webhook metrics:', error);
    }
  }

  // Update connection status
  updateConnectionStatus(instance, isConnected) {
    if (!this.isInitialized) return;

    try {
      this.metrics.connectionStatus.set({
        instance
      }, isConnected ? 1 : 0);

    } catch (error) {
      logger.error('Failed to update connection status metrics:', error);
    }
  }

  // Record error metrics
  recordError(type, component) {
    if (!this.isInitialized) return;

    try {
      this.metrics.errors.inc({
        type,
        component
      });

    } catch (error) {
      logger.error('Failed to record error metrics:', error);
    }
  }

  // Update active chats
  updateActiveChats(type, count) {
    if (!this.isInitialized) return;

    try {
      this.metrics.activeChats.set({
        type
      }, count);

    } catch (error) {
      logger.error('Failed to update active chats metrics:', error);
    }
  }

  // Record summary generation
  recordSummaryGeneration(period, status) {
    if (!this.isInitialized) return;

    try {
      this.metrics.summariesGenerated.inc({
        period,
        status
      });

    } catch (error) {
      logger.error('Failed to record summary generation metrics:', error);
    }
  }

  // Record media processing
  recordMediaProcessing(mediaType, status) {
    if (!this.isInitialized) return;

    try {
      this.metrics.mediaProcessed.inc({
        media_type: mediaType,
        status
      });

    } catch (error) {
      logger.error('Failed to record media processing metrics:', error);
    }
  }

  // Get current metrics
  async getMetrics() {
    if (!this.isInitialized) {
      return 'Metrics not initialized';
    }

    try {
      return await this.register.metrics();
    } catch (error) {
      logger.error('Failed to get metrics:', error);
      throw error;
    }
  }

  // Reset all metrics
  resetMetrics() {
    if (!this.isInitialized) return;

    try {
      this.register.resetMetrics();
      logger.info('All metrics reset');
    } catch (error) {
      logger.error('Failed to reset metrics:', error);
    }
  }

  // Get metric by name
  getMetric(name) {
    return this.metrics[name] || null;
  }

  // Check if metrics are enabled
  isEnabled() {
    return this.isInitialized && process.env.ENABLE_METRICS === 'true';
  }
}

module.exports = new MetricsService();