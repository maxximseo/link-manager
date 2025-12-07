/**
 * Email Service
 * Sends email notifications for system alerts
 */

const nodemailer = require('nodemailer');
const logger = require('../config/logger');

// Create transporter - uses SMTP settings from env
let transporter = null;

/**
 * Initialize email transporter
 */
function initTransporter() {
  if (transporter) return transporter;

  // Check if SMTP is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('Email service not configured - SMTP_HOST, SMTP_USER, or SMTP_PASS missing');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  logger.info('Email transporter initialized');
  return transporter;
}

/**
 * Send email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} options.html - HTML body (optional)
 */
async function sendEmail({ to, subject, text, html }) {
  const transport = initTransporter();

  if (!transport) {
    logger.warn('Email not sent - transporter not configured', { to, subject });
    return { success: false, error: 'SMTP not configured' };
  }

  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;

    const info = await transport.sendMail({
      from,
      to,
      subject,
      text,
      html: html || text
    });

    logger.info('Email sent successfully', { to, subject, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error('Failed to send email', { to, subject, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Send alert email to admin
 * @param {string} alertType - Type of alert (error, warning, critical)
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 * @param {Object} details - Additional details
 */
async function sendAlertEmail(alertType, title, message, details = {}) {
  const adminEmail = process.env.ADMIN_EMAIL || 'morixblack@yandex.com';

  const alertColors = {
    critical: '#dc3545',
    error: '#dc3545',
    warning: '#ffc107',
    info: '#0d6efd'
  };

  const color = alertColors[alertType] || alertColors.info;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${color}; color: white; padding: 15px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">🚨 ${title}</h2>
      </div>
      <div style="background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; margin: 0 0 15px 0;">${message}</p>
        ${
          Object.keys(details).length > 0
            ? `
          <div style="background: white; padding: 15px; border-radius: 4px; border: 1px solid #dee2e6;">
            <h4 style="margin: 0 0 10px 0; color: #495057;">Детали:</h4>
            <pre style="margin: 0; font-size: 12px; overflow-x: auto;">${JSON.stringify(details, null, 2)}</pre>
          </div>
        `
            : ''
        }
        <p style="margin: 15px 0 0 0; color: #6c757d; font-size: 12px;">
          Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
        </p>
      </div>
    </div>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `[Link Manager] ${alertType.toUpperCase()}: ${title}`,
    text: `${title}\n\n${message}\n\nДетали: ${JSON.stringify(details, null, 2)}`,
    html
  });
}

/**
 * Send system health alert
 * @param {Object} metrics - System metrics
 * @param {Array} anomalies - List of detected anomalies
 */
async function sendHealthAlert(metrics, anomalies) {
  const title = 'Обнаружены аномалии системы';

  const anomalyList = anomalies.map((a) => `• ${a}`).join('\n');

  const message = `Система обнаружила следующие проблемы:\n\n${anomalyList}`;

  return sendAlertEmail('warning', title, message, {
    uptime: metrics.uptime,
    memory: metrics.memory,
    database: metrics.database,
    redis: metrics.redis,
    errors: metrics.requests?.errors
  });
}

module.exports = {
  sendEmail,
  sendAlertEmail,
  sendHealthAlert,
  initTransporter
};
