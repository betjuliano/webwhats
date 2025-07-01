const axios = require('axios');
const logger = require('../utils/logger');
const { aiServiceErrorHandler } = require('../middleware/errorHandler');

class EvolutionService {
  constructor() {
    this.apiUrl = process.env.EVOLUTION_API_URL;
    this.apiKey = process.env.EVOLUTION_API_KEY;
    this.instanceName = process.env.EVOLUTION_INSTANCE_NAME;
    this.webhookUrl = process.env.EVOLUTION_WEBHOOK_URL;
    
    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey
      },
      timeout: 120000
    });

    // Setup request/response interceptors
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.debug('EvolutionAPI Request:', {
          method: config.method,
          url: config.url,
          data: config.data ? 'present' : 'none'
        });
        return config;
      },
      (error) => {
        logger.error('EvolutionAPI Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug('EvolutionAPI Response:', {
          status: response.status,
          url: response.config.url,
          data: response.data ? 'present' : 'none'
        });
        return response;
      },
      (error) => {
        logger.error('EvolutionAPI Response Error:', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  // Create instance
  async createInstance() {
    try {
      const response = await this.axiosInstance.post('/instance/create', {
        instanceName: this.instanceName,
        token: this.apiKey,
        qrcode: true,
        webhook: this.webhookUrl,
        webhook_by_events: true,
        events: [
          'APPLICATION_STARTUP',
          'QRCODE_UPDATED',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'CONTACTS_SET',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
          'PRESENCE_UPDATE',
          'CHATS_SET',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'GROUPS_UPSERT',
          'GROUP_UPDATE',
          'GROUP_PARTICIPANTS_UPDATE',
          'CONNECTION_UPDATE'
        ]
      });

      logger.info('EvolutionAPI instance created:', {
        instanceName: this.instanceName,
        status: response.data.instance?.state
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to create EvolutionAPI instance:', error);
      throw aiServiceErrorHandler('EvolutionAPI', 'create_instance', error);
    }
  }

  // Get instance info
  async getInstanceInfo() {
    try {
      const response = await this.axiosInstance.get(`/instance/fetchInstances`);
      
      const instance = response.data.find(inst => inst.instance.instanceName === this.instanceName);
      
      if (!instance) {
        throw new Error(`Instance ${this.instanceName} not found`);
      }

      return instance;

    } catch (error) {
      logger.error('Failed to get instance info:', error);
      throw aiServiceErrorHandler('EvolutionAPI', 'get_instance_info', error);
    }
  }

  // Connect instance
  async connectInstance() {
    try {
      const response = await this.axiosInstance.get(`/instance/connect/${this.instanceName}`);
      
      logger.info('EvolutionAPI instance connection initiated:', {
        instanceName: this.instanceName,
        response: response.data
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to connect instance:', error);
      throw aiServiceErrorHandler('EvolutionAPI', 'connect_instance', error);
    }
  }

  // Get QR Code
  async getQRCode() {
    try {
      const response = await this.axiosInstance.get(`/instance/qrcode/${this.instanceName}`);
      
      return response.data;

    } catch (error) {
      logger.error('Failed to get QR code:', error);
      throw aiServiceErrorHandler('EvolutionAPI', 'get_qrcode', error);
    }
  }

  // Send text message
  async sendMessage(chatId, message, options = {}) {
    try {
      const payload = {
        number: chatId,
        text: message,
        delay: options.delay || 0,
        quoted: options.quoted || null
      };

      const response = await this.axiosInstance.post(
        `/message/sendText/${this.instanceName}`,
        payload
      );

      logger.info('Message sent successfully:', {
        chatId,
        messageLength: message.length,
        messageId: response.data.key?.id
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to send message:', {
        chatId,
        error: error.message
      });
      throw aiServiceErrorHandler('EvolutionAPI', 'send_message', error);
    }
  }

  // Send media message
  async sendMedia(chatId, mediaUrl, caption = '', mediaType = 'image') {
    try {
      const payload = {
        number: chatId,
        media: mediaUrl,
        caption: caption,
        delay: 0
      };

      let endpoint;
      switch (mediaType) {
        case 'image':
          endpoint = `/message/sendMedia/${this.instanceName}`;
          break;
        case 'audio':
          endpoint = `/message/sendWhatsAppAudio/${this.instanceName}`;
          break;
        case 'video':
          endpoint = `/message/sendMedia/${this.instanceName}`;
          break;
        case 'document':
          endpoint = `/message/sendMedia/${this.instanceName}`;
          break;
        default:
          endpoint = `/message/sendMedia/${this.instanceName}`;
      }

      const response = await this.axiosInstance.post(endpoint, payload);

      logger.info('Media sent successfully:', {
        chatId,
        mediaType,
        captionLength: caption.length,
        messageId: response.data.key?.id
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to send media:', {
        chatId,
        mediaType,
        error: error.message
      });
      throw aiServiceErrorHandler('EvolutionAPI', 'send_media', error);
    }
  }

  // Send audio message
  async sendAudio(chatId, audioUrl) {
    try {
      const payload = {
        number: chatId,
        audio: audioUrl,
        delay: 0
      };

      const response = await this.axiosInstance.post(
        `/message/sendWhatsAppAudio/${this.instanceName}`,
        payload
      );

      logger.info('Audio sent successfully:', {
        chatId,
        messageId: response.data.key?.id
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to send audio:', {
        chatId,
        error: error.message
      });
      throw aiServiceErrorHandler('EvolutionAPI', 'send_audio', error);
    }
  }

  // Get chat info
  async getChatInfo(chatId) {
    try {
      const response = await this.axiosInstance.get(
        `/chat/whatsAppNumbers/${this.instanceName}?numbers=${chatId}`
      );

      return response.data;

    } catch (error) {
      logger.error('Failed to get chat info:', {
        chatId,
        error: error.message
      });
      throw aiServiceErrorHandler('EvolutionAPI', 'get_chat_info', error);
    }
  }

  // Get group info
  async getGroupInfo(groupId) {
    try {
      const response = await this.axiosInstance.get(
        `/group/findGroup/${this.instanceName}?groupJid=${groupId}`
      );

      return response.data;

    } catch (error) {
      logger.error('Failed to get group info:', {
        groupId,
        error: error.message
      });
      throw aiServiceErrorHandler('EvolutionAPI', 'get_group_info', error);
    }
  }

  // Get group participants
  async getGroupParticipants(groupId) {
    try {
      const response = await this.axiosInstance.get(
        `/group/participants/${this.instanceName}?groupJid=${groupId}`
      );

      return response.data;

    } catch (error) {
      logger.error('Failed to get group participants:', {
        groupId,
        error: error.message
      });
      throw aiServiceErrorHandler('EvolutionAPI', 'get_group_participants', error);
    }
  }

  // Mark message as read
  async markAsRead(chatId, messageId) {
    try {
      const payload = {
        readMessages: [
          {
            remoteJid: chatId,
            id: messageId,
            fromMe: false
          }
        ]
      };

      const response = await this.axiosInstance.post(
        `/chat/markMessageAsRead/${this.instanceName}`,
        payload
      );

      return response.data;

    } catch (error) {
      logger.error('Failed to mark message as read:', {
        chatId,
        messageId,
        error: error.message
      });
      // Don't throw error for read receipts as it's not critical
    }
  }

  // Set presence (typing, recording, etc.)
  async setPresence(chatId, presence = 'available') {
    try {
      const payload = {
        number: chatId,
        presence: presence // available, unavailable, composing, recording, paused
      };

      const response = await this.axiosInstance.post(
        `/chat/presence/${this.instanceName}`,
        payload
      );

      return response.data;

    } catch (error) {
      logger.error('Failed to set presence:', {
        chatId,
        presence,
        error: error.message
      });
      // Don't throw error for presence as it's not critical
    }
  }

  // Download media
  async downloadMedia(messageId) {
    try {
      const response = await this.axiosInstance.post(
        `/chat/getBase64FromMediaMessage/${this.instanceName}`,
        {
          message: {
            key: {
              id: messageId
            }
          }
        }
      );

      return response.data;

    } catch (error) {
      logger.error('Failed to download media:', {
        messageId,
        error: error.message
      });
      throw aiServiceErrorHandler('EvolutionAPI', 'download_media', error);
    }
  }

  // Get contacts
  async getContacts() {
    try {
      const response = await this.axiosInstance.get(
        `/chat/findContacts/${this.instanceName}`
      );

      return response.data;

    } catch (error) {
      logger.error('Failed to get contacts:', error);
      throw aiServiceErrorHandler('EvolutionAPI', 'get_contacts', error);
    }
  }

  // Get chats
  async getChats() {
    try {
      const response = await this.axiosInstance.get(
        `/chat/findChats/${this.instanceName}`
      );

      return response.data;

    } catch (error) {
      logger.error('Failed to get chats:', error);
      throw aiServiceErrorHandler('EvolutionAPI', 'get_chats', error);
    }
  }

  // Get messages from chat
  async getChatMessages(chatId, limit = 50) {
    try {
      const response = await this.axiosInstance.get(
        `/chat/findMessages/${this.instanceName}?number=${chatId}&limit=${limit}`
      );

      return response.data;

    } catch (error) {
      logger.error('Failed to get chat messages:', {
        chatId,
        limit,
        error: error.message
      });
      throw aiServiceErrorHandler('EvolutionAPI', 'get_chat_messages', error);
    }
  }

  // Delete instance
  async deleteInstance() {
    try {
      const response = await this.axiosInstance.delete(
        `/instance/delete/${this.instanceName}`
      );

      logger.info('EvolutionAPI instance deleted:', {
        instanceName: this.instanceName
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to delete instance:', error);
      throw aiServiceErrorHandler('EvolutionAPI', 'delete_instance', error);
    }
  }

  // Logout instance
  async logoutInstance() {
    try {
      const response = await this.axiosInstance.delete(
        `/instance/logout/${this.instanceName}`
      );

      logger.info('EvolutionAPI instance logged out:', {
        instanceName: this.instanceName
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to logout instance:', error);
      throw aiServiceErrorHandler('EvolutionAPI', 'logout_instance', error);
    }
  }

  // Restart instance
  async restartInstance() {
    try {
      const response = await this.axiosInstance.put(
        `/instance/restart/${this.instanceName}`
      );

      logger.info('EvolutionAPI instance restarted:', {
        instanceName: this.instanceName
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to restart instance:', error);
      throw aiServiceErrorHandler('EvolutionAPI', 'restart_instance', error);
    }
  }

  // Set webhook
  async setWebhook(webhookUrl, events = []) {
    try {
      const payload = {
        webhook: webhookUrl,
        webhook_by_events: true,
        events: events.length > 0 ? events : [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
          'GROUPS_UPSERT',
          'GROUP_UPDATE',
          'CONNECTION_UPDATE'
        ]
      };

      const response = await this.axiosInstance.post(
        `/webhook/set/${this.instanceName}`,
        payload
      );

      logger.info('Webhook set successfully:', {
        instanceName: this.instanceName,
        webhookUrl,
        events: payload.events
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to set webhook:', error);
      throw aiServiceErrorHandler('EvolutionAPI', 'set_webhook', error);
    }
  }

  // Health check
  async healthCheck() {
    try {
      const response = await this.axiosInstance.get('/');
      return {
        status: 'healthy',
        response: response.data
      };

    } catch (error) {
      logger.error('EvolutionAPI health check failed:', error);
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Format phone number for WhatsApp
  formatPhoneNumber(number) {
    // Remove all non-numeric characters
    const cleaned = number.replace(/\D/g, '');
    
    // Add country code if not present (assuming Brazil +55)
    if (cleaned.length === 11 && cleaned.startsWith('11')) {
      return `55${cleaned}@s.whatsapp.net`;
    } else if (cleaned.length === 10) {
      return `55${cleaned}@s.whatsapp.net`;
    } else if (cleaned.length === 13 && cleaned.startsWith('55')) {
      return `${cleaned}@s.whatsapp.net`;
    }
    
    return `${cleaned}@s.whatsapp.net`;
  }

  // Check if number is a group
  isGroupNumber(number) {
    return number.includes('@g.us');
  }

  // Extract number from WhatsApp ID
  extractNumber(whatsappId) {
    return whatsappId.replace('@s.whatsapp.net', '').replace('@g.us', '');
  }
}

module.exports = new EvolutionService();