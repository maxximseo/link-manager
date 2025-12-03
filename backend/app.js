/**
 * Express application setup with Redis Queue integration
 * Falls back to legacy functionality when queue unavailable
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const Sentry = require('@sentry/node');

const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const routes = require('./routes');

const app = express();

// Trust proxy for load balancer (enables req.ip to work correctly)
app.set('trust proxy', 1);

// Security middleware
// Configure helmet for production security
const helmetConfig = {
  crossOriginEmbedderPolicy: false, // Allow loading external resources
  contentSecurityPolicy:
    process.env.NODE_ENV === 'production'
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'], // Allow Bootstrap & other CDN scripts
            scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, onchange, etc.)
            styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'], // Allow inline styles for Bootstrap
            imgSrc: ["'self'", 'data:', 'https:'], // Allow images from any HTTPS source
            connectSrc: ["'self'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'], // API calls + CDN source maps
            fontSrc: ["'self'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'], // CDN fonts
            objectSrc: ["'none'"], // Block plugins like Flash
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"], // Block iframes
            upgradeInsecureRequests: [] // Force HTTPS
          }
        }
      : false, // Disable CSP in development for easier debugging
  hsts:
    process.env.NODE_ENV === 'production'
      ? {
          maxAge: 31536000, // 1 year in seconds
          includeSubDomains: true, // Apply to all subdomains
          preload: true // Allow preloading in browsers
        }
      : false // Disable HSTS in development
};

app.use(helmet(helmetConfig));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'build')));

// API routes
app.use('/api', routes);

// Comprehensive health check endpoint (monitoring)
const healthRoutes = require('./routes/health.routes');
app.use('/health', healthRoutes);

// Sentry test endpoint (development only)
app.get('/debug-sentry', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }
  throw new Error('Sentry test error - triggered manually for verification');
});

// Sentry error handler - MUST be before other error middleware
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Error handling for API routes
app.use('/api', errorHandler);

// Serve frontend for all non-API routes (but not static assets)
app.get('*', (req, res) => {
  // Let static middleware handle assets first
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
    return res.status(404).json({ error: 'Static asset not found' });
  }
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

module.exports = app;
