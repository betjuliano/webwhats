const database = require('../config/database');
const aiService = require('./aiService');
const logger = require('../utils/logger');

const MESSAGE_HISTORY_LIMIT = 200;

/**
 * Gera um resumo dos principais tópicos de uma conversa.
 * @param {string} chatId O ID do chat a ser analisado.
 * @returns {Promise<string>} O texto do resumo gerado.
 */
async function summarizeConversation(chatId) {
  try {
    logger.info(`Iniciando resumo de conversa para o chatId: ${chatId}`);

    // 1. Buscar o histórico de mensagens
    const historyQuery = `
      SELECT sender, content, created_at
      FROM messages
      WHERE chat_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const historyResult = await database.query(historyQuery, [chatId, MESSAGE_HISTORY_LIMIT]);

    if (historyResult.rows.length < 5) {
      logger.warn(`Não há mensagens suficientes para resumir o chat: ${chatId}`);
      return 'Não há histórico de mensagens suficiente para gerar um resumo.';
    }

    // Formata as mensagens para a IA
    const formattedHistory = historyResult.rows.reverse().map(msg => {
      const senderName = msg.sender.split('@')[0]; // Apenas o número
      return `${senderName}: ${msg.content}`;
    }).join('\n');

    // 2. Chamar o serviço de IA para gerar o resumo
    const prompt = `
      Com base no seguinte histórico de conversa de WhatsApp, identifique os 5 principais tópicos distintos discutidos.
      Para cada tópico, forneça um resumo conciso de uma frase.
      Se houver menos de 5 tópicos, liste quantos encontrar.

      Histórico:
      ---
      ${formattedHistory}
      ---

      Resumo dos Tópicos:
    `;

    const summary = await aiService.generateTextResponse(prompt, { chatId });
    
    logger.info(`Resumo da conversa gerado com sucesso para o chatId: ${chatId}`);

    return summary;

  } catch (error) {
    logger.error('Falha ao gerar resumo da conversa', {
      chatId,
      errorMessage: error.message,
      stack: error.stack
    });
    // Retorna uma mensagem de erro amigável que pode ser enviada ao admin
    return 'Ocorreu um erro ao tentar processar o histórico da conversa.';
  }
}

module.exports = {
  summarizeConversation,
}; 