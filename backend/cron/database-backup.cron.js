/**
 * Full Backup Cron Job (Database + Files)
 * Runs every 12 hours to backup database and files to DigitalOcean Spaces
 */

const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const logger = require('../config/logger');

const DB_SCRIPT_PATH = path.join(__dirname, '../../scripts/backup-database.sh');
const FILES_SCRIPT_PATH = path.join(__dirname, '../../scripts/backup-files.sh');

/**
 * Execute a backup script
 */
async function runScript(scriptPath, type) {
  const startTime = Date.now();
  logger.info(`Starting scheduled ${type} backup...`);

  return new Promise((resolve, reject) => {
    exec(
      scriptPath,
      {
        cwd: path.join(__dirname, '../..'),
        env: { ...process.env },
        timeout: 600000 // 10 minutes timeout
      },
      (error, stdout, stderr) => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        if (error) {
          logger.error(`${type} backup failed`, {
            error: error.message,
            stderr,
            duration: `${duration}s`
          });
          reject(error);
          return;
        }

        // Parse output to get backup file info
        const match = stdout.match(/File: (.+\.enc)/);
        const backupFile = match ? match[1] : 'unknown';

        logger.info(`${type} backup completed successfully`, {
          duration: `${duration}s`,
          backupFile
        });

        resolve({ success: true, duration, backupFile, type });
      }
    );
  });
}

/**
 * Run full backup (database + files)
 */
async function runFullBackup() {
  const results = { database: null, files: null };

  // Database backup
  try {
    results.database = await runScript(DB_SCRIPT_PATH, 'database');
  } catch (error) {
    results.database = { success: false, error: error.message };
  }

  // Files backup
  try {
    results.files = await runScript(FILES_SCRIPT_PATH, 'files');
  } catch (error) {
    results.files = { success: false, error: error.message };
  }

  return results;
}

/**
 * Initialize full backup cron job (database + files)
 * Runs at 00:00 and 12:00 (every 12 hours)
 */
function initDatabaseBackupCron() {
  // Check if backup is enabled
  if (!process.env.DO_SPACES_KEY || !process.env.DO_SPACES_SECRET) {
    logger.warn('Backup cron disabled: DO_SPACES credentials not configured');
    return;
  }

  if (!process.env.BACKUP_ENCRYPTION_KEY) {
    logger.warn('Backup cron disabled: BACKUP_ENCRYPTION_KEY not configured');
    return;
  }

  // Schedule: At 00:00 and 12:00 every day
  // Cron expression: minute hour day month weekday
  cron.schedule(
    '0 0,12 * * *',
    async () => {
      try {
        await runFullBackup();
      } catch (error) {
        // Error already logged in runFullBackup
        // Could add alerting here (Slack, email, etc.)
      }
    },
    {
      timezone: 'UTC'
    }
  );

  logger.info(
    'Full backup cron initialized (database + files, every 12 hours at 00:00 and 12:00 UTC)'
  );
}

/**
 * Run full backup manually (for testing or on-demand)
 */
async function runManualBackup() {
  return runFullBackup();
}

/**
 * Run database backup only
 */
async function runDatabaseBackup() {
  return runScript(DB_SCRIPT_PATH, 'database');
}

/**
 * Run files backup only
 */
async function runFilesBackup() {
  return runScript(FILES_SCRIPT_PATH, 'files');
}

module.exports = {
  initDatabaseBackupCron,
  runManualBackup,
  runDatabaseBackup,
  runFilesBackup
};
