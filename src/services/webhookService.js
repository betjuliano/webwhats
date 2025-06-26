const logger = require('../utils/logger');
const messageService = require('./messageService');

class WebhookService {
  async processIncomingMessage(payload) {
    try {
      logger.info('Processing incoming webhook from Evolution API', { payload });

      const { event, instance, data } = payload;

      if (event !== 'messages.upsert' || !data || !data.key || !data.message) {
        logger.warn('Received a non-message event, or payload is missing data, skipping.', { event });
        return;
      }

      // The transformation logic has been moved to messageService.
      // The webhookService now only validates the event and passes the raw data.
      await messageService.processIncomingMessage(data, instance);

      logger.info('Successfully processed and stored incoming message from webhook.');
    } catch (error) {
      logger.error('Failed to process incoming webhook:', {
        errorMessage: error.message,
        errorStack: error.stack,
      });
      throw error;
    }
  }
}

module.exports = new WebhookService(); 