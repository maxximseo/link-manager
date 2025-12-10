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

    // Purchase modal listeners (using shared purchase-modal.js)
    document.getElementById('purchaseProjectSelect').addEventListener('change', onPurchaseProjectChange);
    document.querySelectorAll('input[name="purchaseType"]').forEach(radio => {
        radio.addEventListener('change', onPurchaseTypeChange);
    });
    document.getElementById('purchaseSiteSelect').addEventListener('change', onPurchaseSiteChange);
    document.getElementById('purchaseContentSelect').addEventListener('change', onPurchaseContentChange);
    document.querySelectorAll('input[name="publishTime"]').forEach(radio => {
        radio.addEventListener('change', onPurchaseTimeChange);
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
        userBalance = parseFloat(result.data.balance) || 0;
        userDiscount = parseInt(result.data.currentDiscount) || 0;

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

        // Cache all placements
        allActivePlacements = placements.filter(p => p.status === 'placed');

        // Apply filters and render
        const filtered = applyPlacementFilters(allActivePlacements);
        renderActivePlacements(filtered);

    } catch (error) {
        console.error('Failed to load active placements:', error);
        document.getElementById('activePlacementsTable').innerHTML =
            '<tr><td colspan="19" class="text-center text-danger">Ошибка загрузки</td></tr>';
    }
}

// Filter functions moved to placements-manager-filters.js
// applyPlacementFilters() and applyFilters() are defined there

/**
 * Render active placements
 */
function renderActivePlacements(placements) {
    console.log('renderActivePlacements called with:', placements.length, 'placements');
    const tbody = document.getElementById('activePlacementsTable');
    tbody.innerHTML = '';

    if (placements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="21" class="text-center text-muted">Нет активных размещений</td></tr>';
        document.getElementById('activeCount').textContent = '0';
        // Hide bulk actions panel
        document.getElementById('activeBulkActions').classList.add('d-none');
        document.getElementById('selectAllActive').checked = false;
        return;
    }

    document.getElementById('activeCount').textContent = placements.length;

    placements.forEach(p => {
        const row = document.createElement('tr');

        // Use shared utilities from badge-utils.js
        const expiryInfo = calculateExpiryInfo(p.expires_at);
        const typeBadge = getPlacementTypeBadge(p.type);
        const autoRenewalToggle = getAutoRenewalToggleHtml(p);
        const displayUrl = getPlacementDisplayUrl(p);

        // Actions - using btn-xs for 3x smaller buttons
        const renewBtn = p.type === 'link' && p.renewal_price
            ? `<button class="btn btn-xs btn-success me-1" onclick="renewPlacement(${p.id})" title="Продлить за $${parseFloat(p.renewal_price || 0).toFixed(2)}">
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

        // SEO metrics with color coding (using shared utilities)
        const drValue = p.site_dr || 0;
        const drClass = getDrColorClass(drValue);
        const daValue = p.site_da || 0;
        const daClass = getDaColorClass(daValue);
        const tfValue = p.site_tf || 0;
        const tfClass = getTfColorClass(tfValue);
        const cfValue = p.site_cf || 0;
        const cfClass = getCfColorClass(cfValue);

        // Other metrics
        const refDomainsValue = p.site_ref_domains || 0;
        const rdMainValue = p.site_rd_main || 0;
        const normValue = p.site_norm || 0;
        const keywordsValue = p.site_keywords || 0;
        const trafficValue = p.site_traffic || 0;
        const geoValue = p.site_geo || 'EN';
        const siteTypeBadge = getSiteTypeBadge(p.site_type || 'wordpress');

        row.innerHTML = `
            <td><input type="checkbox" class="active-checkbox" data-id="${p.id}" data-type="${p.type}" onchange="updateActiveBulkActions()"></td>
            <td>#${p.id}</td>
            <td>${p.project_name || '—'}</td>
            <td><a href="${displayUrl}" target="_blank">${displayUrl}</a></td>
            <td>${formatDate(p.published_at || p.placed_at)}</td>
            <td class="${expiryInfo.class}">${expiryInfo.text}</td>
            <td>$${parseFloat(p.final_price || 0).toFixed(2)}</td>
            <td>${autoRenewalToggle}</td>
            <td class="text-nowrap">
                ${renewBtn}
                ${viewBtn}
                ${deleteBtn}
            </td>
            <td class="${drClass}">${drValue}</td>
            <td class="${daClass}">${daValue}</td>
            <td class="${tfClass}">${tfValue}</td>
            <td class="${cfClass}">${cfValue}</td>
            <td class="text-muted">${refDomainsValue}</td>
            <td class="text-muted">${rdMainValue}</td>
            <td class="text-muted">${normValue}</td>
            <td class="text-muted">${keywordsValue}</td>
            <td class="text-muted">${trafficValue}</td>
            <td class="text-muted">${geoValue}</td>
            <td>${siteTypeBadge}</td>
            <td>${typeBadge}</td>
        `;

        tbody.appendChild(row);
    });

    // Reset bulk actions panel after render
    updateActiveBulkActions();

    // Reapply column visibility settings after table is rendered
    if (typeof window.reapplyColumnSettings === 'function') {
        window.reapplyColumnSettings();
    }
}

/**
 * Load scheduled placements
 */
async function loadScheduledPlacements() {
    try {
        const response = await fetch('/api/placements?status=scheduled&limit=5000', {
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
            '<tr><td colspan="19" class="text-center text-danger">Ошибка загрузки</td></tr>';
    }
}

/**
 * Render scheduled placements
 */
function renderScheduledPlacements(placements) {
    const tbody = document.getElementById('scheduledPlacementsTable');
    tbody.innerHTML = '';

    if (placements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="21" class="text-center text-muted">Нет запланированных размещений</td></tr>';
        document.getElementById('scheduledCount').textContent = '0';
        // Hide bulk actions panel
        document.getElementById('scheduledBulkActions').classList.add('d-none');
        document.getElementById('selectAllScheduled').checked = false;
        return;
    }

    document.getElementById('scheduledCount').textContent = placements.length;

    placements.forEach(p => {
        const row = document.createElement('tr');

        // Use shared utilities from badge-utils.js
        const typeBadge = getPlacementTypeBadge(p.type);
        const displayUrl = getPlacementDisplayUrl(p);
        const formattedDate = formatDate(p.scheduled_publish_date);

        // SEO metrics with color coding (using shared utilities)
        const drValue = p.site_dr || 0;
        const drClass = getDrColorClass(drValue);
        const daValue = p.site_da || 0;
        const daClass = getDaColorClass(daValue);
        const tfValue = p.site_tf || 0;
        const tfClass = getTfColorClass(tfValue);
        const cfValue = p.site_cf || 0;
        const cfClass = getCfColorClass(cfValue);

        // Other metrics
        const refDomainsValue = p.site_ref_domains || 0;
        const rdMainValue = p.site_rd_main || 0;
        const normValue = p.site_norm || 0;
        const keywordsValue = p.site_keywords || 0;
        const trafficValue = p.site_traffic || 0;
        const geoValue = p.site_geo || 'EN';
        const siteTypeBadge = getSiteTypeBadge(p.site_type || 'wordpress');

        const finalPrice = parseFloat(p.final_price || 0);
        row.innerHTML = `
            <td><input type="checkbox" class="scheduled-checkbox" data-id="${p.id}" data-price="${finalPrice}" onchange="updateScheduledBulkActions()"></td>
            <td>#${p.id}</td>
            <td>${p.project_name || '—'}</td>
            <td><a href="${displayUrl}" target="_blank">${displayUrl}</a></td>
            <td class="fw-bold text-primary">${formattedDate}</td>
            <td>${formatDate(p.purchased_at)}</td>
            <td>$${finalPrice.toFixed(2)}</td>
            <td>
                <button class="btn btn-xs btn-success" onclick="publishNow(${p.id})" title="Опубликовать сейчас">
                    <i class="bi bi-send-fill"></i> Опубл.
                </button>
                <button class="btn btn-xs btn-outline-danger ms-1" onclick="cancelScheduledPlacement(${p.id})" title="Удалить размещение">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
            <td class="${drClass}">${drValue}</td>
            <td class="${daClass}">${daValue}</td>
            <td class="${tfClass}">${tfValue}</td>
            <td class="${cfClass}">${cfValue}</td>
            <td class="text-muted">${refDomainsValue}</td>
            <td class="text-muted">${rdMainValue}</td>
            <td class="text-muted">${normValue}</td>
            <td class="text-muted">${keywordsValue}</td>
            <td class="text-muted">${trafficValue}</td>
            <td class="text-muted">${geoValue}</td>
            <td>${siteTypeBadge}</td>
            <td>${typeBadge}</td>
        `;

        tbody.appendChild(row);
    });

    // Reapply column visibility settings after table is rendered
    if (typeof window.reapplyColumnSettings === 'function') {
        window.reapplyColumnSettings();
    }
}

/**
 * Load history placements
 */
async function loadHistoryPlacements(page = 1) {
    try {
        const type = document.getElementById('historyTypeFilter').value;
        const status = document.getElementById('historyStatusFilter').value;

        let url = `/api/placements?page=${page}&limit=5000`;
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
            '<tr><td colspan="20" class="text-center text-danger">Ошибка загрузки</td></tr>';
    }
}

/**
 * Render history placements
 */
function renderHistoryPlacements(placements) {
    const tbody = document.getElementById('historyPlacementsTable');
    tbody.innerHTML = '';

    if (placements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="20" class="text-center text-muted">Нет размещений</td></tr>';
        return;
    }

    placements.forEach(p => {
        const row = document.createElement('tr');

        // Use shared utilities from badge-utils.js
        const typeBadge = getPlacementTypeBadge(p.type);
        const displayUrl = getPlacementDisplayUrl(p);

        // SEO metrics with color coding (using shared utilities)
        const drValue = p.site_dr || 0;
        const drClass = getDrColorClass(drValue);
        const daValue = p.site_da || 0;
        const daClass = getDaColorClass(daValue);
        const tfValue = p.site_tf || 0;
        const tfClass = getTfColorClass(tfValue);
        const cfValue = p.site_cf || 0;
        const cfClass = getCfColorClass(cfValue);

        // Other metrics
        const refDomainsValue = p.site_ref_domains || 0;
        const rdMainValue = p.site_rd_main || 0;
        const normValue = p.site_norm || 0;
        const keywordsValue = p.site_keywords || 0;
        const trafficValue = p.site_traffic || 0;
        const geoValue = p.site_geo || 'EN';
        const siteTypeBadge = getSiteTypeBadge(p.site_type || 'wordpress');

        row.innerHTML = `
            <td>#${p.id}</td>
            <td>${p.project_name || '—'}</td>
            <td><a href="${displayUrl}" target="_blank">${displayUrl}</a></td>
            <td>${getPlacementStatusBadge(p.status)}</td>
            <td>${formatDate(p.published_at || p.placed_at)}</td>
            <td>${p.expires_at ? formatDate(p.expires_at) : '—'}</td>
            <td>$${parseFloat(p.final_price || 0).toFixed(2)}</td>
            <td>${p.renewal_count || 0}</td>
            <td class="${drClass}">${drValue}</td>
            <td class="${daClass}">${daValue}</td>
            <td class="${tfClass}">${tfValue}</td>
            <td class="${cfClass}">${cfValue}</td>
            <td class="text-muted">${refDomainsValue}</td>
            <td class="text-muted">${rdMainValue}</td>
            <td class="text-muted">${normValue}</td>
            <td class="text-muted">${keywordsValue}</td>
            <td class="text-muted">${trafficValue}</td>
            <td class="text-muted">${geoValue}</td>
            <td>${siteTypeBadge}</td>
            <td>${typeBadge}</td>
        `;

        tbody.appendChild(row);
    });

    // Reapply column visibility settings after table is rendered
    if (typeof window.reapplyColumnSettings === 'function') {
        window.reapplyColumnSettings();
    }
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
        let placements = Array.isArray(result.data) ? result.data : result;

        // Apply same filters as loadScheduledPlacements/loadActivePlacements
        // This ensures badge counts match the displayed data
        if (activeFilters.projectId) {
            placements = placements.filter(p => p.project_id == activeFilters.projectId);
        }
        if (activeFilters.type) {
            placements = placements.filter(p => p.type === activeFilters.type);
        }
        if (activeFilters.dateFrom) {
            const fromDate = new Date(activeFilters.dateFrom);
            placements = placements.filter(p => {
                const placementDate = new Date(p.purchased_at || p.created_at);
                return placementDate >= fromDate;
            });
        }
        if (activeFilters.dateTo) {
            const toDate = new Date(activeFilters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            placements = placements.filter(p => {
                const placementDate = new Date(p.purchased_at || p.created_at);
                return placementDate <= toDate;
            });
        }

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

        // Reload to sync checkbox state with database
        await loadActivePlacements();

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
        await loadHistoryPlacements();

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

// Purchase Modal Logic moved to shared purchase-modal.js

// Utility functions provided by shared modules:
// formatDate() is provided by badge-utils.js (loaded first)
// showAlert() is provided by security.js (loaded first)
// getToken(), isAdmin() is provided by auth.js (loaded first)

/**
 * Load all placements (active, scheduled, history)
 */
async function loadAllPlacements() {
    await Promise.all([
        loadActivePlacements(),
        loadScheduledPlacements(),
        loadHistoryPlacements()
    ]);
    await updateTabCounts();
}

// loadFilterDropdowns() moved to placements-manager-filters.js

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

// ==================== BULK CANCEL SCHEDULED PLACEMENTS ====================

/**
 * Toggle all scheduled placement checkboxes
 */
function toggleAllScheduled(checkbox) {
    document.querySelectorAll('.scheduled-checkbox').forEach(cb => {
        cb.checked = checkbox.checked;
    });
    updateScheduledBulkActions();
}

/**
 * Update bulk actions panel based on selected checkboxes
 */
function updateScheduledBulkActions() {
    const checked = document.querySelectorAll('.scheduled-checkbox:checked');
    const count = checked.length;
    const total = Array.from(checked).reduce((sum, cb) =>
        sum + parseFloat(cb.dataset.price || 0), 0);

    document.getElementById('scheduledSelectedCount').textContent = count;
    document.getElementById('scheduledRefundTotal').textContent = `$${total.toFixed(2)}`;

    const bulkPanel = document.getElementById('scheduledBulkActions');
    if (count > 0) {
        bulkPanel.classList.remove('d-none');
    } else {
        bulkPanel.classList.add('d-none');
    }

    // Update "select all" checkbox state
    const allCheckboxes = document.querySelectorAll('.scheduled-checkbox');
    const selectAllCheckbox = document.getElementById('selectAllScheduled');
    if (allCheckboxes.length > 0 && count === allCheckboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (count > 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

// Track if bulk cancel was cancelled by user
let bulkCancelAborted = false;

/**
 * Bulk cancel selected scheduled placements with progress
 */
async function bulkCancelScheduled() {
    const checked = document.querySelectorAll('.scheduled-checkbox:checked');
    const ids = Array.from(checked).map(cb => parseInt(cb.dataset.id));

    if (ids.length === 0) return;

    const totalEstimatedRefund = Array.from(checked).reduce((sum, cb) =>
        sum + parseFloat(cb.dataset.price || 0), 0);

    if (!confirm(`Отменить ${ids.length} размещений?\n\nОжидаемый возврат: $${totalEstimatedRefund.toFixed(2)}\n\nСредства будут возвращены на баланс.`)) {
        return;
    }

    // Show progress modal
    showBulkCancelProgress(ids.length);

    console.log(`⚡ Starting batch delete: ${ids.length} placements via single API call...`);
    const startTime = performance.now();

    try {
        // Use new batch delete endpoint - all deletions processed in parallel on server
        // This is 5-10x faster than individual requests
        const response = await fetch('/api/placements/batch-delete', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ placementIds: ids })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Batch delete failed');
        }

        const successful = result.data?.successful || 0;
        const failed = result.data?.failed || 0;
        const totalRefunded = result.data?.totalRefunded || 0;
        const errors = (result.data?.errors || []).map(e => ({
            id: e.placementId,
            error: e.error
        }));

        // Update progress to 100%
        updateBulkCancelProgress(100, successful, failed, totalRefunded);

        const endTime = performance.now();
        const serverDuration = result.data?.durationMs || 0;
        console.log(`✅ Batch delete completed in ${((endTime - startTime) / 1000).toFixed(2)}s (server: ${serverDuration}ms)`);

        // Complete
        completeBulkCancelProgress(successful, failed, totalRefunded, errors);

    } catch (error) {
        console.error('Batch delete error:', error);
        // Hide modal and show error
        const modal = bootstrap.Modal.getInstance(document.getElementById('bulkCancelModal'));
        if (modal) modal.hide();
        showNotification('Ошибка при массовом удалении: ' + error.message, 'error');
    }

    // Reload data
    loadAllPlacements();
}

/**
 * Show bulk cancel progress modal
 */
function showBulkCancelProgress(total) {
    // Create modal if doesn't exist
    let modal = document.getElementById('bulkCancelModal');
    if (!modal) {
        const modalHtml = `
        <div class="modal fade" id="bulkCancelModal" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="bi bi-trash me-2"></i>Массовая отмена размещений</h5>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <div class="d-flex justify-content-between mb-1">
                                <span id="bulkCancelStatus">Отменяем размещения...</span>
                                <span id="bulkCancelPercent">0%</span>
                            </div>
                            <div class="progress" style="height: 25px;">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" id="bulkCancelProgressBar"
                                     role="progressbar" style="width: 0%"></div>
                            </div>
                        </div>
                        <div class="row text-center">
                            <div class="col-4">
                                <div class="fs-4 fw-bold" id="bulkCancelTotal">0</div>
                                <small class="text-muted">Всего</small>
                            </div>
                            <div class="col-4">
                                <div class="fs-4 fw-bold text-success" id="bulkCancelSuccessful">0</div>
                                <small class="text-muted">Успешно</small>
                            </div>
                            <div class="col-4">
                                <div class="fs-4 fw-bold text-danger" id="bulkCancelFailed">0</div>
                                <small class="text-muted">Ошибки</small>
                            </div>
                        </div>
                        <div class="mt-3 text-center">
                            <span class="fs-5">Возвращено: <strong class="text-success" id="bulkCancelRefunded">$0.00</strong></span>
                        </div>
                        <div id="bulkCancelErrors" class="mt-3 d-none">
                            <div class="alert alert-danger" style="max-height: 150px; overflow-y: auto;">
                                <strong>Ошибки:</strong>
                                <ul class="mb-0" id="bulkCancelErrorList"></ul>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="bulkCancelAbortBtn" onclick="abortBulkCancel()">
                            <i class="bi bi-x-circle me-1"></i>Прервать
                        </button>
                        <button type="button" class="btn btn-primary d-none" id="bulkCancelCloseBtn" data-bs-dismiss="modal">
                            <i class="bi bi-check-circle me-1"></i>Закрыть
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('bulkCancelModal');
    }

    // Reset state
    document.getElementById('bulkCancelStatus').textContent = 'Отменяем размещения...';
    document.getElementById('bulkCancelPercent').textContent = '0%';
    document.getElementById('bulkCancelProgressBar').style.width = '0%';
    document.getElementById('bulkCancelProgressBar').className = 'progress-bar progress-bar-striped progress-bar-animated';
    document.getElementById('bulkCancelTotal').textContent = total;
    document.getElementById('bulkCancelSuccessful').textContent = '0';
    document.getElementById('bulkCancelFailed').textContent = '0';
    document.getElementById('bulkCancelRefunded').textContent = '$0.00';
    document.getElementById('bulkCancelErrors').classList.add('d-none');
    document.getElementById('bulkCancelErrorList').innerHTML = '';
    document.getElementById('bulkCancelAbortBtn').classList.remove('d-none');
    document.getElementById('bulkCancelCloseBtn').classList.add('d-none');

    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

/**
 * Update bulk cancel progress
 */
function updateBulkCancelProgress(percent, successful, failed, totalRefunded) {
    document.getElementById('bulkCancelPercent').textContent = `${percent}%`;
    document.getElementById('bulkCancelProgressBar').style.width = `${percent}%`;
    document.getElementById('bulkCancelSuccessful').textContent = successful;
    document.getElementById('bulkCancelFailed').textContent = failed;
    document.getElementById('bulkCancelRefunded').textContent = `$${totalRefunded.toFixed(2)}`;
}

/**
 * Complete bulk cancel progress
 */
function completeBulkCancelProgress(successful, failed, totalRefunded, errors) {
    const progressBar = document.getElementById('bulkCancelProgressBar');
    progressBar.classList.remove('progress-bar-striped', 'progress-bar-animated');
    progressBar.style.width = '100%';

    if (failed === 0 && !bulkCancelAborted) {
        progressBar.classList.add('bg-success');
        document.getElementById('bulkCancelStatus').textContent = 'Все размещения отменены!';
    } else if (successful === 0) {
        progressBar.classList.add('bg-danger');
        document.getElementById('bulkCancelStatus').textContent = 'Все попытки провалены';
    } else if (bulkCancelAborted) {
        progressBar.classList.add('bg-warning');
        document.getElementById('bulkCancelStatus').textContent = `Прервано: ${successful} отменено, ${failed} ошибок`;
    } else {
        progressBar.classList.add('bg-warning');
        document.getElementById('bulkCancelStatus').textContent = `Завершено: ${successful} успешно, ${failed} ошибок`;
    }

    // Show errors if any
    if (errors && errors.length > 0) {
        const errorList = document.getElementById('bulkCancelErrorList');
        errorList.innerHTML = errors.map(e => `<li>ID #${e.id}: ${e.error}</li>`).join('');
        document.getElementById('bulkCancelErrors').classList.remove('d-none');
    }

    // Switch buttons
    document.getElementById('bulkCancelAbortBtn').classList.add('d-none');
    document.getElementById('bulkCancelCloseBtn').classList.remove('d-none');
}

/**
 * Abort bulk cancel operation
 */
function abortBulkCancel() {
    if (confirm('Прервать отмену? Уже отменённые размещения останутся отменёнными.')) {
        bulkCancelAborted = true;
        document.getElementById('bulkCancelStatus').textContent = 'Прерываем...';
    }
}

// ==================== BULK AUTO-RENEWAL FOR ACTIVE PLACEMENTS ====================

/**
 * Toggle all active placement checkboxes
 */
function toggleAllActive(checkbox) {
    document.querySelectorAll('.active-checkbox').forEach(cb => {
        cb.checked = checkbox.checked;
    });
    updateActiveBulkActions();
}

/**
 * Update bulk actions panel for active placements
 */
function updateActiveBulkActions() {
    const checked = document.querySelectorAll('.active-checkbox:checked');
    const count = checked.length;

    // Count only links (auto-renewal only works for links)
    const linkCount = Array.from(checked).filter(cb => cb.dataset.type === 'link').length;

    document.getElementById('activeSelectedCount').textContent = count;
    document.getElementById('activeLinksInfo').textContent = linkCount < count
        ? `(${linkCount} ссылок, ${count - linkCount} гест-постов)`
        : '';

    const bulkPanel = document.getElementById('activeBulkActions');
    if (count > 0) {
        bulkPanel.classList.remove('d-none');
    } else {
        bulkPanel.classList.add('d-none');
    }

    // Update "select all" checkbox state
    const allCheckboxes = document.querySelectorAll('.active-checkbox');
    const selectAllCheckbox = document.getElementById('selectAllActive');
    if (allCheckboxes.length > 0 && count === allCheckboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (count > 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

// Track if bulk auto-renewal was aborted by user
let bulkAutoRenewalAborted = false;

/**
 * Bulk set auto-renewal for selected active placements
 */
async function bulkSetAutoRenewal(enabled) {
    const checked = document.querySelectorAll('.active-checkbox:checked');

    // Filter only links (auto-renewal doesn't work for articles)
    const linkIds = Array.from(checked)
        .filter(cb => cb.dataset.type === 'link')
        .map(cb => parseInt(cb.dataset.id));

    if (linkIds.length === 0) {
        showAlert('Выберите хотя бы одну ссылку (гест-посты не поддерживают автопродление)', 'warning');
        return;
    }

    const action = enabled ? 'Включить' : 'Выключить';
    if (!confirm(`${action} автопродление для ${linkIds.length} размещений?`)) {
        return;
    }

    // Reset abort flag
    bulkAutoRenewalAborted = false;

    // Show progress modal
    showBulkAutoRenewalProgress(linkIds.length, enabled);

    let successful = 0;
    let failed = 0;
    const errors = [];

    // Batch processing - 5 at a time for progress visibility
    const batchSize = 5;
    for (let i = 0; i < linkIds.length; i += batchSize) {
        // Check if aborted
        if (bulkAutoRenewalAborted) {
            console.log('⚠️ Bulk auto-renewal aborted by user');
            break;
        }

        const batch = linkIds.slice(i, i + batchSize);

        const results = await Promise.allSettled(
            batch.map(id => fetch(`/api/billing/auto-renewal/${id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ enabled })
            }).then(r => r.json()))
        );

        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.success) {
                successful++;
            } else {
                failed++;
                const errorMsg = result.reason?.message || result.value?.error || 'Неизвестная ошибка';
                errors.push({ id: batch[index], error: errorMsg });
            }
        });

        // Update progress
        const processedCount = Math.min(i + batchSize, linkIds.length);
        const progress = Math.round((processedCount / linkIds.length) * 100);
        updateBulkAutoRenewalProgress(progress, successful, failed, enabled);
    }

    // Complete
    completeBulkAutoRenewalProgress(successful, failed, enabled, errors);

    // Reload data
    loadAllPlacements();
}

/**
 * Bulk renew selected placements
 */
let bulkRenewAborted = false;

async function bulkRenewPlacements() {
    const checked = document.querySelectorAll('.active-checkbox:checked');
    const placementIds = Array.from(checked).map(cb => parseInt(cb.dataset.id));

    if (placementIds.length === 0) {
        showAlert('Выберите хотя бы одно размещение для продления', 'warning');
        return;
    }

    if (!confirm(`Продлить ${placementIds.length} размещений? Средства будут списаны с вашего баланса.`)) {
        return;
    }

    // Reset abort flag
    bulkRenewAborted = false;

    // Show progress modal
    showBulkRenewProgress(placementIds.length);

    let successful = 0;
    let failed = 0;
    const errors = [];
    let totalCost = 0;

    // Batch processing - 5 at a time for progress visibility
    const batchSize = 5;
    for (let i = 0; i < placementIds.length; i += batchSize) {
        // Check if aborted
        if (bulkRenewAborted) {
            console.log('⚠️ Bulk renewal aborted by user');
            break;
        }

        const batch = placementIds.slice(i, i + batchSize);

        // Process batch in parallel
        const results = await Promise.allSettled(
            batch.map(id => fetch(`/api/billing/renew/${id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                }
            }).then(r => r.json()))
        );

        // Process results
        for (let j = 0; j < results.length; j++) {
            const result = results[j];
            const id = batch[j];

            if (result.status === 'fulfilled' && result.value.data) {
                successful++;
                totalCost += result.value.data.pricePaid || 0;
            } else {
                failed++;
                const errorMsg = result.status === 'rejected'
                    ? result.reason.message
                    : result.value.error || 'Failed to renew';
                errors.push(`Размещение #${id}: ${errorMsg}`);
                console.error(`Failed to renew placement ${id}:`, errorMsg);
            }
        }

        // Update progress
        const processedCount = Math.min(i + batchSize, placementIds.length);
        const progress = Math.round((processedCount / placementIds.length) * 100);
        updateBulkRenewProgress(progress, successful, failed, totalCost);
    }

    // Complete
    completeBulkRenewProgress(successful, failed, totalCost, errors);

    // Reload data
    await loadBalance();
    await loadAllPlacements();
}

/**
 * Show bulk renew progress modal
 */
function showBulkRenewProgress(total) {
    // Create modal if doesn't exist
    let modal = document.getElementById('bulkRenewModal');
    if (!modal) {
        const modalHtml = `
        <div class="modal fade" id="bulkRenewModal" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title"><i class="bi bi-clock-history me-2"></i>Массовое продление</h5>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <div class="d-flex justify-content-between mb-1">
                                <span id="bulkRenewStatus">Продление...</span>
                                <span id="bulkRenewPercent">0%</span>
                            </div>
                            <div class="progress" style="height: 25px;">
                                <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" id="bulkRenewProgressBar"
                                     role="progressbar" style="width: 0%"></div>
                            </div>
                        </div>
                        <div class="row text-center mb-3">
                            <div class="col-3">
                                <div class="fs-4 fw-bold" id="bulkRenewTotal">0</div>
                                <small class="text-muted">Всего</small>
                            </div>
                            <div class="col-3">
                                <div class="fs-4 fw-bold text-success" id="bulkRenewSuccessful">0</div>
                                <small class="text-muted">Успешно</small>
                            </div>
                            <div class="col-3">
                                <div class="fs-4 fw-bold text-danger" id="bulkRenewFailed">0</div>
                                <small class="text-muted">Ошибки</small>
                            </div>
                            <div class="col-3">
                                <div class="fs-4 fw-bold text-info" id="bulkRenewCost">$0</div>
                                <small class="text-muted">Стоимость</small>
                            </div>
                        </div>
                        <div id="bulkRenewErrors" class="d-none">
                            <div class="alert alert-danger" style="max-height: 150px; overflow-y: auto;">
                                <strong>Ошибки:</strong>
                                <ul class="mb-0" id="bulkRenewErrorList"></ul>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="bulkRenewAbortBtn" onclick="abortBulkRenew()">
                            <i class="bi bi-x-circle me-1"></i>Прервать
                        </button>
                        <button type="button" class="btn btn-primary d-none" id="bulkRenewCloseBtn" data-bs-dismiss="modal">
                            <i class="bi bi-check-circle me-1"></i>Закрыть
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('bulkRenewModal');
    }

    // Reset state
    document.getElementById('bulkRenewStatus').textContent = 'Продление размещений...';
    document.getElementById('bulkRenewPercent').textContent = '0%';
    document.getElementById('bulkRenewProgressBar').style.width = '0%';
    document.getElementById('bulkRenewProgressBar').className = 'progress-bar progress-bar-striped progress-bar-animated bg-primary';
    document.getElementById('bulkRenewTotal').textContent = total;
    document.getElementById('bulkRenewSuccessful').textContent = '0';
    document.getElementById('bulkRenewFailed').textContent = '0';
    document.getElementById('bulkRenewCost').textContent = '$0.00';
    document.getElementById('bulkRenewErrors').classList.add('d-none');
    document.getElementById('bulkRenewErrorList').innerHTML = '';
    document.getElementById('bulkRenewAbortBtn').classList.remove('d-none');
    document.getElementById('bulkRenewCloseBtn').classList.add('d-none');

    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

/**
 * Update bulk renew progress
 */
function updateBulkRenewProgress(percent, successful, failed, totalCost) {
    document.getElementById('bulkRenewPercent').textContent = `${percent}%`;
    document.getElementById('bulkRenewProgressBar').style.width = `${percent}%`;
    document.getElementById('bulkRenewSuccessful').textContent = successful;
    document.getElementById('bulkRenewFailed').textContent = failed;
    document.getElementById('bulkRenewCost').textContent = `$${totalCost.toFixed(2)}`;
}

/**
 * Complete bulk renew progress
 */
function completeBulkRenewProgress(successful, failed, totalCost, errors) {
    const total = successful + failed;
    document.getElementById('bulkRenewStatus').textContent = 'Завершено';
    document.getElementById('bulkRenewProgressBar').classList.remove('progress-bar-animated');

    if (failed === 0) {
        document.getElementById('bulkRenewProgressBar').classList.remove('bg-primary');
        document.getElementById('bulkRenewProgressBar').classList.add('bg-success');
        document.getElementById('bulkRenewStatus').innerHTML = '<i class="bi bi-check-circle me-1"></i>Все размещения продлены!';
    } else {
        document.getElementById('bulkRenewProgressBar').classList.remove('bg-primary');
        document.getElementById('bulkRenewProgressBar').classList.add('bg-warning');
        document.getElementById('bulkRenewStatus').innerHTML = `<i class="bi bi-exclamation-triangle me-1"></i>Завершено с ошибками`;

        // Show errors
        if (errors.length > 0) {
            const errorList = document.getElementById('bulkRenewErrorList');
            errorList.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
            document.getElementById('bulkRenewErrors').classList.remove('d-none');
        }
    }

    // Swap buttons
    document.getElementById('bulkRenewAbortBtn').classList.add('d-none');
    document.getElementById('bulkRenewCloseBtn').classList.remove('d-none');
}

/**
 * Abort bulk renewal
 */
function abortBulkRenew() {
    if (confirm('Прервать массовое продление?')) {
        bulkRenewAborted = true;
        document.getElementById('bulkRenewStatus').innerHTML = '<i class="bi bi-x-circle me-1"></i>Прервано пользователем';
        document.getElementById('bulkRenewProgressBar').classList.remove('progress-bar-animated', 'bg-primary');
        document.getElementById('bulkRenewProgressBar').classList.add('bg-secondary');
        document.getElementById('bulkRenewAbortBtn').classList.add('d-none');
        document.getElementById('bulkRenewCloseBtn').classList.remove('d-none');
    }
}

/**
 * Show bulk auto-renewal progress modal
 */
function showBulkAutoRenewalProgress(total, enabled) {
    const action = enabled ? 'Включение' : 'Выключение';

    // Create modal if doesn't exist
    let modal = document.getElementById('bulkAutoRenewalModal');
    if (!modal) {
        const modalHtml = `
        <div class="modal fade" id="bulkAutoRenewalModal" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="bi bi-arrow-repeat me-2"></i><span id="bulkAutoRenewalTitle">Автопродление</span></h5>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <div class="d-flex justify-content-between mb-1">
                                <span id="bulkAutoRenewalStatus">Обработка...</span>
                                <span id="bulkAutoRenewalPercent">0%</span>
                            </div>
                            <div class="progress" style="height: 25px;">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" id="bulkAutoRenewalProgressBar"
                                     role="progressbar" style="width: 0%"></div>
                            </div>
                        </div>
                        <div class="row text-center">
                            <div class="col-4">
                                <div class="fs-4 fw-bold" id="bulkAutoRenewalTotal">0</div>
                                <small class="text-muted">Всего</small>
                            </div>
                            <div class="col-4">
                                <div class="fs-4 fw-bold text-success" id="bulkAutoRenewalSuccessful">0</div>
                                <small class="text-muted">Успешно</small>
                            </div>
                            <div class="col-4">
                                <div class="fs-4 fw-bold text-danger" id="bulkAutoRenewalFailed">0</div>
                                <small class="text-muted">Ошибки</small>
                            </div>
                        </div>
                        <div id="bulkAutoRenewalErrors" class="mt-3 d-none">
                            <div class="alert alert-danger" style="max-height: 150px; overflow-y: auto;">
                                <strong>Ошибки:</strong>
                                <ul class="mb-0" id="bulkAutoRenewalErrorList"></ul>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="bulkAutoRenewalAbortBtn" onclick="abortBulkAutoRenewal()">
                            <i class="bi bi-x-circle me-1"></i>Прервать
                        </button>
                        <button type="button" class="btn btn-primary d-none" id="bulkAutoRenewalCloseBtn" data-bs-dismiss="modal">
                            <i class="bi bi-check-circle me-1"></i>Закрыть
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('bulkAutoRenewalModal');
    }

    // Reset state
    document.getElementById('bulkAutoRenewalTitle').textContent = `${action} автопродления`;
    document.getElementById('bulkAutoRenewalStatus').textContent = `${action} автопродления...`;
    document.getElementById('bulkAutoRenewalPercent').textContent = '0%';
    document.getElementById('bulkAutoRenewalProgressBar').style.width = '0%';
    document.getElementById('bulkAutoRenewalProgressBar').className = 'progress-bar progress-bar-striped progress-bar-animated';
    document.getElementById('bulkAutoRenewalTotal').textContent = total;
    document.getElementById('bulkAutoRenewalSuccessful').textContent = '0';
    document.getElementById('bulkAutoRenewalFailed').textContent = '0';
    document.getElementById('bulkAutoRenewalErrors').classList.add('d-none');
    document.getElementById('bulkAutoRenewalErrorList').innerHTML = '';
    document.getElementById('bulkAutoRenewalAbortBtn').classList.remove('d-none');
    document.getElementById('bulkAutoRenewalCloseBtn').classList.add('d-none');

    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

/**
 * Update bulk auto-renewal progress
 */
function updateBulkAutoRenewalProgress(percent, successful, failed, enabled) {
    document.getElementById('bulkAutoRenewalPercent').textContent = `${percent}%`;
    document.getElementById('bulkAutoRenewalProgressBar').style.width = `${percent}%`;
    document.getElementById('bulkAutoRenewalSuccessful').textContent = successful;
    document.getElementById('bulkAutoRenewalFailed').textContent = failed;
}

/**
 * Complete bulk auto-renewal progress
 */
function completeBulkAutoRenewalProgress(successful, failed, enabled, errors) {
    const action = enabled ? 'включено' : 'выключено';
    const progressBar = document.getElementById('bulkAutoRenewalProgressBar');
    progressBar.classList.remove('progress-bar-striped', 'progress-bar-animated');
    progressBar.style.width = '100%';

    if (failed === 0 && !bulkAutoRenewalAborted) {
        progressBar.classList.add('bg-success');
        document.getElementById('bulkAutoRenewalStatus').textContent = `Автопродление ${action} для всех!`;
    } else if (successful === 0) {
        progressBar.classList.add('bg-danger');
        document.getElementById('bulkAutoRenewalStatus').textContent = 'Все попытки провалены';
    } else if (bulkAutoRenewalAborted) {
        progressBar.classList.add('bg-warning');
        document.getElementById('bulkAutoRenewalStatus').textContent = `Прервано: ${successful} ${action}, ${failed} ошибок`;
    } else {
        progressBar.classList.add('bg-warning');
        document.getElementById('bulkAutoRenewalStatus').textContent = `Завершено: ${successful} ${action}, ${failed} ошибок`;
    }

    // Show errors if any
    if (errors && errors.length > 0) {
        const errorList = document.getElementById('bulkAutoRenewalErrorList');
        errorList.innerHTML = errors.map(e => `<li>ID #${e.id}: ${e.error}</li>`).join('');
        document.getElementById('bulkAutoRenewalErrors').classList.remove('d-none');
    }

    // Switch buttons
    document.getElementById('bulkAutoRenewalAbortBtn').classList.add('d-none');
    document.getElementById('bulkAutoRenewalCloseBtn').classList.remove('d-none');
}

/**
 * Abort bulk auto-renewal operation
 */
function abortBulkAutoRenewal() {
    if (confirm('Прервать операцию? Уже изменённые размещения останутся с новым состоянием.')) {
        bulkAutoRenewalAborted = true;
        document.getElementById('bulkAutoRenewalStatus').textContent = 'Прерываем...';
    }
}
