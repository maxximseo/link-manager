/**
 * Sentry Instrumentation
 * Must be imported before any other modules
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/node/
 */

const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: require('../package.json').version,

    // Send default PII data (IP addresses)
    sendDefaultPii: true,

    // Performance monitoring - 10% in production, 100% in development
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Don't send events in test environment
    beforeSend(event) {
      if (process.env.NODE_ENV === 'test') {
        return null;
      }
      return event;
    }
  });

  console.log('✅ Sentry initialized');
} else {
  console.log('⚠️  Sentry not configured (SENTRY_DSN not set)');
}

module.exports = Sentry;
