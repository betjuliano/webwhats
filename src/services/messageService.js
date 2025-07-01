const database = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const aiService = require('./aiService');
const queueService = require('./queueService');
const whatsappService = require('./whatsappService');
const conversationAnalysisService = require('./conversationAnalysisService');
const knowledgeSearchService = require('./knowledgeSearchService');
const summaryService = require('./summaryService');
const { AppError } = require('../middleware/errorHandler');
const fs = require('fs/promises');
const path = require('path');

class MessageService {
  constructor() {
    this.processingQueue = new Map();
    this.activeSupportChats = new Map(); // chatId -> category
  }

  // Process incoming message from webhook
  async processIncomingMessage(message, instance) {
    try {
      const messageData = this.extractMessageData(message, instance);
      
      // Check if message already exists
      const existingMessage = await this.getMessageById(messageData.messageId);
      if (existingMessage) {
        logger.debug('Message already processed', { messageId: messageData.messageId });
        return;
      }

      // Save message to database
      const savedMessage = await this.saveMessage(messageData);
      
      // Determine if it's a group or individual chat
      const isGroup = messageData.chatId.includes('@g.us');
      
      if (isGroup) {
        await this.processGroupMessage(savedMessage);
      } else {
        await this.processIndividualMessage(savedMessage);
      }

      logger.logMessageProcessing(messageData.messageId, 'received', 'success', {
        chatId: messageData.chatId,
        messageType: messageData.messageType,
        isGroup
      });

    } catch (error) {
      logger.logMessageProcessing(message.key?.id, 'process_incoming', 'error', {
        error: error.message
      });
      logger.error('Failed to process incoming webhook:', {
        errorMessage: error.message,
        errorStack: error.stack,
      });
      throw error;
    }
  }

  // Extract message data from EvolutionAPI format
  extractMessageData(message, instance) {
    const key = message.key || {};
    const messageInfo = message.message || {};
    
    // Determine message type and content
    let messageType = 'text';
    let content = '';
    let mediaUrl = null;
    let mediaType = null;

    if (messageInfo.conversation) {
      messageType = 'text';
      content = messageInfo.conversation;
    } else if (messageInfo.extendedTextMessage) {
      messageType = 'text';
      content = messageInfo.extendedTextMessage.text;
    } else if (messageInfo.imageMessage) {
      messageType = 'image';
      content = messageInfo.imageMessage.caption || '';
      mediaUrl = messageInfo.imageMessage.url;
      mediaType = 'image';
    } else if (messageInfo.videoMessage) {
      messageType = 'video';
      content = messageInfo.videoMessage.caption || '';
      mediaUrl = messageInfo.videoMessage.url;
      mediaType = 'video';
    } else if (messageInfo.audioMessage) {
      messageType = 'audio';
      mediaUrl = messageInfo.audioMessage.url;
      mediaType = 'audio';
    } else if (messageInfo.documentMessage) {
      messageType = 'document';
      content = messageInfo.documentMessage.caption || '';
      mediaUrl = messageInfo.documentMessage.url;
      mediaType = 'document';
    } else if (messageInfo.stickerMessage) {
      messageType = 'sticker';
      mediaUrl = messageInfo.stickerMessage.url;
      mediaType = 'sticker';
    }

    return {
      messageId: key.id,
      chatId: key.remoteJid,
      senderId: key.fromMe ? instance : (key.participant || key.remoteJid),
      senderName: message.pushName || 'Unknown',
      messageType,
      content,
      mediaUrl,
      mediaType,
      fromMe: key.fromMe || false,
      timestamp: message.messageTimestamp || Date.now(),
      instanceId: instance,
    };
  }

  // Save message to database
  async saveMessage(messageData) {
    try {
      const query = `
        INSERT INTO messages (
          message_id, chat_id, sender_id, sender_name, 
          message_type, content, media_url, media_type, 
          is_group, created_at, instance_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const values = [
        messageData.messageId,
        messageData.chatId,
        messageData.senderId,
        messageData.senderName,
        messageData.messageType,
        messageData.content,
        messageData.mediaUrl,
        messageData.mediaType,
        messageData.chatId.includes('@g.us'),
        new Date(messageData.timestamp * 1000),
        messageData.instanceId,
      ];

      const result = await database.query(query, values);
      
      logger.logDatabase('INSERT', 'messages', 'success', {
        messageId: messageData.messageId
      });

      return result.rows[0];
    } catch (error) {
      logger.logDatabase('INSERT', 'messages', 'error', {
        messageId: messageData.messageId,
        error: error.message
      });
      throw error;
    }
  }

  // Process individual chat message
  async processIndividualMessage(message) {
    try {
      const content = (message.content || '').trim();
      const lowerContent = content.toLowerCase();
      const chatId = message.chat_id;

      // Check if chat is in an active support mode
      if (this.activeSupportChats.has(chatId)) {
        if (lowerContent.replace(/\s+/g, '') === 'obrigado') {
          await this.deactivateSupportMode(chatId);
        } else {
          await this.handleSupportQuery(message, this.activeSupportChats.get(chatId));
        }
        return; // Message handled by support mode logic
      }

      // Handle commands first
      if (content && (content.startsWith('//') || content.startsWith('/'))) {
        const commandPrefix = content.startsWith('//') ? '//' : '/';
        const commandBody = content.substring(commandPrefix.length);
        const [command, ...args] = commandBody.split(' ');
        const query = args.join(' ');

        console.log('🎯 COMANDO DETECTADO:', { command, query, chatId });

        if (commandPrefix === '//' && command === 'apoioaluno') {
          await this.activateSupportMode(chatId, 'curso');
          return;
        }

        if (command === 'historico') {
          await this.handleHistoryCommand(message);
          return;
        }

        if (['curso', 'projetos', 'orientacoes'].includes(command)) {
          console.log('✅ PROCESSANDO COMANDO DE CONHECIMENTO:', command);
          await this.handleKnowledgeCommand(command, query, message);
          return;
        }

        if (command === 'base') {
          await this.handleBaseCommand(message);
          return;
        }
      }

      // Check if message has media that needs processing
      console.log('🔍 VERIFICANDO MÍDIA:', {
        hasMediaUrl: !!message.media_url,
        mediaType: message.media_type,
        messageType: message.message_type
      });
      
      if (message.media_url && message.media_type === 'audio') {
        console.log('✅ ENFILEIRANDO ÁUDIO PARA TRANSCRIÇÃO');
        await this.queueMediaProcessing(message);
      } else if (content && message.message_type === 'text') {
        // Process text message
        await this.processTextMessage(message);
      }

      // Mark message as processed
      await this.markMessageProcessed(message.message_id);

    } catch (error) {
      logger.logMessageProcessing(message.message_id, 'process_individual', 'error', {
        error: error.message
      });
      throw error;
    }
  }

  // Process group message
  async processGroupMessage(message) {
    try {
      // Handle commands first
      if (message.content && message.content.trim() === '/resumo') {
        await this.handleSummaryCommand(message);
        return; // Command handled
      }

      // Check for summary requests
      if (message.content && this.isSummaryRequest(message.content)) {
        await this.handleSummaryRequest(message);
        return;
      }

      // Store group message for future summaries
      await this.storeGroupMessage(message);

      // Mark message as processed
      await this.markMessageProcessed(message.message_id);

    } catch (error) {
      logger.logMessageProcessing(message.message_id, 'process_group', 'error', {
        error: error.message
      });
      throw error;
    }
  }

  // Queue media for processing
  async queueMediaProcessing(message) {
    try {
      const jobData = {
        messageId: message.message_id,
        chatId: message.chat_id,
        mediaUrl: message.media_url,
        mediaType: message.media_type,
        content: message.content
      };

      await queueService.addMediaProcessingJob(jobData);
      
      logger.logMessageProcessing(message.message_id, 'queue_media', 'success', {
        mediaType: message.media_type
      });

    } catch (error) {
      logger.logMessageProcessing(message.message_id, 'queue_media', 'error', {
        error: error.message
      });
      throw error;
    }
  }

  // Process text message
  async processTextMessage(message) {
    try {
      // Generate AI response for text
      const response = await aiService.generateTextResponse(message.content, {
        chatId: message.chat_id,
        senderId: message.sender_id
      });

      if (response) {
        await this.sendResponse(message.chat_id, response);
      }

    } catch (error) {
      logger.logMessageProcessing(message.message_id, 'process_text', 'error', {
        error: error.message
      });
    }
  }

  // Check if message is a summary request
  isSummaryRequest(content) {
    const summaryKeywords = [
      'resumo', 'summary', 'resumir', 'summarize',
      '24h', '48h', '1 semana', '1 week',
      'últimas 24 horas', 'last 24 hours',
      'últimas 48 horas', 'last 48 hours',
      'última semana', 'last week'
    ];

    const lowerContent = content.toLowerCase();
    return summaryKeywords.some(keyword => lowerContent.includes(keyword));
  }

  // Handle summary request
  async handleSummaryRequest(message) {
    try {
      const period = this.extractSummaryPeriod(message.content);
      const summary = await this.generateGroupSummary(message.chat_id, period);
      
      if (summary) {
        await this.sendResponse(message.chat_id, summary);
      } else {
        await this.sendResponse(message.chat_id, 'Não há mensagens suficientes para gerar um resumo.');
      }

    } catch (error) {
      logger.logMessageProcessing(message.message_id, 'handle_summary', 'error', {
        error: error.message
      });
      
      await this.sendResponse(message.chat_id, 'Erro ao gerar resumo. Tente novamente mais tarde.');
    }
  }

  // Extract summary period from message content
  extractSummaryPeriod(content) {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('24h') || lowerContent.includes('24 horas')) {
      return '24h';
    } else if (lowerContent.includes('48h') || lowerContent.includes('48 horas')) {
      return '48h';
    } else if (lowerContent.includes('semana') || lowerContent.includes('week')) {
      return '1week';
    }
    
    return '24h'; // Default
  }

  // Generate group summary
  async generateGroupSummary(chatId, period) {
    try {
      // Check cache first
      const cacheKey = `summary:${chatId}:${period}`;
      const cachedSummary = await redis.get(cacheKey);
      
      if (cachedSummary) {
        logger.info('Returning cached summary', { chatId, period });
        return cachedSummary;
      }

      // Get messages from database
      const messages = await this.getGroupMessages(chatId, period);
      
      if (messages.length === 0) {
        return null;
      }

      // Generate summary using AI
      const summary = await aiService.generateGroupSummary(messages, period);
      
      // Cache summary
      const ttl = period === '24h' ? 3600 : period === '48h' ? 7200 : 14400; // 1h, 2h, 4h
      await redis.set(cacheKey, summary, ttl);

      // Save summary to database
      await this.saveSummary(chatId, period, summary, messages.length);

      return summary;

    } catch (error) {
      logger.error('Failed to generate group summary:', error);
      throw error;
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

  // Send response message
  async sendResponse(chatId, message) {
    try {
      await whatsappService.sendMessage(chatId, message);
      
      logger.logMessageProcessing('response', 'send', 'success', {
        chatId,
        messageLength: message.length
      });

    } catch (error) {
      logger.logMessageProcessing('response', 'send', 'error', {
        chatId,
        error: error.message
      });
      throw error;
    }
  }

  // Mark message as processed
  async markMessageProcessed(messageId) {
    try {
      const query = `
        UPDATE messages 
        SET processed = true, processed_at = CURRENT_TIMESTAMP 
        WHERE message_id = $1
      `;
      
      await database.query(query, [messageId]);

    } catch (error) {
      logger.logDatabase('UPDATE', 'messages', 'error', {
        messageId,
        error: error.message
      });
    }
  }

  // Get message by ID
  async getMessageById(messageId) {
    try {
      const query = 'SELECT * FROM messages WHERE message_id = $1';
      const result = await database.query(query, [messageId]);
      return result.rows[0] || null;

    } catch (error) {
      logger.logDatabase('SELECT', 'messages', 'error', {
        messageId,
        error: error.message
      });
      return null;
    }
  }

  // Update message
  async updateMessage(message, instance) {
    try {
      const messageData = this.extractMessageData(message, instance);
      
      const query = `
        UPDATE messages 
        SET content = $2, updated_at = CURRENT_TIMESTAMP 
        WHERE message_id = $1
      `;
      
      await database.query(query, [messageData.messageId, messageData.content]);
      
      logger.logMessageProcessing(messageData.messageId, 'update', 'success');

    } catch (error) {
      logger.logMessageProcessing(message.key?.id, 'update', 'error', {
        error: error.message
      });
    }
  }

  // Delete message
  async deleteMessage(messageId, instance) {
    try {
      const query = 'DELETE FROM messages WHERE message_id = $1';
      await database.query(query, [messageId]);
      
      logger.logMessageProcessing(messageId, 'delete', 'success');

    } catch (error) {
      logger.logMessageProcessing(messageId, 'delete', 'error', {
        error: error.message
      });
    }
  }

  // Store group message for future processing
  async storeGroupMessage(message) {
    // Message is already stored, just add to cache for quick access
    const cacheKey = `group_messages:${message.chat_id}`;
    await redis.lpush(cacheKey, {
      messageId: message.message_id,
      content: message.content,
      senderName: message.sender_name,
      timestamp: message.created_at
    });
    
    // Keep only last 1000 messages in cache
    const listLength = await redis.llen(cacheKey);
    if (listLength > 1000) {
      await redis.ltrim(cacheKey, 0, 999);
    }
  }

  // Handle /historico command
  async handleHistoryCommand(message) {
    logger.info(`Comando /historico recebido de: ${message.chat_id}`);
    
    if (!process.env.ADMIN_CHAT_ID) {
      logger.warn('Comando /historico recebido, mas ADMIN_CHAT_ID não está configurado. Ignorando.');
      return;
    }

    try {
      // Generate the summary
      const summary = await conversationAnalysisService.summarizeConversation(message.chat_id);

      // Format the response for the admin
      const adminResponse = `
*--- Relatório de Histórico ---*

*Solicitado por:* ${message.sender_id}
*Na conversa com:* ${message.chat_id}

*Resumo dos Tópicos:*
${summary}
      `.trim();

      // Send the response to the admin
      await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, adminResponse);
      
      logger.info(`Relatório de histórico para ${message.chat_id} enviado para o administrador.`);

    } catch (error) {
      logger.error(`Falha ao lidar com o comando /historico para ${message.chat_id}`, {
        errorMessage: error.message
      });
      // Notify admin of the failure
      const adminErrorResponse = `Falha ao gerar o histórico para o chat ${message.chat_id}.`;
      await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, adminErrorResponse);
    } finally {
      // Mark message as processed regardless of summary success
      await this.markMessageProcessed(message.message_id);
    }
  }

  // Handle /resumo command for groups
  async handleSummaryCommand(message) {
    logger.info(`Comando /resumo recebido no grupo: ${message.chat_id}`);

    if (!process.env.ADMIN_CHAT_ID) {
      logger.warn('Comando /resumo recebido, mas ADMIN_CHAT_ID não está configurado.');
      return;
    }

    try {
      await summaryService.requestSummary(message.chat_id, process.env.ADMIN_CHAT_ID);

      const notification = `Solicitação de resumo para o grupo ${message.chat_id} foi enfileirada. O resultado será enviado em breve.`;
      await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, notification);
      
      logger.info(`Trabalho de resumo para o grupo ${message.chat_id} foi adicionado à fila.`);

    } catch (error) {
      logger.error(`Falha ao enfileirar resumo para o grupo ${message.chat_id}`, {
        errorMessage: error.message
      });
      const adminErrorMsg = `Falha ao solicitar resumo para o grupo ${message.chat_id}: ${error.message}`;
      await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, adminErrorMsg);
    } finally {
      await this.markMessageProcessed(message.message_id);
    }
  }

  // Handle /base command for contact-specific knowledge
  async handleBaseCommand(message) {
    const chatId = message.chat_id;
    const knowledgeDir = path.join(__dirname, '..', 'conhecimento', 'orientacoes');
    const knowledgeFile = path.join(knowledgeDir, `${chatId}.txt`);

    logger.info(`Comando /base recebido para o chat: ${chatId}`);

    if (!process.env.ADMIN_CHAT_ID) {
      logger.warn('Comando /base recebido, mas ADMIN_CHAT_ID não está configurado.');
      return;
    }

    try {
      // Check if knowledge file already exists
      await fs.access(knowledgeFile);

      // If it exists, retrieve and send to admin
      const content = await fs.readFile(knowledgeFile, 'utf-8');
      const adminResponse = `*Base de conhecimento recuperada para ${chatId}:*\n\n${content}`;
      await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, adminResponse);
      logger.info(`Base de conhecimento para ${chatId} enviada ao administrador.`);

    } catch (error) {
      // If file does not exist (ENOENT), create it
      if (error.code === 'ENOENT') {
        try {
          logger.info(`Nenhuma base de conhecimento encontrada para ${chatId}. Criando uma nova...`);

          const historyQuery = `
            SELECT sender_id, content, created_at FROM messages
            WHERE chat_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'
            ORDER BY created_at ASC
          `;
          const historyResult = await database.query(historyQuery, [chatId]);

          if (historyResult.rows.length === 0) {
            const noHistoryMsg = `Nenhuma mensagem na última hora para criar uma base de conhecimento para ${chatId}.`;
            await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, noHistoryMsg);
            logger.warn(noHistoryMsg);
            return;
          }

          const formattedHistory = historyResult.rows.map(msg =>
            `[${new Date(msg.created_at).toLocaleTimeString('pt-BR')}] ${msg.sender_id.split('@')[0]}: ${msg.content}`
          ).join('\n');

          await fs.mkdir(knowledgeDir, { recursive: true });
          await fs.writeFile(knowledgeFile, formattedHistory);

          const creationMsg = `Nova base de conhecimento criada para ${chatId}. Lembre-se de executar "npm run knowledge:build" para incluí-la nas buscas.`;
          await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, creationMsg);
          logger.info(`Nova base de conhecimento para ${chatId} criada com sucesso.`);

        } catch (creationError) {
          logger.error(`Falha ao criar a base de conhecimento para ${chatId}`, { errorMessage: creationError.message });
          const adminErrorMsg = `Falha ao criar a base de conhecimento para ${chatId}.`;
          await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, adminErrorMsg);
        }
      } else {
        // Other errors during file access
        logger.error(`Erro ao acessar o arquivo de conhecimento para ${chatId}`, { errorMessage: error.message });
        const adminErrorMsg = `Erro ao acessar a base de conhecimento para ${chatId}.`;
        await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, adminErrorMsg);
      }
    } finally {
      await this.markMessageProcessed(message.message_id);
    }
  }

  // Handle knowledge base search commands
  async handleKnowledgeCommand(category, query, message) {
    logger.info(`Comando de conhecimento /${category} recebido de: ${message.chat_id} com a consulta: "${query}"`);

    if (!process.env.ADMIN_CHAT_ID) {
      logger.warn(`Comando /${category} recebido, mas ADMIN_CHAT_ID não está configurado. Ignorando.`);
      return;
    }

    if (!query) {
      const notification = `Comando /${category} recebido de ${message.chat_id} sem texto para busca.`;
      await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, notification);
      return;
    }

    try {
      const results = await knowledgeSearchService.search(query, category);

      let adminResponse;
      if (results.length > 0) {
        const resultsText = results.map((r, i) => 
          `*Resultado ${i + 1} (Similaridade: ${r.similarity.toFixed(2)})*\nFonte: ${r.source}\n---\n${r.content}\n---`
        ).join('\n\n');

        adminResponse = `
*--- Busca na Base de Conhecimento ---*

*Comando:* /${category}
*Consulta:* "${query}"
*Solicitado por:* ${message.sender_id}

*Resultados Encontrados:*
${resultsText}
        `.trim();
      } else {
        adminResponse = `
*--- Busca na Base de Conhecimento ---*

*Comando:* /${category}
*Consulta:* "${query}"
*Solicitado por:* ${message.sender_id}

Nenhum resultado relevante encontrado na base de conhecimento.
        `.trim();
      }

      await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, adminResponse);
      logger.info(`Resultados da busca para "${query}" enviados ao administrador.`);

    } catch (error) {
      logger.error(`Falha ao lidar com o comando de conhecimento /${category}`, {
        errorMessage: error.message
      });
      const adminErrorResponse = `Falha ao processar a busca por "${query}" na categoria ${category}.`;
      await whatsappService.sendMessage(process.env.ADMIN_CHAT_ID, adminErrorResponse);
    } finally {
      await this.markMessageProcessed(message.message_id);
    }
  }

  // Activate support mode for a chat
  async activateSupportMode(chatId, category) {
    this.activeSupportChats.set(chatId, category);

    let response;
    if (category === 'curso') {
      response = "✅ *Modo de Apoio ao Aluno ativado. Faça suas perguntas sobre o curso. Para sair, digite 'obrigado'.*";
    } else {
      response = `✅ *Modo de Apoio (${category}) ativado.*\n\nFaça suas perguntas. Para sair, digite 'obrigado'.`;
    }
    
    await whatsappService.sendMessage(chatId, response);
    logger.info(`Modo de suporte ativado para ${chatId} com a categoria ${category}.`);
  }

  // Deactivate support mode for a chat
  async deactivateSupportMode(chatId) {
    this.activeSupportChats.delete(chatId);
    const response = "👍 *Modo de Apoio finalizado.* Até a próxima!";
    await whatsappService.sendMessage(chatId, response);
    logger.info(`Modo de suporte desativado para ${chatId}.`);
  }

  // Handle a query while in support mode
  async handleSupportQuery(message, category) {
    try {
      const query = message.content;
      logger.info(`Consulta de suporte recebida de ${message.chat_id}: "${query}"`);
      
      const searchResults = await knowledgeSearchService.search(query, category);

      if (searchResults.length === 0) {
        await whatsappService.sendMessage(message.chat_id, "Desculpe, não encontrei uma resposta para sua pergunta na base de conhecimento.");
        return;
      }
      
      const context = searchResults.map(r => r.content).join('\n\n---\n\n');
      
      const prompt = `
        Você é um tutor. Use as informações de contexto abaixo para responder à pergunta do aluno de forma clara e objetiva. Se o contexto não for suficiente, informe que não encontrou a resposta.
        
        **Contexto:**
        ---
        ${context}
        ---
        
        **Pergunta do Aluno:**
        ${query}
        
        **Sua Resposta:**
      `;

      const response = await aiService.generateTextResponse(prompt);
      await whatsappService.sendMessage(message.chat_id, response);

    } catch (error) {
      logger.error(`Erro ao processar a consulta de suporte para ${message.chat_id}`, { error: error.message });
      await whatsappService.sendMessage(message.chat_id, "Ocorreu um erro ao processar sua pergunta. Tente novamente.");
    } finally {
      await this.markMessageProcessed(message.message_id);
    }
  }
}

module.exports = new MessageService();