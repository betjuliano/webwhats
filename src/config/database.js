const { Pool } = require('pg');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.pool = null;
  }

  async initialize() {
    try {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      logger.info('Database connection established successfully');
      
      // Run migrations
      await this.runMigrations();
      
    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  async runMigrations() {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create tables if they don't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          message_id VARCHAR(255) UNIQUE NOT NULL,
          chat_id VARCHAR(255) NOT NULL,
          sender_id VARCHAR(255) NOT NULL,
          sender_name VARCHAR(255),
          message_type VARCHAR(50) NOT NULL,
          content TEXT,
          media_url VARCHAR(500),
          media_type VARCHAR(50),
          is_group BOOLEAN DEFAULT FALSE,
          processed BOOLEAN DEFAULT FALSE,
          processed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS processed_media (
          id SERIAL PRIMARY KEY,
          message_id VARCHAR(255) REFERENCES messages(message_id),
          original_url VARCHAR(500),
          media_type VARCHAR(50) NOT NULL,
          transcription TEXT,
          description TEXT,
          summary TEXT,
          processing_status VARCHAR(50) DEFAULT 'pending',
          processing_error TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS group_summaries (
          id SERIAL PRIMARY KEY,
          chat_id VARCHAR(255) NOT NULL,
          summary_period VARCHAR(20) NOT NULL,
          summary_text TEXT NOT NULL,
          message_count INTEGER DEFAULT 0,
          start_date TIMESTAMP NOT NULL,
          end_date TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(chat_id, summary_period, start_date)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS chat_participants (
          id SERIAL PRIMARY KEY,
          chat_id VARCHAR(255) NOT NULL,
          participant_id VARCHAR(255) NOT NULL,
          participant_name VARCHAR(255),
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_admin BOOLEAN DEFAULT FALSE,
          UNIQUE(chat_id, participant_id)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS processing_queue (
          id SERIAL PRIMARY KEY,
          message_id VARCHAR(255) NOT NULL,
          queue_type VARCHAR(50) NOT NULL,
          priority INTEGER DEFAULT 0,
          attempts INTEGER DEFAULT 0,
          max_attempts INTEGER DEFAULT 3,
          status VARCHAR(50) DEFAULT 'pending',
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_is_group ON messages(is_group);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_processed_media_message_id ON processed_media(message_id);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_group_summaries_chat_id ON group_summaries(chat_id);
      `);

      await client.query('COMMIT');
      logger.info('Database migrations completed successfully');
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Database migration failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      logger.error('Database query error:', { text, error: error.message });
      throw error;
    }
  }

  async getClient() {
    return await this.pool.connect();
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info('Database connection pool closed');
    }
  }
}

module.exports = new Database();