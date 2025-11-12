/**
 * Balance page logic
 */

let currentBalance = 0;
let currentDiscount = 0;
let totalSpent = 0;
let discountTiers = [];

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await loadBalanceData();
    await loadPricing();
    await loadDiscountTiers();
    await loadTransactions();
    updateDiscountProgress();
});

/**
 * Load balance data
 */
async function loadBalanceData() {
    try {
        const response = await fetch('/api/billing/balance', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load balance');
        }

        const result = await response.json();
        const data = result.data;

        currentBalance = parseFloat(data.balance);
        totalSpent = parseFloat(data.totalSpent);
        currentDiscount = parseInt(data.currentDiscount);

        // Update UI
        document.getElementById('currentBalance').textContent = currentBalance.toFixed(2);
        document.getElementById('totalSpent').textContent = totalSpent.toFixed(2);
        document.getElementById('currentDiscount').textContent = currentDiscount;
        document.getElementById('discountTier').textContent = data.discountTier || 'Стандарт';

        // Update navbar balance
        const navBalance = document.getElementById('navBalance');
        if (navBalance) {
            navBalance.textContent = currentBalance.toFixed(2);
        }

    } catch (error) {
        console.error('Failed to load balance:', error);
        showAlert('Ошибка загрузки баланса', 'danger');
    }
}

/**
 * Load pricing with user discount
 */
async function loadPricing() {
    try {
        const response = await fetch('/api/billing/pricing', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load pricing');
        }

        const result = await response.json();
        const pricing = result.data;

        // Update link pricing
        document.getElementById('linkBasePrice').textContent = `$${pricing.link.basePrice.toFixed(2)}`;
        document.getElementById('linkFinalPrice').textContent = pricing.link.finalPrice.toFixed(2);
        document.getElementById('linkRenewalPrice').textContent = pricing.renewal.finalPrice.toFixed(2);

        // Update article pricing
        document.getElementById('articleBasePrice').textContent = `$${pricing.article.basePrice.toFixed(2)}`;
        document.getElementById('articleFinalPrice').textContent = pricing.article.finalPrice.toFixed(2);

        // Update renewal discount info
        document.getElementById('renewalTotalDiscount').textContent = pricing.renewal.totalDiscount;
        document.getElementById('renewalPersonalDiscount').textContent = pricing.renewal.personalDiscount;

    } catch (error) {
        console.error('Failed to load pricing:', error);
    }
}

/**
 * Load discount tiers
 */
async function loadDiscountTiers() {
    try {
        const response = await fetch('/api/billing/discount-tiers', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load discount tiers');
        }

        const result = await response.json();
        discountTiers = result.data;

        renderDiscountTiers();

    } catch (error) {
        console.error('Failed to load discount tiers:', error);
    }
}

/**
 * Render discount tiers table
 */
function renderDiscountTiers() {
    const tbody = document.getElementById('discountTiersTable');
    tbody.innerHTML = '';

    discountTiers.forEach(tier => {
        const isActive = currentDiscount === tier.discount_percentage;
        const row = document.createElement('tr');
        row.className = isActive ? 'table-success' : '';

        row.innerHTML = `
            <td>
                <strong>${tier.tier_name}</strong>
                ${isActive ? '<span class="badge bg-success ms-2">Текущий</span>' : ''}
            </td>
            <td>$${parseFloat(tier.min_spent).toFixed(2)}</td>
            <td><span class="badge bg-warning">${tier.discount_percentage}%</span></td>
            <td>
                ${totalSpent >= parseFloat(tier.min_spent)
                    ? '<span class="text-success"><i class="bi bi-check-circle-fill"></i> Достигнут</span>'
                    : '<span class="text-muted"><i class="bi bi-lock-fill"></i> Заблокирован</span>'}
            </td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Update discount progress bar
 */
function updateDiscountProgress() {
    // Find next tier
    const nextTier = discountTiers.find(tier => totalSpent < parseFloat(tier.min_spent));

    if (!nextTier) {
        // Max tier achieved
        document.getElementById('discountProgress').style.width = '100%';
        document.getElementById('discountProgressText').textContent = '100%';
        document.getElementById('discountProgressMessage').innerHTML =
            '<i class="bi bi-trophy-fill text-warning"></i> Поздравляем! Вы достигли максимального уровня скидки!';
        return;
    }

    // Find current tier
    const currentTierIndex = discountTiers.findIndex(tier => currentDiscount === tier.discount_percentage);
    const currentTierMinSpent = currentTierIndex >= 0
        ? parseFloat(discountTiers[currentTierIndex].min_spent)
        : 0;

    const nextTierMinSpent = parseFloat(nextTier.min_spent);
    const range = nextTierMinSpent - currentTierMinSpent;
    const progress = totalSpent - currentTierMinSpent;
    const percentage = Math.min(100, Math.max(0, (progress / range) * 100));

    document.getElementById('discountProgress').style.width = `${percentage}%`;
    document.getElementById('discountProgressText').textContent = `${percentage.toFixed(0)}%`;

    const remaining = nextTierMinSpent - totalSpent;
    document.getElementById('amountToNextTier').textContent = remaining.toFixed(2);
    document.getElementById('nextTierDiscount').textContent = nextTier.discount_percentage;
    document.getElementById('nextTierName').textContent = nextTier.tier_name;
}

/**
 * Load transactions
 */
async function loadTransactions(page = 1) {
    try {
        const response = await fetch(`/api/billing/transactions?page=${page}&limit=20`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load transactions');
        }

        const result = await response.json();
        renderTransactions(result.data);
        renderTransactionsPagination(result.pagination);

    } catch (error) {
        console.error('Failed to load transactions:', error);
        document.getElementById('transactionsTable').innerHTML =
            '<tr><td colspan="6" class="text-center text-danger">Ошибка загрузки транзакций</td></tr>';
    }
}

/**
 * Render transactions table
 */
function renderTransactions(transactions) {
    const tbody = document.getElementById('transactionsTable');
    tbody.innerHTML = '';

    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Нет транзакций</td></tr>';
        return;
    }

    transactions.forEach(tx => {
        const row = document.createElement('tr');

        const amount = parseFloat(tx.amount);
        const amountClass = amount > 0 ? 'text-success' : 'text-danger';
        const amountPrefix = amount > 0 ? '+' : '';

        // Transaction type badges
        const typeBadges = {
            'deposit': '<span class="badge bg-success">Пополнение</span>',
            'purchase': '<span class="badge bg-primary">Покупка</span>',
            'renewal': '<span class="badge bg-info">Продление</span>',
            'auto_renewal': '<span class="badge bg-info">Авто-продление</span>',
            'refund': '<span class="badge bg-warning">Возврат</span>',
            'admin_adjustment': '<span class="badge bg-secondary">Корректировка</span>'
        };

        row.innerHTML = `
            <td>#${tx.id}</td>
            <td>${new Date(tx.created_at).toLocaleString('ru-RU')}</td>
            <td>${typeBadges[tx.type] || tx.type}</td>
            <td class="${amountClass} fw-bold">${amountPrefix}$${Math.abs(amount).toFixed(2)}</td>
            <td>$${parseFloat(tx.balance_after).toFixed(2)}</td>
            <td>${tx.description || '—'}</td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Render transactions pagination
 */
function renderTransactionsPagination(pagination) {
    const container = document.getElementById('transactionsPagination');
    container.innerHTML = '';

    if (pagination.pages <= 1) {
        return;
    }

    const nav = document.createElement('nav');
    const ul = document.createElement('ul');
    ul.className = 'pagination justify-content-center';

    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${!pagination.hasPrev ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#" onclick="loadTransactions(${pagination.page - 1}); return false;">Назад</a>`;
    ul.appendChild(prevLi);

    // Page numbers
    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.pages, pagination.page + 2);

    for (let i = startPage; i <= endPage; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === pagination.page ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" onclick="loadTransactions(${i}); return false;">${i}</a>`;
        ul.appendChild(li);
    }

    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${!pagination.hasNext ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#" onclick="loadTransactions(${pagination.page + 1}); return false;">Вперед</a>`;
    ul.appendChild(nextLi);

    nav.appendChild(ul);
    container.appendChild(nav);
}

/**
 * Process deposit
 */
async function processDeposit() {
    const amount = parseFloat(document.getElementById('depositAmount').value);
    const description = document.getElementById('depositDescription').value || 'Пополнение баланса';

    if (isNaN(amount) || amount < 1 || amount > 10000) {
        showAlert('Сумма должна быть от $1 до $10,000', 'danger');
        return;
    }

    try {
        const response = await fetch('/api/billing/deposit', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ amount, description })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to deposit');
        }

        const result = await response.json();

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('depositModal'));
        modal.hide();

        // Reload data
        await loadBalanceData();
        await loadTransactions();
        updateDiscountProgress();

        showAlert(`Баланс успешно пополнен на $${amount.toFixed(2)}. Новый баланс: $${result.data.newBalance.toFixed(2)}`, 'success');

        // Reset form
        document.getElementById('depositAmount').value = '100';
        document.getElementById('depositDescription').value = '';

    } catch (error) {
        console.error('Failed to deposit:', error);
        showAlert(error.message || 'Ошибка пополнения баланса', 'danger');
    }
}

/**
 * Export transactions
 */
async function exportTransactions(format = 'csv') {
    try {
        const response = await fetch(`/api/billing/export/transactions?format=${format}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to export transactions');
        }

        // Download file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions-${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showAlert(`Транзакции экспортированы в формате ${format.toUpperCase()}`, 'success');

    } catch (error) {
        console.error('Failed to export:', error);
        showAlert('Ошибка экспорта транзакций', 'danger');
    }
}

/**
 * Show alert
 */
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

/**
 * Get auth token (with fallback for old key)
 */
function getToken() {
    return localStorage.getItem('token') || localStorage.getItem('authToken');
}
