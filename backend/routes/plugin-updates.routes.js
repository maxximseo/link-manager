const express = require('express');
const router = express.Router();
const pluginUpdatesController = require('../controllers/plugin-updates.controller');

// Check for updates (public, no auth required)
// WordPress calls this every 12 hours
router.get('/check', pluginUpdatesController.checkForUpdates);

// Get detailed plugin info (for "View details" link in WordPress admin)
router.get('/info', pluginUpdatesController.getPluginInfo);

// Download plugin ZIP file
router.get('/download', pluginUpdatesController.downloadPlugin);

module.exports = router;
