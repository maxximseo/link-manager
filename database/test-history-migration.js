const { query } = require('../backend/config/database');

async function test() {
  try {
    console.log('Adding history column...');
    await query(`ALTER TABLE site_slot_rentals ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb`);
    console.log('✅ Column added');

    console.log('Creating GIN index...');
    await query('CREATE INDEX IF NOT EXISTS idx_site_slot_rentals_history ON site_slot_rentals USING GIN (history)');
    console.log('✅ Index created');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
  process.exit(0);
}

test();
