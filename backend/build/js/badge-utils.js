/**
 * Badge & Status Utilities
 * Shared configurations for badges, status labels, and color coding
 *
 * Used by: placements-manager.js, admin-placements.js, admin-dashboard.js, admin-users.js, balance.js
 */

// ============================================
// Placement Status Badges
// ============================================

const PLACEMENT_STATUS_BADGES = {
    'placed': '<span class="badge bg-success">Размещено</span>',
    'pending': '<span class="badge bg-warning">Ожидание</span>',
    'pending_approval': '<span class="badge bg-warning"><i class="bi bi-hourglass-split"></i> На модерации</span>',
    'scheduled': '<span class="badge bg-info">Запланировано</span>',
    'expired': '<span class="badge bg-secondary">Истекло</span>',
    'cancelled': '<span class="badge bg-danger">Отменено</span>',
    'rejected': '<span class="badge bg-danger"><i class="bi bi-x-circle"></i> Отклонено</span>',
    'failed': '<span class="badge bg-danger">Ошибка</span>'
};

function getPlacementStatusBadge(status) {
    return PLACEMENT_STATUS_BADGES[status] || `<span class="badge bg-secondary">${escapeHtml(status)}</span>`;
}

// ============================================
// Placement Type Badges
// ============================================

const PLACEMENT_TYPE_BADGES = {
    'link': '<span class="badge bg-primary">Главная</span>',
    'article': '<span class="badge bg-success">Статья</span>'
};

function getPlacementTypeBadge(type) {
    return PLACEMENT_TYPE_BADGES[type] || `<span class="badge bg-secondary">${escapeHtml(type)}</span>`;
}

// ============================================
// Site Type Badges
// ============================================

const SITE_TYPE_BADGES = {
    'wordpress': '<span class="badge bg-secondary"><i class="bi bi-wordpress"></i> WP</span>',
    'static_php': '<span class="badge bg-success"><i class="bi bi-filetype-php"></i> PHP</span>'
};

function getSiteTypeBadge(siteType) {
    return SITE_TYPE_BADGES[siteType] || SITE_TYPE_BADGES['wordpress'];
}

// ============================================
// Transaction Type Badges
// ============================================

const TRANSACTION_TYPE_BADGES = {
    'deposit': '<span class="badge bg-success">Пополнение</span>',
    'purchase': '<span class="badge bg-primary">Покупка</span>',
    'renewal': '<span class="badge bg-info">Продление</span>',
    'auto_renewal': '<span class="badge bg-info">Авто-продление</span>',
    'refund': '<span class="badge bg-warning">Возврат</span>',
    'admin_adjustment': '<span class="badge bg-secondary">Корректировка</span>',
    'adjustment': '<span class="badge bg-secondary">Корректировка</span>'
};

function getTransactionTypeBadge(type) {
    return TRANSACTION_TYPE_BADGES[type] || `<span class="badge bg-secondary">${escapeHtml(type)}</span>`;
}

// ============================================
// User Role Badges
// ============================================

const USER_ROLE_BADGES = {
    'admin': '<span class="badge bg-danger">Админ</span>',
    'user': '<span class="badge bg-secondary">Пользователь</span>'
};

function getUserRoleBadge(role) {
    return USER_ROLE_BADGES[role] || `<span class="badge bg-secondary">${escapeHtml(role)}</span>`;
}

// ============================================
// Auto-Renewal Icons
// ============================================

function getAutoRenewalIcon(enabled) {
    return enabled
        ? '<i class="bi bi-arrow-repeat text-success" title="Включено"></i>'
        : '<i class="bi bi-dash-circle text-muted" title="Выключено"></i>';
}

// ============================================
// Amount Color Classes
// ============================================

function getAmountColorClass(amount) {
    if (amount > 0) return 'text-success';
    if (amount < 0) return 'text-danger';
    return 'text-muted';
}

// ============================================
// Balance Color Classes
// ============================================

function getBalanceColorClass(balance) {
    return balance > 0 ? 'text-success' : 'text-muted';
}

// ============================================
// Expiry Date Formatting with Color
// ============================================

function formatExpiryWithColor(expiresAt) {
    if (!expiresAt) return { text: 'Бессрочно', class: '' };

    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    const formattedDate = expiryDate.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    if (daysLeft < 0) {
        return { text: formattedDate, class: 'text-danger fw-bold', expired: true };
    } else if (daysLeft <= 3) {
        return { text: formattedDate, class: 'text-danger fw-bold', daysLeft };
    } else if (daysLeft <= 7) {
        return { text: formattedDate, class: 'text-warning', daysLeft };
    } else {
        return { text: formattedDate, class: '', daysLeft };
    }
}

// ============================================
// SEO Metric Color (DR, DA, TF, CF)
// ============================================

function getMetricColorClass(value, thresholds = { high: 50, medium: 30, low: 15 }) {
    const numValue = parseInt(value) || 0;
    if (numValue >= thresholds.high) return 'text-success fw-bold';
    if (numValue >= thresholds.medium) return 'text-success';
    if (numValue >= thresholds.low) return 'text-warning';
    return 'text-muted';
}

// Shorthand functions for common metrics
function getDrColorClass(dr) {
    return getMetricColorClass(dr, { high: 50, medium: 30, low: 15 });
}

function getDaColorClass(da) {
    return getMetricColorClass(da, { high: 50, medium: 30, low: 15 });
}

function getTfColorClass(tf) {
    return getMetricColorClass(tf, { high: 40, medium: 25, low: 10 });
}

function getCfColorClass(cf) {
    return getMetricColorClass(cf, { high: 40, medium: 25, low: 10 });
}

// ============================================
// Discount Tier Status
// ============================================

function getTierStatusHtml(isActive, isAchieved) {
    if (isActive) {
        return '<span class="badge bg-success ms-2">Текущий</span>';
    }
    if (isAchieved) {
        return '<span class="text-success"><i class="bi bi-check-circle-fill"></i> Достигнут</span>';
    }
    return '<span class="text-muted"><i class="bi bi-lock-fill"></i> Заблокирован</span>';
}

// ============================================
// Empty State Messages
// ============================================

function getEmptyTableRow(colspan, message = 'Нет данных') {
    return `<tr><td colspan="${colspan}" class="text-center text-muted">${escapeHtml(message)}</td></tr>`;
}

function getErrorTableRow(colspan, message = 'Ошибка загрузки') {
    return `<tr><td colspan="${colspan}" class="text-center text-danger">${escapeHtml(message)}</td></tr>`;
}

// ============================================
// Export to window
// ============================================

if (typeof window !== 'undefined') {
    // Status badges
    window.PLACEMENT_STATUS_BADGES = PLACEMENT_STATUS_BADGES;
    window.getPlacementStatusBadge = getPlacementStatusBadge;
    window.PLACEMENT_TYPE_BADGES = PLACEMENT_TYPE_BADGES;
    window.getPlacementTypeBadge = getPlacementTypeBadge;
    window.SITE_TYPE_BADGES = SITE_TYPE_BADGES;
    window.getSiteTypeBadge = getSiteTypeBadge;
    window.TRANSACTION_TYPE_BADGES = TRANSACTION_TYPE_BADGES;
    window.getTransactionTypeBadge = getTransactionTypeBadge;
    window.USER_ROLE_BADGES = USER_ROLE_BADGES;
    window.getUserRoleBadge = getUserRoleBadge;

    // Icon helpers
    window.getAutoRenewalIcon = getAutoRenewalIcon;

    // Color helpers
    window.getAmountColorClass = getAmountColorClass;
    window.getBalanceColorClass = getBalanceColorClass;
    window.formatExpiryWithColor = formatExpiryWithColor;
    window.getMetricColorClass = getMetricColorClass;
    window.getDrColorClass = getDrColorClass;
    window.getDaColorClass = getDaColorClass;
    window.getTfColorClass = getTfColorClass;
    window.getCfColorClass = getCfColorClass;

    // Tier status
    window.getTierStatusHtml = getTierStatusHtml;

    // Table helpers
    window.getEmptyTableRow = getEmptyTableRow;
    window.getErrorTableRow = getErrorTableRow;
}
