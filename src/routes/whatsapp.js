const express = require('express');
const { body, validationResult } = require('express-validator');
const { catchAsync, validationErrorHandler } = require('../middleware/errorHandler');
const whatsappService = require('../services/whatsappService');
const logger = require('../utils/logger');

const router = express.Router();

// Get connection status
router.get('/status',
  catchAsync(async (req, res) => {
    try {
      const health = await whatsappService.healthCheck();

      res.json({
        status: 'success',
        data: {
          ...health,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Failed to get WhatsApp status:', error);
      throw error;
    }
  })
);

// Send message
router.post('/send',
  [
    body('chatId').notEmpty().withMessage('Chat ID is required'),
    body('message').notEmpty().withMessage('Message is required')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { chatId, message } = req.body;

    try {
      const result = await whatsappService.sendMessage(chatId, message);

      res.json({
        status: 'success',
        message: 'Message sent successfully',
        data: result
      });

    } catch (error) {
      logger.error('Failed to send message:', {
        chatId,
        error: error.message
      });
      throw error;
    }
  })
);

// Send media
router.post('/send-media',
  [
    body('chatId').notEmpty().withMessage('Chat ID is required'),
    body('mediaUrl').notEmpty().withMessage('Media URL is required'),
    body('caption').optional().isString().withMessage('Caption must be a string')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw validationErrorHandler(errors);
    }

    const { chatId, mediaUrl, caption = '' } = req.body;

    try {
      // Note: The send-media route now expects a public URL for the media.
      const result = await whatsappService.sendMedia(chatId, mediaUrl, caption);

      res.json({
        status: 'success',
        message: 'Media sent successfully',
        data: result
      });

    } catch (error) {
      logger.error('Failed to send media:', {
        chatId,
        mediaUrl,
        error: error.message
      });
      throw error;
    }
  })
);

// Restart the connection
router.post('/restart',
  catchAsync(async (req, res) => {
    try {
      const result = await whatsappService.restart();
      res.json({
        status: 'success',
        message: 'Restart command sent.',
        data: result
      });
    } catch (error) {
      logger.error('Failed to restart connection:', error);
      throw error;
    }
  })
);

module.exports = router;