const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

// Plugin metadata - update these when releasing new versions
const PLUGIN_INFO = {
  name: 'Serparium Link Widget',
  slug: 'link-manager-widget',
  version: '2.7.2',
  author: 'NDA Team (SEO is Dead)',
  author_profile: 'https://serparium.com',
  homepage: 'https://serparium.com',
  requires: '5.0',
  requires_php: '7.2',
  tested: '6.4',
  description:
    'Display placed links and articles from Serparium.com. Supports automatic updates, multi-layer caching, and flexible content templates.',
  short_description: 'Serparium links and articles widget with auto-updates'
};

// Get the API base URL from environment or use default
const getApiBaseUrl = () => {
  return process.env.API_BASE_URL || 'https://shark-app-9kv6u.ondigitalocean.app';
};

/**
 * Check for plugin updates
 * GET /api/plugin-updates/check
 *
 * WordPress calls this to check if a newer version is available
 */
const checkForUpdates = async (req, res) => {
  try {
    const { slug, version: installedVersion } = req.query;

    // Only respond for our plugin
    if (slug && slug !== PLUGIN_INFO.slug) {
      return res.status(404).json({ error: 'Plugin not found' });
    }

    const baseUrl = getApiBaseUrl();

    // Return current version info
    const response = {
      slug: PLUGIN_INFO.slug,
      new_version: PLUGIN_INFO.version,
      version: PLUGIN_INFO.version,
      url: PLUGIN_INFO.homepage,
      package: `${baseUrl}/api/plugin-updates/download`,
      requires: PLUGIN_INFO.requires,
      requires_php: PLUGIN_INFO.requires_php,
      tested: PLUGIN_INFO.tested,
      upgrade_notice: 'Added automatic plugin updates support'
    };

    // Log update check for monitoring
    if (installedVersion) {
      const needsUpdate =
        installedVersion !== PLUGIN_INFO.version &&
        compareVersions(installedVersion, PLUGIN_INFO.version) < 0;

      logger.info('Plugin update check', {
        installedVersion,
        latestVersion: PLUGIN_INFO.version,
        needsUpdate,
        clientIp: req.ip
      });
    }

    res.json(response);
  } catch (error) {
    logger.error('Error checking for plugin updates:', error);
    res.status(500).json({ error: 'Failed to check for updates' });
  }
};

/**
 * Get detailed plugin info
 * GET /api/plugin-updates/info
 *
 * WordPress calls this when user clicks "View details"
 */
const getPluginInfo = async (req, res) => {
  try {
    const baseUrl = getApiBaseUrl();

    // Read changelog from file
    let changelog = '';
    try {
      const changelogPath = path.join(__dirname, '../../wordpress-plugin/CHANGELOG.md');
      if (fs.existsSync(changelogPath)) {
        changelog = fs.readFileSync(changelogPath, 'utf8');
        // Convert markdown to simple HTML for WordPress display
        changelog = markdownToHtml(changelog);
      }
    } catch {
      changelog = '<p>See GitHub repository for full changelog.</p>';
    }

    const response = {
      name: PLUGIN_INFO.name,
      slug: PLUGIN_INFO.slug,
      version: PLUGIN_INFO.version,
      new_version: PLUGIN_INFO.version,
      author: `<a href="${PLUGIN_INFO.author_profile}">${PLUGIN_INFO.author}</a>`,
      author_profile: PLUGIN_INFO.author_profile,
      homepage: PLUGIN_INFO.homepage,
      requires: PLUGIN_INFO.requires,
      requires_php: PLUGIN_INFO.requires_php,
      tested: PLUGIN_INFO.tested,
      download_link: `${baseUrl}/api/plugin-updates/download`,
      trunk: `${baseUrl}/api/plugin-updates/download`,
      last_updated: new Date().toISOString().split('T')[0],
      sections: {
        description: `<p>${PLUGIN_INFO.description}</p>
          <h4>Features</h4>
          <ul>
            <li>Automatic plugin updates from Link Manager server</li>
            <li>Multi-layer caching (transient + persistent + file)</li>
            <li>Flexible content templates (default, with_image, card, custom)</li>
            <li>Extended fields support (image_url, link_attributes, wrapper_config)</li>
            <li>Quick site registration with tokens</li>
            <li>REST API for article publishing</li>
          </ul>`,
        installation: `<ol>
            <li>Upload the plugin files to <code>/wp-content/plugins/link-manager-widget</code></li>
            <li>Activate the plugin through the 'Plugins' screen in WordPress</li>
            <li>Go to Settings → Link Manager Widget to configure</li>
            <li>Enter your API key or use registration token</li>
          </ol>`,
        changelog: changelog,
        faq: `<h4>How do I get an API key?</h4>
          <p>Contact your Link Manager administrator to get a registration token, or request an API key directly.</p>
          <h4>Why are links not showing?</h4>
          <p>Check that your API key is correct and that you have placed content assigned to your site in the Link Manager dashboard.</p>`
      },
      banners: {
        low: `${baseUrl}/images/plugin-banner-772x250.jpg`,
        high: `${baseUrl}/images/plugin-banner-1544x500.jpg`
      },
      icons: {
        '1x': `${baseUrl}/images/plugin-icon-128x128.png`,
        '2x': `${baseUrl}/images/plugin-icon-256x256.png`
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error getting plugin info:', error);
    res.status(500).json({ error: 'Failed to get plugin info' });
  }
};

/**
 * Download plugin ZIP
 * GET /api/plugin-updates/download
 *
 * Serves the plugin ZIP file for WordPress to install
 */
const downloadPlugin = async (req, res) => {
  try {
    const zipPath = path.join(__dirname, '../../backend/build/link-manager-widget.zip');

    // Check if ZIP file exists
    if (!fs.existsSync(zipPath)) {
      logger.error('Plugin ZIP not found at:', zipPath);
      return res.status(404).json({ error: 'Plugin package not found' });
    }

    // Get file stats
    const stats = fs.statSync(zipPath);

    // Log download
    logger.info('Plugin download requested', {
      version: PLUGIN_INFO.version,
      fileSize: stats.size,
      clientIp: req.ip
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="link-manager-widget-${PLUGIN_INFO.version}.zip"`
    );
    res.setHeader('Content-Length', stats.size);

    // Stream the file
    const stream = fs.createReadStream(zipPath);
    stream.pipe(res);

    stream.on('error', (err) => {
      logger.error('Error streaming plugin ZIP:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download plugin' });
      }
    });
  } catch (error) {
    logger.error('Error downloading plugin:', error);
    res.status(500).json({ error: 'Failed to download plugin' });
  }
};

/**
 * Compare two version strings
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

/**
 * Simple markdown to HTML converter for changelog
 */
function markdownToHtml(markdown) {
  return (
    markdown
      // Headers
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Lists
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      // Wrap consecutive li items in ul
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      // Code blocks
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Paragraphs (lines that aren't already wrapped)
      .replace(/^(?!<[hul]|<li)(.+)$/gm, '<p>$1</p>')
      // Clean up empty paragraphs
      .replace(/<p>\s*<\/p>/g, '')
      // Horizontal rules
      .replace(/^---$/gm, '<hr>')
  );
}

module.exports = {
  checkForUpdates,
  getPluginInfo,
  downloadPlugin
};
