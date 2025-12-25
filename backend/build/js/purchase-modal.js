/**
 * Purchase Modal Shared Module
 *
 * Общий модуль для покупки размещений.
 * Используется в: placements-manager.js, my-placements.js
 *
 * Зависимости:
 * - Bootstrap 5 (модальные окна)
 * - Глобальные переменные: projects, sites, pricing, userBalance
 * - Функции: getToken(), showAlert(), loadBalance(), loadActivePlacements(),
 *   loadScheduledPlacements(), updateTabCounts()
 */

// ============================================
// Purchase Modal Data Loading
// ============================================

/**
 * Load purchase modal data
 */
async function loadPurchaseModalData() {
    await loadPurchaseProjects();
    await loadPurchaseSites();
    await loadPurchasePricing();

    // Reset form
    document.getElementById('purchaseProjectSelect').value = '';
    document.getElementById('purchaseSiteSelect').value = '';
    document.getElementById('purchaseContentSelect').innerHTML = '<option value="">Сначала выберите проект и тип</option>';
    document.getElementById('purchaseTypeLink').checked = true;
    document.getElementById('publishImmediate').checked = true;
    document.getElementById('autoRenewalCheckbox').checked = false;
    document.getElementById('confirmPurchaseBtn').disabled = true;

    updatePriceCalculator();
}

/**
 * Load projects for purchase modal
 */
async function loadPurchaseProjects() {
    try {
        const response = await fetch('/api/projects', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load projects');

        const result = await response.json();
        projects = Array.isArray(result.data) ? result.data : result;

        const select = document.getElementById('purchaseProjectSelect');
        select.innerHTML = '<option value="">-- Выберите проект --</option>';

        projects.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Failed to load projects:', error);
    }
}

/**
 * Load sites for purchase modal
 */
async function loadPurchaseSites() {
    try {
        const response = await fetch('/api/sites', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load sites');

        const result = await response.json();
        sites = Array.isArray(result.data) ? result.data : result;

        const select = document.getElementById('purchaseSiteSelect');
        select.innerHTML = '<option value="">-- Выберите сайт --</option>';

        sites.forEach(s => {
            const option = document.createElement('option');
            option.value = s.id;
            option.textContent = `${s.site_name} (${s.site_url})`;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Failed to load sites:', error);
    }
}

/**
 * Load pricing for purchase modal
 */
async function loadPurchasePricing() {
    try {
        const response = await fetch('/api/billing/pricing', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load pricing');

        const result = await response.json();
        pricing = result.data;

        // Update prices in modal
        document.getElementById('purchaseLinkPrice').textContent = pricing.link.finalPrice.toFixed(2);
        document.getElementById('purchaseLinkRenewalPrice').textContent = pricing.renewal.finalPrice.toFixed(2);
        document.getElementById('purchaseArticlePrice').textContent = pricing.article.finalPrice.toFixed(2);
        document.getElementById('purchaseUserDiscount').textContent = pricing.link.discount;

    } catch (error) {
        console.error('Failed to load pricing:', error);
    }
}

// ============================================
// Purchase Modal Event Handlers
// ============================================

/**
 * On project change in purchase modal
 */
async function onPurchaseProjectChange() {
    const projectId = document.getElementById('purchaseProjectSelect').value;
    if (!projectId) {
        document.getElementById('purchaseContentSelect').disabled = true;
        return;
    }

    await loadContentForPurchase(projectId);
    validatePurchaseForm();
}

/**
 * On type change in purchase modal
 */
function onPurchaseTypeChange() {
    const type = document.querySelector('input[name="purchaseType"]:checked').value;

    // Show/hide auto-renewal option
    document.getElementById('autoRenewalOption').style.display = type === 'link' ? 'block' : 'none';

    // Reload content
    const projectId = document.getElementById('purchaseProjectSelect').value;
    if (projectId) {
        loadContentForPurchase(projectId);
    }

    updatePriceCalculator();
    validatePurchaseForm();
}

/**
 * Load content for project in purchase modal
 */
async function loadContentForPurchase(projectId) {
    const type = document.querySelector('input[name="purchaseType"]:checked').value;
    const endpoint = type === 'link' ? 'links' : 'articles';

    try {
        const response = await fetch(`/api/projects/${projectId}/${endpoint}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load content');

        const result = await response.json();
        const content = Array.isArray(result.data) ? result.data : result;

        const select = document.getElementById('purchaseContentSelect');
        select.innerHTML = '';
        select.disabled = false;

        if (content.length === 0) {
            select.innerHTML = `<option value="">Нет доступных ${type === 'link' ? 'ссылок' : 'гест-постов'}</option>`;
            select.disabled = true;
            return;
        }

        content.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;

            if (type === 'link') {
                option.textContent = `${item.anchor_text} → ${item.url}`;
            } else {
                option.textContent = item.title;
            }

            select.appendChild(option);
        });

    } catch (error) {
        console.error('Failed to load content:', error);
    }
}

/**
 * On site change in purchase modal
 */
function onPurchaseSiteChange() {
    validatePurchaseForm();
}

/**
 * On content change in purchase modal
 */
function onPurchaseContentChange() {
    validatePurchaseForm();
}

/**
 * On publish time change in purchase modal
 */
function onPurchaseTimeChange() {
    const isScheduled = document.getElementById('publishScheduled').checked;
    document.getElementById('scheduledDatePicker').style.display = isScheduled ? 'block' : 'none';

    if (isScheduled) {
        // Set min date to now
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('scheduledDate').min = now.toISOString().slice(0, 16);

        // Set max date to 90 days from now
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + 90);
        maxDate.setMinutes(maxDate.getMinutes() - maxDate.getTimezoneOffset());
        document.getElementById('scheduledDate').max = maxDate.toISOString().slice(0, 16);
    }

    validatePurchaseForm();
}

// ============================================
// Purchase Modal Price Calculator
// ============================================

/**
 * Update price calculator display
 */
function updatePriceCalculator() {
    if (!pricing) return;

    const type = document.querySelector('input[name="purchaseType"]:checked').value;
    const priceData = type === 'link' ? pricing.link : pricing.article;

    document.getElementById('purchaseBasePrice').textContent = priceData.basePrice.toFixed(2);
    document.getElementById('purchaseDiscountAmount').textContent = (priceData.basePrice - priceData.finalPrice).toFixed(2);
    document.getElementById('purchaseFinalPrice').textContent = priceData.finalPrice.toFixed(2);
    document.getElementById('purchaseCurrentBalance').textContent = userBalance.toFixed(2);

    // Check if balance is sufficient
    const finalPrice = priceData.finalPrice;
    const sufficient = userBalance >= finalPrice;

    if (!sufficient) {
        document.getElementById('insufficientBalanceAlert').style.display = 'block';
        document.getElementById('amountNeeded').textContent = (finalPrice - userBalance).toFixed(2);
        document.getElementById('currentBalanceDisplay').classList.add('text-danger');
    } else {
        document.getElementById('insufficientBalanceAlert').style.display = 'none';
        document.getElementById('currentBalanceDisplay').classList.remove('text-danger');
    }
}

/**
 * Get current price based on selected type
 */
function getCurrentPrice() {
    if (!pricing) return 0;

    const type = document.querySelector('input[name="purchaseType"]:checked').value;
    const priceData = type === 'link' ? pricing.link : pricing.article;

    return priceData.finalPrice;
}

// ============================================
// Purchase Modal Validation & Submission
// ============================================

/**
 * Validate purchase form
 */
function validatePurchaseForm() {
    const projectId = document.getElementById('purchaseProjectSelect').value;
    const siteId = document.getElementById('purchaseSiteSelect').value;
    const contentId = document.getElementById('purchaseContentSelect').value;
    const isScheduled = document.getElementById('publishScheduled').checked;
    const scheduledDate = document.getElementById('scheduledDate').value;

    const valid = projectId && siteId && contentId && (!isScheduled || scheduledDate) && userBalance >= getCurrentPrice();

    document.getElementById('confirmPurchaseBtn').disabled = !valid;
}

/**
 * Confirm and execute purchase
 */
async function confirmPurchase() {
    const projectId = parseInt(document.getElementById('purchaseProjectSelect').value);
    const siteId = parseInt(document.getElementById('purchaseSiteSelect').value);
    const contentId = parseInt(document.getElementById('purchaseContentSelect').value);
    const type = document.querySelector('input[name="purchaseType"]:checked').value;
    const isScheduled = document.getElementById('publishScheduled').checked;
    const scheduledDate = isScheduled ? document.getElementById('scheduledDate').value : null;
    const autoRenewal = document.getElementById('autoRenewalCheckbox').checked;

    try {
        const response = await fetch('/api/billing/purchase', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectId,
                siteId,
                type,
                contentIds: [contentId],
                scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : null,
                autoRenewal
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Purchase failed');
        }

        const result = await response.json();

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('purchasePlacementModal'));
        modal.hide();

        // Reload data
        await loadBalance();
        await loadActivePlacements();
        if (isScheduled) {
            await loadScheduledPlacements();
        }
        await updateTabCounts();

        // Разные сообщения для ссылок и статей
        if (type === 'link') {
            showAlert(`Ссылка успешно размещена! Новый баланс: $${result.data.newBalance.toFixed(2)}`, 'success');
        } else {
            showAlert(`Статья отправлена на модерацию. Новый баланс: $${result.data.newBalance.toFixed(2)}`, 'info');
        }

    } catch (error) {
        console.error('Purchase failed:', error);
        showAlert(error.message || 'Ошибка покупки размещения', 'danger');
    }
}
