/**
 * Express application setup with Redis Queue integration
 * Falls back to legacy functionality when queue unavailable
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const logger = require('./config/logger');
const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const routes = require('./routes');

const app = express();

// Trust proxy for load balancer (enables req.ip to work correctly)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
  crossOriginEmbedderPolicy: false
}));

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