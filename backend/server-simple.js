const express = require('express');
const cors = require('cors');
const pg = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Debug environment variables
console.log('Environment check:', {
  DATABASE_URL: process.env.DATABASE_URL ? 'provided' : 'missing',
  DB_HOST: process.env.DB_HOST || 'missing',
  DB_PORT: process.env.DB_PORT || 'missing',
  DB_NAME: process.env.DB_NAME || 'missing',
  DB_USER: process.env.DB_USER || 'missing',
  DB_PASSWORD: process.env.DB_PASSWORD ? 'provided' : 'missing',
  NODE_ENV: process.env.NODE_ENV || 'development'
});

// Parse DATABASE_URL for DigitalOcean and other platforms
// Always parse if DATABASE_URL exists, overriding individual vars
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    process.env.DB_HOST = url.hostname;
    process.env.DB_PORT = url.port || 5432;
    process.env.DB_NAME = url.pathname.slice(1);
    process.env.DB_USER = url.username;
    process.env.DB_PASSWORD = decodeURIComponent(url.password);
    console.log('Successfully parsed DATABASE_URL for connection parameters');
    console.log('Parsed values:', {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER
    });
  } catch (error) {
    console.error('Failed to parse DATABASE_URL:', error);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Logger configuration with file transports
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // Error log file
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Combined log file
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ]
});

// Rate limiting configuration
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} on login`);
    res.status(429).json({ 
      error: 'Too many login attempts, please try again later.',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limits for resource creation
const createLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 create operations per minute
  message: 'Too many create operations, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Moderate limits for placement operations
const placementLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Limit each IP to 20 placement operations per minute
  message: 'Too many placement operations, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

// WordPress API limiter
const wordpressLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 WordPress API calls per minute
  message: 'Too many WordPress API requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration with whitelist
const corsOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:3002', 'http://localhost:3005', 'https://shark-app-9kv6u.ondigitalocean.app'];

// Middleware
app.use(compression()); // Enable gzip compression
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Trust proxy for production (needed for rate limiting behind reverse proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'build'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Generate strong JWT secret if not provided
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    // Generate a cryptographically secure secret for production
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    logger.warn('JWT_SECRET not provided. Generated random secret for this session.');
    logger.warn('Please set JWT_SECRET environment variable for persistent sessions across restarts.');
  } else {
    // Use a development secret for non-production
    process.env.JWT_SECRET = 'dev-secret-' + crypto.randomBytes(16).toString('hex');
    logger.info('Using generated development JWT secret');
  }
}

// Check required environment variables after parsing DATABASE_URL
// If DATABASE_URL is provided and parsed successfully, we don't need individual vars
const hasValidDatabaseUrl = process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME;

if (!hasValidDatabaseUrl) {
  const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    logger.error('Please set these variables in your environment or provide DATABASE_URL');
    logger.error('Current environment:', {
      DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'not set',
      DB_HOST: process.env.DB_HOST || 'not set',
      DB_NAME: process.env.DB_NAME || 'not set',
      NODE_ENV: process.env.NODE_ENV
    });
    
    // Only exit in production if we really have no database config
    if (process.env.NODE_ENV === 'production') {
      logger.error('FATAL: No database configuration found in production. Exiting.');
      process.exit(1);
    }
  }
}

// PostgreSQL connection with increased pool
// Handle SSL configuration for DigitalOcean
let sslConfig = false;
if (process.env.NODE_ENV === 'production' || process.env.DB_HOST?.includes('ondigitalocean.com')) {
  // For DigitalOcean, use less strict SSL validation
  sslConfig = { rejectUnauthorized: false };
  logger.info('Using DigitalOcean SSL configuration');
} else if (fs.existsSync(path.join(__dirname, 'ca-certificate.crt'))) {
  // Use certificate if available
  sslConfig = {
    rejectUnauthorized: true,
    ca: fs.readFileSync(path.join(__dirname, 'ca-certificate.crt')).toString()
  };
  logger.info('Using SSL with CA certificate');
}

const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: sslConfig,
  max: 25, // Increased from 10
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000
};

logger.info(`Connecting to database: ${dbConfig.database} on port: ${dbConfig.port}`);
const pool = new pg.Pool(dbConfig);

// Monitor pool events
pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
  logger.debug('New client connected to database');
});

// Retry logic for database operations
async function executeWithRetry(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if ((error.code === 'ECONNRESET' || error.errno === -54) && i < maxRetries - 1) {
        logger.warn(`Database connection reset, retrying... (attempt ${i + 2}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
}

// Initialize database tables
async function initDatabase() {
  try {
    logger.info('Initializing database...');
    
    const testResult = await pool.query('SELECT NOW()');
    logger.info('Database connected:', testResult.rows[0].now);
    
    // Create tables (schema unchanged, just removed console.logs)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_links (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        url VARCHAR(500) NOT NULL,
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
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        excerpt TEXT,
        meta_title VARCHAR(255),
        meta_description TEXT,
        featured_image VARCHAR(500),
        slug VARCHAR(255),
        status VARCHAR(50) DEFAULT 'published',
        tags TEXT,
        category VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        site_url TEXT NOT NULL,
        site_name TEXT NOT NULL,
        api_key TEXT NOT NULL,
        max_links INTEGER DEFAULT 10,
        used_links INTEGER DEFAULT 0,
        max_articles INTEGER DEFAULT 30,
        used_articles INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS placements (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        count INTEGER DEFAULT 1,
        placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        wordpress_post_id INTEGER,
        status VARCHAR(50) DEFAULT 'pending',
        UNIQUE(project_id, site_id, type)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS placement_content (
        id SERIAL PRIMARY KEY,
        placement_id INTEGER REFERENCES placements(id) ON DELETE CASCADE,
        link_id INTEGER REFERENCES project_links(id) ON DELETE CASCADE,
        article_id INTEGER REFERENCES project_articles(id) ON DELETE CASCADE,
        wordpress_post_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(link_id),
        UNIQUE(article_id)
      )
    `);

    // Create indexes if not exist
    await pool.query('CREATE INDEX IF NOT EXISTS idx_project_links_project_id ON project_links(project_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_project_articles_project_id ON project_articles(project_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_placement_content_placement_id ON placement_content(placement_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_placements_project_site ON placements(project_id, site_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)');

    // Create default admin user if not exists
    const adminCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4)',
        ['admin', hashedPassword, 'admin@example.com', 'admin']
      );
      logger.info('Default admin user created (username: admin, password: admin123)');
    }

    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Database initialization error:', error);
  }
}

// Input validation middleware
const validateInput = (rules) => {
  return (req, res, next) => {
    const errors = [];
    
    for (const field in rules) {
      const value = req.body[field];
      const fieldRules = rules[field];
      
      // Required check
      if (fieldRules.required && !value) {
        errors.push(`${field} is required`);
        continue;
      }
      
      // Skip other checks if field is not present and not required
      if (!value && !fieldRules.required) continue;
      
      // Type check
      if (fieldRules.type && typeof value !== fieldRules.type) {
        errors.push(`${field} must be of type ${fieldRules.type}`);
      }
      
      // Length checks
      if (fieldRules.minLength && value.length < fieldRules.minLength) {
        errors.push(`${field} must be at least ${fieldRules.minLength} characters`);
      }
      
      if (fieldRules.maxLength && value.length > fieldRules.maxLength) {
        errors.push(`${field} must not exceed ${fieldRules.maxLength} characters`);
      }
      
      // Pattern check
      if (fieldRules.pattern && !fieldRules.pattern.test(value)) {
        errors.push(`${field} has invalid format`);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    
    next();
  };
};

// Sanitize HTML to prevent XSS
const sanitizeHtml = (dirty) => {
  // Basic HTML sanitization - removes script tags and event handlers
  return dirty
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');
};

// Auth middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new Error();
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (user.rows.length === 0) {
      throw new Error();
    }
    req.user = user.rows[0];
    next();
  } catch (error) {
    res.status(401).json({ error: 'Please authenticate' });
  }
};

// Auth routes
app.post('/api/auth/login', loginLimiter, validateInput({
  username: { required: true, type: 'string', minLength: 3, maxLength: 50 },
  password: { required: true, type: 'string', minLength: 6, maxLength: 100 }
}), async (req, res) => {
  try {
    const { username, password } = req.body;
    logger.debug(`Login attempt for: ${username}`);
    
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// OPTIMIZED: Projects routes with single query using JOIN and optional pagination
app.get('/api/projects', authMiddleware, async (req, res) => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 0;
    const usePagination = page > 0 && limit > 0;
    
    // Build query with optional LIMIT/OFFSET
    let query = `
      WITH project_stats AS (
        SELECT 
          p.project_id,
          COUNT(DISTINCT CASE WHEN pc.link_id IS NOT NULL THEN pc.link_id END) as placed_links_count,
          COUNT(DISTINCT CASE WHEN pc.article_id IS NOT NULL THEN pc.article_id END) as placed_articles_count
        FROM placements p
        LEFT JOIN placement_content pc ON p.id = pc.placement_id
        GROUP BY p.project_id
      )
      SELECT 
        p.*,
        COALESCE(ps.placed_links_count, 0) as placed_links_count,
        COALESCE(ps.placed_articles_count, 0) as placed_articles_count
      FROM projects p
      LEFT JOIN project_stats ps ON p.id = ps.project_id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
    `;
    
    const queryParams = [req.user.id];
    
    if (usePagination) {
      const offset = (page - 1) * limit;
      query += ` LIMIT $2 OFFSET $3`;
      queryParams.push(limit, offset);
    }
    
    const result = await pool.query(query, queryParams);
    
    // If pagination is requested, return paginated format
    if (usePagination) {
      // Get total count
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM projects WHERE user_id = $1',
        [req.user.id]
      );
      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / limit);
      
      res.json({
        data: result.rows,
        pagination: {
          page,
          limit,
          total,
          pages: totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    } else {
      // Return simple array for backward compatibility
      res.json(result.rows);
    }
  } catch (error) {
    logger.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

app.post('/api/projects', authMiddleware, validateInput({
  name: { required: true, type: 'string', minLength: 1, maxLength: 255 },
  description: { type: 'string', maxLength: 1000 }
}), async (req, res) => {
  try {
    const { name, description } = req.body;
    
    const result = await pool.query(
      'INSERT INTO projects (name, description, user_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description, req.user.id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// OPTIMIZED: Get project with all data in fewer queries
app.get('/api/projects/:id', authMiddleware, async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    
    // Single query to get everything using CTEs
    const result = await pool.query(`
      WITH project_data AS (
        SELECT p.*,
          (SELECT COUNT(DISTINCT pc.link_id) 
           FROM placements pl 
           JOIN placement_content pc ON pl.id = pc.placement_id 
           WHERE pl.project_id = p.id AND pc.link_id IS NOT NULL) as placed_links_count,
          (SELECT COUNT(DISTINCT pc.article_id) 
           FROM placements pl 
           JOIN placement_content pc ON pl.id = pc.placement_id 
           WHERE pl.project_id = p.id AND pc.article_id IS NOT NULL) as placed_articles_count
        FROM projects p
        WHERE p.id = $1 AND p.user_id = $2
      ),
      links_data AS (
        SELECT pl.*, 
          COUNT(DISTINCT pc.placement_id) as usage_count
        FROM project_links pl
        LEFT JOIN placement_content pc ON pl.id = pc.link_id
        WHERE pl.project_id = $1
        GROUP BY pl.id
        ORDER BY pl.position
      ),
      articles_data AS (
        SELECT pa.*, 
          pc.placement_id IS NOT NULL as is_placed,
          s.site_name as placed_on_site
        FROM project_articles pa
        LEFT JOIN placement_content pc ON pa.id = pc.article_id
        LEFT JOIN placements p ON pc.placement_id = p.id
        LEFT JOIN sites s ON p.site_id = s.id
        WHERE pa.project_id = $1
        ORDER BY pa.created_at DESC
      )
      SELECT 
        (SELECT row_to_json(pd) FROM project_data pd) as project,
        COALESCE(json_agg(DISTINCT ld) FILTER (WHERE ld.id IS NOT NULL), '[]') as links,
        COALESCE(json_agg(DISTINCT ad) FILTER (WHERE ad.id IS NOT NULL), '[]') as articles
      FROM links_data ld
      FULL OUTER JOIN articles_data ad ON false
    `, [projectId, userId]);
    
    if (!result.rows[0].project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({
      ...result.rows[0].project,
      links: result.rows[0].links,
      articles: result.rows[0].articles
    });
  } catch (error) {
    logger.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

app.put('/api/projects/:id', authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'UPDATE projects SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 RETURNING *',
      [name, description, req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

app.delete('/api/projects/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    logger.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Project links routes
app.post('/api/projects/:id/links', authMiddleware, createLimiter, async (req, res) => {
  try {
    const { url, anchor_text, position, html_context } = req.body;
    
    const projectCheck = await pool.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await pool.query(
      'INSERT INTO project_links (project_id, url, anchor_text, position, html_context) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.params.id, url, anchor_text, position || 0, html_context || null]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Add link error:', error);
    res.status(500).json({ error: 'Failed to add link' });
  }
});

// OPTIMIZED: Bulk import with batch insert
app.post('/api/projects/:id/links/bulk', authMiddleware, createLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    const { links } = req.body;
    
    const projectCheck = await client.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!Array.isArray(links) || links.length === 0) {
      return res.status(400).json({ error: 'No links provided' });
    }

    if (links.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 links at once' });
    }

    await client.query('BEGIN');
    
    // Prepare bulk insert
    const values = [];
    const placeholders = [];
    let paramIndex = 1;
    
    links.forEach((link, i) => {
      if (link.url && link.url.startsWith('http')) {
        placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        values.push(req.params.id, link.url, link.anchor_text || link.url, link.position || 0);
      }
    });
    
    if (placeholders.length > 0) {
      const query = `
        INSERT INTO project_links (project_id, url, anchor_text, position) 
        VALUES ${placeholders.join(', ')} 
        RETURNING *
      `;
      
      const result = await client.query(query, values);
      await client.query('COMMIT');
      
      res.json({
        success: true,
        added: result.rows.length,
        results: result.rows
      });
    } else {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'No valid links to import' });
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Bulk import error:', error);
    res.status(500).json({ error: 'Failed to import links' });
  } finally {
    client.release();
  }
});

app.delete('/api/projects/:projectId/links/:linkId', authMiddleware, async (req, res) => {
  try {
    const projectCheck = await pool.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.projectId, req.user.id]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await pool.query(
      'DELETE FROM project_links WHERE id = $1 AND project_id = $2 RETURNING *',
      [req.params.linkId, req.params.projectId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    res.json({ message: 'Link deleted successfully' });
  } catch (error) {
    logger.error('Delete link error:', error);
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// Cyrillic to Latin transliteration
const cyrillicToLatin = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
  'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
  'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
  'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
  'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '',
  'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
};

function transliterate(text) {
  return text.split('').map(char => cyrillicToLatin[char] || char).join('');
}

function generateSlugFromTitle(title) {
  const transliterated = transliterate(title);
  return transliterated
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

// Project articles routes
app.post('/api/projects/:id/articles', authMiddleware, createLimiter, async (req, res) => {
  try {
    const { 
      title, content, excerpt, meta_title, meta_description, 
      featured_image, slug, tags, category 
    } = req.body;
    
    const projectCheck = await pool.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const finalSlug = slug || generateSlugFromTitle(title);

    const result = await pool.query(
      `INSERT INTO project_articles 
       (project_id, title, content, excerpt, meta_title, meta_description, featured_image, slug, status, tags, category) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
       RETURNING *`,
      [
        req.params.id, title, content, excerpt || null,
        meta_title || title, meta_description || null,
        featured_image || null, finalSlug, 'published',
        tags || null, category || null
      ]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Add article error:', error);
    res.status(500).json({ error: 'Failed to add article' });
  }
});

app.put('/api/projects/:projectId/articles/:articleId', authMiddleware, async (req, res) => {
  try {
    const { 
      title, content, excerpt, meta_title, meta_description,
      featured_image, slug, tags, category 
    } = req.body;
    
    const projectCheck = await pool.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.projectId, req.user.id]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const finalSlug = slug || (title ? generateSlugFromTitle(title) : undefined);
    
    const updateFields = [];
    const values = [];
    let paramCount = 1;
    
    if (title !== undefined) {
      updateFields.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (content !== undefined) {
      updateFields.push(`content = $${paramCount++}`);
      values.push(content);
    }
    if (excerpt !== undefined) {
      updateFields.push(`excerpt = $${paramCount++}`);
      values.push(excerpt);
    }
    if (meta_title !== undefined) {
      updateFields.push(`meta_title = $${paramCount++}`);
      values.push(meta_title);
    }
    if (meta_description !== undefined) {
      updateFields.push(`meta_description = $${paramCount++}`);
      values.push(meta_description);
    }
    if (featured_image !== undefined) {
      updateFields.push(`featured_image = $${paramCount++}`);
      values.push(featured_image);
    }
    if (finalSlug !== undefined) {
      updateFields.push(`slug = $${paramCount++}`);
      values.push(finalSlug);
    }
    updateFields.push(`status = $${paramCount++}`);
    values.push('published');
    if (tags !== undefined) {
      updateFields.push(`tags = $${paramCount++}`);
      values.push(tags);
    }
    if (category !== undefined) {
      updateFields.push(`category = $${paramCount++}`);
      values.push(category);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(req.params.articleId);
    values.push(req.params.projectId);
    
    const result = await pool.query(
      `UPDATE project_articles 
       SET ${updateFields.join(', ')} 
       WHERE id = $${paramCount} AND project_id = $${paramCount + 1} 
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update article error:', error);
    res.status(500).json({ error: 'Failed to update article' });
  }
});

app.delete('/api/projects/:projectId/articles/:articleId', authMiddleware, async (req, res) => {
  try {
    const projectCheck = await pool.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.projectId, req.user.id]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await pool.query(
      'DELETE FROM project_articles WHERE id = $1 AND project_id = $2 RETURNING *',
      [req.params.articleId, req.params.projectId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    logger.error('Delete article error:', error);
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

// Sites routes
app.get('/api/sites', authMiddleware, async (req, res) => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 0;
    const recalculate = req.query.recalculate === 'true';
    const usePagination = page > 0 && limit > 0;
    
    // Optionally recalculate statistics first (batch operation optimization)
    if (recalculate) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Batch recalculate all user's sites in single query
        await client.query(`
          WITH site_stats AS (
            SELECT 
              s.id,
              COUNT(DISTINCT CASE WHEN pc.link_id IS NOT NULL THEN pc.id END) as link_count,
              COUNT(DISTINCT CASE WHEN pc.article_id IS NOT NULL THEN pc.id END) as article_count
            FROM sites s
            LEFT JOIN placements p ON s.id = p.site_id
            LEFT JOIN placement_content pc ON p.id = pc.placement_id
            WHERE s.user_id = $1
            GROUP BY s.id
          )
          UPDATE sites s
          SET 
            used_links = COALESCE(ss.link_count, 0),
            used_articles = COALESCE(ss.article_count, 0)
          FROM site_stats ss
          WHERE s.id = ss.id AND s.user_id = $1
        `, [req.user.id]);
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Recalculation error:', error);
        // Continue to fetch sites even if recalc fails
      } finally {
        client.release();
      }
    }
    
    // Fetch sites data
    let query = 'SELECT * FROM sites WHERE user_id = $1 ORDER BY created_at DESC';
    const queryParams = [req.user.id];
    
    if (usePagination) {
      const offset = (page - 1) * limit;
      query += ' LIMIT $2 OFFSET $3';
      queryParams.push(limit, offset);
    }
    
    const result = await pool.query(query, queryParams);
    
    // If pagination is requested, return paginated format
    if (usePagination) {
      // Get total count
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM sites WHERE user_id = $1',
        [req.user.id]
      );
      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / limit);
      
      res.json({
        data: result.rows,
        pagination: {
          page,
          limit,
          total,
          pages: totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        recalculated: recalculate
      });
    } else {
      // Return simple array for backward compatibility
      res.json(result.rows);
    }
  } catch (error) {
    logger.error('Get sites error:', error);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

app.post('/api/sites', authMiddleware, validateInput({
  name: { required: true, type: 'string', minLength: 1, maxLength: 255 },
  url: { required: true, type: 'string', pattern: /^https?:\/\/.+/ },
  api_key: { type: 'string', maxLength: 255 },
  max_links: { type: 'number' },
  max_articles: { type: 'number' }
}), async (req, res) => {
  try {
    const { site_url, api_key, max_links, max_articles } = req.body;
    
    const finalApiKey = api_key || 'api_af44aafbca44';
    const site_name = site_url;
    
    const result = await pool.query(
      'INSERT INTO sites (site_url, site_name, api_key, user_id, max_links, max_articles, used_links, used_articles) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [site_url, site_name, finalApiKey, req.user.id, max_links || 10, max_articles || 30, 0, 0]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Create site error:', error);
    res.status(500).json({ error: 'Failed to create site' });
  }
});

app.put('/api/sites/:id', authMiddleware, async (req, res) => {
  try {
    const { site_url, site_name, api_key, max_links, max_articles } = req.body;
    
    const updateFields = [];
    const values = [];
    let paramCount = 1;
    
    if (site_url !== undefined) {
      updateFields.push(`site_url = $${paramCount++}`);
      values.push(site_url);
    }
    if (site_name !== undefined) {
      updateFields.push(`site_name = $${paramCount++}`);
      values.push(site_name);
    }
    if (api_key !== undefined) {
      updateFields.push(`api_key = $${paramCount++}`);
      values.push(api_key);
    }
    if (max_links !== undefined) {
      updateFields.push(`max_links = $${paramCount++}`);
      values.push(max_links);
    }
    if (max_articles !== undefined) {
      updateFields.push(`max_articles = $${paramCount++}`);
      values.push(max_articles);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(req.params.id);
    values.push(req.user.id);
    
    const query = `UPDATE sites SET ${updateFields.join(', ')} 
                   WHERE id = $${paramCount} AND user_id = $${paramCount + 1} 
                   RETURNING *`;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update site error:', error);
    res.status(500).json({ error: 'Failed to update site' });
  }
});

app.delete('/api/sites/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM sites WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    
    res.json({ message: 'Site deleted successfully' });
  } catch (error) {
    logger.error('Delete site error:', error);
    res.status(500).json({ error: 'Failed to delete site' });
  }
});

// OPTIMIZED: Recalculate site statistics with batch update
app.post('/api/sites/recalculate-stats', authMiddleware, async (req, res) => {
  try {
    // Single query to update all sites
    const updateResult = await pool.query(`
      WITH site_stats AS (
        SELECT 
          s.id,
          COUNT(DISTINCT CASE WHEN pc.link_id IS NOT NULL THEN pc.link_id END) as link_count,
          COUNT(DISTINCT CASE WHEN pc.article_id IS NOT NULL THEN pc.article_id END) as article_count
        FROM sites s
        LEFT JOIN placements p ON s.id = p.site_id
        LEFT JOIN placement_content pc ON p.id = pc.placement_id
        WHERE s.user_id = $1
        GROUP BY s.id
      )
      UPDATE sites s
      SET 
        used_links = COALESCE(ss.link_count, 0),
        used_articles = COALESCE(ss.article_count, 0)
      FROM site_stats ss
      WHERE s.id = ss.id
      RETURNING s.*
    `, [req.user.id]);
    
    res.json({ 
      message: 'Statistics recalculated successfully',
      sites: updateResult.rows
    });
  } catch (error) {
    logger.error('Recalculate stats error:', error);
    res.status(500).json({ error: 'Failed to recalculate statistics' });
  }
});

// OPTIMIZED: Get available content with single query
app.get('/api/projects/:id/available-content', authMiddleware, async (req, res) => {
  try {
    const projectId = req.params.id;
    
    // Single comprehensive query
    const result = await pool.query(`
      WITH project_data AS (
        SELECT * FROM projects WHERE id = $1 AND user_id = $2
      ),
      links_with_placement AS (
        SELECT 
          pl.*,
          pc.placement_id,
          s.site_name as placed_on_site,
          s.id as placed_on_site_id
        FROM project_links pl
        LEFT JOIN placement_content pc ON pl.id = pc.link_id
        LEFT JOIN placements p ON pc.placement_id = p.id
        LEFT JOIN sites s ON p.site_id = s.id
        WHERE pl.project_id = $1
      ),
      articles_with_placement AS (
        SELECT 
          pa.*,
          pc.placement_id,
          s.site_name as placed_on_site,
          s.id as placed_on_site_id
        FROM project_articles pa
        LEFT JOIN placement_content pc ON pa.id = pc.article_id
        LEFT JOIN placements p ON pc.placement_id = p.id
        LEFT JOIN sites s ON p.site_id = s.id
        WHERE pa.project_id = $1
      ),
      sites_with_availability AS (
        SELECT 
          s.*,
          COUNT(DISTINCT CASE WHEN p.project_id = $1 THEN pc.link_id END) as project_links_placed,
          COUNT(DISTINCT CASE WHEN p.project_id = $1 THEN pc.article_id END) as project_articles_placed
        FROM sites s
        LEFT JOIN placements p ON s.id = p.site_id
        LEFT JOIN placement_content pc ON p.id = pc.placement_id
        WHERE s.user_id = $2
        GROUP BY s.id
      )
      SELECT 
        (SELECT row_to_json(pd) FROM project_data pd) as project,
        COALESCE(json_agg(DISTINCT lwp) FILTER (WHERE lwp.id IS NOT NULL), '[]') as links,
        COALESCE(json_agg(DISTINCT awp) FILTER (WHERE awp.id IS NOT NULL), '[]') as articles,
        COALESCE(json_agg(DISTINCT swa) FILTER (WHERE swa.id IS NOT NULL), '[]') as sites
      FROM links_with_placement lwp
      FULL OUTER JOIN articles_with_placement awp ON false
      FULL OUTER JOIN sites_with_availability swa ON false
    `, [projectId, req.user.id]);
    
    const data = result.rows[0];
    
    if (!data.project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Process sites data
    const sitesWithAvailability = data.sites.map(site => ({
      ...site,
      available_links: site.max_links - site.used_links,
      available_articles: site.max_articles - site.used_articles,
      has_project_link: site.project_links_placed > 0,
      has_project_article: site.project_articles_placed > 0,
      can_place_link: site.project_links_placed === 0 && site.used_links < site.max_links,
      can_place_article: site.project_articles_placed === 0 && site.used_articles < site.max_articles
    }));
    
    res.json({
      project: data.project,
      links: data.links.map(link => ({
        ...link,
        is_placed: !!link.placement_id,
        placed_on_site: link.placed_on_site,
        placed_on_site_id: link.placed_on_site_id
      })),
      articles: data.articles.map(article => ({
        ...article,
        is_placed: !!article.placement_id,
        placed_on_site: article.placed_on_site,
        placed_on_site_id: article.placed_on_site_id
      })),
      sites: sitesWithAvailability
    });
  } catch (error) {
    logger.error('Get available content error:', error);
    res.status(500).json({ error: 'Failed to get available content' });
  }
});

// OPTIMIZED: Placement routes with batch operations
app.post('/api/placements', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { site_id, project_id, link_ids = [], article_ids = [] } = req.body;
    
    await client.query('BEGIN');
    
    // Check permissions and get data in single query
    const checkQuery = `
      WITH project_check AS (
        SELECT * FROM projects WHERE id = $1 AND user_id = $2
      ),
      site_check AS (
        SELECT * FROM sites WHERE id = $3 AND user_id = $2
      ),
      existing_placements AS (
        SELECT 
          pc.link_id,
          pc.article_id
        FROM placements p
        JOIN placement_content pc ON p.id = pc.placement_id
        WHERE p.project_id = $1 AND p.site_id = $3
      )
      SELECT 
        (SELECT COUNT(*) FROM project_check) as project_exists,
        (SELECT COUNT(*) FROM site_check) as site_exists,
        array_agg(DISTINCT ep.link_id) FILTER (WHERE ep.link_id IS NOT NULL) as existing_links,
        array_agg(DISTINCT ep.article_id) FILTER (WHERE ep.article_id IS NOT NULL) as existing_articles
      FROM existing_placements ep
    `;
    
    const checkResult = await client.query(checkQuery, [project_id, req.user.id, site_id]);
    const check = checkResult.rows[0];
    
    if (check.project_exists === '0') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (check.site_exists === '0') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Site not found' });
    }
    
    // Filter out already placed content
    const existingLinks = check.existing_links || [];
    const existingArticles = check.existing_articles || [];
    const newLinkIds = link_ids.filter(id => !existingLinks.includes(id));
    const newArticleIds = article_ids.filter(id => !existingArticles.includes(id));
    
    if (newLinkIds.length === 0 && newArticleIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'All selected content has already been placed on this site' });
    }
    
    // Create placement
    const placementResult = await client.query(
      'INSERT INTO placements (site_id, project_id, user_id, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [site_id, project_id, req.user.id, 'active']
    );
    const placement = placementResult.rows[0];
    
    // Batch insert placement content
    const contentValues = [];
    newLinkIds.forEach(linkId => {
      contentValues.push(`(${placement.id}, ${linkId}, NULL)`);
    });
    newArticleIds.forEach(articleId => {
      contentValues.push(`(${placement.id}, NULL, ${articleId})`);
    });
    
    if (contentValues.length > 0) {
      await client.query(`
        INSERT INTO placement_content (placement_id, link_id, article_id)
        VALUES ${contentValues.join(', ')}
      `);
    }
    
    // Update site statistics in single query
    await client.query(`
      WITH counts AS (
        SELECT 
          COUNT(DISTINCT pc.link_id) as link_count,
          COUNT(DISTINCT pc.article_id) as article_count
        FROM placements p
        JOIN placement_content pc ON p.id = pc.placement_id
        WHERE p.site_id = $1
      )
      UPDATE sites
      SET 
        used_links = counts.link_count,
        used_articles = counts.article_count
      FROM counts
      WHERE id = $1
    `, [site_id]);
    
    await client.query('COMMIT');
    
    res.json({
      ...placement,
      links_placed: newLinkIds.length,
      articles_placed: newArticleIds.length,
      skipped_links: link_ids.length - newLinkIds.length,
      skipped_articles: article_ids.length - newArticleIds.length
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Create placement error:', error);
    res.status(500).json({ error: 'Failed to create placement' });
  } finally {
    client.release();
  }
});

app.get('/api/placements', authMiddleware, async (req, res) => {
  try {
    const { project_id } = req.query;
    // Parse pagination parameters
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 0;
    const usePagination = page > 0 && limit > 0;
    
    // Base query
    let query = `
      WITH placement_data AS (
        SELECT 
          p.*,
          s.site_name,
          s.site_url,
          pr.name as project_name,
          COUNT(DISTINCT pc.link_id) as links_count,
          COUNT(DISTINCT pc.article_id) as articles_count,
          array_agg(DISTINCT jsonb_build_object(
            'id', pl.id,
            'url', pl.url,
            'anchor_text', pl.anchor_text
          )) FILTER (WHERE pl.id IS NOT NULL) as links,
          array_agg(DISTINCT jsonb_build_object(
            'id', pa.id,
            'title', pa.title,
            'slug', pa.slug
          )) FILTER (WHERE pa.id IS NOT NULL) as articles
        FROM placements p
        JOIN sites s ON p.site_id = s.id
        JOIN projects pr ON p.project_id = pr.id
        LEFT JOIN placement_content pc ON p.id = pc.placement_id
        LEFT JOIN project_links pl ON pc.link_id = pl.id
        LEFT JOIN project_articles pa ON pc.article_id = pa.id
        WHERE p.user_id = $1 ${project_id ? 'AND p.project_id = $2' : ''}
        GROUP BY p.id, s.site_name, s.site_url, pr.name
        ORDER BY p.placement_date DESC
      )
      SELECT * FROM placement_data
    `;
    
    const values = project_id ? [req.user.id, project_id] : [req.user.id];
    
    // Add pagination if requested
    if (usePagination) {
      const offset = (page - 1) * limit;
      const paramOffset = values.length;
      query += ` LIMIT $${paramOffset + 1} OFFSET $${paramOffset + 2}`;
      values.push(limit, offset);
    }
    
    const result = await pool.query(query, values);
    
    // If pagination is requested, return paginated format
    if (usePagination) {
      // Get total count
      const countQuery = project_id 
        ? 'SELECT COUNT(*) FROM placements WHERE user_id = $1 AND project_id = $2'
        : 'SELECT COUNT(*) FROM placements WHERE user_id = $1';
      const countValues = project_id ? [req.user.id, project_id] : [req.user.id];
      const countResult = await pool.query(countQuery, countValues);
      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / limit);
      
      res.json({
        data: result.rows,
        pagination: {
          page,
          limit,
          total,
          pages: totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    } else {
      // Return simple array for backward compatibility
      res.json(result.rows);
    }
  } catch (error) {
    logger.error('Get placements error:', error);
    res.status(500).json({ error: 'Failed to fetch placements' });
  }
});

app.delete('/api/placements/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get placement info before deletion
    const placementResult = await client.query(
      'SELECT * FROM placements WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (placementResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Placement not found' });
    }
    
    const placement = placementResult.rows[0];
    
    // Delete placement (cascade will handle placement_content)
    await client.query('DELETE FROM placements WHERE id = $1', [req.params.id]);
    
    // Update site statistics
    await client.query(`
      WITH counts AS (
        SELECT 
          COUNT(DISTINCT pc.link_id) as link_count,
          COUNT(DISTINCT pc.article_id) as article_count
        FROM placements p
        JOIN placement_content pc ON p.id = pc.placement_id
        WHERE p.site_id = $1
      )
      UPDATE sites
      SET 
        used_links = COALESCE(counts.link_count, 0),
        used_articles = COALESCE(counts.article_count, 0)
      FROM counts
      WHERE sites.id = $1
    `, [placement.site_id]);
    
    await client.query('COMMIT');
    res.json({ message: 'Placement deleted successfully' });
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Delete placement error:', error);
    res.status(500).json({ error: 'Failed to delete placement' });
  } finally {
    client.release();
  }
});

// WordPress publish article endpoint
app.post('/api/wordpress/publish-article', authMiddleware, wordpressLimiter, async (req, res) => {
  try {
    const { site_id, article_id, placement_id } = req.body;
    
    // Get article and site data
    const articleResult = await pool.query(
      'SELECT * FROM project_articles WHERE id = $1',
      [article_id]
    );
    
    if (articleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    const siteResult = await pool.query(
      'SELECT * FROM sites WHERE id = $1 AND user_id = $2',
      [site_id, req.user.id]
    );
    
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    
    const article = articleResult.rows[0];
    const site = siteResult.rows[0];
    
    // Prepare WordPress API call
    const fetch = require('node-fetch');
    const wpApiUrl = `${site.site_url.replace(/\/$/, '')}/wp-json/link-manager/v1/create-article`;
    
    const wpResponse = await fetch(wpApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': site.api_key
      },
      body: JSON.stringify({
        title: article.title,
        content: article.content,
        slug: article.slug,
        // No category - use WordPress default
      })
    });
    
    const responseText = await wpResponse.text();
    logger.debug('WordPress response:', responseText);
    
    if (!wpResponse.ok) {
      logger.error('WordPress API error:', responseText);
      return res.status(500).json({ 
        error: 'Failed to publish to WordPress',
        details: responseText 
      });
    }
    
    let wpResult;
    try {
      wpResult = JSON.parse(responseText);
    } catch (e) {
      logger.error('Failed to parse WordPress response:', responseText);
      return res.status(500).json({ 
        error: 'Invalid response from WordPress',
        details: responseText 
      });
    }
    
    // Update placement_content with WordPress post ID if available
    if (wpResult.post_id && placement_id) {
      await pool.query(
        'UPDATE placement_content SET wordpress_post_id = $1 WHERE placement_id = $2 AND article_id = $3',
        [wpResult.post_id, placement_id, article_id]
      );
    }
    
    res.json({
      success: true,
      post_id: wpResult.post_id,
      post_url: wpResult.post_url,
      message: 'Article published successfully'
    });
    
  } catch (error) {
    logger.error('Publish article error:', error);
    res.status(500).json({ error: 'Failed to publish article' });
  }
});

// WordPress API routes
app.get('/api/wordpress/get-content/:api_key', async (req, res) => {
  try {
    const { api_key } = req.params;
    
    // Get site and content in single optimized query
    const result = await pool.query(`
      WITH site_info AS (
        SELECT id, site_url, user_id FROM sites WHERE api_key = $1 LIMIT 1
      ),
      recent_placements AS (
        SELECT 
          p.id,
          p.project_id,
          p.placement_date,
          pr.name as project_name
        FROM placements p
        JOIN projects pr ON p.project_id = pr.id
        WHERE p.site_id = (SELECT id FROM site_info)
        ORDER BY p.placement_date DESC
        LIMIT 5
      ),
      placement_content_data AS (
        SELECT 
          pc.placement_id,
          jsonb_build_object(
            'id', pl.id,
            'url', pl.url,
            'anchor_text', pl.anchor_text,
            'position', pl.position
          ) as link,
          jsonb_build_object(
            'id', pa.id,
            'title', pa.title,
            'content', pa.content,
            'slug', pa.slug,
            'category', pa.category
          ) as article
        FROM placement_content pc
        JOIN recent_placements rp ON pc.placement_id = rp.id
        LEFT JOIN project_links pl ON pc.link_id = pl.id
        LEFT JOIN project_articles pa ON pc.article_id = pa.id
      )
      SELECT 
        (SELECT row_to_json(si) FROM site_info si) as site,
        COALESCE(
          json_agg(json_build_object(
            'placement_id', pcd.placement_id,
            'link', pcd.link,
            'article', pcd.article
          )), '[]'::json
        ) as content
      FROM placement_content_data pcd
      GROUP BY (SELECT id FROM site_info)
    `, [api_key]);
    
    if (!result.rows[0] || !result.rows[0].site) {
      return res.status(404).json({ error: 'Site not found or invalid API key' });
    }
    
    const data = result.rows[0];
    
    // Format response
    const links = [];
    const articles = [];
    
    data.content.forEach(item => {
      if (item.link && item.link.id) {
        links.push(item.link);
      }
      if (item.article && item.article.id) {
        articles.push(item.article);
      }
    });
    
    res.json({
      site_url: data.site.site_url,
      links: links.sort((a, b) => (a.position || 0) - (b.position || 0)),
      articles: articles
    });
    
  } catch (error) {
    logger.error('WordPress get content error:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

app.post('/api/wordpress/verify', async (req, res) => {
  try {
    const { site_url, api_key } = req.body;
    
    let query, params;
    if (site_url && api_key) {
      // Old way - with site_url and api_key
      query = 'SELECT id, site_name, site_url FROM sites WHERE site_url = $1 AND api_key = $2';
      params = [site_url, api_key];
    } else if (api_key) {
      // New way - only by api_key (for WordPress plugin Test Connection)
      query = 'SELECT id, site_name, site_url FROM sites WHERE api_key = $1';
      params = [api_key];
    } else {
      return res.status(400).json({ 
        verified: false, 
        error: 'API key is required' 
      });
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        verified: false, 
        error: 'Site not found or API key mismatch' 
      });
    }
    
    res.json({ 
      verified: true,
      success: true, // For WordPress plugin compatibility
      site: result.rows[0]
    });
  } catch (error) {
    logger.error('WordPress verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.post('/api/wordpress/content', wordpressLimiter, async (req, res) => {
  try {
    const { api_key, article_id, status } = req.body;
    
    if (status === 'published' && article_id) {
      const result = await pool.query(`
        UPDATE placement_content pc
        SET wordpress_post_id = $1
        FROM placements p
        JOIN sites s ON p.site_id = s.id
        WHERE pc.placement_id = p.id
        AND s.api_key = $2
        AND pc.article_id = $1
      `, [article_id, api_key]);
      
      logger.info(`WordPress article ${article_id} published`);
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('WordPress content update error:', error);
    res.status(500).json({ error: 'Failed to update content status' });
  }
});

// Legacy placement route (keep for compatibility)
app.post('/api/placements/create', authMiddleware, async (req, res) => {
  logger.warn('Legacy /api/placements/create endpoint used');
  return app._router.handle({ ...req, url: '/api/placements' }, res);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.1.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working correctly',
    frontend: 'Should be served from /index.html',
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to create/reset admin - DISABLED IN PRODUCTION
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/init-admin', async (req, res) => {
    try {
      const adminCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      if (adminCheck.rows.length > 0) {
        await pool.query(
          'UPDATE users SET password = $1 WHERE username = $2',
          [hashedPassword, 'admin']
        );
        return res.json({ message: 'Admin password reset successfully', username: 'admin', password: 'admin123' });
      }
      
      await pool.query(
        'INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4)',
        ['admin', hashedPassword, 'admin@example.com', 'admin']
      );
      
      res.json({ message: 'Admin created successfully', username: 'admin', password: 'admin123' });
    } catch (error) {
      logger.error('Init admin error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Start server
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();