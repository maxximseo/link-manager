const { query } = require('./backend/config/database');

async function test() {
  try {
    // 1. Проверим пользователя
    const userResult = await query(
      `SELECT id, username, email, balance FROM users WHERE username = $1 OR email = $1`,
      ['mmmmm135788@gmail.com']
    );
    console.log('Поиск пользователя mmmmm135788@gmail.com:', userResult.rows);

    // 2. Проверим сайт claudiapages.com
    const siteResult = await query(
      `SELECT id, site_url, user_id, max_links, used_links FROM sites WHERE site_url ILIKE '%claudiapages.com%'`
    );
    console.log('\nСайт claudiapages.com:', siteResult.rows);

    // 3. Проверим есть ли активные аренды на этом сайте
    if (siteResult.rows.length > 0) {
      const siteId = siteResult.rows[0].id;
      const rentalsResult = await query(
        `SELECT * FROM site_slot_rentals WHERE site_id = $1`,
        [siteId]
      );
      console.log('\nАренды на сайте:', rentalsResult.rows);
    }

    // 4. Проверим таблицу slot_rentals существует
    const tableResult = await query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('slot_rentals', 'site_slot_rentals')
    `);
    console.log('\nТаблицы аренды:', tableResult.rows);
  } catch (error) {
    console.error('Ошибка:', error.message);
  }
  process.exit(0);
}

test();
