/**
 * IP Address Utility Functions
 *
 * IMPORTANT: Server has direct access (no CDN/proxy in front)
 * Therefore X-Forwarded-For header is NEVER trusted
 * All IP detection uses direct connection IP only
 *
 * If you add Cloudflare/nginx later, update app.js trust proxy setting
 * and this file may need to parse X-Forwarded-For appropriately
 */

/**
 * Get client IP from direct connection
 * Ignores X-Forwarded-For header (can be spoofed without proxy)
 *
 * @param {object} req - Express request object
 * @returns {string} - Client IP address
 */
function getClientIP(req) {
  // With trust proxy = false, req.ip is the real connection IP
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  // Normalize IPv6-mapped IPv4 (::ffff:192.168.1.1 → 192.168.1.1)
  return ip.replace(/^::ffff:/, '');
}

module.exports = { getClientIP };
