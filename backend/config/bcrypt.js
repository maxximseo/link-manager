const bcrypt = require('bcrypt');
const logger = require('./logger');

async function warmupBcrypt() {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '8');
  try {
    await bcrypt.hash('warmup', rounds);
    logger.info(`Bcrypt warmed up (${rounds} rounds)`);
  } catch (error) {
    logger.error('Bcrypt warmup failed:', error);
  }
}

module.exports = { warmupBcrypt };
