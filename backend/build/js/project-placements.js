/**
 * Project Placements page logic - filtered by project ID
 */

let userBalance = 0;
let currentProjectId = null;
let currentProject = null;

// Extract project ID from URL
function getProjectIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    // Get project ID from URL
    currentProjectId = getProjectIdFromURL();

    if (!currentProjectId) {
        alert('Не указан ID проекта');
        window.location.href = '/dashboard.html';
        return;
    }

    // Load project info and update page title
    await loadProjectInfo();

    await loadBalance();
    await loadActivePlacements();
    await updateTabCounts();

    // Tab change listeners
    document.getElementById('scheduled-tab').addEventListener('click', () => loadScheduledPlacements());
    document.getElementById('history-tab').addEventListener('click', () => loadHistoryPlacements());

    // History filters
    document.getElementById('historyTypeFilter').addEventListener('change', () => loadHistoryPlacements());
    document.getElementById('historyStatusFilter').addEventListener('change', () => loadHistoryPlacements());
});

/**
 * Load project information
 */
async function loadProjectInfo() {
    try {
        const response = await fetch(`/api/projects/${currentProjectId}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) {
            throw new Error('Project not found');
        }

        currentProject = await response.json();

        // Update page title and breadcrumb
        document.getElementById('projectName').textContent = currentProject.name;
        document.getElementById('projectBreadcrumb').textContent = currentProject.name;
        document.title = `${currentProject.name} - Размещения`;

    } catch (error) {
        console.error('Failed to load project:', error);
        alert('Проект не найден');
        window.location.href = '/dashboard.html';
    }
}

/**
 * Load user balance
 */
async function loadBalance() {
    try {
        const response = await fetch('/api/billing/balance', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load balance');

        const result = await response.json();
        userBalance = parseFloat(result.data.balance);
        userDiscount = parseInt(result.data.currentDiscount);

        // Update navbar
        const navBalance = document.getElementById('navBalance');
        if (navBalance) {
            navBalance.textContent = userBalance.toFixed(2);
        }

    } catch (error) {
        console.error('Failed to load balance:', error);
    }
}

/**
 * Load active placements for current project
 */
async function loadActivePlacements() {
    try {
        const response = await fetch(`/api/placements?status=placed&project_id=${currentProjectId}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load placements');

        const result = await response.json();
        const placements = Array.isArray(result.data) ? result.data : result;

        renderActivePlacements(placements);

    } catch (error) {
        console.error('Failed to load active placements:', error);
        document.getElementById('activePlacementsTable').innerHTML =
            '<tr><td colspan="9" class="text-center text-danger">Ошибка загрузки</td></tr>';
    }
}

/**
 * Render active placements
 */
function renderActivePlacements(placements) {
    const tbody = document.getElementById('activePlacementsTable');
    tbody.innerHTML = '';

    if (placements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Нет активных размещений</td></tr>';
        document.getElementById('activeCount').textContent = '0';
        return;
    }

    document.getElementById('activeCount').textContent = placements.length;

    placements.forEach(p => {
        const row = document.createElement('tr');

        // Calculate days until expiry
        let daysLeft = null;
        let expiryClass = '';
        let expiryText = '—';

        if (p.expires_at) {
            const now = new Date();
            const expiry = new Date(p.expires_at);
            daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

            if (daysLeft <= 7) {
                expiryClass = 'text-danger fw-bold';
            } else if (daysLeft <= 30) {
                expiryClass = 'text-warning';
            }

            expiryText = `${formatDate(p.expires_at)} (${daysLeft} дн.)`;
        }

        // Type badge
        const typeBadge = p.type === 'link'
            ? '<span class="badge bg-primary">Ссылка</span>'
            : '<span class="badge bg-success">Статья</span>';

        // Auto-renewal toggle
        const autoRenewalToggle = p.type === 'link'
            ? `<div class="form-check form-switch">
                 <input class="form-check-input" type="checkbox" ${p.auto_renewal ? 'checked' : ''}
                   onchange="toggleAutoRenewal(${p.id}, this.checked)">
               </div>`
            : '—';

        // Actions
        const renewBtn = p.type === 'link' && p.renewal_price
            ? `<button class="btn btn-sm btn-success me-1" onclick="renewPlacement(${p.id})">
                 Продлить ($${parseFloat(p.renewal_price).toFixed(2)})
               </button>`
            : '';

        const viewBtn = p.wordpress_post_id
            ? `<a href="${p.site_url}/?p=${p.wordpress_post_id}" target="_blank" class="btn btn-sm btn-outline-primary me-1">
                 <i class="bi bi-eye"></i>
               </a>`
            : '';

        // Delete button - only for admins
        const deleteBtn = isAdmin()
            ? `<button class="btn btn-sm btn-outline-danger" onclick="deletePlacement(${p.id})" title="Удалить размещение">
                 <i class="bi bi-trash"></i>
               </button>`
            : '';

        // For articles, show full WordPress post URL; for links, show site URL
        const displayUrl = (p.type === 'article' && p.wordpress_post_id)
            ? `${p.site_url}/?p=${p.wordpress_post_id}`
            : p.site_url;

        // Display site name or URL
        const siteDisplay = p.site_name || p.site_url;

        // Debug log
        console.log(`Placement #${p.id}: type=${p.type}, wordpress_post_id=${p.wordpress_post_id}, site_name=${p.site_name}, displayUrl=${displayUrl}`);

        row.innerHTML = `
            <td>#${p.id}</td>
            <td>${p.project_name || '—'}</td>
            <td><a href="${displayUrl}" target="_blank" class="text-break">${siteDisplay}</a></td>
            <td>${typeBadge}</td>
            <td>${formatDate(p.published_at || p.placed_at)}</td>
            <td class="${expiryClass}">${expiryText}</td>
            <td>$${parseFloat(p.final_price || 0).toFixed(2)}</td>
            <td>${autoRenewalToggle}</td>
            <td class="text-nowrap">
                ${renewBtn}
                ${viewBtn}
                ${deleteBtn}
            </td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Load scheduled placements
 */
async function loadScheduledPlacements() {
    try {
        const response = await fetch(`/api/placements?status=scheduled&project_id=${currentProjectId}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load scheduled placements');

        const result = await response.json();
        const placements = Array.isArray(result.data) ? result.data : result;

        renderScheduledPlacements(placements);

    } catch (error) {
        console.error('Failed to load scheduled placements:', error);
        document.getElementById('scheduledPlacementsTable').innerHTML =
            '<tr><td colspan="8" class="text-center text-danger">Ошибка загрузки</td></tr>';
    }
}

/**
 * Render scheduled placements
 */
function renderScheduledPlacements(placements) {
    const tbody = document.getElementById('scheduledPlacementsTable');
    tbody.innerHTML = '';

    if (placements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Нет запланированных размещений</td></tr>';
        document.getElementById('scheduledCount').textContent = '0';
        return;
    }

    document.getElementById('scheduledCount').textContent = placements.length;

    placements.forEach(p => {
        const row = document.createElement('tr');

        const typeBadge = p.type === 'link'
            ? '<span class="badge bg-primary">Ссылка</span>'
            : '<span class="badge bg-success">Статья</span>';

        // For articles, show full WordPress post URL; for links, show site URL
        const displayUrl = (p.type === 'article' && p.wordpress_post_id)
            ? `${p.site_url}/?p=${p.wordpress_post_id}`
            : p.site_url;

        // Display site name or URL
        const siteDisplay = p.site_name || p.site_url;

        console.log(`Scheduled #${p.id}: type=${p.type}, wordpress_post_id=${p.wordpress_post_id}, site_name=${p.site_name}, displayUrl=${displayUrl}`);

        row.innerHTML = `
            <td>#${p.id}</td>
            <td>${p.project_name || '—'}</td>
            <td><a href="${displayUrl}" target="_blank" class="text-break">${siteDisplay}</a></td>
            <td>${typeBadge}</td>
            <td class="fw-bold text-primary">${formatDate(p.scheduled_publish_date)}</td>
            <td>${formatDate(p.purchased_at)}</td>
            <td>$${parseFloat(p.final_price || 0).toFixed(2)}</td>
            <td>
                <button class="btn btn-sm btn-outline-danger" onclick="cancelScheduledPlacement(${p.id})">
                    Отменить
                </button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Load history placements
 */
async function loadHistoryPlacements(page = 1) {
    try {
        const type = document.getElementById('historyTypeFilter').value;
        const status = document.getElementById('historyStatusFilter').value;

        let url = `/api/placements?page=${page}&limit=50`;
        if (type) url += `&type=${type}`;
        if (status) url += `&status=${status}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load history');

        const result = await response.json();
        const placements = result.data || result;

        // Filter by current project ID
        const projectPlacements = Array.isArray(placements)
            ? placements.filter(p => p.project_id == currentProjectId)
            : [];

        renderHistoryPlacements(projectPlacements);

    } catch (error) {
        console.error('Failed to load history:', error);
        document.getElementById('historyPlacementsTable').innerHTML =
            '<tr><td colspan="9" class="text-center text-danger">Ошибка загрузки</td></tr>';
    }
}

/**
 * Render history placements
 */
function renderHistoryPlacements(placements) {
    const tbody = document.getElementById('historyPlacementsTable');
    tbody.innerHTML = '';

    if (placements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Нет размещений</td></tr>';
        return;
    }

    placements.forEach(p => {
        const row = document.createElement('tr');

        const typeBadge = p.type === 'link'
            ? '<span class="badge bg-primary">Ссылка</span>'
            : '<span class="badge bg-success">Статья</span>';

        const statusBadges = {
            'placed': '<span class="badge bg-success">Размещено</span>',
            'pending': '<span class="badge bg-warning">Ожидание</span>',
            'scheduled': '<span class="badge bg-info">Запланировано</span>',
            'expired': '<span class="badge bg-secondary">Истекло</span>',
            'cancelled': '<span class="badge bg-danger">Отменено</span>',
            'failed': '<span class="badge bg-danger">Ошибка</span>'
        };

        // For articles, show full WordPress post URL; for links, show site URL
        const displayUrl = (p.type === 'article' && p.wordpress_post_id)
            ? `${p.site_url}/?p=${p.wordpress_post_id}`
            : p.site_url;

        // Display site name or URL
        const siteDisplay = p.site_name || p.site_url;

        console.log(`History #${p.id}: type=${p.type}, wordpress_post_id=${p.wordpress_post_id}, site_name=${p.site_name}, displayUrl=${displayUrl}`);

        row.innerHTML = `
            <td>#${p.id}</td>
            <td>${p.project_name || '—'}</td>
            <td><a href="${displayUrl}" target="_blank" class="text-break">${siteDisplay}</a></td>
            <td>${typeBadge}</td>
            <td>${statusBadges[p.status] || p.status}</td>
            <td>${formatDate(p.published_at || p.placed_at)}</td>
            <td>${p.expires_at ? formatDate(p.expires_at) : '—'}</td>
            <td>$${parseFloat(p.final_price || 0).toFixed(2)}</td>
            <td>${p.renewal_count || 0}</td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Update tab counts
 */
async function updateTabCounts() {
    try {
        const response = await fetch('/api/placements', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) return;

        const result = await response.json();
        const placements = Array.isArray(result.data) ? result.data : result;

        const activeCount = placements.filter(p => p.status === 'placed').length;
        const scheduledCount = placements.filter(p => p.status === 'scheduled').length;

        document.getElementById('activeCount').textContent = activeCount;
        document.getElementById('scheduledCount').textContent = scheduledCount;

    } catch (error) {
        console.error('Failed to update counts:', error);
    }
}

/**
 * Toggle auto-renewal
 */
async function toggleAutoRenewal(placementId, enabled) {
    try {
        const response = await fetch(`/api/billing/auto-renewal/${placementId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enabled })
        });

        if (!response.ok) throw new Error('Failed to toggle auto-renewal');

        showAlert(`Автопродление ${enabled ? 'включено' : 'выключено'}`, 'success');

    } catch (error) {
        console.error('Failed to toggle auto-renewal:', error);
        showAlert('Ошибка изменения автопродления', 'danger');
        // Reload to reset checkbox
        await loadActivePlacements();
    }
}

/**
 * Renew placement
 */
async function renewPlacement(placementId) {
    if (!confirm('Подтвердите продление размещения')) return;

    try {
        const response = await fetch(`/api/billing/renew/${placementId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to renew');
        }

        const result = await response.json();

        showAlert(`Размещение продлено до ${formatDate(result.data.newExpiryDate)}. Списано $${result.data.pricePaid.toFixed(2)}`, 'success');

        await loadBalance();
        await loadActivePlacements();

    } catch (error) {
        console.error('Failed to renew placement:', error);
        showAlert(error.message || 'Ошибка продления размещения', 'danger');
    }
}

/**
 * Delete placement (admin only)
 */
async function deletePlacement(placementId) {
    if (!confirm('Вы уверены, что хотите удалить это размещение? Средства будут возвращены на баланс.')) return;

    try {
        const response = await fetch(`/api/placements/${placementId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete placement');
        }

        const result = await response.json();

        let message = 'Размещение удалено';
        if (result.refund) {
            message += `. Возвращено $${result.refund.amount.toFixed(2)}. Новый баланс: $${result.refund.newBalance.toFixed(2)}`;
        }

        showAlert(message, 'success');

        // Reload data
        await loadBalance();
        await loadActivePlacements();
        await loadScheduledPlacements();

    } catch (error) {
        console.error('Failed to delete placement:', error);
        showAlert(error.message || 'Ошибка удаления размещения', 'danger');
    }
}

/**
 * Export placements - show modal for selection
 */
function exportPlacements(format = 'csv') {
    // Store format for later use
    window.exportFormat = format;

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('exportModal'));
    modal.show();
}

/**
 * Confirm export with selected option
 */
async function confirmExport(scope) {
    const format = window.exportFormat || 'csv';
    const modal = bootstrap.Modal.getInstance(document.getElementById('exportModal'));
    modal.hide();

    try {
        let url_path = `/api/billing/export/placements?format=${format}`;

        // For 'current' scope, add project_id parameter
        if (scope === 'current' && currentProjectId) {
            url_path += `&project_id=${currentProjectId}`;
        }

        const response = await fetch(url_path, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to export');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const scopeLabel = scope === 'current' ? `project-${currentProjectId}` : 'all-projects';
        a.download = `placements-${scopeLabel}-${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        const scopeText = scope === 'current' ? 'текущего проекта' : 'всех проектов';
        showAlert(`Размещения ${scopeText} экспортированы в формате ${format.toUpperCase()}`, 'success');

    } catch (error) {
        console.error('Failed to export:', error);
        showAlert('Ошибка экспорта', 'danger');
    }
}

// ============================================
// Purchase Modal Logic
// ============================================

/**
 * Load purchase modal data
 */
async function loadPurchaseModalData() {
    await loadProjects();
    await loadSites();
    await loadPricing();

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
 * Load projects
 */
async function loadProjects() {
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
 * Load sites
 */
async function loadSites() {
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
 * Load pricing
 */
async function loadPricing() {
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

/**
 * On project change
 */
async function onProjectChange() {
    const projectId = document.getElementById('purchaseProjectSelect').value;
    if (!projectId) {
        document.getElementById('purchaseContentSelect').disabled = true;
        return;
    }

    await loadContentForProject(projectId);
    validatePurchaseForm();
}

/**
 * On type change
 */
function onTypeChange() {
    const type = document.querySelector('input[name="purchaseType"]:checked').value;

    // Show/hide auto-renewal option
    document.getElementById('autoRenewalOption').style.display = type === 'link' ? 'block' : 'none';

    // Reload content
    const projectId = document.getElementById('purchaseProjectSelect').value;
    if (projectId) {
        loadContentForProject(projectId);
    }

    updatePriceCalculator();
    validatePurchaseForm();
}

/**
 * Load content for project
 */
async function loadContentForProject(projectId) {
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
            select.innerHTML = `<option value="">Нет доступных ${type === 'link' ? 'ссылок' : 'статей'}</option>`;
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
 * On site change
 */
function onSiteChange() {
    validatePurchaseForm();
}

/**
 * On content change
 */
function onContentChange() {
    validatePurchaseForm();
}

/**
 * On publish time change
 */
function onPublishTimeChange() {
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

/**
 * Update price calculator
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
 * Get current price
 */
function getCurrentPrice() {
    if (!pricing) return 0;

    const type = document.querySelector('input[name="purchaseType"]:checked').value;
    const priceData = type === 'link' ? pricing.link : pricing.article;

    return priceData.finalPrice;
}

/**
 * Confirm purchase
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

        showAlert(`Размещение успешно куплено! Новый баланс: $${result.data.newBalance.toFixed(2)}`, 'success');

    } catch (error) {
        console.error('Purchase failed:', error);
        showAlert(error.message || 'Ошибка покупки размещения', 'danger');
    }
}

// ============================================
// Utility Functions
// ============================================

function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    document.body.appendChild(alertDiv);

    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

function getToken() {
    return localStorage.getItem('token') || localStorage.getItem('authToken');
}
