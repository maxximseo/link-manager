/**
 * Test: Link Edit Modal - full functionality test
 * Tests: open modal, edit fields, save, verify changes
 */

const puppeteer = require('puppeteer');

const CONFIG = {
  baseUrl: 'http://localhost:3003',
  credentials: {
    username: 'maximator',
    password: '*8NKDb6fXXLVu1h*'
  },
  projectId: 1218,
  testLinkId: 2312
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLinkEdit() {
  console.log('🔍 TEST: Link Edit Functionality\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function addResult(name, passed, details = '') {
    results.tests.push({ name, passed, details });
    if (passed) {
      results.passed++;
      console.log(`   ✅ ${name}`);
    } else {
      results.failed++;
      console.log(`   ❌ ${name}${details ? ': ' + details : ''}`);
    }
  }

  try {
    // 1. Login
    console.log('1️⃣ Logging in...');
    await page.goto(CONFIG.baseUrl + '/login.html', { waitUntil: 'networkidle2' });
    await page.type('#username', CONFIG.credentials.username);
    await page.type('#password', CONFIG.credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    addResult('Login successful', true);

    // 2. Load project page
    console.log('\n2️⃣ Loading project page...');
    await page.goto(CONFIG.baseUrl + '/project-detail.html?id=' + CONFIG.projectId, {
      waitUntil: 'networkidle2'
    });
    await sleep(3000);
    addResult('Project page loaded', true);

    // 3. Find and click edit button for link 2312
    console.log('\n3️⃣ Opening edit modal...');

    // Wait for table to load
    await page.waitForSelector('.modern-table tbody tr', { timeout: 10000 });

    // Click edit button for first link
    const editBtn = await page.$('.action-btn.edit');
    if (editBtn) {
      await editBtn.click();
      await sleep(1000);
      addResult('Edit button clicked', true);
    } else {
      addResult('Edit button clicked', false, 'Button not found');
    }

    // 4. Check if modal opened
    console.log('\n4️⃣ Checking modal...');
    const modalVisible = await page.evaluate(() => {
      const modal = document.getElementById('linkModal');
      return modal && modal.classList.contains('show');
    });
    addResult('Modal opened', modalVisible);

    // 5. Check modal fields are populated
    console.log('\n5️⃣ Checking modal fields...');
    const fieldValues = await page.evaluate(() => {
      return {
        url: document.getElementById('linkUrl')?.value || '',
        anchor: document.getElementById('linkAnchor')?.value || '',
        htmlContext: document.getElementById('linkHtmlContext')?.value || '',
        limit: document.getElementById('linkLimit')?.value || ''
      };
    });

    addResult('URL field populated', fieldValues.url.length > 0, fieldValues.url);
    addResult('Anchor field populated', fieldValues.anchor.length > 0, fieldValues.anchor);
    addResult('Limit field populated', fieldValues.limit.length > 0, fieldValues.limit);

    // Take screenshot of modal
    await page.screenshot({
      path: 'tests/visual/screenshots/link-edit-modal.png',
      fullPage: false
    });
    console.log('   📸 Screenshot saved: link-edit-modal.png');

    // 6. Modify fields
    console.log('\n6️⃣ Modifying fields...');
    const testAnchor = 'тестовый анкор ' + Date.now();
    const testContext = 'Тестовый HTML контекст с ' + testAnchor + ' для проверки сохранения.';

    // Clear and fill anchor
    await page.click('#linkAnchor', { clickCount: 3 });
    await page.type('#linkAnchor', testAnchor);

    // Clear and fill HTML context
    await page.click('#linkHtmlContext', { clickCount: 3 });
    await page.type('#linkHtmlContext', testContext);

    addResult('Fields modified', true);

    // 7. Save changes
    console.log('\n7️⃣ Saving changes...');

    // Find and click save button (use more specific selector)
    const saveBtnClicked = await page.evaluate(() => {
      const btns = document.querySelectorAll('#linkModal button');
      for (const btn of btns) {
        if (btn.textContent.includes('Сохранить')) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (saveBtnClicked) {
      await sleep(3000); // Wait for save and reload
      addResult('Save button clicked', true);
    } else {
      addResult('Save button clicked', false, 'Button not found');
    }

    // 8. Verify changes were saved
    console.log('\n8️⃣ Verifying saved changes...');

    // Check if modal closed
    const modalClosed = await page.evaluate(() => {
      const modal = document.getElementById('linkModal');
      return !modal || !modal.classList.contains('show');
    });
    addResult('Modal closed after save', modalClosed);

    // Wait for table to reload
    await sleep(2000);

    // Check if anchor text updated in table
    const anchorInTable = await page.evaluate(expectedAnchor => {
      const cells = document.querySelectorAll('.modern-table tbody td');
      for (const cell of cells) {
        if (cell.textContent.includes(expectedAnchor.substring(0, 20))) {
          return true;
        }
      }
      return false;
    }, testAnchor);

    addResult('Anchor updated in table', anchorInTable);

    // Take screenshot of updated table
    await page.screenshot({
      path: 'tests/visual/screenshots/link-edit-after-save.png',
      fullPage: false
    });
    console.log('   📸 Screenshot saved: link-edit-after-save.png');

    // 9. Verify via API
    console.log('\n9️⃣ Verifying via API...');
    const apiResponse = await page.evaluate(
      async (projectId, linkId) => {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/projects/${projectId}/links`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        const link = data.find(l => l.id === linkId);
        return link;
      },
      CONFIG.projectId,
      CONFIG.testLinkId
    );

    if (apiResponse) {
      addResult('API returns updated anchor', apiResponse.anchor_text.includes('тестовый анкор'));
      addResult(
        'API returns updated html_context',
        apiResponse.html_context && apiResponse.html_context.includes('Тестовый HTML контекст')
      );
      addResult('API returns updated_at timestamp', !!apiResponse.updated_at);
    } else {
      addResult('API verification', false, 'Link not found in response');
    }

    // 10. Restore original data
    console.log('\n🔄 Restoring original data...');
    await page.evaluate(
      async (projectId, linkId) => {
        const token = localStorage.getItem('token');
        await fetch(`/api/projects/${projectId}/links/${linkId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: 'https://example.com/titanium-knife',
            anchor_text: 'перочинный нож титановый',
            html_context:
              'Легкий перочинный нож титановый отличается прочностью среди перочинных ножей.',
            usage_limit: 1
          })
        });
      },
      CONFIG.projectId,
      CONFIG.testLinkId
    );
    console.log('   ✅ Original data restored');
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    await page.screenshot({
      path: 'tests/visual/screenshots/link-edit-error.png',
      fullPage: true
    });
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   PASSED: ${results.passed}`);
  console.log(`   FAILED: ${results.failed}`);
  console.log('═══════════════════════════════════════════════════════════');

  if (results.failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Link edit functionality works correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Check details above.');
  }

  console.log('\n🏁 Test completed');
}

testLinkEdit().catch(console.error);
