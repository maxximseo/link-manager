/**
 * Change user password in database
 * Usage: node database/change-password.js
 */

require('dotenv').config({ path: './backend/.env' });
const bcrypt = require('bcryptjs');
const { query, pool } = require('../backend/config/database');

const USERNAME = 'maximator';
const NEW_PASSWORD = 'Sv^xc7iwbV75AU6!';

async function changePassword() {
  console.log('='.repeat(50));
  console.log('PASSWORD CHANGE SCRIPT');
  console.log('='.repeat(50));

  try {
    // 1. Check user exists
    console.log(`\n1. Checking user "${USERNAME}" exists...`);
    const userResult = await query('SELECT id, username FROM users WHERE username = $1', [USERNAME]);

    if (userResult.rows.length === 0) {
      console.error(`   User "${USERNAME}" not found!`);
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log(`   Found user: ID=${user.id}, username=${user.username}`);

    // 2. Hash new password
    console.log('\n2. Hashing new password...');
    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, bcryptRounds);
    console.log(`   Hashed with ${bcryptRounds} rounds`);

    // 3. Update password in database
    console.log('\n3. Updating password in database...');
    await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [
      hashedPassword,
      user.id
    ]);
    console.log('   Password updated successfully!');

    // 4. Verify new password works
    console.log('\n4. Verifying new password...');
    const verifyResult = await query('SELECT password FROM users WHERE id = $1', [user.id]);
    const storedHash = verifyResult.rows[0].password;
    const isValid = await bcrypt.compare(NEW_PASSWORD, storedHash);

    if (isValid) {
      console.log('   Password verification: SUCCESS');
    } else {
      console.error('   Password verification: FAILED!');
      process.exit(1);
    }

    console.log('\n' + '='.repeat(50));
    console.log('PASSWORD CHANGED SUCCESSFULLY!');
    console.log('='.repeat(50));
    console.log(`\nNew password for "${USERNAME}": ${NEW_PASSWORD}`);
    console.log('\nDon\'t forget to update .credentials.local file!');
  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

changePassword();
