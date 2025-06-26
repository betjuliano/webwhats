const Bull = require('bull');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const aiService = require('./aiService');
const database = require('../config/database');
const whatsappService = require('./whatsappService');

class QueueService {
  constructor() {
    this.queues = {};
    this.isInitialized = false;
  }

  async initializeQueues() {
    try {
      // Create Redis connection for Bull
      const redisOptions = process.env.REDIS_URL 
        ? process.env.REDIS_URL
        : {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD,
            db: 1 // Use a different database for queues
          };

      // Media processing queue
      this.queues.mediaProcessing = new Bull('media processing', {
        redis: redisOptions,
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });

      // Summary generation queue
      this.queues.summaryGeneration = new Bull('summary generation', {
        redis: redisOptions,
        defaultJobOptions: {
          removeOnComplete: 20,
          removeOnFail: 50,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        }
      });

      // Message response queue
      this.queues.messageResponse = new Bull('message response', {
        redis: redisOptions,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'fixed',
            delay: 1000
          }
        }
      });

      // Setup queue processors
      await this.setupProcessors();

      // Setup queue event listeners
      this.setupEventListeners();

      this.isInitialized = true;
      logger.info('Queue service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize queue service:', error);
      throw error;
    }
  }

  async setupProcessors() {
    // Media processing processor
    this.queues.mediaProcessing.process('audio', 3, async (job) => {
      return await this.processAudioJob(job);
    });

    this.queues.mediaProcessing.process('image', 5, async (job) => {
      return await this.processImageJob(job);
    });

    this.queues.mediaProcessing.process('document', 2, async (job) => {
      return await this.processDocumentJob(job);
    });

    // Summary generation processor
    this.queues.summaryGeneration.process('group-summary', 1, async (job) => {
      return await this.processGroupSummaryJob(job);
    });

    // Message response processor
    this.queues.messageResponse.process('text-response', 10, async (job) => {
      return await this.processTextResponseJob(job);
    });

    logger.info('Queue processors setup completed');
  }

  setupEventListeners() {
    Object.entries(this.queues).forEach(([queueName, queue]) => {
      queue.on('completed', (job, result) => {
        logger.logQueue(queueName, job.id, 'completed', {
          processingTime: Date.now() - job.timestamp,
          result: typeof result === 'string' ? result.substring(0, 100) : 'processed'
        });
      });

      queue.on('failed', (job, err) => {
        logger.logQueue(queueName, job.id, 'failed', {
          error: err.message,
          attempts: job.attemptsMade,
          data: job.data
        });
      });

      queue.on('stalled', (job) => {
        logger.logQueue(queueName, job.id, 'stalled', {
          attempts: job.attemptsMade
        });
      });

      queue.on('progress', (job, progress) => {
        logger.logQueue(queueName, job.id, 'progress', {
          progress: `${progress}%`
        });
      });
    });
  }

  // Add media processing job
  async addMediaProcessingJob(jobData) {
    try {
      const { mediaType, messageId } = jobData;
      
      const job = await this.queues.mediaProcessing.add(mediaType, jobData, {
        priority: this.getMediaPriority(mediaType),
        delay: 0
      });

      logger.logQueue('mediaProcessing', job.id, 'added', {
        mediaType,
        messageId
      });

      return job;

    } catch (error) {
      logger.error('Failed to add media processing job:', error);
      throw error;
    }
  }

  // Add summary generation job
  async addSummaryJob(jobData) {
    try {
      const job = await this.queues.summaryGeneration.add('group-summary', jobData, {
        priority: 1
      });

      logger.logQueue('summaryGeneration', job.id, 'added', {
        chatId: jobData.chatId,
        period: jobData.period
      });

      return job;

    } catch (error) {
      logger.error('Failed to add summary job:', error);
      throw error;
    }
  }

  // Add text response job
  async addTextResponseJob(jobData) {
    try {
      const job = await this.queues.messageResponse.add('text-response', jobData, {
        priority: 2
      });

      logger.logQueue('messageResponse', job.id, 'added', {
        chatId: jobData.chatId,
        messageId: jobData.messageId
      });

      return job;

    } catch (error) {
      logger.error('Failed to add text response job:', error);
      throw error;
    }
  }

  // Process audio job
  async processAudioJob(job) {
    const { messageId, chatId, mediaUrl, content } = job.data;
    
    try {
      job.progress(10);
      
      // Transcribe audio
      const transcription = await aiService.transcribeAudio(mediaUrl, messageId);
      
      job.progress(70);
      
      // Save transcription to database
      await this.saveProcessedMedia(messageId, 'audio', {
        transcription,
        originalUrl: mediaUrl
      });
      
      job.progress(90);
      
      // Send transcription to admin if configured
      if (process.env.ADMIN_CHAT_ID) {
        const response = `🎵 *Transcrição de áudio de ${chatId}:*\n\n${transcription}`;
        await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, response);
      }
      
      job.progress(100);
      
      return { transcription, status: 'completed' };

    } catch (error) {
      await this.saveProcessedMedia(messageId, 'audio', {
        originalUrl: mediaUrl,
        error: error.message
      }, 'failed');
      
      throw error;
    }
  }

  // Process image job
  async processImageJob(job) {
    const { messageId, chatId, mediaUrl, content } = job.data;
    
    try {
      job.progress(10);
      
      // Describe image
      const description = await aiService.describeImage(mediaUrl, messageId);
      
      job.progress(70);
      
      // Save description to database
      await this.saveProcessedMedia(messageId, 'image', {
        description,
        originalUrl: mediaUrl
      });
      
      job.progress(90);
      
      // Send description to admin if configured
      if (process.env.ADMIN_CHAT_ID) {
        const response = `🖼️ *Descrição de imagem de ${chatId}:*\n\n${description}`;
        await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, response);
      }
      
      job.progress(100);
      
      return { description, status: 'completed' };

    } catch (error) {
      await this.saveProcessedMedia(messageId, 'image', {
        originalUrl: mediaUrl,
        error: error.message
      }, 'failed');
      
      throw error;
    }
  }

  // Process document job
  async processDocumentJob(job) {
    const { messageId, chatId, mediaUrl, content } = job.data;
    
    try {
      job.progress(10);
      
      // Summarize document
      const summary = await aiService.summarizeDocument(mediaUrl, messageId, content);
      
      job.progress(70);
      
      // Save summary to database
      await this.saveProcessedMedia(messageId, 'document', {
        summary,
        originalUrl: mediaUrl
      });
      
      job.progress(90);
      
      // Send summary to admin if configured
      if (process.env.ADMIN_CHAT_ID) {
        const response = `📄 *Resumo de documento de ${chatId}:*\n\n${summary}`;
        await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, response);
      }
      
      job.progress(100);
      
      return { summary, status: 'completed' };

    } catch (error) {
      await this.saveProcessedMedia(messageId, 'document', {
        originalUrl: mediaUrl,
        error: error.message
      }, 'failed');
      
      throw error;
    }
  }

  // Process group summary job
  async processGroupSummaryJob(job) {
    const { chatId, period, requesterId } = job.data;
    
    try {
      job.progress(20);
      
      // Get messages for the period
      const messages = await this.getGroupMessages(chatId, period);
      
      if (messages.length === 0) {
        throw new Error('No messages found for the specified period');
      }
      
      job.progress(50);
      
      // Generate summary
      const summary = await aiService.generateGroupSummary(messages, period);
      
      job.progress(80);
      
      // Save summary to database
      await this.saveSummary(chatId, period, summary, messages.length);
      
      job.progress(90);
      
      // Se a solicitação foi feita sob demanda por um usuário, envia o resumo para ele.
      // Caso contrário (ex: job agendado), envia para o admin.
      if (requesterId && requesterId.includes('@c.us')) {
        const requesterResponse = `📊 *Seu resumo solicitado para o grupo ${chatId} (${this.getPeriodText(period)}):*\n\n${summary}`;
        await whatsappService.sendMessage(requesterId, requesterResponse);
      } else if (process.env.ADMIN_CHAT_ID) {
        const adminResponse = `📊 *Resumo do grupo ${chatId} (${this.getPeriodText(period)}):*\n\n${summary}`;
        await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, adminResponse);
      }
      
      job.progress(100);
      
      return { summary, messageCount: messages.length, status: 'completed' };

    } catch (error) {
      // Send error message to requester
      const errorResponse = `❌ Erro ao gerar resumo: ${error.message}`;
      if (requesterId && requesterId.includes('@c.us')) {
        await whatsappService.sendMessage(requesterId, errorResponse);
      } else if (process.env.ADMIN_CHAT_ID) {
        await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, `Falha no resumo para ${chatId}: ${error.message}`);
      }
      
      throw error;
    }
  }

  // Process text response job
  async processTextResponseJob(job) {
    const { messageId, chatId, content, context } = job.data;
    
    try {
      job.progress(30);
      
      // Generate AI response
      const response = await aiService.generateTextResponse(content, context);
      
      job.progress(80);
      
      // Send response
      await whatsappService.sendMessage(chatId, response);
      
      job.progress(100);
      
      return { response, status: 'completed' };

    } catch (error) {
      logger.error('Failed to process text response job:', {
        messageId,
        chatId,
        error: error.message
      });
      
      throw error;
    }
  }

  // Save processed media to database
  async saveProcessedMedia(messageId, mediaType, data, status = 'completed') {
    try {
      const query = `
        INSERT INTO processed_media (
          message_id, media_type, original_url, transcription, 
          description, summary, processing_status, processing_error
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (message_id) 
        DO UPDATE SET 
          transcription = EXCLUDED.transcription,
          description = EXCLUDED.description,
          summary = EXCLUDED.summary,
          processing_status = EXCLUDED.processing_status,
          processing_error = EXCLUDED.processing_error,
          updated_at = CURRENT_TIMESTAMP
      `;

      const values = [
        messageId,
        mediaType,
        data.originalUrl,
        data.transcription || null,
        data.description || null,
        data.summary || null,
        status,
        data.error || null
      ];

      await database.query(query, values);

    } catch (error) {
      logger.logDatabase('INSERT', 'processed_media', 'error', {
        messageId,
        error: error.message
      });
    }
  }

  // Get group messages for summary
  async getGroupMessages(chatId, period) {
    try {
      let hours;
      switch (period) {
        case '24h':
          hours = 24;
          break;
        case '48h':
          hours = 48;
          break;
        case '1week':
          hours = 168;
          break;
        default:
          hours = 24;
      }

      const query = `
        SELECT * FROM messages 
        WHERE chat_id = $1 
        AND is_group = true 
        AND created_at >= NOW() - INTERVAL '${hours} hours'
        ORDER BY created_at ASC
        LIMIT 500
      `;

      const result = await database.query(query, [chatId]);
      return result.rows;

    } catch (error) {
      logger.logDatabase('SELECT', 'messages', 'error', {
        chatId,
        period,
        error: error.message
      });
      throw error;
    }
  }

  // Save summary to database
  async saveSummary(chatId, period, summaryText, messageCount) {
    try {
      const query = `
        INSERT INTO group_summaries (
          chat_id, summary_period, summary_text, message_count,
          start_date, end_date
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (chat_id, summary_period, start_date) 
        DO UPDATE SET 
          summary_text = EXCLUDED.summary_text,
          message_count = EXCLUDED.message_count,
          updated_at = CURRENT_TIMESTAMP
      `;

      const endDate = new Date();
      const startDate = new Date();
      
      switch (period) {
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          break;
        case '48h':
          startDate.setHours(startDate.getHours() - 48);
          break;
        case '1week':
          startDate.setDate(startDate.getDate() - 7);
          break;
      }

      const values = [chatId, period, summaryText, messageCount, startDate, endDate];
      await database.query(query, values);

    } catch (error) {
      logger.logDatabase('INSERT', 'group_summaries', 'error', {
        chatId,
        period,
        error: error.message
      });
    }
  }

  // Get media priority based on type
  getMediaPriority(mediaType) {
    const priorities = {
      'text': 1,
      'audio': 2,
      'image': 3,
      'document': 4,
      'video': 5
    };
    
    return priorities[mediaType] || 5;
  }

  // Get period text in Portuguese
  getPeriodText(period) {
    switch (period) {
      case '24h':
        return 'últimas 24 horas';
      case '48h':
        return 'últimas 48 horas';
      case '1week':
        return 'última semana';
      default:
        return 'últimas 24 horas';
    }
  }

  // Get queue statistics
  async getQueueStats() {
    const stats = {};
    
    for (const [queueName, queue] of Object.entries(this.queues)) {
      try {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();
        
        stats[queueName] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length
        };
      } catch (error) {
        stats[queueName] = { error: error.message };
      }
    }
    
    return stats;
  }

  // Clean old jobs
  async cleanOldJobs() {
    try {
      for (const [queueName, queue] of Object.entries(this.queues)) {
        await queue.clean(24 * 60 * 60 * 1000, 'completed'); // 24 hours
        await queue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // 7 days
      }
      
      logger.info('Old jobs cleaned successfully');
    } catch (error) {
      logger.error('Failed to clean old jobs:', error);
    }
  }

  // Graceful shutdown
  async shutdown() {
    try {
      for (const [queueName, queue] of Object.entries(this.queues)) {
        await queue.close();
        logger.info(`Queue ${queueName} closed`);
      }
    } catch (error) {
      logger.error('Error during queue shutdown:', error);
    }
  }
}

module.exports = new QueueService();