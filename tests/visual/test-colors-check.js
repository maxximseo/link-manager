/**
 * Проверка ФАКТИЧЕСКИХ цветов в таблице
 */

const puppeteer = require('puppeteer');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
  },
  projectId: 1218
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testColors() {
  console.log('🎨 ПРОВЕРКА ЦВЕТОВ В ТАБЛИЦЕ\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // Login
    await page.goto(CONFIG.baseUrl + '/login.html', { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // Load page
    await page.goto(CONFIG.baseUrl + '/project-detail.html?id=' + CONFIG.projectId, {
      waitUntil: 'networkidle2'
    });
    await sleep(3000);

    // Получаем ВСЕ цвета из первой строки таблицы
    const colors = await page.evaluate(() => {
      const row = document.querySelector('.modern-table tbody tr');
      if (!row) return null;

      const cells = row.querySelectorAll('td');
      const result = {};

      // ID (колонка 2)
      const idSpan = cells[1]?.querySelector('span');
      if (idSpan) {
        const style = window.getComputedStyle(idSpan);
        result.id = {
          color: style.color,
          fontWeight: style.fontWeight,
          text: idSpan.textContent
        };
      }

      // Анкор (колонка 3)
      const anchorSpan = cells[2]?.querySelector('span');
      if (anchorSpan) {
        const style = window.getComputedStyle(anchorSpan);
        result.anchor = {
          color: style.color,
          fontWeight: style.fontWeight,
          fontSize: style.fontSize,
          text: anchorSpan.textContent.substring(0, 30)
        };
      }

      // HTML контекст (колонка 4)
      const contextDiv = cells[3]?.querySelector('div');
      if (contextDiv) {
        const style = window.getComputedStyle(contextDiv);
        result.htmlContext = {
          color: style.color,
          fontSize: style.fontSize
        };

        // Подсвеченный анкор внутри контекста
        const highlight = contextDiv.querySelector('.anchor-highlight');
        if (highlight) {
          const hStyle = window.getComputedStyle(highlight);
          result.anchorHighlight = {
            color: hStyle.color,
            fontWeight: hStyle.fontWeight,
            fontSize: hStyle.fontSize,
            text: highlight.textContent.substring(0, 30)
          };
        }
      }

      // Использований (колонка 5)
      const usageSpan = cells[4]?.querySelector('span');
      if (usageSpan) {
        const style = window.getComputedStyle(usageSpan);
        result.usage = {
          color: style.color,
          text: usageSpan.textContent
        };
      }

      return result;
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 ФАКТИЧЕСКИЕ ЦВЕТА (computed styles)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Функция для конвертации rgb в hex
    const rgbToHex = rgb => {
      const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!match) return rgb;
      const [, r, g, b] = match;
      return '#' + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    };

    if (colors) {
      console.log('1️⃣ ID колонка:');
      console.log(`   Цвет: ${colors.id?.color} (${rgbToHex(colors.id?.color)})`);
      console.log(`   Font-weight: ${colors.id?.fontWeight}`);
      console.log(`   Текст: "${colors.id?.text}"`);
      console.log('   Ожидаемый: #2563eb (синий)\n');

      console.log('2️⃣ Анкор колонка:');
      console.log(`   Цвет: ${colors.anchor?.color} (${rgbToHex(colors.anchor?.color)})`);
      console.log(`   Font-weight: ${colors.anchor?.fontWeight}`);
      console.log(`   Font-size: ${colors.anchor?.fontSize}`);
      console.log(`   Текст: "${colors.anchor?.text}"`);
      console.log('   Ожидаемый: #111827 (черный), font-weight: 500\n');

      console.log('3️⃣ HTML контекст (общий текст):');
      console.log(`   Цвет: ${colors.htmlContext?.color} (${rgbToHex(colors.htmlContext?.color)})`);
      console.log('   Ожидаемый: #4b5563 (серый)\n');

      console.log('4️⃣ Подсвеченный анкор в контексте:');
      console.log(
        `   Цвет: ${colors.anchorHighlight?.color} (${rgbToHex(colors.anchorHighlight?.color)})`
      );
      console.log(`   Font-weight: ${colors.anchorHighlight?.fontWeight}`);
      console.log(`   Font-size: ${colors.anchorHighlight?.fontSize}`);
      console.log(`   Текст: "${colors.anchorHighlight?.text}"`);
      console.log('   Ожидаемый: #2563eb (синий), font-weight: 500\n');

      console.log('5️⃣ Использований колонка:');
      console.log(`   Цвет: ${colors.usage?.color} (${rgbToHex(colors.usage?.color)})`);
      console.log(`   Текст: "${colors.usage?.text}"`);
      console.log('   Ожидаемый: #4b5563 (серый)\n');
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 СРАВНЕНИЕ С РЕФЕРЕНСОМ (React)');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Референс React:');
    console.log('  ID: text-blue-600 = #2563eb');
    console.log('  Анкор: text-gray-900 font-medium = #111827, weight 500');
    console.log('  HTML контекст: text-gray-600 = #4b5563');
    console.log('  Подсветка анкора: text-blue-600 font-medium = #2563eb, weight 500');
    console.log('  Использований: text-gray-600 = #4b5563\n');

    // Скриншот первых строк
    const tableEl = await page.$('.modern-table');
    if (tableEl) {
      await tableEl.screenshot({
        path: 'tests/visual/screenshots/colors-check.png'
      });
      console.log('📸 Скриншот сохранен: colors-check.png');
    }
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    await browser.close();
    console.log('\n🏁 Тест завершен');
  }
}

testColors().catch(console.error);
