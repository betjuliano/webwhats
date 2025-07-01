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
      },
      timeout: 30000 // 30 segundos timeout
    });
  }

  // Método para retry com backoff exponencial
  async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(`Tentativa ${attempt} falhou, tentando novamente em ${delay}ms...`, {
          error: error.message
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async sendMessage(chatId, message) {
    return this.retryWithBackoff(async () => {
      try {
        logger.info(`Sending message to ${chatId} via Evolution API`);
        
        // Validação dos parâmetros
        if (!chatId || !message) {
          throw new Error('ChatId and message are required');
        }

        const payload = {
          number: chatId,
          textMessage: {
            text: message
          }
        };

        const response = await this.api.post(`/message/sendText/${WHATSAPP_INSTANCE}`, payload);
        
        logger.info('Message sent successfully via Evolution API', { 
          chatId,
          messageLength: message.length,
          responseStatus: response.status,
          data: response.data 
        });
        
        return response.data;
      } catch (error) {
        // Log detalhado do erro
        const errorDetails = {
          chatId,
          messageLength: message?.length || 0,
          errorMessage: error.message,
          errorCode: error.code,
          responseStatus: error.response?.status,
          responseData: error.response?.data,
          requestUrl: error.config?.url,
          requestMethod: error.config?.method
        };

        logger.error('Failed to send message via Evolution API:', errorDetails);
        
        // Re-throw com mensagem mais específica
        if (error.response) {
          throw new Error(`Evolution API responded with ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        } else if (error.code === 'ECONNREFUSED') {
          throw new Error('Cannot connect to Evolution API - connection refused');
        } else if (error.code === 'ETIMEDOUT') {
          throw new Error('Evolution API request timed out');
        } else {
          throw new Error(`Failed to send message via Evolution API: ${error.message}`);
        }
      }
    });
  }

  async sendMedia(chatId, mediaUrl, caption = '') {
    return this.retryWithBackoff(async () => {
      try {
        logger.info(`Sending media to ${chatId} via Evolution API from URL: ${mediaUrl}`);
        
        if (!chatId || !mediaUrl) {
          throw new Error('ChatId and mediaUrl are required');
        }

        const payload = {
          number: chatId,
          mediaMessage: {
            mediaType: "image", // This is an assumption. You may need to adapt it based on the actual media type.
            url: mediaUrl,
            caption: caption
          }
        };
        
        const response = await this.api.post(`/message/sendMedia/${WHATSAPP_INSTANCE}`, payload);
        
        logger.info('Media sent successfully via Evolution API', { 
          chatId,
          mediaUrl,
          captionLength: caption?.length || 0,
          responseStatus: response.status,
          data: response.data 
        });
        
        return response.data;
      } catch (error) {
        const errorDetails = {
          chatId,
          mediaUrl,
          captionLength: caption?.length || 0,
          errorMessage: error.message,
          errorCode: error.code,
          responseStatus: error.response?.status,
          responseData: error.response?.data
        };

        logger.error('Failed to send media via Evolution API:', errorDetails);
        
        if (error.response) {
          throw new Error(`Evolution API responded with ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        } else {
          throw new Error(`Failed to send media via Evolution API: ${error.message}`);
        }
      }
    });
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
      logger.info('Checking Evolution API health...');
      
      const response = await this.api.get(`/instance/connectionState/${WHATSAPP_INSTANCE}`);
      
      logger.info('Evolution API health check successful', {
        status: response.status,
        data: response.data
      });
      
      return { 
        status: 'ok', 
        details: response.data,
        instance: WHATSAPP_INSTANCE,
        apiUrl: EVOLUTION_API_URL
      };
    } catch (error) {
      const errorDetails = {
        instance: WHATSAPP_INSTANCE,
        apiUrl: EVOLUTION_API_URL,
        errorMessage: error.message,
        errorCode: error.code,
        responseStatus: error.response?.status,
        responseData: error.response?.data
      };

      logger.error('Evolution API health check failed:', errorDetails);
      
      return { 
        status: 'error', 
        details: 'Could not connect to Evolution API instance.',
        error: errorDetails
      };
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
      logger.info('Evolution API instance restart command sent.', { data: response.data });
      return response.data;
    } catch (error) {
      const errorDetails = {
        instance: WHATSAPP_INSTANCE,
        errorMessage: error.message,
        responseStatus: error.response?.status,
        responseData: error.response?.data
      };

      logger.error('Failed to send restart command to Evolution API:', errorDetails);
      throw new Error(`Failed to restart Evolution instance: ${error.message}`);
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