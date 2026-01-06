/**
 * Environment Variables Validation
 * Fail-fast approach: server should crash at startup if config is wrong
 */

const REQUIRED_VARS = ['DATABASE_URL', 'JWT_SECRET'];

const OPTIONAL_WARNINGS = [
  { key: 'SENTRY_DSN', message: 'Sentry not configured - error tracking disabled' },
  { key: 'REDIS_HOST', message: 'Redis not configured - caching disabled' },
  { key: 'BACKUP_ENCRYPTION_KEY', message: 'Backup encryption key not set - backups disabled' }
];

/**
 * Validate required environment variables
 * @throws {Error} If any required variable is missing
 */
function validateEnv() {
  const errors = [];
  const warnings = [];

  // Check required variables
  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET) {
    const secret = process.env.JWT_SECRET;

    // Length check
    if (secret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters');
    }

    // Entropy check - avoid repetitive secrets like "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const uniqueChars = new Set(secret).size;
    if (uniqueChars < 10) {
      errors.push('JWT_SECRET has low entropy (too repetitive) - use a more random value');
    }
  }

  // Check DATABASE_URL format
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
      errors.push('DATABASE_URL must start with postgres:// or postgresql://');
    }
  }

  // Collect warnings for optional but recommended variables
  for (const { key, message } of OPTIONAL_WARNINGS) {
    if (!process.env[key]) {
      warnings.push(message);
    }
  }

  // Output results
  if (errors.length > 0) {
    console.error('\n');
    console.error('='.repeat(60));
    console.error('  ENVIRONMENT VALIDATION FAILED');
    console.error('='.repeat(60));
    console.error('\nErrors:');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\n');
    console.error('Please fix these issues in your .env file and restart.');
    console.error('='.repeat(60));
    console.error('\n');
    process.exit(1);
  }

  // Print warnings (non-fatal)
  if (warnings.length > 0) {
    console.warn('\nEnvironment warnings:');
    warnings.forEach(warn => console.warn(`  - ${warn}`));
    console.warn('');
  }

  console.log('Environment validation passed');
}

module.exports = validateEnv;
