/**
 * Placements Manager - Unified placements management with filters
 */

let userBalance = 0;
let userDiscount = 0;
let pricing = null;
let projects = [];
let sites = [];

// Filter state
let activeFilters = {
    projectId: '',
    type: '',
    dateFrom: '',
    dateTo: ''
};

// Cache all placements for filtering
let allActivePlacements = [];
let allScheduledPlacements = [];
let allHistoryPlacements = [];

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await loadBalance();
    await loadFilterDropdowns(); // Load projects and sites for filters

    // Check for projectId in URL and apply filter
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('projectId');
    if (projectId) {
        activeFilters.projectId = projectId;
        document.getElementById('projectFilter').value = projectId;
    }

    // Check for tab parameter and switch to that tab
    const tabParam = urlParams.get('tab');
    if (tabParam && ['active', 'scheduled', 'history'].includes(tabParam)) {
        // Get tab elements
        const tabButton = document.getElementById(`${tabParam}-tab`);
        const tabPane = document.getElementById(tabParam);

        if (tabButton && tabPane) {
            // Remove active class from all tabs
            document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('show', 'active');
            });

            // Activate target tab
            tabButton.classList.add('active');
            tabPane.classList.add('show', 'active');
        }
    }

    // Load data for the active tab
    if (tabParam === 'scheduled') {
        await loadScheduledPlacements();
    } else if (tabParam === 'history') {
        await loadHistoryPlacements();
    } else {
        // Default: load active placements
        await loadActivePlacements();
    }
    await updateTabCounts();

    // Tab change listeners
    document.getElementById('scheduled-tab').addEventListener('click', () => loadScheduledPlacements());
    document.getElementById('history-tab').addEventListener('click', () => loadHistoryPlacements());

    // History filters
    document.getElementById('historyTypeFilter').addEventListener('change', () => loadHistoryPlacements());
    document.getElementById('historyStatusFilter').addEventListener('change', () => loadHistoryPlacements());

    // Purchase modal listeners
    document.getElementById('purchaseProjectSelect').addEventListener('change', onProjectChange);
    document.querySelectorAll('input[name="purchaseType"]').forEach(radio => {
        radio.addEventListener('change', onTypeChange);
    });
    document.getElementById('purchaseSiteSelect').addEventListener('change', onSiteChange);
    document.getElementById('purchaseContentSelect').addEventListener('change', onContentChange);
    document.querySelectorAll('input[name="publishTime"]').forEach(radio => {
        radio.addEventListener('change', onPublishTimeChange);
    });

    // Load data for purchase modal
    document.getElementById('purchasePlacementModal').addEventListener('show.bs.modal', async () => {
        await loadPurchaseModalData();
    });
});

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
 * Load active placements
 */
async function loadActivePlacements() {
    try {
        const response = await fetch('/api/placements?status=placed&limit=5000', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load placements');

        const result = await response.json();
        const placements = Array.isArray(result.data) ? result.data : result;

        console.log('=== PLACEMENTS MANAGER DEBUG ===');
        console.log('API response:', result);
        console.log('Placements array length:', placements.length);
        console.log('First 5 placements:', placements.slice(0, 5));

        // Cache all placements
        allActivePlacements = placements.filter(p => p.status === 'placed');
        console.log('Filtered active placements:', allActivePlacements.length);

        // Apply filters and render
        const filtered = applyPlacementFilters(allActivePlacements);
        console.log('After filtering:', filtered.length);
        renderActivePlacements(filtered);

    } catch (error) {
        console.error('Failed to load active placements:', error);
        document.getElementById('activePlacementsTable').innerHTML =
            '<tr><td colspan="9" class="text-center text-danger">Ошибка загрузки</td></tr>';
    }
}

/**
 * Apply placement filters
 */
function applyPlacementFilters(placements) {
    return placements.filter(p => {
        // Project filter
        if (activeFilters.projectId && p.project_id != activeFilters.projectId) {
            return false;
        }

        // Type filter
        if (activeFilters.type && p.type !== activeFilters.type) {
            return false;
        }

        // Date range filter
        if (activeFilters.dateFrom || activeFilters.dateTo) {
            const placementDate = new Date(p.purchased_at);

            if (activeFilters.dateFrom) {
                const fromDate = new Date(activeFilters.dateFrom);
                if (placementDate < fromDate) return false;
            }

            if (activeFilters.dateTo) {
                const toDate = new Date(activeFilters.dateTo);
                toDate.setHours(23, 59, 59, 999); // End of day
                if (placementDate > toDate) return false;
            }
        }

        return true;
    });
}

/**
 * Apply filters from UI inputs
 */
function applyFilters() {
    // Update filter state from UI
    activeFilters.projectId = document.getElementById('projectFilter').value;
    activeFilters.type = document.getElementById('typeFilter').value;
    activeFilters.dateFrom = document.getElementById('dateFrom').value;
    activeFilters.dateTo = document.getElementById('dateTo').value;

    // Re-filter and re-render active placements
    const filtered = applyPlacementFilters(allActivePlacements);
    renderActivePlacements(filtered);
}

/**
 * Render active placements
 */
function renderActivePlacements(placements) {
    console.log('renderActivePlacements called with:', placements.length, 'placements');
    const tbody = document.getElementById('activePlacementsTable');
    tbody.innerHTML = '';

    if (placements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Нет активных размещений</td></tr>';
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
            ? '<span class="badge bg-primary">Главная</span>'
            : '<span class="badge bg-success">Статья</span>';

        // Auto-renewal toggle
        const autoRenewalToggle = p.type === 'link'
            ? `<div class="form-check form-switch">
                 <input class="form-check-input" type="checkbox" ${p.auto_renewal ? 'checked' : ''}
                   onchange="toggleAutoRenewal(${p.id}, this.checked)">
               </div>`
            : '—';

        // Actions - using btn-xs for 3x smaller buttons
        const renewBtn = p.type === 'link' && p.renewal_price
            ? `<button class="btn btn-xs btn-success me-1" onclick="renewPlacement(${p.id})" title="Продлить за $${parseFloat(p.renewal_price).toFixed(2)}">
                 <i class="bi bi-arrow-repeat"></i> Продлить
               </button>`
            : '';

        const viewBtn = p.wordpress_post_id
            ? `<a href="${p.site_url}/?p=${p.wordpress_post_id}" target="_blank" class="btn btn-xs btn-outline-primary me-1" title="Просмотреть">
                 <i class="bi bi-eye"></i>
               </a>`
            : '';

        // Delete button - only for admins
        const deleteBtn = isAdmin()
            ? `<button class="btn btn-xs btn-outline-danger" onclick="deletePlacement(${p.id})" title="Удалить размещение">
                 <i class="bi bi-trash"></i>
               </button>`
            : '';

        // For articles, show full WordPress post URL; for links, show site URL
        const displayUrl = (p.type === 'article' && p.wordpress_post_id)
            ? `${p.site_url}/?p=${p.wordpress_post_id}`
            : p.site_url;

        // DR value with color coding
        const drValue = p.site_dr || 0;
        const drClass = drValue >= 50 ? 'text-success fw-bold' : drValue >= 20 ? 'text-primary' : 'text-muted';

        // DA value with color coding
        const daValue = p.site_da || 0;
        const daClass = daValue >= 50 ? 'text-success fw-bold' : daValue >= 20 ? 'text-primary' : 'text-muted';

        row.innerHTML = `
            <td>#${p.id}</td>
            <td>${p.project_name || '—'}</td>
            <td><a href="${displayUrl}" target="_blank">${displayUrl}</a></td>
            <td class="${drClass}">${drValue}</td>
            <td class="${daClass}">${daValue}</td>
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
        const response = await fetch('/api/placements?status=scheduled', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load scheduled placements');

        const result = await response.json();
        const placements = Array.isArray(result.data) ? result.data : result;

        // Cache all placements
        allScheduledPlacements = placements.filter(p => p.status === 'scheduled');

        // Apply filters and render
        const filtered = applyPlacementFilters(allScheduledPlacements);
        renderScheduledPlacements(filtered);

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
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Нет запланированных размещений</td></tr>';
        document.getElementById('scheduledCount').textContent = '0';
        return;
    }

    document.getElementById('scheduledCount').textContent = placements.length;

    // DEBUG: Log placement data to see what's coming from API
    console.log('=== SCHEDULED PLACEMENTS DEBUG ===');
    console.log('Total placements:', placements.length);
    if (placements.length > 0) {
        console.log('First placement data:', placements[0]);
        console.log('scheduled_publish_date value:', placements[0]?.scheduled_publish_date);
        console.log('scheduled_publish_date type:', typeof placements[0]?.scheduled_publish_date);
    }

    placements.forEach(p => {
        const row = document.createElement('tr');

        const typeBadge = p.type === 'link'
            ? '<span class="badge bg-primary">Главная</span>'
            : '<span class="badge bg-success">Статья</span>';

        // For articles, show full WordPress post URL; for links, show site URL
        const displayUrl = (p.type === 'article' && p.wordpress_post_id)
            ? `${p.site_url}/?p=${p.wordpress_post_id}`
            : p.site_url;

        // DEBUG: Log the date before formatting
        console.log(`Placement #${p.id} scheduled_publish_date:`, p.scheduled_publish_date);
        const formattedDate = formatDate(p.scheduled_publish_date);
        console.log(`Placement #${p.id} formatted date:`, formattedDate);

        // DR value with color coding
        const drValue = p.site_dr || 0;
        const drClass = drValue >= 50 ? 'text-success fw-bold' : drValue >= 20 ? 'text-primary' : 'text-muted';

        // DA value with color coding
        const daValue = p.site_da || 0;
        const daClass = daValue >= 50 ? 'text-success fw-bold' : daValue >= 20 ? 'text-primary' : 'text-muted';

        row.innerHTML = `
            <td>#${p.id}</td>
            <td>${p.project_name || '—'}</td>
            <td><a href="${displayUrl}" target="_blank">${displayUrl}</a></td>
            <td class="${drClass}">${drValue}</td>
            <td class="${daClass}">${daValue}</td>
            <td>${typeBadge}</td>
            <td class="fw-bold text-primary">${formattedDate}</td>
            <td>${formatDate(p.purchased_at)}</td>
            <td>$${parseFloat(p.final_price || 0).toFixed(2)}</td>
            <td>
                <button class="btn btn-xs btn-success" onclick="publishNow(${p.id})" title="Опубликовать сейчас">
                    <i class="bi bi-send-fill"></i> Опубл.
                </button>
                <button class="btn btn-xs btn-outline-danger ms-1" onclick="cancelScheduledPlacement(${p.id})" title="Удалить размещение">
                    <i class="bi bi-trash"></i>
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
        renderHistoryPlacements(result.data || result);

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
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Нет размещений</td></tr>';
        return;
    }

    placements.forEach(p => {
        const row = document.createElement('tr');

        const typeBadge = p.type === 'link'
            ? '<span class="badge bg-primary">Главная</span>'
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

        // DR value with color coding
        const drValue = p.site_dr || 0;
        const drClass = drValue >= 50 ? 'text-success fw-bold' : drValue >= 20 ? 'text-primary' : 'text-muted';

        // DA value with color coding
        const daValue = p.site_da || 0;
        const daClass = daValue >= 50 ? 'text-success fw-bold' : daValue >= 20 ? 'text-primary' : 'text-muted';

        row.innerHTML = `
            <td>#${p.id}</td>
            <td>${p.project_name || '—'}</td>
            <td><a href="${displayUrl}" target="_blank">${displayUrl}</a></td>
            <td class="${drClass}">${drValue}</td>
            <td class="${daClass}">${daValue}</td>
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
        const response = await fetch('/api/placements?limit=5000', {
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
        await loadHistory();

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
        // For 'all' scope, export all placements
        // For 'current' scope, this would need project_id (not applicable in my-placements.html)
        const response = await fetch(`/api/billing/export/placements?format=${format}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to export');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const scopeLabel = scope === 'all' ? 'all-projects' : 'current-project';
        a.download = `placements-${scopeLabel}-${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showAlert(`Размещения экспортированы в формате ${format.toUpperCase()}`, 'success');

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
    return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
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

// ============================================
// Sorting Functions
// ============================================

let activeSortColumn = null;
let activeSortDirection = 'asc';
let scheduledSortColumn = null;
let scheduledSortDirection = 'asc';

/**
 * Sort active placements by column
 */
function sortActiveBy(column) {
    // Toggle direction if same column, otherwise default to ascending
    if (activeSortColumn === column) {
        activeSortDirection = activeSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        activeSortColumn = column;
        activeSortDirection = 'asc';
    }

    // Sort the array
    const sorted = [...allActivePlacements].sort((a, b) => {
        let aVal, bVal;

        if (column === 'published') {
            aVal = new Date(a.published_at || a.placed_at || 0);
            bVal = new Date(b.published_at || b.placed_at || 0);
        } else if (column === 'expires') {
            aVal = new Date(a.expires_at || 0);
            bVal = new Date(b.expires_at || 0);
        }

        if (aVal < bVal) return activeSortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return activeSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    // Update sort icons
    document.querySelectorAll('#activePlacementsTable').forEach(table => {
        table.closest('.table-responsive').querySelectorAll('.sortable-header').forEach(th => {
            th.classList.remove('sorted');
            const icon = th.querySelector('.sort-icon i');
            if (icon) {
                icon.className = 'bi bi-arrow-down-up';
            }
        });
    });

    const activeHeader = document.querySelector(`.sortable-header[onclick="sortActiveBy('${column}')"]`);
    if (activeHeader) {
        activeHeader.classList.add('sorted');
        const icon = activeHeader.querySelector('.sort-icon i');
        if (icon) {
            icon.className = activeSortDirection === 'asc' ? 'bi bi-arrow-up' : 'bi bi-arrow-down';
        }
    }

    // Re-render
    const filtered = applyPlacementFilters(sorted);
    renderActivePlacements(filtered);
}

/**
 * Sort scheduled placements by column
 */
function sortScheduledBy(column) {
    // Toggle direction if same column, otherwise default to ascending
    if (scheduledSortColumn === column) {
        scheduledSortDirection = scheduledSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        scheduledSortColumn = column;
        scheduledSortDirection = 'asc';
    }

    // Sort the array
    const sorted = [...allScheduledPlacements].sort((a, b) => {
        let aVal, bVal;

        if (column === 'scheduled') {
            aVal = new Date(a.scheduled_publish_date || 0);
            bVal = new Date(b.scheduled_publish_date || 0);
        } else if (column === 'purchased') {
            aVal = new Date(a.purchased_at || 0);
            bVal = new Date(b.purchased_at || 0);
        }

        if (aVal < bVal) return scheduledSortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return scheduledSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    // Update sort icons
    document.querySelectorAll('#scheduledPlacementsTable').forEach(table => {
        table.closest('.table-responsive').querySelectorAll('.sortable-header').forEach(th => {
            th.classList.remove('sorted');
            const icon = th.querySelector('.sort-icon i');
            if (icon) {
                icon.className = 'bi bi-arrow-down-up';
            }
        });
    });

    const scheduledHeader = document.querySelector(`.sortable-header[onclick="sortScheduledBy('${column}')"]`);
    if (scheduledHeader) {
        scheduledHeader.classList.add('sorted');
        const icon = scheduledHeader.querySelector('.sort-icon i');
        if (icon) {
            icon.className = scheduledSortDirection === 'asc' ? 'bi bi-arrow-up' : 'bi bi-arrow-down';
        }
    }

    // Re-render
    const filtered = applyPlacementFilters(sorted);
    renderScheduledPlacements(filtered);
}

/**
 * Publish scheduled placement NOW
 */
async function publishNow(placementId) {
    if (!confirm('Опубликовать это размещение сейчас? Оно будет опубликовано на сайте немедленно.')) {
        return;
    }

    try {
        const response = await fetch(`/api/placements/${placementId}/publish-now`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to publish placement');
        }

        showAlert('Размещение публикуется! Обновите страницу через несколько секунд.', 'success');

        // Reload placements after short delay
        setTimeout(() => {
            loadAllPlacements();
        }, 2000);
    } catch (error) {
        console.error('Publish placement error:', error);
        showAlert(error.message || 'Ошибка публикации размещения', 'danger');
    }
}

/**
 * Cancel (delete) scheduled placement
 */
async function cancelScheduledPlacement(placementId) {
    if (!confirm('Отменить это размещение? Оно будет удалено, и средства вернутся на баланс.')) {
        return;
    }

    try {
        const response = await fetch(`/api/placements/${placementId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to cancel placement');
        }

        showAlert(
            data.refund
                ? `Размещение отменено. Возврат: $${data.refund.amount.toFixed(2)}`
                : 'Размещение отменено',
            'success'
        );

        // Reload placements
        loadAllPlacements();
    } catch (error) {
        console.error('Cancel placement error:', error);
        showAlert(error.message || 'Ошибка отмены размещения', 'danger');
    }
}
