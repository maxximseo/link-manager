/**
 * Email Service
 * Sends email notifications using Resend API or SMTP fallback
 */

const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const logger = require('../config/logger');

// Initialize Resend client
let resend = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  logger.info('Resend email service initialized');
}

// SMTP fallback transporter
let transporter = null;

/**
 * Initialize SMTP transporter (fallback)
 */
function initTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  logger.info('SMTP transporter initialized');
  return transporter;
}

/**
 * Send email via Resend or SMTP
 */
async function sendEmail({ to, subject, text, html }) {
  // Use configured from address with name
  const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const fromName = process.env.RESEND_FROM_NAME || 'Serparium';
  const from = `${fromName} <${fromEmail}>`;

  // Try Resend first
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from,
        to,
        subject,
        html: html || text,
        text
      });

      if (error) {
        logger.error('Resend error', { to, subject, error });
        return { success: false, error: error.message };
      }

      logger.info('Email sent via Resend', { to, subject, id: data?.id });
      return { success: true, messageId: data?.id };
    } catch (error) {
      logger.error('Resend exception', { to, subject, error: error.message });
      // Fall through to SMTP
    }
  }

  // SMTP fallback
  const transport = initTransporter();
  if (!transport) {
    logger.warn('Email not sent - no email service configured', { to, subject });
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html: html || text
    });

    logger.info('Email sent via SMTP', { to, subject, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error('SMTP error', { to, subject, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Send verification email to new user
 */
async function sendVerificationEmail(email, token, username) {
  const appUrl = process.env.APP_URL || 'http://localhost:3003';
  const verifyUrl = `${appUrl}/verify-email?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px 16px 0 0; padding: 40px 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">
            🔗 Serparium
          </h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
            Подтверждение email
          </p>
        </div>

        <div style="background: white; padding: 40px 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #1a1a2e; margin: 0 0 20px 0; font-size: 22px;">
            Привет, ${username}! 👋
          </h2>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
            Спасибо за регистрацию в Serparium! Чтобы завершить регистрацию и начать пользоваться сервисом, пожалуйста, подтвердите свой email адрес.
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);">
              Подтвердить Email
            </a>
          </div>

          <p style="color: #718096; font-size: 14px; line-height: 1.6; margin: 25px 0 0 0;">
            Или скопируйте эту ссылку в браузер:
          </p>
          <p style="color: #667eea; font-size: 13px; word-break: break-all; background: #f7fafc; padding: 12px; border-radius: 6px; margin: 10px 0 0 0;">
            ${verifyUrl}
          </p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

          <p style="color: #a0aec0; font-size: 13px; margin: 0;">
            ⏰ Ссылка действительна 24 часа.<br>
            Если вы не регистрировались на нашем сервисе, просто проигнорируйте это письмо.
          </p>
        </div>

        <div style="text-align: center; padding: 20px;">
          <p style="color: #a0aec0; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} LinkBuilder Pro. Все права защищены.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Привет, ${username}!

Спасибо за регистрацию в LinkBuilder Pro!

Чтобы подтвердить свой email, перейдите по ссылке:
${verifyUrl}

Ссылка действительна 24 часа.

Если вы не регистрировались, просто проигнорируйте это письмо.

---
LinkBuilder Pro
  `.trim();

  return sendEmail({
    to: email,
    subject: '🔗 Подтвердите ваш email - LinkBuilder Pro',
    text,
    html
  });
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(email, token, username) {
  const appUrl = process.env.APP_URL || 'http://localhost:3003';
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 16px 16px 0 0; padding: 40px 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">
            🔐 Сброс пароля
          </h1>
        </div>

        <div style="background: white; padding: 40px 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #1a1a2e; margin: 0 0 20px 0; font-size: 22px;">
            Привет, ${username}!
          </h2>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
            Мы получили запрос на сброс пароля для вашего аккаунта. Если это были вы, нажмите кнопку ниже:
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
              Сбросить пароль
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

          <p style="color: #a0aec0; font-size: 13px; margin: 0;">
            ⏰ Ссылка действительна 1 час.<br>
            Если вы не запрашивали сброс пароля, проигнорируйте это письмо.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: '🔐 Сброс пароля - LinkBuilder Pro',
    text: `Привет, ${username}!\n\nДля сброса пароля перейдите по ссылке: ${resetUrl}\n\nСсылка действительна 1 час.`,
    html
  });
}

/**
 * Send alert email to admin
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

/**
 * Check if email service is configured
 */
function isConfigured() {
  return !!(resend || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAlertEmail,
  sendHealthAlert,
  initTransporter,
  isConfigured
};
