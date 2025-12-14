/**
 * User Statistics Dashboard
 * Shows user-specific spending and placement statistics
 */

/**
 * Get translated tier name based on discount percentage
 */
function getTranslatedTierName(discount) {
    const discountInt = parseInt(discount) || 0;
    // Standard tier (0%) should use translation, others keep English names
    if (discountInt === 0) return t('tierStandard');
    // Other tiers: Bronze(10%), Silver(15%), Gold(20%), Platinum(25%), Diamond(30%)
    const tierNames = {
        10: 'Bronze',
        15: 'Silver',
        20: 'Gold',
        25: 'Platinum',
        30: 'Diamond'
    };
    return tierNames[discountInt] || t('tierStandard');
}

// Check authentication
if (!isAuthenticated()) {
    window.location.href = '/index.html';
}

let spendingByTypeChart = null;
let spendingTimelineChart = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await loadUserBalance();
    await loadMultiPeriodSpending();
    await loadUserStats('week');
    await loadRecentPurchases();

    // Period selector button listeners
    document.querySelectorAll('.stats-period-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const period = btn.dataset.period;
            updateActivePeriod(period);
            await loadUserStats(period);
        });
    });

    // Spending card click listeners
    document.querySelectorAll('.stats-spending-card').forEach(card => {
        card.addEventListener('click', async () => {
            const period = card.dataset.period;
            updateActivePeriod(period);
            await loadUserStats(period);
        });
    });
});

/**
 * Update active period (both buttons and cards)
 */
function updateActivePeriod(period) {
    // Update period buttons
    document.querySelectorAll('.stats-period-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });

    // Update spending cards
    document.querySelectorAll('.stats-spending-card').forEach(card => {
        card.classList.toggle('active', card.dataset.period === period);
    });
}

/**
 * Load user balance info
 */
async function loadUserBalance() {
    try {
        const response = await fetch('/api/billing/balance', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load balance');

        const result = await response.json();
        const data = result.data;

        document.getElementById('currentBalance').textContent = parseFloat(data.balance || 0).toFixed(2);
        document.getElementById('totalSpent').textContent = parseFloat(data.totalSpent || 0).toFixed(2);
        // Translate tier name based on discount percentage
        document.getElementById('discountTier').textContent = getTranslatedTierName(data.currentDiscount);

    } catch (error) {
        console.error('Failed to load balance:', error);
    }
}

/**
 * Load multi-period spending (all periods at once)
 */
async function loadMultiPeriodSpending() {
    try {
        const response = await fetch('/api/billing/statistics/spending', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load spending statistics');

        const result = await response.json();
        const data = result.data;

        // Update spending cards
        document.getElementById('spendingDay').textContent = parseFloat(data.day.total || 0).toFixed(2);
        document.getElementById('transactionsDay').textContent = parseInt(data.day.count || 0);

        document.getElementById('spendingWeek').textContent = parseFloat(data.week.total || 0).toFixed(2);
        document.getElementById('transactionsWeek').textContent = parseInt(data.week.count || 0);

        document.getElementById('spendingMonth').textContent = parseFloat(data.month.total || 0).toFixed(2);
        document.getElementById('transactionsMonth').textContent = parseInt(data.month.count || 0);

        document.getElementById('spendingYear').textContent = parseFloat(data.year.total || 0).toFixed(2);
        document.getElementById('transactionsYear').textContent = parseInt(data.year.count || 0);

    } catch (error) {
        console.error('Failed to load spending statistics:', error);
    }
}

/**
 * Load user stats for selected period
 */
async function loadUserStats(period = 'week') {
    try {
        const response = await fetch(`/api/billing/statistics/placements?period=${period}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load placement stats');

        const result = await response.json();
        const stats = result.data;

        // Update placements stats
        document.getElementById('totalPlacements').textContent = stats.placements.total;
        document.getElementById('linkPlacements').textContent = stats.placements.links;
        document.getElementById('articlePlacements').textContent = stats.placements.articles;
        document.getElementById('scheduledPlacements').textContent = stats.placements.scheduled;

        // Update charts
        await updateSpendingByTypeChart(stats.spending);
        await loadSpendingTimeline(period);

    } catch (error) {
        console.error('Failed to load user stats:', error);
        showAlert('Ошибка загрузки статистики', 'danger');
    }
}

/**
 * Update spending by type chart (pie chart)
 */
function updateSpendingByTypeChart(spending) {
    const ctx = document.getElementById('spendingByTypeChart');

    // Destroy previous chart
    if (spendingByTypeChart) {
        spendingByTypeChart.destroy();
    }

    const purchases = parseFloat(spending.purchases || 0);
    const renewals = parseFloat(spending.renewals || 0);

    spendingByTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Покупки', 'Продления'],
            datasets: [{
                data: [purchases, renewals],
                backgroundColor: [
                    'rgba(13, 110, 253, 0.8)',
                    'rgba(25, 135, 84, 0.8)'
                ],
                borderColor: [
                    'rgba(13, 110, 253, 1)',
                    'rgba(25, 135, 84, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            return `${label}: $${value.toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Load spending timeline chart
 */
async function loadSpendingTimeline(period = 'week') {
    try {
        const response = await fetch(`/api/billing/statistics/timeline?period=${period}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load spending timeline');

        const result = await response.json();
        const data = result.data;

        const groupBy = period === 'year' ? 'month' : 'day';
        updateSpendingTimelineChart(data, groupBy);

    } catch (error) {
        console.error('Failed to load spending timeline:', error);
    }
}

/**
 * Update spending timeline chart (line chart)
 */
function updateSpendingTimelineChart(data, groupBy) {
    const ctx = document.getElementById('spendingTimelineChart');

    // Destroy previous chart
    if (spendingTimelineChart) {
        spendingTimelineChart.destroy();
    }

    // Group data by period
    const periods = {};

    data.forEach(item => {
        const periodKey = formatPeriodKey(item.period, groupBy);

        if (!periods[periodKey]) {
            periods[periodKey] = { purchase: 0, renewal: 0 };
        }

        const amount = parseFloat(item.total_amount || 0);

        if (item.type === 'purchase') {
            periods[periodKey].purchase += amount;
        } else if (item.type === 'renewal' || item.type === 'auto_renewal') {
            periods[periodKey].renewal += amount;
        }
    });

    // Sort periods chronologically
    const sortedPeriods = Object.keys(periods).sort();

    const labels = sortedPeriods;
    const purchaseData = sortedPeriods.map(p => periods[p].purchase);
    const renewalData = sortedPeriods.map(p => periods[p].renewal);

    spendingTimelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Покупки',
                    data: purchaseData,
                    borderColor: 'rgba(13, 110, 253, 1)',
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Продления',
                    data: renewalData,
                    borderColor: 'rgba(25, 135, 84, 1)',
                    backgroundColor: 'rgba(25, 135, 84, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y || 0;
                            return `${label}: $${value.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(0);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Format period key for chart labels
 */
function formatPeriodKey(periodString, groupBy) {
    const date = new Date(periodString);

    if (groupBy === 'month') {
        return date.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' });
    } else if (groupBy === 'day') {
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
    } else {
        return date.toLocaleDateString('ru-RU');
    }
}

/**
 * Load recent purchases for current user
 */
async function loadRecentPurchases() {
    try {
        const response = await fetch('/api/billing/statistics/recent-purchases?limit=20', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load recent purchases');

        const result = await response.json();
        const purchases = result.data;

        renderRecentPurchases(purchases);

    } catch (error) {
        console.error('Failed to load recent purchases:', error);
        document.getElementById('recentPurchasesTable').innerHTML =
            '<tr><td colspan="7" class="text-center text-danger">Ошибка загрузки</td></tr>';
    }
}

/**
 * Render recent purchases table
 */
function renderRecentPurchases(purchases) {
    const tbody = document.getElementById('recentPurchasesTable');
    tbody.innerHTML = '';

    if (purchases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">' + t('noPurchases') + '</td></tr>';
        return;
    }

    purchases.forEach(p => {
        const row = document.createElement('tr');

        // Type badge with new CSS classes
        const typeBadgeClass = p.type === 'link' ? 'badge-link' : 'badge-article';
        const typeIcon = p.type === 'link' ? 'bi-link-45deg' : 'bi-file-earmark-text';
        const typeText = p.type === 'link' ? t('typeHomepage') : t('typeArticle');

        // Status badge with new CSS classes
        let statusBadgeClass = 'badge-pending';
        let statusIcon = 'bi-clock';
        if (p.status === 'placed') {
            statusBadgeClass = 'badge-placed';
            statusIcon = 'bi-check-circle';
        } else if (p.status === 'failed') {
            statusBadgeClass = 'badge-failed';
            statusIcon = 'bi-x-circle';
        }

        row.innerHTML = `
            <td>${formatDateTime(p.purchased_at)}</td>
            <td>${escapeHtml(p.project_name || '—')}</td>
            <td><span class="badge ${typeBadgeClass}"><i class="bi ${typeIcon}"></i> ${typeText}</span></td>
            <td><a href="${escapeHtml(p.site_url)}" target="_blank" class="site-link">${escapeHtml(p.site_name)} <i class="bi bi-box-arrow-up-right"></i></a></td>
            <td class="fw-bold text-success">$${parseFloat(p.final_price || 0).toFixed(2)}</td>
            <td>
                ${p.discount_applied > 0
                    ? `<span class="badge bg-warning text-dark">${p.discount_applied}%</span>`
                    : '—'}
            </td>
            <td><span class="badge ${statusBadgeClass}"><i class="bi ${statusIcon}"></i> ${getStatusText(p.status)}</span></td>
            <td>
                ${p.placement_id
                    ? `<a href="/placements-manager.html?id=${p.placement_id}" class="btn-action" title="${t('viewDetails')}"><i class="bi bi-arrow-right"></i></a>`
                    : '—'}
            </td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Get translated status text
 */
function getStatusText(status) {
    const statusTexts = {
        placed: t('statusPlaced'),
        pending: t('statusPending'),
        failed: t('statusFailed')
    };
    return statusTexts[status] || status;
}

// Utility functions provided by shared modules:
// formatDateTime() is provided by badge-utils.js
// showAlert() is provided by security.js
// getToken() is provided by auth.js
// escapeHtml() is provided by security.js
