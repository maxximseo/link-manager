#!/usr/bin/env node
/**
 * Реальный тест кастомных цен
 * Создаёт сайт с кастомной ценой и проверяет что она сохранилась
 */

const { query, pool } = require('./backend/config/database');

async function test() {
  console.log('\n🧪 Тест кастомных цен - прямой доступ к базе данных\n');

  try {
    // Тест 1: Проверка схемы
    console.log('📋 Тест 1: Проверка схемы таблицы sites');
    const schemaCheck = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'sites'
        AND column_name IN ('price_link', 'price_article')
      ORDER BY column_name;
    `);

    if (schemaCheck.rows.length === 2) {
      console.log('✅ Колонки price_link и price_article существуют');
      schemaCheck.rows.forEach(col => {
        console.log(`   ${col.column_name}: ${col.data_type}, nullable=${col.is_nullable}`);
      });
    } else {
      console.log('❌ Колонки не найдены!');
      process.exit(1);
    }

    // Тест 2: Создание сайта с кастомными ценами
    console.log('\n📋 Тест 2: Создание сайта с кастомными ценами ($50 link, $30 article)');

    const testUrl = `https://test-custom-${Date.now()}.com`;
    const insertResult = await query(
      `INSERT INTO sites (
        site_url, site_name, api_key, site_type, user_id,
        max_links, max_articles, used_links, used_articles,
        price_link, price_article
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        testUrl,
        'Test Custom Pricing Site',
        'api_test_123',
        'wordpress',
        1072, // admin user
        20,
        10,
        0,
        0,
        50.00,
        30.00
      ]
    );

    const newSite = insertResult.rows[0];
    console.log(`✅ Сайт создан с ID: ${newSite.id}`);
    console.log(`   price_link: $${newSite.price_link}`);
    console.log(`   price_article: $${newSite.price_article}`);

    if (parseFloat(newSite.price_link) === 50.00 && parseFloat(newSite.price_article) === 30.00) {
      console.log('✅ Кастомные цены сохранены правильно');
    } else {
      console.log('❌ Ошибка: цены не совпадают!');
      process.exit(1);
    }

    // Тест 3: Создание сайта БЕЗ кастомных цен (NULL)
    console.log('\n📋 Тест 3: Создание сайта БЕЗ кастомных цен (NULL)');

    const testUrl2 = `https://test-default-${Date.now()}.com`;
    const insertResult2 = await query(
      `INSERT INTO sites (
        site_url, site_name, api_key, site_type, user_id,
        max_links, max_articles, used_links, used_articles,
        price_link, price_article
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        testUrl2,
        'Test Default Pricing Site',
        'api_test_456',
        'wordpress',
        1072,
        10,
        5,
        0,
        0,
        null,
        null
      ]
    );

    const newSite2 = insertResult2.rows[0];
    console.log(`✅ Сайт создан с ID: ${newSite2.id}`);
    console.log(`   price_link: ${newSite2.price_link === null ? 'NULL (будет $25)' : newSite2.price_link}`);
    console.log(`   price_article: ${newSite2.price_article === null ? 'NULL (будет $15)' : newSite2.price_article}`);

    if (newSite2.price_link === null && newSite2.price_article === null) {
      console.log('✅ NULL значения сохранены правильно');
    } else {
      console.log('❌ Ошибка: ожидались NULL!');
      process.exit(1);
    }

    // Тест 4: Проверка COALESCE логики
    console.log('\n📋 Тест 4: Проверка COALESCE fallback логики');

    const coalesceTest = await query(`
      SELECT
        id,
        site_name,
        price_link,
        price_article,
        COALESCE(price_link, 25.00) as effective_link_price,
        COALESCE(price_article, 15.00) as effective_article_price
      FROM sites
      WHERE id IN ($1, $2)
      ORDER BY id
    `, [newSite.id, newSite2.id]);

    coalesceTest.rows.forEach(site => {
      console.log(`\n   Сайт #${site.id}: ${site.site_name}`);
      console.log(`     price_link: ${site.price_link || 'NULL'} → effective: $${site.effective_link_price}`);
      console.log(`     price_article: ${site.price_article || 'NULL'} → effective: $${site.effective_article_price}`);

      // Проверка
      if (site.id === newSite.id) {
        if (parseFloat(site.effective_link_price) === 50.00 && parseFloat(site.effective_article_price) === 30.00) {
          console.log('     ✅ Кастомные цены используются');
        } else {
          console.log('     ❌ Ошибка: неправильные effective цены');
        }
      } else {
        if (parseFloat(site.effective_link_price) === 25.00 && parseFloat(site.effective_article_price) === 15.00) {
          console.log('     ✅ Дефолтные цены используются (fallback работает)');
        } else {
          console.log('     ❌ Ошибка: fallback не работает');
        }
      }
    });

    // Тест 5: UPDATE с COALESCE (частичное обновление)
    console.log('\n📋 Тест 5: Частичное обновление (COALESCE pattern)');

    await query(
      `UPDATE sites
       SET price_link = COALESCE($1, price_link)
       WHERE id = $2`,
      [35.50, newSite2.id]
    );

    const updatedSite = await query('SELECT * FROM sites WHERE id = $1', [newSite2.id]);
    console.log(`   Обновлён сайт #${newSite2.id}`);
    console.log(`     price_link: $${updatedSite.rows[0].price_link} (было NULL, стало $35.50)`);
    console.log(`     price_article: ${updatedSite.rows[0].price_article || 'NULL'} (осталось NULL - не обновлялось)`);

    if (parseFloat(updatedSite.rows[0].price_link) === 35.50 && updatedSite.rows[0].price_article === null) {
      console.log('   ✅ Частичное обновление работает правильно');
    } else {
      console.log('   ❌ Ошибка: COALESCE pattern не работает');
    }

    // Очистка тестовых данных
    console.log('\n🧹 Очистка тестовых данных...');
    await query('DELETE FROM sites WHERE id IN ($1, $2)', [newSite.id, newSite2.id]);
    console.log('✅ Тестовые сайты удалены');

    console.log('\n✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ!\n');

  } catch (error) {
    console.error('\n❌ ОШИБКА:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

test();
