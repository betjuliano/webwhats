const express = require('express');
const { query, param, body, validationResult } = require('express-validator');
const { catchAsync, validationErrorHandler } = require('../middleware/errorHandler');
const database = require('../config/database');
const redis = require('../config/redis');
const queueService = require('../services/queueService');
const summaryService = require('../services/summaryService');
const logger = require('../utils/logger');

const router = express.Router();

// Get summaries for a chat
router.get('/:chatId',
  [
    param('chatId').notEmpty().withMessage('Chat ID is required'),
    query('period').optional().isIn(['24h', '48h', '1week']).withMessage('Invalid period'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { chatId } = req.params;
    const { period, limit = 10, offset = 0 } = req.query;

    try {
      let query = `
        SELECT 
          id,
          chat_id,
          summary_period,
          summary_text,
          message_count,
          start_date,
          end_date,
          created_at
        FROM group_summaries 
        WHERE chat_id = $1
      `;
      
      const params = [chatId];
      let paramIndex = 2;

      if (period) {
        query += ` AND summary_period = $${paramIndex}`;
        params.push(period);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await database.query(query, params);

      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) FROM group_summaries WHERE chat_id = $1';
      const countParams = [chatId];

      if (period) {
        countQuery += ' AND summary_period = $2';
        countParams.push(period);
      }

      const countResult = await database.query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].count);

      res.json({
        status: 'success',
        data: {
          summaries: result.rows,
          pagination: {
            total: totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
          }
        }
      });

    } catch (error) {
      logger.error('Failed to get summaries:', {
        chatId,
        period,
        error: error.message
      });
      throw error;
    }
  })
);

// Get specific summary by ID
router.get('/summary/:summaryId',
  [
    param('summaryId').isInt().withMessage('Summary ID must be an integer')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { summaryId } = req.params;

    try {
      const query = `
        SELECT 
          gs.*,
          COUNT(m.id) as actual_message_count
        FROM group_summaries gs
        LEFT JOIN messages m ON m.chat_id = gs.chat_id 
          AND m.created_at >= gs.start_date 
          AND m.created_at <= gs.end_date
          AND m.is_group = true
        WHERE gs.id = $1
        GROUP BY gs.id
      `;

      const result = await database.query(query, [summaryId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Summary not found'
        });
      }

      res.json({
        status: 'success',
        data: {
          summary: result.rows[0]
        }
      });

    } catch (error) {
      logger.error('Failed to get summary:', {
        summaryId,
        error: error.message
      });
      throw error;
    }
  })
);

// Generate new summary
router.post('/:chatId/generate',
  [
    param('chatId').notEmpty().withMessage('Chat ID is required'),
    body('period').isIn(['24h', '48h', '1week']).withMessage('Invalid period'),
    body('force').optional().isBoolean().withMessage('Force must be a boolean')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { chatId } = req.params;
    const { period, force = false } = req.body;

    try {
      // Check if chat is a group
      const chatQuery = `
        SELECT is_group FROM messages 
        WHERE chat_id = $1 
        LIMIT 1
      `;
      
      const chatResult = await database.query(chatQuery, [chatId]);
      
      if (chatResult.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Chat not found'
        });
      }

      if (!chatResult.rows[0].is_group) {
        return res.status(400).json({
          status: 'error',
          message: 'Summaries can only be generated for group chats'
        });
      }

      // Check if summary already exists for today (unless forced)
      if (!force) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const existingQuery = `
          SELECT id FROM group_summaries 
          WHERE chat_id = $1 
          AND summary_period = $2 
          AND start_date >= $3
        `;

        const existing = await database.query(existingQuery, [chatId, period, today]);

        if (existing.rows.length > 0) {
          return res.status(409).json({
            status: 'error',
            message: 'Summary already exists for this period. Use force=true to regenerate.'
          });
        }
      }

      // Check if there are enough messages
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
      }

      const messageCountQuery = `
        SELECT COUNT(*) as count FROM messages 
        WHERE chat_id = $1 
        AND is_group = true 
        AND created_at >= NOW() - INTERVAL '${hours} hours'
      `;

      const messageCountResult = await database.query(messageCountQuery, [chatId]);
      const messageCount = parseInt(messageCountResult.rows[0].count);

      if (messageCount < 5) {
        return res.status(400).json({
          status: 'error',
          message: 'Not enough messages to generate a summary (minimum 5 required)'
        });
      }

      // Add summary generation job to queue
      const job = await queueService.addSummaryJob({
        chatId,
        period,
        requesterId: 'api',
        force
      });

      res.status(202).json({
        status: 'success',
        message: 'Summary generation started',
        data: {
          jobId: job.id,
          chatId,
          period,
          messageCount,
          estimatedTime: Math.ceil(messageCount / 10) // Rough estimate in seconds
        }
      });

    } catch (error) {
      logger.error('Failed to generate summary:', {
        chatId,
        period,
        error: error.message
      });
      throw error;
    }
  })
);

// Get summary generation status
router.get('/job/:jobId/status',
  [
    param('jobId').notEmpty().withMessage('Job ID is required')
  ],
  catchAsync(async (req, res) => {
    const { jobId } = req.params;

    try {
      // This would require accessing Bull queue job status
      // For now, we'll return a placeholder response
      res.json({
        status: 'success',
        data: {
          jobId,
          status: 'processing',
          message: 'Job status tracking not implemented yet'
        }
      });

    } catch (error) {
      logger.error('Failed to get job status:', {
        jobId,
        error: error.message
      });
      throw error;
    }
  })
);

// Get cached summary
router.get('/:chatId/cached',
  [
    param('chatId').notEmpty().withMessage('Chat ID is required'),
    query('period').isIn(['24h', '48h', '1week']).withMessage('Invalid period')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { chatId } = req.params;
    const { period } = req.query;

    try {
      const cacheKey = `summary:${chatId}:${period}`;
      const cachedSummary = await redis.get(cacheKey);

      if (!cachedSummary) {
        return res.status(404).json({
          status: 'error',
          message: 'No cached summary found'
        });
      }

      res.json({
        status: 'success',
        data: {
          summary: cachedSummary,
          cached: true,
          chatId,
          period
        }
      });

    } catch (error) {
      logger.error('Failed to get cached summary:', {
        chatId,
        period,
        error: error.message
      });
      throw error;
    }
  })
);

// Delete summary
router.delete('/summary/:summaryId',
  [
    param('summaryId').isInt().withMessage('Summary ID must be an integer')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { summaryId } = req.params;

    try {
      const query = 'DELETE FROM group_summaries WHERE id = $1 RETURNING *';
      const result = await database.query(query, [summaryId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Summary not found'
        });
      }

      const deletedSummary = result.rows[0];

      // Clear cache if exists
      const cacheKey = `summary:${deletedSummary.chat_id}:${deletedSummary.summary_period}`;
      await redis.del(cacheKey);

      res.json({
        status: 'success',
        message: 'Summary deleted successfully',
        data: {
          deletedSummary
        }
      });

    } catch (error) {
      logger.error('Failed to delete summary:', {
        summaryId,
        error: error.message
      });
      throw error;
    }
  })
);

// Get summary statistics
router.get('/stats/overview',
  [
    query('period').optional().isIn(['24h', '48h', '1week', '1month']).withMessage('Invalid period')
  ],
  catchAsync(async (req, res) => {
    const { period = '1week' } = req.query;

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
        case '1month':
          hours = 720;
          break;
      }

      const statsQuery = `
        SELECT 
          COUNT(*) as total_summaries,
          COUNT(DISTINCT chat_id) as unique_chats,
          summary_period,
          AVG(message_count) as avg_message_count,
          MIN(created_at) as first_summary,
          MAX(created_at) as last_summary
        FROM group_summaries 
        WHERE created_at >= NOW() - INTERVAL '${hours} hours'
        GROUP BY summary_period
        ORDER BY summary_period
      `;

      const result = await database.query(statsQuery);

      // Get top active chats
      const topChatsQuery = `
        SELECT 
          chat_id,
          COUNT(*) as summary_count,
          MAX(created_at) as last_summary
        FROM group_summaries 
        WHERE created_at >= NOW() - INTERVAL '${hours} hours'
        GROUP BY chat_id
        ORDER BY summary_count DESC
        LIMIT 10
      `;

      const topChatsResult = await database.query(topChatsQuery);

      res.json({
        status: 'success',
        data: {
          period,
          statistics: result.rows,
          topChats: topChatsResult.rows
        }
      });

    } catch (error) {
      logger.error('Failed to get summary statistics:', {
        period,
        error: error.message
      });
      throw error;
    }
  })
);

// Search summaries
router.get('/search',
  [
    query('q').notEmpty().withMessage('Search query is required'),
    query('period').optional().isIn(['24h', '48h', '1week']).withMessage('Invalid period'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('chatId').optional().notEmpty().withMessage('Chat ID cannot be empty')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { q, period, limit = 20, chatId } = req.query;

    try {
      let query = `
        SELECT 
          *,
          ts_rank(to_tsvector('portuguese', summary_text), plainto_tsquery('portuguese', $1)) as rank
        FROM group_summaries 
        WHERE to_tsvector('portuguese', summary_text) @@ plainto_tsquery('portuguese', $1)
      `;

      const params = [q];
      let paramIndex = 2;

      if (period) {
        query += ` AND summary_period = $${paramIndex}`;
        params.push(period);
        paramIndex++;
      }

      if (chatId) {
        query += ` AND chat_id = $${paramIndex}`;
        params.push(chatId);
        paramIndex++;
      }

      query += ` ORDER BY rank DESC, created_at DESC LIMIT $${paramIndex}`;
      params.push(parseInt(limit));

      const result = await database.query(query, params);

      res.json({
        status: 'success',
        data: {
          query: q,
          results: result.rows,
          count: result.rows.length
        }
      });

    } catch (error) {
      logger.error('Failed to search summaries:', {
        query: q,
        period,
        chatId,
        error: error.message
      });
      throw error;
    }
  })
);

// Request a new summary on demand
router.post('/request',
  [
    body('chatId').notEmpty().withMessage('Chat ID is required'),
    body('requesterId').notEmpty().withMessage('Requester ID is required')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { chatId, requesterId } = req.body;

    try {
      const jobDetails = await summaryService.requestSummary(chatId, requesterId);

      res.status(202).json({
        status: 'success',
        message: 'Solicitação de resumo recebida e enfileirada para processamento',
        data: jobDetails
      });

    } catch (error) {
      logger.error('API failed to handle summary request', {
        chatId,
        requesterId,
        errorMessage: error.message,
      });

      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        status: 'error',
        message: error.message
      });
    }
  })
);

module.exports = router;