const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const logger = require('../utils/logger');
const { aiServiceErrorHandler } = require('../middleware/errorHandler');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.blipApiUrl = process.env.BLIP_API_URL;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  // Generate text response using OpenAI
  async generateTextResponse(text, context = {}) {
    try {
      logger.logAIService('OpenAI', 'text_generation', 'started', {
        textLength: text.length,
        chatId: context.chatId
      });

      const systemPrompt = this.buildSystemPrompt(context);
      
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 2000,
        temperature: 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const generatedText = response.choices[0]?.message?.content;
      
      if (!generatedText) {
        throw new Error('No response generated from OpenAI');
      }

      logger.logAIService('OpenAI', 'text_generation', 'success', {
        inputLength: text.length,
        outputLength: generatedText.length,
        tokensUsed: response.usage?.total_tokens
      });

      return generatedText;

    } catch (error) {
      logger.logAIService('OpenAI', 'text_generation', 'error', {
        error: error.message,
        textLength: text.length
      });
      
      throw aiServiceErrorHandler('OpenAI', 'text_generation', error);
    }
  }

  // Transcribe audio using Whisper
  async transcribeAudio(audioUrl, messageId) {
    try {
      logger.logAIService('Whisper', 'transcription', 'started', {
        audioUrl,
        messageId
      });

      // Download audio file
      const audioPath = await this.downloadMedia(audioUrl, messageId, 'audio');
      
      // Convert to supported format if needed
      const convertedPath = await this.convertAudioForWhisper(audioPath);
      
      // Transcribe using Whisper
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(convertedPath),
        model: process.env.WHISPER_MODEL || 'whisper-1',
        language: process.env.WHISPER_LANGUAGE || 'pt',
        response_format: 'text'
      });

      // Clean up temporary files
      await this.cleanupTempFiles([audioPath, convertedPath]);

      logger.logAIService('Whisper', 'transcription', 'success', {
        messageId,
        transcriptionLength: transcription.length
      });

      return transcription;

    } catch (error) {
      logger.logAIService('Whisper', 'transcription', 'error', {
        messageId,
        error: error.message
      });
      
      throw aiServiceErrorHandler('Whisper', 'transcription', error);
    }
  }

  // Describe image using BLIP
  async describeImage(imageUrl, messageId) {
    try {
      logger.logAIService('BLIP', 'image_description', 'started', {
        imageUrl,
        messageId
      });

      // Download and process image
      const imagePath = await this.downloadMedia(imageUrl, messageId, 'image');
      const processedImagePath = await this.processImageForBLIP(imagePath);

      // Send to BLIP service
      const description = await this.callBLIPService(processedImagePath);

      // Clean up temporary files
      await this.cleanupTempFiles([imagePath, processedImagePath]);

      logger.logAIService('BLIP', 'image_description', 'success', {
        messageId,
        descriptionLength: description.length
      });

      return description;

    } catch (error) {
      logger.logAIService('BLIP', 'image_description', 'error', {
        messageId,
        error: error.message
      });
      
      // Fallback to OpenAI Vision if BLIP fails
      try {
        return await this.describeImageWithOpenAI(imageUrl, messageId);
      } catch (fallbackError) {
        throw aiServiceErrorHandler('BLIP', 'image_description', error);
      }
    }
  }

  // Describe image using OpenAI Vision (fallback)
  async describeImageWithOpenAI(imageUrl, messageId) {
    try {
      logger.logAIService('OpenAI Vision', 'image_description', 'started', {
        imageUrl,
        messageId
      });

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Descreva esta imagem de forma detalhada e útil em português.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 500
      });

      const description = response.choices[0]?.message?.content;

      logger.logAIService('OpenAI Vision', 'image_description', 'success', {
        messageId,
        descriptionLength: description.length
      });

      return description;

    } catch (error) {
      throw aiServiceErrorHandler('OpenAI Vision', 'image_description', error);
    }
  }

  // Summarize document
  async summarizeDocument(documentUrl, messageId, caption = '') {
    try {
      logger.logAIService('OpenAI', 'document_summary', 'started', {
        documentUrl,
        messageId
      });

      // Download document
      const documentPath = await this.downloadMedia(documentUrl, messageId, 'document');
      
      // Extract text from document
      const extractedText = await this.extractTextFromDocument(documentPath);
      
      if (!extractedText || extractedText.length < 50) {
        throw new Error('Could not extract sufficient text from document');
      }

      // Generate summary
      const prompt = `Resuma o seguinte documento de forma clara e concisa em português:\n\n${extractedText}`;
      if (caption) {
        prompt += `\n\nContexto adicional: ${caption}`;
      }

      const summary = await this.generateTextResponse(prompt);

      // Clean up temporary files
      await this.cleanupTempFiles([documentPath]);

      logger.logAIService('OpenAI', 'document_summary', 'success', {
        messageId,
        originalLength: extractedText.length,
        summaryLength: summary.length
      });

      return summary;

    } catch (error) {
      logger.logAIService('OpenAI', 'document_summary', 'error', {
        messageId,
        error: error.message
      });
      
      throw aiServiceErrorHandler('OpenAI', 'document_summary', error);
    }
  }

  // Generate group summary
  async generateGroupSummary(messages, period) {
    try {
      logger.logAIService('OpenAI', 'group_summary', 'started', {
        messageCount: messages.length,
        period
      });

      // Prepare messages for summarization
      const messageText = this.prepareMessagesForSummary(messages);
      
      const prompt = `
        Crie um resumo das conversas do grupo WhatsApp dos últimos ${this.getPeriodText(period)}.
        
        Instruções:
        - Resuma os principais tópicos discutidos
        - Identifique decisões importantes tomadas
        - Mencione eventos ou informações relevantes
        - Use uma linguagem clara e organizada
        - Limite o resumo a no máximo 500 palavras
        
        Conversas:
        ${messageText}
      `;

      const summary = await this.generateTextResponse(prompt);

      logger.logAIService('OpenAI', 'group_summary', 'success', {
        messageCount: messages.length,
        period,
        summaryLength: summary.length
      });

      return summary;

    } catch (error) {
      logger.logAIService('OpenAI', 'group_summary', 'error', {
        messageCount: messages.length,
        period,
        error: error.message
      });
      
      throw aiServiceErrorHandler('OpenAI', 'group_summary', error);
    }
  }

  // Generate embeddings for a given text
  async generateEmbedding(text) {
    try {
      logger.logAIService('OpenAI', 'embedding', 'started', {
        textLength: text.length
      });

      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        encoding_format: "float",
      });

      const embedding = response.data[0]?.embedding;

      if (!embedding) {
        throw new Error('No embedding generated from OpenAI');
      }

      logger.logAIService('OpenAI', 'embedding', 'success', {
        textLength: text.length,
        embeddingDim: embedding.length,
      });

      return embedding;

    } catch (error) {
      logger.logAIService('OpenAI', 'embedding', 'error', {
        textLength: text.length,
        error: error.message
      });

      throw aiServiceErrorHandler('OpenAI', 'embedding', error);
    }
  }

  // Build system prompt based on context
  buildSystemPrompt(context) {
    return `
      Você é um assistente inteligente para WhatsApp que ajuda usuários de forma útil e amigável.
      
      Diretrizes:
      - Responda sempre em português brasileiro
      - Seja conciso mas informativo
      - Use um tom amigável e profissional
      - Se não souber algo, admita e sugira alternativas
      - Para perguntas técnicas, forneça explicações claras
      - Evite respostas muito longas (máximo 300 palavras)
      
      Contexto da conversa:
      - Chat ID: ${context.chatId || 'N/A'}
      - Usuário: ${context.senderId || 'N/A'}
    `;
  }

  // Download media file
  async downloadMedia(url, messageId, type) {
    try {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000
      });

      const extension = this.getFileExtension(response.headers['content-type'], type);
      const filename = `${messageId}_${Date.now()}.${extension}`;
      const filepath = path.join(process.env.TEMP_PATH || './temp', filename);

      // Ensure temp directory exists
      const tempDir = path.dirname(filepath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const writer = fs.createWriteStream(filepath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filepath));
        writer.on('error', reject);
      });

    } catch (error) {
      logger.error('Failed to download media:', {
        url,
        messageId,
        error: error.message
      });
      throw error;
    }
  }

  // Convert audio for Whisper compatibility
  async convertAudioForWhisper(inputPath) {
    return new Promise((resolve, reject) => {
      const outputPath = inputPath.replace(/\.[^/.]+$/, '_converted.mp3');
      
      ffmpeg(inputPath)
        .toFormat('mp3')
        .audioCodec('libmp3lame')
        .audioBitrate(128)
        .audioChannels(1)
        .audioFrequency(16000)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  // Process image for BLIP
  async processImageForBLIP(inputPath) {
    try {
      const outputPath = inputPath.replace(/\.[^/.]+$/, '_processed.jpg');
      
      await sharp(inputPath)
        .resize(512, 512, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ quality: 85 })
        .toFile(outputPath);

      return outputPath;

    } catch (error) {
      logger.error('Failed to process image for BLIP:', error);
      throw error;
    }
  }

  // Call BLIP service
  async callBLIPService(imagePath) {
    try {
      const formData = new FormData();
      formData.append('image', fs.createReadStream(imagePath));

      const response = await axios.post(`${this.blipApiUrl}/describe`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 30000
      });

      return response.data.description || 'Não foi possível descrever a imagem.';

    } catch (error) {
      logger.error('BLIP service call failed:', error);
      throw error;
    }
  }

  // Extract text from document
  async extractTextFromDocument(documentPath) {
    // This is a simplified implementation
    // In production, you'd want to use libraries like pdf-parse, mammoth, etc.
    try {
      const extension = path.extname(documentPath).toLowerCase();
      
      if (extension === '.txt') {
        return fs.readFileSync(documentPath, 'utf8');
      }
      
      // For other document types, you'd implement specific extractors
      throw new Error(`Unsupported document type: ${extension}`);

    } catch (error) {
      logger.error('Failed to extract text from document:', error);
      throw error;
    }
  }

  // Prepare messages for summary
  prepareMessagesForSummary(messages) {
    return messages
      .filter(msg => msg.content && msg.content.trim().length > 0)
      .map(msg => {
        const timestamp = new Date(msg.created_at).toLocaleString('pt-BR');
        return `[${timestamp}] ${msg.sender_name}: ${msg.content}`;
      })
      .join('\n');
  }

  // Get period text in Portuguese
  getPeriodText(period) {
    switch (period) {
      case '24h':
        return '24 horas';
      case '48h':
        return '48 horas';
      case '1week':
        return '1 semana';
      default:
        return '24 horas';
    }
  }

  // Get file extension based on content type
  getFileExtension(contentType, type) {
    const mimeMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/mp4': 'm4a',
      'video/mp4': 'mp4',
      'video/mpeg': 'mpeg',
      'video/quicktime': 'mov',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'text/plain': 'txt'
    };

    return mimeMap[contentType] || type || 'bin';
  }

  // Clean up temporary files
  async cleanupTempFiles(filePaths) {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        logger.warn('Failed to cleanup temp file:', {
          filePath,
          error: error.message
        });
      }
    }
  }

  // Retry mechanism for API calls
  async retryOperation(operation, maxRetries = this.maxRetries) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        logger.warn(`Operation failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}

module.exports = new AIService();