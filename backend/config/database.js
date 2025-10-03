const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Load environment variables first
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const logger = require('./logger');

// Parse DATABASE_URL if provided (DigitalOcean format)
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    process.env.DB_HOST = url.hostname;
    process.env.DB_PORT = url.port || 5432;
    process.env.DB_NAME = url.pathname.slice(1);
    process.env.DB_USER = url.username;
    process.env.DB_PASSWORD = decodeURIComponent(url.password);
    logger.info('Successfully parsed DATABASE_URL for connection parameters');
  } catch (error) {
    logger.error('Failed to parse DATABASE_URL:', error);
  }
}

// SSL configuration - Use rejectUnauthorized: false for DigitalOcean
let sslConfig = false;
if (process.env.DB_HOST?.includes('ondigitalocean.com')) {
  // DigitalOcean requires SSL but we can disable certificate verification
  sslConfig = { rejectUnauthorized: false };
  logger.info('Using SSL with disabled certificate verification for DigitalOcean');
} else {
  logger.info('SSL disabled for local development');
}

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: sslConfig,
  max: 25, // Increased pool size for performance
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
};

logger.info(`Connecting to database: ${dbConfig.database} on port: ${dbConfig.port}`);

// Create connection pool
const pool = new Pool(dbConfig);

// Log SSL certificate info
if (sslConfig && sslConfig.ca) {
  logger.info('SSL certificate loaded for DigitalOcean database connection');
}

// Monitor pool events
pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
  logger.debug('New client connected to database');
});

// Database initialization
async function initDatabase() {
  try {
    logger.info('Initializing database tables...');
    
    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        site_url VARCHAR(512) NOT NULL,
        site_name VARCHAR(255) NOT NULL,
        api_key VARCHAR(255),
        max_links INTEGER DEFAULT 10,
        used_links INTEGER DEFAULT 0,
        max_articles INTEGER DEFAULT 30,
        used_articles INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_links (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        url VARCHAR(512) NOT NULL,
        anchor_text VARCHAR(255) NOT NULL,
        position INTEGER DEFAULT 0,
        html_context TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_articles (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        content TEXT NOT NULL,
        excerpt TEXT,
        meta_title VARCHAR(255),
        meta_description TEXT,
        featured_image VARCHAR(512),
        slug VARCHAR(255),
        status VARCHAR(50) DEFAULT 'published',
        tags TEXT,
        category VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS placements (
        id SERIAL PRIMARY KEY,
        site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS placement_content (
        id SERIAL PRIMARY KEY,
        placement_id INTEGER REFERENCES placements(id) ON DELETE CASCADE,
        link_id INTEGER REFERENCES project_links(id) ON DELETE CASCADE,
        article_id INTEGER REFERENCES project_articles(id) ON DELETE CASCADE,
        UNIQUE(placement_id, link_id),
        UNIQUE(placement_id, article_id)
      )
    `);

    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)'); // Performance fix for login
    await pool.query('CREATE INDEX IF NOT EXISTS idx_project_links_project_id ON project_links(project_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_project_articles_project_id ON project_articles(project_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_placement_content_placement_id ON placement_content(placement_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_placements_project_site ON placements(project_id, site_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)');

    logger.info('Database tables initialized successfully');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
}

// Query wrapper
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn('Slow query detected', { query: text, duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    logger.error('Database query error', { query: text, error: error.message });
    throw error;
  }
}

module.exports = {
  pool,
  query,
  initDatabase
};