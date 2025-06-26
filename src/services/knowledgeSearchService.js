const fs = require('fs/promises');
const path = require('path');
const aiService = require('./aiService');
const logger = require('../utils/logger');

const KNOWLEDGE_BASE_DIR = path.join(__dirname, '..', 'data', 'knowledge-base');
const TOP_K = 3; // Number of top results to return

const loadedBases = new Map(); // Cache for loaded knowledge bases

async function getKnowledgeBase(category) {
  // Return from cache if available
  if (loadedBases.has(category)) {
    return loadedBases.get(category);
  }

  // Otherwise, load from file
  try {
    const filePath = path.join(KNOWLEDGE_BASE_DIR, `${category}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    const knowledgeBase = JSON.parse(data);
    
    loadedBases.set(category, knowledgeBase); // Store in cache
    logger.info(`Base de conhecimento para a categoria "${category}" carregada. Total de vetores: ${knowledgeBase.length}`);
    return knowledgeBase;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn(`Arquivo de conhecimento para a categoria "${category}" não encontrado.`);
    } else {
      logger.error(`Falha ao carregar a base de conhecimento para "${category}".`, { error: error.message });
    }
    loadedBases.set(category, []); // Cache empty result to prevent re-reading a missing file
    return [];
  }
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Busca na base de conhecimento por textos similares a uma consulta.
 * @param {string} query A pergunta do usuário.
 * @param {string} category A categoria para filtrar a busca (ex: 'curso', 'projetos').
 * @returns {Promise<Array<object>>} Uma lista dos resultados mais relevantes.
 */
async function search(query, category) {
  const knowledgeBase = await getKnowledgeBase(category);

  if (knowledgeBase.length === 0) {
    logger.warn(`Tentativa de busca na categoria "${category}", que está vazia ou não foi carregada.`);
    return [];
  }

  try {
    // 1. Gerar embedding para a consulta do usuário
    const queryEmbedding = await aiService.generateEmbedding(query);

    // 2. Calcular a similaridade de cosseno
    const similarities = knowledgeBase.map(vector => ({
      ...vector,
      similarity: cosineSimilarity(queryEmbedding, vector.embedding)
    }));

    // 3. Ordenar por similaridade e retornar os melhores resultados
    const topResults = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, TOP_K);
    
    logger.info(`Busca por "${query}" na categoria "${category}" retornou ${topResults.length} resultados.`);
    return topResults;

  } catch (error) {
    logger.error('Ocorreu um erro durante a busca na base de conhecimento.', {
      query,
      category,
      error: error.message
    });
    return [];
  }
}

// No longer loading everything on startup
// loadKnowledgeBase();

module.exports = {
  search,
  // No longer need to export loadKnowledgeBase for manual reload
}; 