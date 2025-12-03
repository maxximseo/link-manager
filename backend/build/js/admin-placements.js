// Admin Placements Management

// Initialize navbar
initNavbar('admin', 'placements');

// Check authentication
if (!isAuthenticated()) {
    window.location.href = '/index.html';
}

// Check admin role
const user = getCurrentUser();
if (user && user.role !== 'admin') {
    window.location.href = '/dashboard.html';
}

let placements = [];
let filteredPlacements = [];
let currentPage = 1;
let placementsPerPage = 50; // Можно менять через UI селектор

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await loadPlacements();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Filter inputs with debounce for text fields
    ['userFilter', 'siteFilter'].forEach(id => {
        document.getElementById(id).addEventListener('input', debounce(() => {
            applyFilters();
        }, 500));
    });
}

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Change page size
function changePageSize(newSize) {
    placementsPerPage = parseInt(newSize);
    currentPage = 1;
    renderPlacements();
    renderPagination();
}

// Load placements from API
async function loadPlacements() {
    try {
        const response = await fetch(`/api/admin/placements?limit=5000`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load placements');
        }

        const result = await response.json();
        placements = result.data || [];
        filteredPlacements = [...placements];

        updateStatistics();
        applyFilters();
    } catch (error) {
        console.error('Error loading placements:', error);
        showError('Ошибка загрузки размещений: ' + error.message);
    }
}

// Update statistics cards
function updateStatistics() {
    const total = placements.length;
    const active = placements.filter(p => p.status === 'placed' && (!p.expires_at || new Date(p.expires_at) > new Date())).length;
    const autoRenewal = placements.filter(p => p.auto_renewal === true).length;
    const scheduled = placements.filter(p => p.status === 'scheduled' || (p.scheduled_publish_date && new Date(p.scheduled_publish_date) > new Date())).length;

    document.getElementById('totalPlacements').textContent = total;
    document.getElementById('activePlacements').textContent = active;
    document.getElementById('autoRenewalPlacements').textContent = autoRenewal;
    document.getElementById('scheduledPlacements').textContent = scheduled;
}

// Apply filters
function applyFilters() {
    const typeFilter = document.getElementById('typeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const userFilter = document.getElementById('userFilter').value.toLowerCase();
    const siteFilter = document.getElementById('siteFilter').value.toLowerCase();
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;

    filteredPlacements = placements.filter(placement => {
        // Type filter
        const matchesType = !typeFilter || placement.type === typeFilter;

        // Status filter
        const matchesStatus = !statusFilter || placement.status === statusFilter;

        // User filter
        const matchesUser = !userFilter || placement.username.toLowerCase().includes(userFilter);

        // Site filter
        const matchesSite = !siteFilter || placement.site_url.toLowerCase().includes(siteFilter);

        // Date filters
        let matchesDate = true;
        if (dateFrom || dateTo) {
            const purchaseDate = new Date(placement.purchased_at);
            if (dateFrom) matchesDate = matchesDate && purchaseDate >= new Date(dateFrom);
            if (dateTo) matchesDate = matchesDate && purchaseDate <= new Date(dateTo + 'T23:59:59');
        }

        return matchesType && matchesStatus && matchesUser && matchesSite && matchesDate;
    });

    currentPage = 1;
    renderPlacements();
    renderPagination();
}

// Reset filters
function resetFilters() {
    document.getElementById('typeFilter').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('userFilter').value = '';
    document.getElementById('siteFilter').value = '';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';

    applyFilters();
}

// Render placements table
function renderPlacements() {
    const tbody = document.getElementById('placementsTableBody');
    const start = (currentPage - 1) * placementsPerPage;
    const end = start + placementsPerPage;
    const pagePlacements = filteredPlacements.slice(start, end);

    document.getElementById('placementsCount').textContent = filteredPlacements.length;

    if (pagePlacements.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="text-center text-muted">
                    <i class="bi bi-inbox"></i> Размещения не найдены
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = pagePlacements.map(placement => {
        // Parse prices
        const originalPrice = parseFloat(placement.original_price || 0);
        const discountApplied = parseInt(placement.discount_applied || 0);
        const finalPrice = parseFloat(placement.final_price || 0);

        // Format dates
        const purchasedAt = new Date(placement.purchased_at).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        // Use shared badge-utils functions
        const expiryInfo = formatExpiryWithColor(placement.expires_at);
        const typeBadge = getPlacementTypeBadge(placement.type);
        const statusBadge = getPlacementStatusBadge(placement.status);
        const autoRenewalIcon = getAutoRenewalIcon(placement.auto_renewal);

        return `
            <tr onclick="viewPlacementDetails(${placement.id})" style="cursor: pointer;">
                <td>${placement.id}</td>
                <td><small><strong>${escapeHtml(placement.username)}</strong></small></td>
                <td><small>${escapeHtml(placement.project_name)}</small></td>
                <td><small>${escapeHtml(placement.site_name)}</small></td>
                <td>${typeBadge}</td>
                <td><small>$${originalPrice.toFixed(2)}</small></td>
                <td><small class="text-success">${discountApplied}%</small></td>
                <td><small class="fw-bold">$${finalPrice.toFixed(2)}</small></td>
                <td><small>${purchasedAt}</small></td>
                <td><small class="${expiryInfo.class}">${expiryInfo.text}</small></td>
                <td class="text-center">${autoRenewalIcon}</td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

// Render pagination
function renderPagination() {
    const totalPages = Math.ceil(filteredPlacements.length / placementsPerPage);
    const pagination = document.getElementById('pagination');

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';

    // Previous button
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1}); return false;">Назад</a>
        </li>
    `;

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `
                <li class="page-item ${currentPage === i ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a>
                </li>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }

    // Next button
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1}); return false;">Вперед</a>
        </li>
    `;

    pagination.innerHTML = html;
}

// Change page
function changePage(page) {
    const totalPages = Math.ceil(filteredPlacements.length / placementsPerPage);
    if (page < 1 || page > totalPages) return;

    currentPage = page;
    renderPlacements();
    renderPagination();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// View placement details
function viewPlacementDetails(placementId) {
    const placement = placements.find(p => p.id === placementId);
    if (!placement) return;

    document.getElementById('detailsId').textContent = placement.id;

    const originalPrice = parseFloat(placement.original_price || 0);
    const discountApplied = parseInt(placement.discount_applied || 0);
    const finalPrice = parseFloat(placement.final_price || 0);
    const renewalPrice = parseFloat(placement.renewal_price || 0);

    const purchasedAt = new Date(placement.purchased_at).toLocaleString('ru-RU');
    const expiresAt = placement.expires_at
        ? new Date(placement.expires_at).toLocaleString('ru-RU')
        : 'Не истекает';
    const scheduledDate = placement.scheduled_publish_date
        ? new Date(placement.scheduled_publish_date).toLocaleString('ru-RU')
        : 'Немедленная публикация';

    const html = `
        <div class="row">
            <div class="col-md-6">
                <h6 class="text-muted">Информация о пользователе</h6>
                <p><strong>Пользователь:</strong> ${escapeHtml(placement.username)}</p>
                <p><strong>Email:</strong> ${escapeHtml(placement.email || 'N/A')}</p>
            </div>
            <div class="col-md-6">
                <h6 class="text-muted">Информация о размещении</h6>
                <p><strong>Проект:</strong> ${escapeHtml(placement.project_name)}</p>
                <p><strong>Сайт:</strong> ${escapeHtml(placement.site_name)}</p>
                <p><strong>URL сайта:</strong> <a href="${escapeHtml(placement.site_url)}" target="_blank">${escapeHtml(placement.site_url)}</a></p>
            </div>
        </div>
        <hr>
        <div class="row">
            <div class="col-md-6">
                <h6 class="text-muted">Ценообразование</h6>
                <p><strong>Оригинальная цена:</strong> $${originalPrice.toFixed(2)}</p>
                <p><strong>Примененная скидка:</strong> ${discountApplied}%</p>
                <p><strong>Финальная цена:</strong> <span class="text-success fw-bold">$${finalPrice.toFixed(2)}</span></p>
                ${placement.type === 'link' ? `<p><strong>Цена продления:</strong> $${renewalPrice.toFixed(2)}</p>` : ''}
            </div>
            <div class="col-md-6">
                <h6 class="text-muted">Даты</h6>
                <p><strong>Дата покупки:</strong> ${purchasedAt}</p>
                ${placement.type === 'link' ? `<p><strong>Истекает:</strong> ${expiresAt}</p>` : ''}
                <p><strong>Запланированная дата:</strong> ${scheduledDate}</p>
                ${placement.published_at ? `<p><strong>Опубликовано:</strong> ${new Date(placement.published_at).toLocaleString('ru-RU')}</p>` : ''}
            </div>
        </div>
        <hr>
        <div class="row">
            <div class="col-md-6">
                <h6 class="text-muted">Статус и настройки</h6>
                <p><strong>Тип:</strong> ${placement.type === 'link' ? 'Главная' : 'Статья'}</p>
                <p><strong>Статус:</strong> ${placement.status}</p>
                ${placement.type === 'link' ? `<p><strong>Автопродление:</strong> ${placement.auto_renewal ? '✅ Включено' : '❌ Выключено'}</p>` : ''}
                ${placement.wordpress_post_id ? `<p><strong>WordPress Post ID:</strong> ${placement.wordpress_post_id}</p>` : ''}
            </div>
            <div class="col-md-6">
                <h6 class="text-muted">Статистика продлений</h6>
                ${placement.renewal_count ? `<p><strong>Количество продлений:</strong> ${placement.renewal_count}</p>` : '<p class="text-muted">Продлений не было</p>'}
                ${placement.last_renewed_at ? `<p><strong>Последнее продление:</strong> ${new Date(placement.last_renewed_at).toLocaleString('ru-RU')}</p>` : ''}
            </div>
        </div>
    `;

    document.getElementById('detailsBody').innerHTML = html;

    const modal = new bootstrap.Modal(document.getElementById('placementDetailsModal'));
    modal.show();
}

// Export placements
async function exportPlacements(format) {
    try {
        const response = await fetch(`/api/billing/export/placements?format=${format}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to export placements');
        }

        // Get filename from Content-Disposition header or use default
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `placements_export_${new Date().toISOString().split('T')[0]}.${format}`;
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
            if (filenameMatch) filename = filenameMatch[1];
        }

        // Download file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showSuccess(`Экспорт успешно завершен: ${filename}`);
    } catch (error) {
        console.error('Error exporting placements:', error);
        showError('Ошибка экспорта: ' + error.message);
    }
}

// Helper functions
// escapeHtml() is provided by security.js (loaded first)
// showAlert() is provided by security.js - use showAlert(message, 'success') or showAlert(message, 'danger')
// getToken() is provided by auth.js (loaded first)
// logout() is provided by auth.js (loaded first)
