// This script is intended to be run manually from the command line
// to generate embeddings for the knowledge base.
// Usage: node scripts/generate-embeddings.js

require('dotenv').config(); // Load environment variables from .env file

const fs = require('fs/promises');
const path = require('path');
const aiService = require('../src/services/aiService');
const logger = require('../src/utils/logger');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const KNOWLEDGE_BASE_DIR = path.join(__dirname, '..', 'conhecimento');
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'data', 'knowledge-base');
const CHUNK_SIZE = 500; // Size of text chunks in characters
const CHUNK_OVERLAP = 50; // Overlap between chunks

async function* getFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* getFiles(res);
    } else if (res.endsWith('.txt') || res.endsWith('.md') || res.endsWith('.pdf') || res.endsWith('.docx')) {
      yield res;
    }
  }
}

async function extractTextFromFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  
  if (extension === '.pdf') {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  }
  
  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  
  // Default to plain text for .txt and .md
  return fs.readFile(filePath, 'utf-8');
}

function chunkText(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    chunks.push(text.substring(i, i + CHUNK_SIZE));
  }
  return chunks;
}

async function processFile(filePath) {
  logger.info(`  Processing new file: ${path.basename(filePath)}`);

  const content = await extractTextFromFile(filePath);
  const chunks = chunkText(content);
  const vectors = [];
  let chunkIndex = 0;

  for (const chunk of chunks) {
    try {
      const embedding = await aiService.generateEmbedding(chunk);
      vectors.push({
        source: path.basename(filePath),
        content: chunk,
        embedding
      });
      chunkIndex++;
      logger.info(`  - Generated embedding for chunk ${chunkIndex}/${chunks.length}`);
    } catch (error) {
      logger.error(`Failed to generate embedding for a chunk in ${filePath}`, { error: error.message });
    }
  }
  return vectors;
}

async function main() {
  logger.info('Starting knowledge base embedding generation (incremental)...');
  if (!process.env.OPENAI_API_KEY) {
    logger.error('OPENAI_API_KEY is not set. Please create a .env file with your key.');
    return;
  }
  
  try {
    // Ensure the output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const categories = await fs.readdir(KNOWLEDGE_BASE_DIR, { withFileTypes: true });

    for (const category of categories) {
      if (category.isDirectory()) {
        const categoryName = category.name;
        const categoryPath = path.join(KNOWLEDGE_BASE_DIR, categoryName);
        const processedPath = path.join(categoryPath, 'prontos');
        const outputFile = path.join(OUTPUT_DIR, `${categoryName}.json`);

        logger.info(`\nProcessing category: ${categoryName}`);
        await fs.mkdir(processedPath, { recursive: true });

        // 1. Load existing data and sync deletions
        let existingVectors = [];
        try {
          const data = await fs.readFile(outputFile, 'utf-8');
          existingVectors = JSON.parse(data);
        } catch (e) {
          logger.warn(`No existing knowledge base file for "${categoryName}". Creating a new one.`);
        }

        const processedFiles = new Set((await fs.readdir(processedPath)).map(f => path.basename(f)));
        const syncedVectors = existingVectors.filter(vector => processedFiles.has(vector.source));
        
        if (syncedVectors.length < existingVectors.length) {
          logger.info(`  - Synced deletions. Removed ${existingVectors.length - syncedVectors.length} vectors.`);
        }

        // 2. Process new files from the staging area (category root)
        const newFiles = (await fs.readdir(categoryPath, { withFileTypes: true }))
          .filter(dirent => dirent.isFile())
          .map(dirent => dirent.name);

        let newVectors = [];
        for (const fileName of newFiles) {
          const filePath = path.join(categoryPath, fileName);
          const fileVectors = await processFile(filePath);
          newVectors.push(...fileVectors);
          // Move file to processed directory after successful processing
          await fs.rename(filePath, path.join(processedPath, fileName));
          logger.info(`  - Moved ${fileName} to "prontos" directory.`);
        }

        // 3. Combine and save the final knowledge base
        const finalVectors = [...syncedVectors, ...newVectors];

        if (finalVectors.length > 0) {
          await fs.writeFile(outputFile, JSON.stringify(finalVectors, null, 2));
          logger.info(`Successfully processed ${newFiles.length} new file(s) for category "${categoryName}".`);
          logger.info(`Knowledge base for "${categoryName}" is up to date with ${finalVectors.length} vectors.`);
        } else {
          logger.warn(`No vectors to save for category "${categoryName}". If you expected data, check for files in the staging directory.`);
           // If no vectors exist at all, we can remove the JSON file to keep things clean
          try {
            await fs.unlink(outputFile);
          } catch (e) { /* ignore if file doesn't exist */ }
        }
      }
    }

  } catch (error) {
    if (error.code === 'ENOENT' && error.path.includes('conhecimento')) {
      logger.warn('The "conhecimento" directory does not exist. Skipping embedding generation.');
    } else {
      logger.error('An error occurred during embedding generation:', error);
    }
  }
}

main(); 