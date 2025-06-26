const database = require('../config/database');
const queueService = require('./queueService');
const logger = require('../utils/logger');

const MIN_MESSAGES_FOR_SUMMARY = 5;
const DEFAULT_SUMMARY_PERIOD = '24h';

async function requestSummary(chatId, requesterId) {
  try {
    // 1. Verificar se o chat é um grupo
    const chatQuery = 'SELECT is_group FROM messages WHERE chat_id = $1 LIMIT 1';
    const chatResult = await database.query(chatQuery, [chatId]);

    if (chatResult.rows.length === 0) {
      const error = new Error('Chat não encontrado');
      error.statusCode = 404;
      throw error;
    }

    if (!chatResult.rows[0].is_group) {
      const error = new Error('Resumos só podem ser gerados para grupos');
      error.statusCode = 400;
      throw error;
    }

    // 2. Verificar se há mensagens suficientes no período padrão
    const hours = 24; // Corresponde a '24h'
    const messageCountQuery = `
      SELECT COUNT(*) as count FROM messages 
      WHERE chat_id = $1 
      AND is_group = true 
      AND created_at >= NOW() - INTERVAL '${hours} hours'
    `;

    const messageCountResult = await database.query(messageCountQuery, [chatId]);
    const messageCount = parseInt(messageCountResult.rows[0].count);

    if (messageCount < MIN_MESSAGES_FOR_SUMMARY) {
      const error = new Error(`Não há mensagens suficientes para gerar um resumo (mínimo de ${MIN_MESSAGES_FOR_SUMMARY} obrigatório)`);
      error.statusCode = 400;
      throw error;
    }

    // 3. Adicionar o trabalho de geração de resumo à fila
    const jobData = {
      chatId,
      period: DEFAULT_SUMMARY_PERIOD,
      requesterId,
      force: true // Força a geração, pois é um pedido sob demanda
    };
    
    const job = await queueService.addSummaryJob(jobData);

    logger.info('Trabalho de resumo sob demanda adicionado à fila', { jobId: job.id, chatId, requesterId });

    return {
      jobId: job.id,
      chatId,
      period: DEFAULT_SUMMARY_PERIOD,
      messageCount,
      estimatedTime: Math.ceil(messageCount / 10) // Estimativa simples
    };

  } catch (error) {
    logger.error('Falha ao solicitar resumo sob demanda', {
      chatId,
      requesterId,
      errorMessage: error.message,
      stack: error.stack
    });
    // Re-throw a excecão para que o controller possa tratá-la adequadamente
    throw error;
  }
}

module.exports = {
  requestSummary
}; 