-- WebWhats Database Initialization Script
-- This script sets up the initial database structure and configurations

-- Create database if it doesn't exist (handled by Docker environment)
-- CREATE DATABASE webwhats;

-- Connect to the webwhats database
\c webwhats;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Create custom functions for better text search
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text AS
$func$
SELECT unaccent('unaccent', $1)
$func$ LANGUAGE sql IMMUTABLE;

-- Create messages table
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
    instance_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create processed_media table
CREATE TABLE IF NOT EXISTS processed_media (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(255) UNIQUE NOT NULL,
    original_url VARCHAR(500),
    media_type VARCHAR(50) NOT NULL,
    transcription TEXT,
    description TEXT,
    summary TEXT,
    processing_status VARCHAR(50) DEFAULT 'pending',
    processing_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE
);

-- Create group_summaries table
CREATE TABLE IF NOT EXISTS group_summaries (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    summary_period VARCHAR(20) NOT NULL,
    summary_text TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, summary_period, start_date)
);

-- Create chat_participants table
CREATE TABLE IF NOT EXISTS chat_participants (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    participant_id VARCHAR(255) NOT NULL,
    participant_name VARCHAR(255),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_admin BOOLEAN DEFAULT FALSE,
    left_at TIMESTAMP,
    UNIQUE(chat_id, participant_id)
);

-- Create processing_queue table
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
);

-- Create system_logs table for application logs
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    meta JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create webhook_events table for tracking webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_is_group ON messages(is_group);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_message_type ON messages(message_type);
CREATE INDEX IF NOT EXISTS idx_messages_processed ON messages(processed);

CREATE INDEX IF NOT EXISTS idx_processed_media_message_id ON processed_media(message_id);
CREATE INDEX IF NOT EXISTS idx_processed_media_status ON processed_media(processing_status);
CREATE INDEX IF NOT EXISTS idx_processed_media_type ON processed_media(media_type);

CREATE INDEX IF NOT EXISTS idx_group_summaries_chat_id ON group_summaries(chat_id);
CREATE INDEX IF NOT EXISTS idx_group_summaries_period ON group_summaries(summary_period);
CREATE INDEX IF NOT EXISTS idx_group_summaries_created_at ON group_summaries(created_at);

CREATE INDEX IF NOT EXISTS idx_chat_participants_chat_id ON chat_participants(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_participant_id ON chat_participants(participant_id);

CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_processing_queue_created_at ON processing_queue(created_at);

CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events(source);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);

-- Create full-text search indexes
CREATE INDEX IF NOT EXISTS idx_messages_content_fts ON messages USING gin(to_tsvector('portuguese', COALESCE(content, '')));
CREATE INDEX IF NOT EXISTS idx_processed_media_transcription_fts ON processed_media USING gin(to_tsvector('portuguese', COALESCE(transcription, '')));
CREATE INDEX IF NOT EXISTS idx_processed_media_description_fts ON processed_media USING gin(to_tsvector('portuguese', COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_group_summaries_text_fts ON group_summaries USING gin(to_tsvector('portuguese', summary_text));

-- Create trigram indexes for fuzzy search
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm ON messages USING gin(content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_processed_media_transcription_trgm ON processed_media USING gin(transcription gin_trgm_ops);

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_group_created ON messages(is_group, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_summaries_chat_period ON group_summaries(chat_id, summary_period, created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processed_media_updated_at BEFORE UPDATE ON processed_media
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_summaries_updated_at BEFORE UPDATE ON group_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processing_queue_updated_at BEFORE UPDATE ON processing_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function for cleaning old data
CREATE OR REPLACE FUNCTION clean_old_data()
RETURNS void AS $$
BEGIN
    -- Clean old processed messages (older than 90 days)
    DELETE FROM messages 
    WHERE created_at < NOW() - INTERVAL '90 days' 
    AND processed = true;
    
    -- Clean old processed media (older than 30 days)
    DELETE FROM processed_media 
    WHERE created_at < NOW() - INTERVAL '30 days' 
    AND processing_status = 'completed';
    
    -- Clean old summaries (older than 60 days)
    DELETE FROM group_summaries 
    WHERE created_at < NOW() - INTERVAL '60 days';
    
    -- Clean old system logs (older than 30 days)
    DELETE FROM system_logs 
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    -- Clean old webhook events (older than 7 days)
    DELETE FROM webhook_events 
    WHERE created_at < NOW() - INTERVAL '7 days' 
    AND processed = true;
    
    -- Clean old processing queue entries (older than 7 days)
    DELETE FROM processing_queue 
    WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Create views for common queries
CREATE OR REPLACE VIEW v_recent_messages AS
SELECT 
    m.*,
    pm.transcription,
    pm.description,
    pm.summary,
    pm.processing_status
FROM messages m
LEFT JOIN processed_media pm ON m.message_id = pm.message_id
WHERE m.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY m.created_at DESC;

CREATE OR REPLACE VIEW v_group_activity AS
SELECT 
    chat_id,
    COUNT(*) as message_count,
    COUNT(DISTINCT sender_id) as unique_senders,
    MAX(created_at) as last_activity,
    MIN(created_at) as first_activity
FROM messages 
WHERE is_group = true 
AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY chat_id
ORDER BY message_count DESC;

CREATE OR REPLACE VIEW v_processing_stats AS
SELECT 
    media_type,
    processing_status,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_time
FROM processed_media 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY media_type, processing_status;

-- Insert initial configuration data
INSERT INTO system_logs (level, message, meta) VALUES 
('info', 'Database initialized successfully', '{"component": "database", "action": "init"}')
ON CONFLICT DO NOTHING;

-- Grant permissions (if needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO webwhats;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO webwhats;

-- Create database user for application (if not exists)
-- This is typically handled by Docker environment variables
-- CREATE USER webwhats WITH PASSWORD 'your_password';
-- GRANT ALL PRIVILEGES ON DATABASE webwhats TO webwhats;

COMMIT;