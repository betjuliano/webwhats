const express = require('express');
const { query, param, validationResult } = require('express-validator');
const { catchAsync, validationErrorHandler } = require('../middleware/errorHandler');
const database = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// Get messages for a chat
router.get('/:chatId',
  [
    param('chatId').notEmpty().withMessage('Chat ID is required'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
    query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO 8601 date'),
    query('endDate').optional().isISO8601().withMessage('End date must be valid ISO 8601 date')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { chatId } = req.params;
    const { 
      limit = 50, 
      offset = 0, 
      startDate, 
      endDate 
    } = req.query;

    try {
      let query = `
        SELECT 
          m.*,
          pm.transcription,
          pm.description,
          pm.summary,
          pm.processing_status
        FROM messages m
        LEFT JOIN processed_media pm ON m.message_id = pm.message_id
        WHERE m.chat_id = $1
      `;
      
      const params = [chatId];
      let paramIndex = 2;

      // Add date filters if provided
      if (startDate) {
        query += ` AND m.created_at >= $${paramIndex}`;
        params.push(new Date(startDate));
        paramIndex++;
      }

      if (endDate) {
        query += ` AND m.created_at <= $${paramIndex}`;
        params.push(new Date(endDate));
        paramIndex++;
      }

      query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await database.query(query, params);

      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) FROM messages WHERE chat_id = $1';
      const countParams = [chatId];
      let countParamIndex = 2;

      if (startDate) {
        countQuery += ` AND created_at >= $${countParamIndex}`;
        countParams.push(new Date(startDate));
        countParamIndex++;
      }

      if (endDate) {
        countQuery += ` AND created_at <= $${countParamIndex}`;
        countParams.push(new Date(endDate));
      }

      const countResult = await database.query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].count);

      res.json({
        status: 'success',
        data: {
          messages: result.rows,
          pagination: {
            total: totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
          }
        }
      });

    } catch (error) {
      logger.error('Failed to get messages:', {
        chatId,
        error: error.message
      });
      throw error;
    }
  })
);

// Get message by ID
router.get('/message/:messageId',
  [
    param('messageId').notEmpty().withMessage('Message ID is required')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { messageId } = req.params;

    try {
      const query = `
        SELECT 
          m.*,
          pm.transcription,
          pm.description,
          pm.summary,
          pm.processing_status,
          pm.processing_error
        FROM messages m
        LEFT JOIN processed_media pm ON m.message_id = pm.message_id
        WHERE m.message_id = $1
      `;

      const result = await database.query(query, [messageId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Message not found'
        });
      }

      res.json({
        status: 'success',
        data: {
          message: result.rows[0]
        }
      });

    } catch (error) {
      logger.error('Failed to get message:', {
        messageId,
        error: error.message
      });
      throw error;
    }
  })
);

// Get chat statistics
router.get('/:chatId/stats',
  [
    param('chatId').notEmpty().withMessage('Chat ID is required'),
    query('period').optional().isIn(['24h', '48h', '1week', '1month']).withMessage('Invalid period')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { chatId } = req.params;
    const { period = '24h' } = req.query;

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
        default:
          hours = 24;
      }

      // Get message statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as total_messages,
          COUNT(CASE WHEN message_type = 'text' THEN 1 END) as text_messages,
          COUNT(CASE WHEN message_type = 'image' THEN 1 END) as image_messages,
          COUNT(CASE WHEN message_type = 'audio' THEN 1 END) as audio_messages,
          COUNT(CASE WHEN message_type = 'video' THEN 1 END) as video_messages,
          COUNT(CASE WHEN message_type = 'document' THEN 1 END) as document_messages,
          COUNT(DISTINCT sender_id) as unique_senders,
          MIN(created_at) as first_message,
          MAX(created_at) as last_message
        FROM messages 
        WHERE chat_id = $1 
        AND created_at >= NOW() - INTERVAL '${hours} hours'
      `;

      const statsResult = await database.query(statsQuery, [chatId]);

      // Get top senders
      const sendersQuery = `
        SELECT 
          sender_id,
          sender_name,
          COUNT(*) as message_count
        FROM messages 
        WHERE chat_id = $1 
        AND created_at >= NOW() - INTERVAL '${hours} hours'
        GROUP BY sender_id, sender_name
        ORDER BY message_count DESC
        LIMIT 10
      `;

      const sendersResult = await database.query(sendersQuery, [chatId]);

      // Get hourly distribution
      const hourlyQuery = `
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as message_count
        FROM messages 
        WHERE chat_id = $1 
        AND created_at >= NOW() - INTERVAL '${hours} hours'
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `;

      const hourlyResult = await database.query(hourlyQuery, [chatId]);

      res.json({
        status: 'success',
        data: {
          period,
          statistics: statsResult.rows[0],
          topSenders: sendersResult.rows,
          hourlyDistribution: hourlyResult.rows
        }
      });

    } catch (error) {
      logger.error('Failed to get chat statistics:', {
        chatId,
        period,
        error: error.message
      });
      throw error;
    }
  })
);

// Search messages
router.get('/:chatId/search',
  [
    param('chatId').notEmpty().withMessage('Chat ID is required'),
    query('q').notEmpty().withMessage('Search query is required'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('messageType').optional().isIn(['text', 'image', 'audio', 'video', 'document']).withMessage('Invalid message type')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { chatId } = req.params;
    const { q, limit = 20, messageType } = req.query;

    try {
      let query = `
        SELECT 
          m.*,
          pm.transcription,
          pm.description,
          pm.summary,
          ts_rank(to_tsvector('portuguese', COALESCE(m.content, '') || ' ' || COALESCE(pm.transcription, '') || ' ' || COALESCE(pm.description, '') || ' ' || COALESCE(pm.summary, '')), plainto_tsquery('portuguese', $2)) as rank
        FROM messages m
        LEFT JOIN processed_media pm ON m.message_id = pm.message_id
        WHERE m.chat_id = $1
        AND (
          to_tsvector('portuguese', COALESCE(m.content, '') || ' ' || COALESCE(pm.transcription, '') || ' ' || COALESCE(pm.description, '') || ' ' || COALESCE(pm.summary, '')) 
          @@ plainto_tsquery('portuguese', $2)
          OR m.content ILIKE $3
          OR pm.transcription ILIKE $3
          OR pm.description ILIKE $3
          OR pm.summary ILIKE $3
        )
      `;

      const params = [chatId, q, `%${q}%`];
      let paramIndex = 4;

      if (messageType) {
        query += ` AND m.message_type = $${paramIndex}`;
        params.push(messageType);
        paramIndex++;
      }

      query += ` ORDER BY rank DESC, m.created_at DESC LIMIT $${paramIndex}`;
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
      logger.error('Failed to search messages:', {
        chatId,
        query: q,
        error: error.message
      });
      throw error;
    }
  })
);

// Get processed media for a message
router.get('/message/:messageId/media',
  [
    param('messageId').notEmpty().withMessage('Message ID is required')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { messageId } = req.params;

    try {
      const query = `
        SELECT * FROM processed_media 
        WHERE message_id = $1
      `;

      const result = await database.query(query, [messageId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Processed media not found'
        });
      }

      res.json({
        status: 'success',
        data: {
          processedMedia: result.rows[0]
        }
      });

    } catch (error) {
      logger.error('Failed to get processed media:', {
        messageId,
        error: error.message
      });
      throw error;
    }
  })
);

// Get recent chats
router.get('/',
  [
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('type').optional().isIn(['individual', 'group', 'all']).withMessage('Invalid chat type')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { limit = 20, type = 'all' } = req.query;

    try {
      let query = `
        SELECT 
          chat_id,
          is_group,
          COUNT(*) as message_count,
          MAX(created_at) as last_message_time,
          MAX(sender_name) as last_sender_name,
          MAX(content) as last_message_content
        FROM messages 
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      if (type === 'individual') {
        query += ` AND is_group = false`;
      } else if (type === 'group') {
        query += ` AND is_group = true`;
      }

      query += ` 
        GROUP BY chat_id, is_group 
        ORDER BY last_message_time DESC 
        LIMIT $${paramIndex}
      `;
      params.push(parseInt(limit));

      const result = await database.query(query, params);

      res.json({
        status: 'success',
        data: {
          chats: result.rows,
          count: result.rows.length
        }
      });

    } catch (error) {
      logger.error('Failed to get recent chats:', {
        type,
        limit,
        error: error.message
      });
      throw error;
    }
  })
);

module.exports = router;