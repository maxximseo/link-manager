/**
 * Puppeteer Visual Testing Script for Placements Page
 *
 * This script takes screenshots of the placements page to verify styling.
 * It captures the page in different states to validate UI components.
 *
 * Usage: node tests/visual/screenshot-placements.js
 *
 * Saves screenshots to: tests/visual/screenshots/
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Configuration
const BASE_URL = 'http://localhost:3003';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const CREDENTIALS = {
  username: 'maximator',
  password: '*8NKDb6fXXLVu1h*'
};

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function takeScreenshots() {
  console.log('🚀 Starting Puppeteer visual test...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Set viewport for consistent screenshots
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // Step 1: Login
    console.log('📝 Logging in...');
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle0' });

    await page.type('#username', CREDENTIALS.username);
    await page.type('#password', CREDENTIALS.password);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log('✅ Login successful\n');

    // Step 2: Navigate to placements page
    console.log('📄 Navigating to placements page...');
    await page.goto(`${BASE_URL}/placements.html`, { waitUntil: 'networkidle0' });

    // Wait for page elements to load
    await page.waitForSelector('.placements-card', { timeout: 10000 });
    console.log('✅ Placements page loaded\n');

    // Step 3: Take full page screenshot
    console.log('📸 Taking full page screenshot...');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'placements-full.png'),
      fullPage: true
    });
    console.log('   Saved: placements-full.png\n');

    // Step 4: Check for unified block structure (NEW)
    console.log('🔍 Checking unified block structure...');
    const unifiedCardStyles = await page.evaluate(() => {
      // Find the unified card (first .placements-card on page)
      const card = document.querySelector('.placements-card');
      if (!card) return { error: 'No .placements-card found' };

      const cardStyles = window.getComputedStyle(card);

      // Find sections within the unified card
      const sections = card.querySelectorAll('.placements-unified-section');
      const sectionWithBorder = card.querySelector('.placements-unified-section.section-with-border');

      let borderBottomInfo = 'N/A';
      if (sectionWithBorder) {
        const sectionStyles = window.getComputedStyle(sectionWithBorder);
        borderBottomInfo = sectionStyles.borderBottom;
      }

      // Check section titles
      const sectionTitles = card.querySelectorAll('.placements-section-title');
      const titleTexts = Array.from(sectionTitles).map(t => t.textContent.trim());

      return {
        cardBorder: cardStyles.border,
        cardBorderRadius: cardStyles.borderRadius,
        sectionsCount: sections.length,
        sectionBorderBottom: borderBottomInfo,
        sectionTitles: titleTexts
      };
    });

    console.log('   Unified Card Structure:');
    if (unifiedCardStyles.error) {
      console.log(`   ❌ Error: ${unifiedCardStyles.error}`);
    } else {
      console.log(`   - Card border: ${unifiedCardStyles.cardBorder}`);
      console.log(`   - Card border-radius: ${unifiedCardStyles.cardBorderRadius}`);
      console.log(`   - Sections count: ${unifiedCardStyles.sectionsCount}`);
      console.log(`   - Section border-bottom (divider): ${unifiedCardStyles.sectionBorderBottom}`);
      console.log(`   - Section titles: ${unifiedCardStyles.sectionTitles.join(' | ')}`);

      // Validate structure matches React reference
      const is1pxBorder = unifiedCardStyles.cardBorder.includes('1px');
      const hasTwoSections = unifiedCardStyles.sectionsCount === 2;
      const hasBorderDivider = unifiedCardStyles.sectionBorderBottom.includes('1px');

      console.log('\n   ✓ Validation:');
      console.log(`   ${is1pxBorder ? '✅' : '❌'} Border is 1px (React: border border-gray-200)`);
      console.log(`   ${hasTwoSections ? '✅' : '❌'} Has 2 sections (unified block)`);
      console.log(`   ${hasBorderDivider ? '✅' : '❌'} Has 1px border-bottom divider`);
    }
    console.log('');

    // Step 5: Screenshot of the unified card block
    console.log('📸 Taking screenshot of unified card block...');
    const unifiedCard = await page.$('.placements-card');
    if (unifiedCard) {
      await unifiedCard.screenshot({
        path: path.join(SCREENSHOT_DIR, 'placements-unified-block.png')
      });
      console.log('   Saved: placements-unified-block.png\n');
    }

    // Step 6: Click "Distributed" option to show slider
    console.log('🎚️ Activating distributed publication to show slider...');
    const distributedRadio = await page.$('#publishDistributed');
    if (distributedRadio) {
      await distributedRadio.click();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Screenshot of slider section
      console.log('📸 Taking screenshot of slider section...');
      const sliderSection = await page.$('#distributedPeriodDiv');
      if (sliderSection) {
        await sliderSection.screenshot({
          path: path.join(SCREENSHOT_DIR, 'placements-slider-section.png')
        });
        console.log('   Saved: placements-slider-section.png\n');
      }

      // Screenshot of zone cards
      console.log('📸 Taking screenshot of zone cards...');
      const zoneCards = await page.$('.zone-cards');
      if (zoneCards) {
        await zoneCards.screenshot({
          path: path.join(SCREENSHOT_DIR, 'placements-zone-cards.png')
        });
        console.log('   Saved: placements-zone-cards.png\n');
      }
    }

    // Step 7: Take screenshot of top section
    console.log('📸 Taking screenshot of top section...');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'placements-top-section.png'),
      clip: {
        x: 0,
        y: 0,
        width: 1920,
        height: 800
      }
    });
    console.log('   Saved: placements-top-section.png\n');

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Visual test completed successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`\n📁 Screenshots saved to: ${SCREENSHOT_DIR}`);
    console.log('\nFiles created:');
    const files = fs.readdirSync(SCREENSHOT_DIR);
    files.forEach(file => {
      const stats = fs.statSync(path.join(SCREENSHOT_DIR, file));
      console.log(`   - ${file} (${Math.round(stats.size / 1024)}KB)`);
    });

  } catch (error) {
    console.error('❌ Error during visual test:', error.message);

    // Take error screenshot
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'error-state.png'),
      fullPage: true
    });
    console.log('   Error screenshot saved: error-state.png');

    throw error;
  } finally {
    await browser.close();
    console.log('\n🏁 Browser closed');
  }
}

// Run the test
takeScreenshots().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
