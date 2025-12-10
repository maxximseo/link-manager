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

        currentBalance = parseFloat(data.balance) || 0;
        totalSpent = parseFloat(data.totalSpent) || 0;
        currentDiscount = parseInt(data.currentDiscount) || 0;

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

        // Update link pricing (with null checks - elements may not exist on all pages)
        const linkBasePrice = document.getElementById('linkBasePrice');
        const linkFinalPrice = document.getElementById('linkFinalPrice');
        const linkRenewalPrice = document.getElementById('linkRenewalPrice');
        const articleBasePrice = document.getElementById('articleBasePrice');
        const articleFinalPrice = document.getElementById('articleFinalPrice');

        if (linkBasePrice) linkBasePrice.textContent = `$${pricing.link.basePrice.toFixed(2)}`;
        if (linkFinalPrice) linkFinalPrice.textContent = pricing.link.finalPrice.toFixed(2);
        if (linkRenewalPrice) linkRenewalPrice.textContent = pricing.renewal.finalPrice.toFixed(2);
        if (articleBasePrice) articleBasePrice.textContent = `$${pricing.article.basePrice.toFixed(2)}`;
        if (articleFinalPrice) articleFinalPrice.textContent = pricing.article.finalPrice.toFixed(2);

        // Update renewal discount info
        const renewalTotalDiscount = document.getElementById('renewalTotalDiscount');
        const renewalPersonalDiscount = document.getElementById('renewalPersonalDiscount');

        if (renewalTotalDiscount) renewalTotalDiscount.textContent = pricing.renewal.totalDiscount;
        if (renewalPersonalDiscount) renewalPersonalDiscount.textContent = pricing.renewal.personalDiscount;

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

    // Add "Стандарт" tier at the beginning if not exists
    const allTiers = [...discountTiers];
    const hasStandardTier = allTiers.some(t => parseFloat(t.min_spent) === 0);
    if (!hasStandardTier) {
        allTiers.unshift({
            tier_name: 'Стандарт',
            min_spent: '0',
            discount_percentage: 0
        });
    }

    // Find current and next tier indexes
    let currentTierIndex = 0;
    for (let i = allTiers.length - 1; i >= 0; i--) {
        if (totalSpent >= parseFloat(allTiers[i].min_spent)) {
            currentTierIndex = i;
            break;
        }
    }
    const nextTierIndex = currentTierIndex + 1;

    allTiers.forEach((tier, index) => {
        const isCurrent = index === currentTierIndex;
        const isNext = index === nextTierIndex;
        const tierReached = totalSpent >= parseFloat(tier.min_spent);
        const isGoldTier = tier.discount_percentage === 20;

        const row = document.createElement('tr');
        row.className = isCurrent ? 'tier-current' : '';

        // Indicator dot color
        let indicatorClass = 'locked';
        if (isCurrent) indicatorClass = 'current';
        else if (isNext) indicatorClass = 'next';

        // Badge style
        let badgeClass = 'badge-gray';
        if (isCurrent) badgeClass = 'badge-amber';
        else if (isNext) badgeClass = 'badge-blue';

        // Status text
        let statusText = 'Заблокирован';
        let statusClass = 'status-locked';
        if (isCurrent) {
            statusText = 'Текущий';
            statusClass = 'status-current';
        } else if (isNext) {
            statusText = 'Следующий';
            statusClass = 'status-next';
        }

        // Gold tier extra info
        let extraInfo = '';
        if (isGoldTier && !tierReached) {
            extraInfo = '<br><small class="text-info"><i class="bi bi-eye-fill"></i> Будут видны адреса площадок</small>';
        }

        row.innerHTML = `
            <td>
                <div class="d-flex align-items-center gap-2">
                    <span class="tier-indicator ${indicatorClass}"></span>
                    <span class="tier-name">${tier.tier_name}</span>
                </div>
            </td>
            <td class="text-muted">$${Number(parseFloat(tier.min_spent)).toLocaleString('ru-RU')}</td>
            <td><span class="tier-badge ${badgeClass}">${tier.discount_percentage}%</span></td>
            <td>
                <span class="tier-status ${statusClass}">${statusText}</span>
                ${extraInfo}
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
        document.getElementById('discountProgressText').textContent = '100';
        document.getElementById('discountProgressMessage').innerHTML =
            '<i class="bi bi-trophy-fill text-warning"></i> Поздравляем! Вы достигли максимального уровня скидки!';

        // Update new progress bar elements for max tier
        const progressIndicator = document.getElementById('progressIndicator');
        const progressTooltip = document.getElementById('progressTooltip');
        const progressSpentValue = document.getElementById('progressSpentValue');
        const progressGoalValue = document.getElementById('progressGoalValue');
        const progressRemainingValue = document.getElementById('progressRemainingValue');

        if (progressIndicator) progressIndicator.style.left = '100%';
        if (progressTooltip) progressTooltip.textContent = `$${totalSpent.toFixed(0)}`;
        if (progressSpentValue) progressSpentValue.textContent = `$${totalSpent.toFixed(2)}`;
        if (progressGoalValue) progressGoalValue.textContent = 'Максимум';
        if (progressRemainingValue) progressRemainingValue.textContent = '$0';
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
    document.getElementById('discountProgressText').textContent = `${percentage.toFixed(0)}`;

    const remaining = nextTierMinSpent - totalSpent;
    document.getElementById('amountToNextTier').textContent = remaining.toFixed(2);
    document.getElementById('nextTierDiscount').textContent = nextTier.discount_percentage;
    document.getElementById('nextTierName').textContent = nextTier.tier_name;

    // Update new enhanced progress bar elements
    const progressIndicator = document.getElementById('progressIndicator');
    const progressTooltip = document.getElementById('progressTooltip');
    const progressSpentValue = document.getElementById('progressSpentValue');
    const progressGoalValue = document.getElementById('progressGoalValue');
    const progressRemainingValue = document.getElementById('progressRemainingValue');

    if (progressIndicator) progressIndicator.style.left = `${percentage}%`;
    if (progressTooltip) progressTooltip.textContent = `$${totalSpent.toFixed(0)}`;
    if (progressSpentValue) progressSpentValue.textContent = `$${totalSpent.toFixed(2)}`;
    if (progressGoalValue) progressGoalValue.textContent = `$${nextTierMinSpent.toLocaleString()}`;
    if (progressRemainingValue) progressRemainingValue.textContent = `$${remaining.toLocaleString()}`;
}

/**
 * Load transactions
 */
async function loadTransactions(page = 1) {
    try {
        const response = await fetch(`/api/billing/transactions?page=${page}&limit=100`, {
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
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="transactions-empty">
                        <div class="empty-icon"><i class="bi bi-download"></i></div>
                        <p>Транзакций пока нет</p>
                        <span class="empty-subtitle">Пополните баланс, чтобы начать работу</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    transactions.forEach(tx => {
        const row = document.createElement('tr');

        // Use shared badge-utils functions
        const amount = parseFloat(tx.amount);
        const amountPrefix = amount > 0 ? '+' : '';
        const amountClass = amount > 0 ? 'amount-positive' : 'amount-negative';

        // Transaction type icon and color
        let typeIcon = '';
        let typeColor = '';
        switch(tx.type) {
            case 'deposit':
                typeIcon = '<i class="bi bi-arrow-down-right text-success"></i>';
                typeColor = 'text-success';
                break;
            case 'withdrawal':
                typeIcon = '<i class="bi bi-arrow-up-right text-danger"></i>';
                typeColor = 'text-danger';
                break;
            case 'purchase':
                typeIcon = '<i class="bi bi-arrow-up-right text-primary"></i>';
                typeColor = 'text-primary';
                break;
            case 'refund':
                typeIcon = '<i class="bi bi-arrow-down-right text-purple"></i>';
                typeColor = 'text-purple';
                break;
            default:
                typeIcon = '<i class="bi bi-circle"></i>';
                typeColor = 'text-muted';
        }

        row.innerHTML = `
            <td><span class="transaction-id">#${tx.id}</span></td>
            <td class="text-muted">${formatDate(tx.created_at)}</td>
            <td>
                <div class="transaction-type">
                    ${typeIcon}
                    <span class="${typeColor}">${tx.type}</span>
                </div>
            </td>
            <td class="${amountClass}">${amountPrefix}${Math.abs(amount).toFixed(2)} $</td>
            <td class="fw-medium">$${parseFloat(tx.balance_after).toFixed(2)}</td>
            <td class="text-muted">${tx.description || '—'}</td>
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
    const prevLink = document.createElement('a');
    prevLink.className = 'page-link';
    prevLink.href = '#';
    prevLink.textContent = 'Назад';
    prevLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (pagination.hasPrev) {
            loadTransactions(pagination.page - 1);
        }
    });
    prevLi.appendChild(prevLink);
    ul.appendChild(prevLi);

    // Page numbers
    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.pages, pagination.page + 2);

    for (let i = startPage; i <= endPage; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === pagination.page ? 'active' : ''}`;
        const pageLink = document.createElement('a');
        pageLink.className = 'page-link';
        pageLink.href = '#';
        pageLink.textContent = i;
        const pageNum = i; // Capture current value for closure
        pageLink.addEventListener('click', (e) => {
            e.preventDefault();
            loadTransactions(pageNum);
        });
        li.appendChild(pageLink);
        ul.appendChild(li);
    }

    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${!pagination.hasNext ? 'disabled' : ''}`;
    const nextLink = document.createElement('a');
    nextLink.className = 'page-link';
    nextLink.href = '#';
    nextLink.textContent = 'Вперед';
    nextLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (pagination.hasNext) {
            loadTransactions(pagination.page + 1);
        }
    });
    nextLi.appendChild(nextLink);
    ul.appendChild(nextLi);

    nav.appendChild(ul);
    container.appendChild(nav);
}

// Payment configuration
let paymentConfig = {
    enabled: false,
    minAmount: 10,
    maxAmount: 10000
};

/**
 * Load payment configuration
 */
async function loadPaymentConfig() {
    try {
        const response = await fetch('/api/payments/config', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            paymentConfig = data;

            // Update UI limits
            const minEl = document.getElementById('minDepositAmount');
            const maxEl = document.getElementById('maxDepositAmount');
            if (minEl) minEl.textContent = paymentConfig.minAmount;
            if (maxEl) maxEl.textContent = paymentConfig.maxAmount.toLocaleString();

            // Update input limits
            const amountInput = document.getElementById('depositAmount');
            if (amountInput) {
                amountInput.min = paymentConfig.minAmount;
                amountInput.max = paymentConfig.maxAmount;
            }
        }
    } catch (error) {
        console.error('Failed to load payment config:', error);
    }
}

/**
 * Create payment invoice via CryptoCloud
 */
async function createPaymentInvoice() {
    const amount = parseFloat(document.getElementById('depositAmount').value);

    if (isNaN(amount) || amount < paymentConfig.minAmount || amount > paymentConfig.maxAmount) {
        showAlert(`Сумма должна быть от $${paymentConfig.minAmount} до $${paymentConfig.maxAmount.toLocaleString()}`, 'danger');
        return;
    }

    const btn = document.getElementById('createInvoiceBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Создание счёта...';

    try {
        const response = await fetch('/api/payments/create-invoice', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ amount })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Ошибка создания счёта');
        }

        // Show step 2 (invoice created)
        document.getElementById('depositStep1').style.display = 'none';
        document.getElementById('depositStep2').style.display = 'block';

        // Update invoice info
        document.getElementById('invoiceAmount').textContent = result.invoice.amount.toFixed(2);

        if (result.invoice.expiresAt) {
            const expiryDate = new Date(result.invoice.expiresAt);
            document.getElementById('invoiceExpiry').textContent = expiryDate.toLocaleString('ru-RU');
        } else {
            document.getElementById('invoiceExpiry').textContent = '24 часа';
        }

        // Set payment link
        document.getElementById('paymentLink').href = result.invoice.paymentLink;

        showAlert('Счёт создан! Нажмите "Перейти к оплате" для оплаты криптовалютой.', 'success');

    } catch (error) {
        console.error('Failed to create invoice:', error);
        showAlert(error.message || 'Ошибка создания счёта', 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

/**
 * Load pending invoices
 */
async function loadPendingInvoices() {
    try {
        const response = await fetch('/api/payments/pending', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) return;

        const result = await response.json();
        const invoices = result.invoices || [];

        if (invoices.length === 0) {
            document.getElementById('pendingInvoicesSection').style.display = 'none';
            return;
        }

        document.getElementById('pendingInvoicesSection').style.display = 'block';
        const listEl = document.getElementById('pendingInvoicesList');
        listEl.innerHTML = '';

        invoices.forEach(inv => {
            const item = document.createElement('div');
            item.className = 'alert alert-info py-2 mb-2';
            item.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>$${inv.amount.toFixed(2)}</strong>
                        <small class="text-muted ms-2">${new Date(inv.createdAt).toLocaleString('ru-RU')}</small>
                    </div>
                    <a href="${inv.paymentLink}" target="_blank" class="btn btn-sm btn-primary">
                        <i class="bi bi-box-arrow-up-right"></i> Оплатить
                    </a>
                </div>
            `;
            listEl.appendChild(item);
        });

    } catch (error) {
        console.error('Failed to load pending invoices:', error);
    }
}

/**
 * Reset deposit modal to step 1
 */
function resetDepositModal() {
    document.getElementById('depositStep1').style.display = 'block';
    document.getElementById('depositStep2').style.display = 'none';
    document.getElementById('depositAmount').value = '100';
}

// Reset modal when closed
document.addEventListener('DOMContentLoaded', () => {
    const depositModal = document.getElementById('depositModal');
    if (depositModal) {
        depositModal.addEventListener('hidden.bs.modal', resetDepositModal);
        depositModal.addEventListener('show.bs.modal', () => {
            loadPaymentConfig();
            loadPendingInvoices();
        });
    }
});

/**
 * Process deposit (legacy - kept for admin manual deposits)
 */
async function processDeposit() {
    const amount = parseFloat(document.getElementById('depositAmount').value);
    const description = document.getElementById('depositDescription')?.value || 'Пополнение баланса';

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
// showAlert() is provided by security.js (loaded first)
// getToken() is provided by auth.js (loaded first)
