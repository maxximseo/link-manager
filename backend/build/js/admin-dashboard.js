/**
 * Admin Dashboard with Charts
 */

// Check authentication
if (!isAuthenticated()) {
    window.location.href = '/index.html';
}

// Check admin role
const user = getCurrentUser();
if (user && user.role !== 'admin') {
    window.location.href = '/dashboard.html';
}

let revenueByTypeChart = null;
let revenueTimelineChart = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await loadSystemHealth();
    await loadMultiPeriodRevenue();
    await loadDashboardStats('week');
    await loadRecentPurchases();

    // Period change listeners
    document.querySelectorAll('input[name="period"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            await loadDashboardStats(e.target.value);
        });
    });

    // Auto-refresh system health every 30 seconds
    setInterval(loadSystemHealth, 30000);
});

/**
 * Load system health metrics
 */
async function loadSystemHealth() {
    try {
        const response = await fetch('/health/metrics');
        if (!response.ok) throw new Error('Failed to load health metrics');

        const data = await response.json();

        // Update uptime
        document.getElementById('healthUptime').textContent = data.uptime;

        // Update requests
        document.getElementById('healthRequests').textContent = data.requests.total.toLocaleString();

        // Update avg response time with color coding
        const avgResponse = data.requests.avgResponseTimeMs;
        const avgResponseEl = document.getElementById('healthAvgResponse');
        avgResponseEl.textContent = `${avgResponse}ms`;
        avgResponseEl.className = 'mb-0';
        if (avgResponse > 500) {
            avgResponseEl.classList.add('text-danger');
        } else if (avgResponse > 200) {
            avgResponseEl.classList.add('text-warning');
        } else {
            avgResponseEl.classList.add('text-success');
        }

        // Update errors with color coding
        const errors = data.requests.errors.count;
        const errorsEl = document.getElementById('healthErrors');
        errorsEl.textContent = errors.toLocaleString();
        errorsEl.className = 'mb-0';
        if (errors > 10) {
            errorsEl.classList.add('text-danger');
        } else if (errors > 0) {
            errorsEl.classList.add('text-warning');
        } else {
            errorsEl.classList.add('text-success');
        }

        // Update memory
        const memoryEl = document.getElementById('healthMemory');
        memoryEl.textContent = `${data.memory.heapUsedMB}/${data.memory.heapTotalMB} MB`;
        const memoryPercent = (data.memory.heapUsedMB / data.memory.heapTotalMB) * 100;
        memoryEl.className = 'mb-0';
        if (memoryPercent > 85) {
            memoryEl.classList.add('text-danger');
        } else if (memoryPercent > 70) {
            memoryEl.classList.add('text-warning');
        }

        // Update DB pool
        const dbPool = data.database.pool;
        const dbPoolEl = document.getElementById('healthDbPool');
        dbPoolEl.textContent = `${dbPool.idle}/${dbPool.total}`;
        dbPoolEl.className = 'mb-0';
        if (dbPool.waiting > 0) {
            dbPoolEl.classList.add('text-warning');
            dbPoolEl.textContent += ` (${dbPool.waiting} wait)`;
        }

        // Update Redis status
        const redisEl = document.getElementById('healthRedisStatus');
        redisEl.textContent = data.redis.status;
        redisEl.className = 'badge me-2';
        if (data.redis.status === 'connected') {
            redisEl.classList.add('bg-success');
        } else if (data.redis.status === 'degraded') {
            redisEl.classList.add('bg-warning');
        } else {
            redisEl.classList.add('bg-danger');
        }

        // Update Queue status
        const queueEl = document.getElementById('healthQueueStatus');
        if (data.queue) {
            queueEl.textContent = `Active: ${data.queue.active}, Failed: ${data.queue.failed}`;
            queueEl.className = 'badge me-2';
            if (data.queue.failed > 0) {
                queueEl.classList.add('bg-warning');
            } else {
                queueEl.classList.add('bg-success');
            }
        } else {
            queueEl.textContent = 'N/A';
            queueEl.className = 'badge me-2 bg-secondary';
        }

        // Update timestamp
        const timestamp = new Date(data.timestamp);
        document.getElementById('healthTimestamp').textContent = timestamp.toLocaleTimeString('ru-RU');

    } catch (error) {
        console.error('Failed to load system health:', error);
    }
}

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
        document.getElementById('transactionsDay').textContent = parseInt(data.day.purchases || 0) + parseInt(data.day.renewals || 0) + parseInt(data.day.rentals || 0);

        document.getElementById('revenueWeek').textContent = parseFloat(data.week.total || 0).toFixed(2);
        document.getElementById('transactionsWeek').textContent = parseInt(data.week.purchases || 0) + parseInt(data.week.renewals || 0) + parseInt(data.week.rentals || 0);

        document.getElementById('revenueMonth').textContent = parseFloat(data.month.total || 0).toFixed(2);
        document.getElementById('transactionsMonth').textContent = parseInt(data.month.purchases || 0) + parseInt(data.month.renewals || 0) + parseInt(data.month.rentals || 0);

        document.getElementById('revenueYear').textContent = parseFloat(data.year.total || 0).toFixed(2);
        document.getElementById('transactionsYear').textContent = parseInt(data.year.purchases || 0) + parseInt(data.year.renewals || 0) + parseInt(data.year.rentals || 0);

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
        document.getElementById('totalUserBalance').textContent = parseFloat(stats.users.totalBalance || 0).toFixed(2);
        document.getElementById('totalUserSpending').textContent = parseFloat(stats.users.totalSpending || 0).toFixed(2);

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
    const rentals = parseFloat(revenue.rentals || 0);

    revenueByTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Покупки', 'Продления', 'Аренда'],
            datasets: [{
                data: [purchases, renewals, rentals],
                backgroundColor: [
                    'rgba(13, 110, 253, 0.8)',
                    'rgba(25, 135, 84, 0.8)',
                    'rgba(255, 193, 7, 0.8)'
                ],
                borderColor: [
                    'rgba(13, 110, 253, 1)',
                    'rgba(25, 135, 84, 1)',
                    'rgba(255, 193, 7, 1)'
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
                            let count = 0;
                            if (context.dataIndex === 0) count = revenue.purchases || 0;
                            else if (context.dataIndex === 1) count = revenue.renewals || 0;
                            else if (context.dataIndex === 2) count = revenue.rentals || 0;
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
            periods[periodKey] = { purchase: 0, renewal: 0, rental: 0 };
        }

        const amount = parseFloat(item.total_amount || 0);

        if (item.type === 'purchase') {
            periods[periodKey].purchase += amount;
        } else if (item.type === 'renewal' || item.type === 'auto_renewal') {
            periods[periodKey].renewal += amount;
        } else if (item.type === 'slot_rental' || item.type === 'slot_rental_renewal' || item.type === 'slot_rental_income') {
            periods[periodKey].rental += amount;
        }
    });

    // Sort periods chronologically
    const sortedPeriods = Object.keys(periods).sort();

    const labels = sortedPeriods;
    const purchaseData = sortedPeriods.map(p => periods[p].purchase);
    const renewalData = sortedPeriods.map(p => periods[p].renewal);
    const rentalData = sortedPeriods.map(p => periods[p].rental);

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
                },
                {
                    label: 'Аренда',
                    data: rentalData,
                    borderColor: 'rgba(255, 193, 7, 1)',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
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

        // Use shared badge-utils functions
        const typeBadge = getPlacementTypeBadge(p.type);

        row.innerHTML = `
            <td>${formatDateTime(p.purchased_at)}</td>
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
            <td>${getPlacementStatusBadge(p.status)}</td>
        `;

        tbody.appendChild(row);
    });
}

// Utility functions provided by shared modules:
// formatDateTime() is provided by badge-utils.js (loaded first)
// showAlert() is provided by security.js (loaded first)
// getToken() is provided by auth.js (loaded first)
