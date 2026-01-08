/**
 * Test Credentials Loader
 *
 * Loads test credentials from .credentials.local file
 * NEVER commit credentials to git - this file reads them from local storage
 *
 * Usage:
 *   const { loadCredentials } = require('../utils/credentials');
 *   const credentials = loadCredentials();
 *   // credentials.username, credentials.password
 */

const fs = require('fs');
const path = require('path');

function loadCredentials() {
  const credFile = path.join(__dirname, '../../.credentials.local');

  if (!fs.existsSync(credFile)) {
    throw new Error(
      'Missing .credentials.local file.\n' +
        'Create it in project root with:\n' +
        '  TEST_USERNAME=your_test_username\n' +
        '  TEST_PASSWORD=your_test_password\n' +
        'See README for details.'
    );
  }

  const content = fs.readFileSync(credFile, 'utf8');
  const creds = {};

  // Parse key=value format
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      creds[key] = value;
    }
  }

  // Validate required credentials
  if (!creds.TEST_USERNAME) {
    throw new Error('TEST_USERNAME not found in .credentials.local');
  }
  if (!creds.TEST_PASSWORD) {
    throw new Error('TEST_PASSWORD not found in .credentials.local');
  }

  return {
    username: creds.TEST_USERNAME,
    password: creds.TEST_PASSWORD
  };
}

module.exports = { loadCredentials };
