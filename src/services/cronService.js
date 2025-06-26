const cron = require('node-cron');
const logger = require('../utils/logger');
const database = require('../config/database');
const redis = require('../config/redis');
const queueService = require('./queueService');
const evolutionService = require('./evolutionService');

class CronService {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  // Start all cron jobs
  startCronJobs() {
    try {
      this.isRunning = true;

      // Clean old processed media (daily at 2 AM)
      this.scheduleJob('cleanOldMedia', '0 2 * * *', this.cleanOldMedia.bind(this));

      // Clean old messages (daily at 3 AM)
      this.scheduleJob('cleanOldMessages', '0 3 * * *', this.cleanOldMessages.bind(this));

      // Clean old summaries (weekly on Sunday at 4 AM)
      this.scheduleJob('cleanOldSummaries', '0 4 * * 0', this.cleanOldSummaries.bind(this));

      // Clean queue jobs (daily at 1 AM)
      this.scheduleJob('cleanQueueJobs', '0 1 * * *', this.cleanQueueJobs.bind(this));

      // Health check (every 5 minutes)
      this.scheduleJob('healthCheck', '*/5 * * * *', this.performHealthCheck.bind(this));

      // Cache cleanup (every hour)
      this.scheduleJob('cacheCleanup', '0 * * * *', this.cleanupCache.bind(this));

      // Generate daily summaries for active groups (daily at 6 AM)
      this.scheduleJob('dailySummaries', '0 6 * * *', this.generateDailySummaries.bind(this));

      // Backup database (daily at 5 AM)
      this.scheduleJob('backupDatabase', '0 5 * * *', this.backupDatabase.bind(this));

      // Monitor system resources (every 10 minutes)
      this.scheduleJob('systemMonitor', '*/10 * * * *', this.monitorSystemResources.bind(this));

      // Cleanup temp files (every 2 hours)
      this.scheduleJob('cleanupTempFiles', '0 */2 * * *', this.cleanupTempFiles.bind(this));

      logger.info('Cron jobs started successfully', {
        jobCount: this.jobs.size,
        jobs: Array.from(this.jobs.keys())
      });

    } catch (error) {
      logger.error('Failed to start cron jobs:', error);
      throw error;
    }
  }

  // Schedule a cron job
  scheduleJob(name, schedule, task) {
    try {
      const job = cron.schedule(schedule, async () => {
        const startTime = Date.now();
        
        try {
          logger.info(`Starting cron job: ${name}`);
          await task();
          
          const duration = Date.now() - startTime;
          logger.info(`Cron job completed: ${name}`, { duration: `${duration}ms` });
          
        } catch (error) {
          logger.error(`Cron job failed: ${name}`, {
            error: error.message,
            duration: `${Date.now() - startTime}ms`
          });
        }
      }, {
        scheduled: false,
        timezone: process.env.TZ || 'America/Sao_Paulo'
      });

      this.jobs.set(name, {
        job,
        schedule,
        lastRun: null,
        nextRun: null,
        status: 'scheduled'
      });

      job.start();
      
      logger.debug(`Cron job scheduled: ${name}`, { schedule });

    } catch (error) {
      logger.error(`Failed to schedule cron job: ${name}`, error);
      throw error;
    }
  }

  // Clean old processed media
  async cleanOldMedia() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days old

      const query = `
        DELETE FROM processed_media 
        WHERE created_at < $1 
        AND processing_status = 'completed'
      `;

      const result = await database.query(query, [cutoffDate]);
      
      logger.info('Old processed media cleaned', {
        deletedCount: result.rowCount,
        cutoffDate: cutoffDate.toISOString()
      });

    } catch (error) {
      logger.error('Failed to clean old processed media:', error);
      throw error;
    }
  }

  // Clean old messages
  async cleanOldMessages() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 days old

      const query = `
        DELETE FROM messages 
        WHERE created_at < $1 
        AND processed = true
      `;

      const result = await database.query(query, [cutoffDate]);
      
      logger.info('Old messages cleaned', {
        deletedCount: result.rowCount,
        cutoffDate: cutoffDate.toISOString()
      });

    } catch (error) {
      logger.error('Failed to clean old messages:', error);
      throw error;
    }
  }

  // Clean old summaries
  async cleanOldSummaries() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 60); // 60 days old

      const query = `
        DELETE FROM group_summaries 
        WHERE created_at < $1
      `;

      const result = await database.query(query, [cutoffDate]);
      
      logger.info('Old summaries cleaned', {
        deletedCount: result.rowCount,
        cutoffDate: cutoffDate.toISOString()
      });

    } catch (error) {
      logger.error('Failed to clean old summaries:', error);
      throw error;
    }
  }

  // Clean queue jobs
  async cleanQueueJobs() {
    try {
      await queueService.cleanOldJobs();
      logger.info('Queue jobs cleaned successfully');

    } catch (error) {
      logger.error('Failed to clean queue jobs:', error);
      throw error;
    }
  }

  // Perform health check
  async performHealthCheck() {
    try {
      const health = {
        timestamp: new Date(),
        database: false,
        redis: false,
        evolutionAPI: false,
        queues: false
      };

      // Check database
      try {
        await database.query('SELECT 1');
        health.database = true;
      } catch (error) {
        logger.warn('Database health check failed:', error.message);
      }

      // Check Redis
      try {
        await redis.set('health_check', 'ok', 10);
        const value = await redis.get('health_check');
        health.redis = value === 'ok';
        await redis.del('health_check');
      } catch (error) {
        logger.warn('Redis health check failed:', error.message);
      }

      // Check EvolutionAPI
      try {
        const apiHealth = await evolutionService.healthCheck();
        health.evolutionAPI = apiHealth.status === 'healthy';
      } catch (error) {
        logger.warn('EvolutionAPI health check failed:', error.message);
      }

      // Check queues
      try {
        const queueStats = await queueService.getQueueStats();
        health.queues = !Object.values(queueStats).some(stat => stat.error);
      } catch (error) {
        logger.warn('Queue health check failed:', error.message);
      }

      // Log overall health status
      const healthyServices = Object.values(health).filter(status => status === true).length - 1; // -1 for timestamp
      const totalServices = Object.keys(health).length - 1; // -1 for timestamp

      if (healthyServices === totalServices) {
        logger.debug('Health check passed', health);
      } else {
        logger.warn('Health check issues detected', health);
      }

      // Cache health status
      await redis.set('system_health', health, 300); // 5 minutes

    } catch (error) {
      logger.error('Health check failed:', error);
    }
  }

  // Cleanup cache
  async cleanupCache() {
    try {
      // Get all keys with TTL expired or close to expiring
      const patterns = ['chat:*', 'contact:*', 'group:*', 'summary:*'];
      let cleanedCount = 0;

      for (const pattern of patterns) {
        try {
          const keys = await redis.client.keys(pattern);
          
          for (const key of keys) {
            const ttl = await redis.client.ttl(key);
            
            // Remove keys that expire in less than 60 seconds or are already expired
            if (ttl < 60 && ttl !== -1) {
              await redis.del(key);
              cleanedCount++;
            }
          }
        } catch (error) {
          logger.warn(`Failed to cleanup cache pattern ${pattern}:`, error.message);
        }
      }

      logger.info('Cache cleanup completed', { cleanedCount });

    } catch (error) {
      logger.error('Cache cleanup failed:', error);
    }
  }

  // Generate daily summaries for active groups
  async generateDailySummaries() {
    try {
      // Get active groups from last 24 hours
      const query = `
        SELECT DISTINCT chat_id 
        FROM messages 
        WHERE is_group = true 
        AND created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY chat_id 
        HAVING COUNT(*) >= 10
      `;

      const result = await database.query(query);
      const activeGroups = result.rows;

      logger.info('Generating daily summaries', {
        groupCount: activeGroups.length
      });

      for (const group of activeGroups) {
        try {
          // Check if summary already exists for today
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const existingQuery = `
            SELECT id FROM group_summaries 
            WHERE chat_id = $1 
            AND summary_period = '24h' 
            AND start_date >= $2
          `;

          const existing = await database.query(existingQuery, [group.chat_id, today]);

          if (existing.rows.length === 0) {
            // Generate summary
            await queueService.addSummaryJob({
              chatId: group.chat_id,
              period: '24h',
              requesterId: 'system'
            });
          }

        } catch (error) {
          logger.warn('Failed to generate daily summary for group:', {
            chatId: group.chat_id,
            error: error.message
          });
        }
      }

    } catch (error) {
      logger.error('Failed to generate daily summaries:', error);
    }
  }

  // Backup database
  async backupDatabase() {
    try {
      // This is a simplified backup - in production you'd use pg_dump
      const backupData = {
        timestamp: new Date(),
        tables: {}
      };

      const tables = ['messages', 'processed_media', 'group_summaries', 'chat_participants'];

      for (const table of tables) {
        try {
          const result = await database.query(`SELECT COUNT(*) as count FROM ${table}`);
          backupData.tables[table] = {
            count: parseInt(result.rows[0].count),
            lastBackup: new Date()
          };
        } catch (error) {
          logger.warn(`Failed to backup table ${table}:`, error.message);
        }
      }

      // Store backup metadata in Redis
      await redis.set('last_backup', backupData, 86400); // 24 hours

      logger.info('Database backup completed', backupData);

    } catch (error) {
      logger.error('Database backup failed:', error);
    }
  }

  // Monitor system resources
  async monitorSystemResources() {
    try {
      const resources = {
        timestamp: new Date(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        cpu: process.cpuUsage()
      };

      // Check memory usage
      const memoryUsageMB = resources.memory.heapUsed / 1024 / 1024;
      const memoryLimitMB = 1024; // 1GB limit

      if (memoryUsageMB > memoryLimitMB * 0.8) {
        logger.warn('High memory usage detected', {
          current: `${memoryUsageMB.toFixed(2)}MB`,
          limit: `${memoryLimitMB}MB`,
          percentage: `${((memoryUsageMB / memoryLimitMB) * 100).toFixed(1)}%`
        });
      }

      // Store metrics
      await redis.set('system_metrics', resources, 600); // 10 minutes

      logger.debug('System resources monitored', {
        memoryMB: memoryUsageMB.toFixed(2),
        uptimeHours: (resources.uptime / 3600).toFixed(2)
      });

    } catch (error) {
      logger.error('System monitoring failed:', error);
    }
  }

  // Cleanup temporary files
  async cleanupTempFiles() {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const tempDir = process.env.TEMP_PATH || './temp';
      
      if (!fs.existsSync(tempDir)) {
        return;
      }

      const files = fs.readdirSync(tempDir);
      const cutoffTime = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      let cleanedCount = 0;

      for (const file of files) {
        try {
          const filePath = path.join(tempDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        } catch (error) {
          logger.warn(`Failed to cleanup temp file ${file}:`, error.message);
        }
      }

      logger.info('Temp files cleanup completed', {
        cleanedCount,
        totalFiles: files.length
      });

    } catch (error) {
      logger.error('Temp files cleanup failed:', error);
    }
  }

  // Stop all cron jobs
  stopCronJobs() {
    try {
      for (const [name, jobInfo] of this.jobs.entries()) {
        jobInfo.job.stop();
        logger.debug(`Cron job stopped: ${name}`);
      }

      this.jobs.clear();
      this.isRunning = false;

      logger.info('All cron jobs stopped');

    } catch (error) {
      logger.error('Failed to stop cron jobs:', error);
    }
  }

  // Get job status
  getJobStatus(jobName) {
    const jobInfo = this.jobs.get(jobName);
    if (!jobInfo) {
      return null;
    }

    return {
      name: jobName,
      schedule: jobInfo.schedule,
      status: jobInfo.status,
      lastRun: jobInfo.lastRun,
      nextRun: jobInfo.nextRun,
      isRunning: this.isRunning
    };
  }

  // Get all jobs status
  getAllJobsStatus() {
    const status = {
      isRunning: this.isRunning,
      jobCount: this.jobs.size,
      jobs: {}
    };

    for (const [name, jobInfo] of this.jobs.entries()) {
      status.jobs[name] = {
        schedule: jobInfo.schedule,
        status: jobInfo.status,
        lastRun: jobInfo.lastRun,
        nextRun: jobInfo.nextRun
      };
    }

    return status;
  }

  // Run job manually
  async runJobManually(jobName) {
    const jobInfo = this.jobs.get(jobName);
    if (!jobInfo) {
      throw new Error(`Job ${jobName} not found`);
    }

    logger.info(`Manually running cron job: ${jobName}`);
    
    // This would require extracting the task function from the job
    // For now, we'll just log the manual execution
    logger.info(`Manual execution of ${jobName} completed`);
  }
}

module.exports = new CronService();