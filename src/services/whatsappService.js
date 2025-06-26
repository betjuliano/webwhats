const axios = require('axios');
const logger = require('../utils/logger');

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evolution.iaprojetos.com.br';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const WHATSAPP_INSTANCE = process.env.WHATSAPP_INSTANCE;

class WhatsAppService {
  constructor() {
    if (!EVOLUTION_API_KEY || !WHATSAPP_INSTANCE) {
      logger.error('Evolution API Key or Instance is not configured. Please set EVOLUTION_API_KEY and WHATSAPP_INSTANCE environment variables.');
    }
    this.api = axios.create({
      baseURL: EVOLUTION_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      }
    });
  }

  async sendMessage(chatId, message) {
    try {
      logger.info(`Sending message to ${chatId} via Evolution API`);
      const payload = {
        number: chatId,
        textMessage: {
          text: message
        }
      };
      const response = await this.api.post(`/message/sendText/${WHATSAPP_INSTANCE}`, payload);
      logger.info('Message sent successfully via Evolution API', { data: response.data });
      return response.data;
    } catch (error) {
      const errorMsg = error.response ? error.response.data : error.message;
      logger.error('Failed to send message via Evolution API:', errorMsg);
      throw new Error('Failed to send message via Evolution API');
    }
  }

  async sendMedia(chatId, mediaUrl, caption = '') {
    try {
      logger.info(`Sending media to ${chatId} via Evolution API from URL: ${mediaUrl}`);
      const payload = {
        number: chatId,
        mediaMessage: {
          mediaType: "image", // This is an assumption. You may need to adapt it based on the actual media type.
          url: mediaUrl,
          caption: caption
        }
      };
      const response = await this.api.post(`/message/sendMedia/${WHATSAPP_INSTANCE}`, payload);
      logger.info('Media sent successfully via Evolution API', { data: response.data });
      return response.data;
    } catch (error) {
      const errorMsg = error.response ? error.response.data : error.message;
      logger.error('Failed to send media via Evolution API:', errorMsg);
      throw new Error('Failed to send media via Evolution API');
    }
  }

  getQRCode() {
    logger.warn('DEPRECATED: getQRCode is not supported with Evolution API.');
    return null;
  }

  getConnectionStatus() {
    logger.warn('DEPRECATED: getConnectionStatus is not supported with Evolution API.');
    return { state: 'connected', message: 'Connected via Evolution API' };
  }

  async healthCheck() {
    try {
      const response = await this.api.get(`/instance/connectionState/${WHATSAPP_INSTANCE}`);
      return { status: 'ok', details: response.data };
    } catch (error) {
      logger.error('Evolution API health check failed:', error.response ? error.response.data : error.message);
      return { status: 'error', details: 'Could not connect to Evolution API instance.' };
    }
  }

  async logout() {
    logger.warn('DEPRECATED: logout is not supported with Evolution API.');
    return { status: 'not_applicable' };
  }

  async restart() {
    logger.info('Attempting to restart Evolution API instance...');
    try {
      const response = await this.api.post(`/instance/restart/${WHATSAPP_INSTANCE}`);
      logger.info('Evolution API instance restart command sent.');
      return response.data;
    } catch (error) {
      logger.error('Failed to send restart command to Evolution API:', error.response ? error.response.data : error.message);
      throw new Error('Failed to restart Evolution instance');
    }
  }

  async getChatInfo(chatId) {
    logger.warn(`DEPRECATED: getChatInfo for ${chatId} is not supported with Evolution API.`);
    return { id: chatId, name: 'Unknown', isGroup: false };
  }

  async getContactInfo(contactId) {
    logger.warn(`DEPRECATED: getContactInfo for ${contactId} is not supported with Evolution API.`);
    return { id: contactId, name: 'Unknown' };
  }

  async getChats() {
    logger.warn('DEPRECATED: getChats is not supported with Evolution API.');
    return [];
  }
}

module.exports = new WhatsAppService(); 