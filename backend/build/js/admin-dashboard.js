/**
 * Admin Dashboard with Charts
 */

let revenueByTypeChart = null;
let revenueTimelineChart = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await loadMultiPeriodRevenue();
    await loadDashboardStats('week');
    await loadRecentPurchases();

    // Period change listeners
    document.querySelectorAll('input[name="period"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            await loadDashboardStats(e.target.value);
        });
    });
});

/**
 * Load multi-period revenue (all periods at once)
 */
async function loadMultiPeriodRevenue() {
    try {
        const response = await fetch('/api/admin/revenue/multi-period', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load multi-period revenue');

        const result = await response.json();
        const data = result.data;

        // Update revenue cards
        document.getElementById('revenueDay').textContent = parseFloat(data.day.total || 0).toFixed(2);
        document.getElementById('transactionsDay').textContent = parseInt(data.day.purchases || 0) + parseInt(data.day.renewals || 0);

        document.getElementById('revenueWeek').textContent = parseFloat(data.week.total || 0).toFixed(2);
        document.getElementById('transactionsWeek').textContent = parseInt(data.week.purchases || 0) + parseInt(data.week.renewals || 0);

        document.getElementById('revenueMonth').textContent = parseFloat(data.month.total || 0).toFixed(2);
        document.getElementById('transactionsMonth').textContent = parseInt(data.month.purchases || 0) + parseInt(data.month.renewals || 0);

        document.getElementById('revenueYear').textContent = parseFloat(data.year.total || 0).toFixed(2);
        document.getElementById('transactionsYear').textContent = parseInt(data.year.purchases || 0) + parseInt(data.year.renewals || 0);

    } catch (error) {
        console.error('Failed to load multi-period revenue:', error);
    }
}

/**
 * Load dashboard stats for selected period
 */
async function loadDashboardStats(period = 'week') {
    try {
        const response = await fetch(`/api/admin/dashboard/stats?period=${period}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load dashboard stats');

        const result = await response.json();
        const stats = result.data;

        // Update placements stats
        document.getElementById('totalPlacements').textContent = stats.placements.total;
        document.getElementById('linkPlacements').textContent = stats.placements.links;
        document.getElementById('articlePlacements').textContent = stats.placements.articles;
        document.getElementById('scheduledPlacements').textContent = stats.placements.scheduled;

        // Update user stats
        document.getElementById('newUsers').textContent = stats.users.newUsers;
        document.getElementById('totalUserBalance').textContent = parseFloat(stats.users.totalBalance).toFixed(2);
        document.getElementById('totalUserSpending').textContent = parseFloat(stats.users.totalSpending).toFixed(2);

        // Update charts
        await updateRevenueByTypeChart(stats.revenue);
        await loadRevenueTimeline(period);

    } catch (error) {
        console.error('Failed to load dashboard stats:', error);
        showAlert('Ошибка загрузки статистики', 'danger');
    }
}

/**
 * Update revenue by type chart (pie chart)
 */
function updateRevenueByTypeChart(revenue) {
    const ctx = document.getElementById('revenueByTypeChart');

    // Destroy previous chart
    if (revenueByTypeChart) {
        revenueByTypeChart.destroy();
    }

    const purchases = parseFloat(revenue.purchases || 0);
    const renewals = parseFloat(revenue.renewals || 0);

    revenueByTypeChart = new Chart(ctx, {
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
                            const count = context.dataIndex === 0
                                ? revenue.purchases || 0
                                : revenue.renewals || 0;
                            return `${label}: $${value.toFixed(2)} (${count} шт)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Load revenue timeline chart
 */
async function loadRevenueTimeline(period = 'week') {
    try {
        const endDate = new Date();
        const startDate = new Date();

        // Calculate start date based on period
        switch (period) {
            case 'day':
                startDate.setDate(startDate.getDate() - 1);
                break;
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
        }

        const groupBy = period === 'year' ? 'month' : 'day';

        const response = await fetch(
            `/api/admin/revenue?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&groupBy=${groupBy}`,
            { headers: { 'Authorization': `Bearer ${getToken()}` } }
        );

        if (!response.ok) throw new Error('Failed to load revenue timeline');

        const result = await response.json();
        const data = result.data;

        updateRevenueTimelineChart(data, groupBy);

    } catch (error) {
        console.error('Failed to load revenue timeline:', error);
    }
}

/**
 * Update revenue timeline chart (line chart)
 */
function updateRevenueTimelineChart(data, groupBy) {
    const ctx = document.getElementById('revenueTimelineChart');

    // Destroy previous chart
    if (revenueTimelineChart) {
        revenueTimelineChart.destroy();
    }

    // Group data by period
    const periods = {};

    data.forEach(item => {
        const periodKey = formatPeriodKey(item.period, groupBy);

        if (!periods[periodKey]) {
            periods[periodKey] = { purchase: 0, renewal: 0, auto_renewal: 0 };
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

    revenueTimelineChart = new Chart(ctx, {
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
 * Load recent purchases
 */
async function loadRecentPurchases() {
    try {
        const response = await fetch('/api/admin/recent-purchases?limit=20', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load recent purchases');

        const result = await response.json();
        const purchases = result.data;

        renderRecentPurchases(purchases);

    } catch (error) {
        console.error('Failed to load recent purchases:', error);
        document.getElementById('recentPurchasesTable').innerHTML =
            '<tr><td colspan="8" class="text-center text-danger">Ошибка загрузки</td></tr>';
    }
}

/**
 * Render recent purchases table
 */
function renderRecentPurchases(purchases) {
    const tbody = document.getElementById('recentPurchasesTable');
    tbody.innerHTML = '';

    if (purchases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Нет покупок</td></tr>';
        return;
    }

    purchases.forEach(p => {
        const row = document.createElement('tr');

        const typeBadge = p.type === 'link'
            ? '<span class="badge bg-primary">Ссылка</span>'
            : '<span class="badge bg-success">Статья</span>';

        const statusBadges = {
            'placed': '<span class="badge bg-success">Размещено</span>',
            'pending': '<span class="badge bg-warning">Ожидание</span>',
            'scheduled': '<span class="badge bg-info">Запланировано</span>',
            'failed': '<span class="badge bg-danger">Ошибка</span>'
        };

        row.innerHTML = `
            <td>${formatDate(p.purchased_at)}</td>
            <td>
                ${p.username}
                <br><small class="text-muted">${p.email}</small>
            </td>
            <td>${p.project_name || '—'}</td>
            <td>${typeBadge}</td>
            <td><a href="${p.site_url}" target="_blank">${p.site_name}</a></td>
            <td class="fw-bold text-success">$${parseFloat(p.final_price || 0).toFixed(2)}</td>
            <td>
                ${p.discount_applied > 0
                    ? `<span class="badge bg-warning">${p.discount_applied}%</span>`
                    : '—'}
            </td>
            <td>${statusBadges[p.status] || p.status}</td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Utility functions
 */
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
