/**
 * Детальный тест: проверка колонки HTML контекст
 * Должен показать чистый текст с подсвеченным анкором (синий), а не HTML теги
 */

const puppeteer = require('puppeteer');
const { loadCredentials } = require('../utils/credentials');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: loadCredentials(),
  projectId: 1218
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testHtmlContext() {
  console.log('🔍 ДЕТАЛЬНЫЙ ТЕСТ: колонка HTML контекст\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // Login
    console.log('1️⃣ Авторизация...');
    await page.goto(CONFIG.baseUrl + '/login.html', { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('   ✅ Успешно\n');

    // Load page
    console.log('2️⃣ Загрузка проекта rezat.ru...');
    await page.goto(CONFIG.baseUrl + '/project-detail.html?id=' + CONFIG.projectId, {
      waitUntil: 'networkidle2'
    });
    await sleep(3000);
    console.log('   ✅ Страница загружена\n');

    // Получаем содержимое первых 5 ячеек HTML контекст
    console.log('3️⃣ Анализ колонки "HTML контекст":\n');

    const htmlContextCells = await page.evaluate(() => {
      const results = [];
      // Колонка HTML контекст - 4-я (index 3)
      const rows = document.querySelectorAll('.modern-table tbody tr');

      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');

        if (cells.length >= 4) {
          const idCell = cells[1]?.textContent?.trim();
          const anchorCell = cells[2]?.textContent?.trim();
          const htmlContextCell = cells[3];

          // Получаем innerHTML и textContent для сравнения
          const innerHTML = htmlContextCell?.innerHTML?.trim() || '';
          const textContent = htmlContextCell?.textContent?.trim() || '';

          // Проверяем наличие .anchor-highlight
          const hasHighlight = htmlContextCell?.querySelector('.anchor-highlight') !== null;
          const highlightText =
            htmlContextCell?.querySelector('.anchor-highlight')?.textContent || '';

          // Проверяем наличие <a href тегов в отображаемом тексте
          const hasVisibleATag =
            textContent.includes('<a href') || textContent.includes('&lt;a href');

          results.push({
            row: i + 1,
            id: idCell,
            anchor: anchorCell?.substring(0, 30),
            textContent: textContent.substring(0, 100),
            hasHighlight,
            highlightText: highlightText.substring(0, 30),
            hasVisibleATag,
            innerHTMLPreview: innerHTML.substring(0, 150)
          });
        }
      }
      return results;
    });

    htmlContextCells.forEach(cell => {
      console.log(`   Строка ${cell.row} (ID: ${cell.id}):`);
      console.log(`      Анкор: "${cell.anchor}"`);
      console.log(`      Текст в ячейке: "${cell.textContent}..."`);
      console.log(`      Есть .anchor-highlight: ${cell.hasHighlight ? '✅ ДА' : '❌ НЕТ'}`);
      console.log(`      Текст в highlight: "${cell.highlightText}"`);
      console.log(
        `      Видны HTML теги (<a href): ${cell.hasVisibleATag ? '❌ ДА - ПРОБЛЕМА!' : '✅ НЕТ - ОК'}`
      );
      console.log(`      innerHTML: ${cell.innerHTMLPreview}...`);
      console.log('');
    });

    // Скриншот первых строк таблицы
    console.log('4️⃣ Скриншот таблицы...');

    // Находим таблицу и делаем скриншот
    const tableElement = await page.$('.modern-table');
    if (tableElement) {
      await tableElement.screenshot({
        path: 'tests/visual/screenshots/html-context-detail.png'
      });
      console.log('   ✅ Сохранен: html-context-detail.png\n');
    }

    // ИТОГ
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 ИТОГ АНАЛИЗА:');
    console.log('═══════════════════════════════════════════════════════════');

    const allHaveHighlight = htmlContextCells.every(c => c.hasHighlight);
    const noneHaveVisibleTags = htmlContextCells.every(c => !c.hasVisibleATag);

    console.log(`   Подсветка анкоров: ${allHaveHighlight ? '✅ ВСЕ OK' : '❌ ПРОБЛЕМА'}`);
    console.log(`   Скрытие HTML тегов: ${noneHaveVisibleTags ? '✅ ВСЕ OK' : '❌ ТЕГИ ВИДНЫ!'}`);

    if (allHaveHighlight && noneHaveVisibleTags) {
      console.log('\n🎉 HTML контекст отображается корректно!');
    } else {
      console.log('\n⚠️ ПРОБЛЕМА: HTML контекст отображается неправильно');
    }
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    await browser.close();
    console.log('\n🏁 Тест завершен');
  }
}

testHtmlContext().catch(console.error);
