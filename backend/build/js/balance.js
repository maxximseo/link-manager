/**
 * Balance page logic
 */

let currentBalance = 0;
let currentDiscount = 0;
let totalSpent = 0;
let discountTiers = [];

// Pagination state
let currentPage = 1;
let itemsPerPage = 100;
let totalTransactions = 0;
let totalPages = 1;

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
        // Translate tier name based on discount percentage
        document.getElementById('discountTier').textContent = getTranslatedTierName(currentDiscount);

        // Update navbar balance
        const navBalance = document.getElementById('navBalance');
        if (navBalance) {
            navBalance.textContent = currentBalance.toFixed(2);
        }

        // Show/hide referral bonus card (shown if user can receive bonus on first deposit)
        const referralBonusReceived = data.referralBonusReceived || false;
        const hasReferrer = data.referredByUserId || data.referred_by_user_id;
        const referralBonusCard = document.getElementById('referralBonusCard');
        const promoCodeSection = document.getElementById('promoCodeSection');

        // User can get bonus if: not received yet AND (has referrer OR can use promo code)
        // Show promo code section for ALL users who haven't received bonus yet
        const canReceiveBonus = !referralBonusReceived;

        if (referralBonusCard) {
            // Show referral bonus card only if user has referrer AND hasn't received bonus
            if (canReceiveBonus && hasReferrer) {
                referralBonusCard.style.display = 'flex';
                const bonusAmountEl = document.getElementById('referralBonusAmount');
                if (bonusAmountEl) {
                    bonusAmountEl.textContent = '100'; // Default bonus amount
                }
            } else {
                referralBonusCard.style.display = 'none';
            }
        }

        // Show promo code section for ALL users (they can check if promo is valid)
        if (promoCodeSection) {
            promoCodeSection.style.display = 'block';
        }

        // Store for later use
        window.canReceiveReferralBonus = canReceiveBonus;

    } catch (error) {
        console.error('Failed to load balance:', error);
        showAlert(t('balanceLoadError'), 'danger');
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

    // Add "Standard" tier at the beginning if not exists
    const allTiers = [...discountTiers];
    const hasStandardTier = allTiers.some(tier => parseFloat(tier.min_spent) === 0);
    if (!hasStandardTier) {
        allTiers.unshift({
            tier_name: t('tierStandard'),
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
        let statusText = t('tierStatusLocked');
        let statusClass = 'status-locked';
        if (isCurrent) {
            statusText = t('tierStatusCurrent');
            statusClass = 'status-current';
        } else if (isNext) {
            statusText = t('tierStatusNext');
            statusClass = 'status-next';
        }

        // Gold tier extra info
        let extraInfo = '';
        if (isGoldTier && !tierReached) {
            extraInfo = `<br><small class="text-info"><i class="bi bi-eye-fill"></i> ${t('tierGoldInfo')}</small>`;
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
            `<i class="bi bi-trophy-fill text-warning"></i> ${t('maxTierReached')}`;

        // Update new progress bar elements for max tier
        const progressIndicator = document.getElementById('progressIndicator');
        const progressTooltip = document.getElementById('progressTooltip');
        const progressSpentValue = document.getElementById('progressSpentValue');
        const progressGoalValue = document.getElementById('progressGoalValue');
        const progressRemainingValue = document.getElementById('progressRemainingValue');

        if (progressIndicator) progressIndicator.style.left = '100%';
        if (progressTooltip) progressTooltip.textContent = `$${totalSpent.toFixed(0)}`;
        if (progressSpentValue) progressSpentValue.textContent = `$${totalSpent.toFixed(2)}`;
        if (progressGoalValue) progressGoalValue.textContent = t('maxTierLabel');
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
        currentPage = page;
        const response = await fetch(`/api/billing/transactions?page=${page}&limit=${itemsPerPage}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load transactions');
        }

        const result = await response.json();
        totalTransactions = result.pagination.total || 0;
        totalPages = result.pagination.pages || 1;

        renderTransactions(result.data);
        renderTransactionsPagination(result.pagination);

    } catch (error) {
        console.error('Failed to load transactions:', error);
        document.getElementById('transactionsTable').innerHTML =
            `<tr><td colspan="6" class="text-center text-danger">${t('txLoadError')}</td></tr>`;
    }
}

/**
 * Change items per page
 */
function changeItemsPerPage(value) {
    itemsPerPage = parseInt(value);
    currentPage = 1;
    loadTransactions(1);
}

/**
 * Go to previous page
 */
function goToPrevPage() {
    if (currentPage > 1) {
        loadTransactions(currentPage - 1);
    }
}

/**
 * Go to next page
 */
function goToNextPage() {
    if (currentPage < totalPages) {
        loadTransactions(currentPage + 1);
    }
}

/**
 * Go to specific page
 */
function goToPage(page) {
    if (page >= 1 && page <= totalPages) {
        loadTransactions(page);
    }
}

/**
 * Render transactions table (table1 style)
 */
function renderTransactions(transactions) {
    const tbody = document.getElementById('transactionsTable');
    tbody.innerHTML = '';

    if (transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5">
                    <div class="notification-empty">
                        <i class="bi bi-receipt"></i>
                        <p>${t('noTransactions')}</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    transactions.forEach(tx => {
        const row = document.createElement('tr');

        const amount = parseFloat(tx.amount);
        const amountPrefix = amount > 0 ? '+' : '';

        // Transaction type badge style
        let typeBadge = '';
        let amountColor = '';
        switch(tx.type) {
            case 'deposit':
                typeBadge = `<span class="status-badge status-live"><i class="bi bi-arrow-down-circle-fill"></i> ${t('txDeposit')}</span>`;
                amountColor = 'color: #16a34a; font-weight: 600;';
                break;
            case 'withdrawal':
                typeBadge = `<span class="status-badge status-failed"><i class="bi bi-arrow-up-circle-fill"></i> ${t('txWithdrawal')}</span>`;
                amountColor = 'color: #dc2626; font-weight: 600;';
                break;
            case 'purchase':
                typeBadge = `<span class="status-badge status-scheduled"><i class="bi bi-cart-fill"></i> ${t('txPurchase')}</span>`;
                amountColor = 'color: #4f46e5; font-weight: 600;';
                break;
            case 'refund':
                typeBadge = `<span class="status-badge status-pending"><i class="bi bi-arrow-counterclockwise"></i> ${t('txRefund')}</span>`;
                amountColor = 'color: #d97706; font-weight: 600;';
                break;
            case 'renewal':
                typeBadge = `<span class="status-badge" style="background: #ede9fe; color: #7c3aed;"><i class="bi bi-arrow-repeat"></i> ${t('txRenewal')}</span>`;
                amountColor = 'color: #7c3aed; font-weight: 600;';
                break;
            case 'referral':
                typeBadge = `<span class="status-badge" style="background: #fce7f3; color: #db2777;"><i class="bi bi-people-fill"></i> ${t('txReferral')}</span>`;
                amountColor = 'color: #db2777; font-weight: 600;';
                break;
            default:
                typeBadge = '<span class="status-badge" style="background: #f3f4f6; color: #6b7280;"><i class="bi bi-circle"></i> ' + tx.type + '</span>';
                amountColor = 'color: #6b7280;';
        }

        row.innerHTML = `
            <td class="col-id"><span class="mono-text">#${tx.id}</span></td>
            <td class="col-date"><span class="date-text">${formatDate(tx.created_at)}</span></td>
            <td>${typeBadge}</td>
            <td class="col-money" style="${amountColor}">${amountPrefix}$${Math.abs(amount).toFixed(2)}</td>
            <td class="col-money" style="font-weight: 500;">$${parseFloat(tx.balance_after).toFixed(2)}</td>
            <td style="color: #64748b; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${tx.description || '—'}</td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Render transactions pagination
 */
function renderTransactionsPagination(pagination) {
    const total = pagination.total || 0;
    totalPages = pagination.pages || 1;

    // Update info text
    const start = Math.min((currentPage - 1) * itemsPerPage + 1, total);
    const end = Math.min(currentPage * itemsPerPage, total);

    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        paginationInfo.textContent = `${t('paginationShowing')} ${start}–${end} ${t('paginationOf')} ${total}`;
    }

    // Update prev/next buttons
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');

    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
    }

    // Render page numbers
    const pageNumbers = document.getElementById('pageNumbers');
    if (!pageNumbers) return;

    pageNumbers.innerHTML = '';

    if (totalPages <= 1) return;

    // Calculate visible pages
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    // First page + ellipsis if needed
    if (startPage > 1) {
        pageNumbers.appendChild(createPageButton(1));
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            pageNumbers.appendChild(ellipsis);
        }
    }

    // Page buttons
    for (let i = startPage; i <= endPage; i++) {
        pageNumbers.appendChild(createPageButton(i));
    }

    // Ellipsis + last page if needed
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            pageNumbers.appendChild(ellipsis);
        }
        pageNumbers.appendChild(createPageButton(totalPages));
    }
}

/**
 * Create page button
 */
function createPageButton(page) {
    const btn = document.createElement('button');
    btn.className = 'pagination-btn' + (page === currentPage ? ' active' : '');
    btn.textContent = page;
    btn.onclick = () => goToPage(page);
    return btn;
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
        showAlert(`${t('depositAmountError')} $${paymentConfig.minAmount} ${t('depositTo')} $${paymentConfig.maxAmount.toLocaleString()}`, 'danger');
        return;
    }

    const btn = document.getElementById('createInvoiceBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> ${t('creatingInvoice')}`;

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
            throw new Error(result.error || t('invoiceError'));
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
            document.getElementById('invoiceExpiry').textContent = t('hours24');
        }

        // Set payment link
        document.getElementById('paymentLink').href = result.invoice.paymentLink;

        showAlert(t('invoiceCreated'), 'success');

    } catch (error) {
        console.error('Failed to create invoice:', error);
        showAlert(error.message || t('invoiceError'), 'danger');
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
                        <i class="bi bi-box-arrow-up-right"></i> ${t('payBtn')}
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
    resetPromoCode();
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

    // Add listener to recalculate total when deposit amount changes
    const depositAmountInput = document.getElementById('depositAmount');
    if (depositAmountInput) {
        depositAmountInput.addEventListener('input', updateTotalDepositAmount);
    }
});

/**
 * Process deposit (legacy - kept for admin manual deposits)
 */
async function processDeposit() {
    const amount = parseFloat(document.getElementById('depositAmount').value);
    const description = document.getElementById('depositDescription')?.value || 'Пополнение баланса';
    const promoCode = validatedPromoCode; // Use validated promo code

    if (isNaN(amount) || amount < 1 || amount > 10000) {
        showAlert(`${t('depositAmountError')} $1 ${t('depositTo')} $10,000`, 'danger');
        return;
    }

    try {
        const requestBody = { amount, description };
        if (promoCode) {
            requestBody.promoCode = promoCode;
        }

        const response = await fetch('/api/billing/deposit', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
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

        // Show success message with bonus info
        let successMessage = `${t('depositSuccess')} $${amount.toFixed(2)}.`;
        if (result.data.bonusAmount && result.data.bonusAmount > 0) {
            successMessage += ` ${t('bonusReceived')}: +$${result.data.bonusAmount.toFixed(2)}!`;
        }
        successMessage += ` ${t('newBalanceLabel')}: $${result.data.newBalance.toFixed(2)}`;

        showAlert(successMessage, 'success');

        // Reset form
        document.getElementById('depositAmount').value = '100';
        resetPromoCode();

    } catch (error) {
        console.error('Failed to deposit:', error);
        showAlert(error.message || t('depositError'), 'danger');
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

        showAlert(`${t('exportSuccess')} ${format.toUpperCase()}`, 'success');

    } catch (error) {
        console.error('Failed to export:', error);
        showAlert(t('exportError'), 'danger');
    }
}

/**
 * Promo code validation
 */
let promoCheckTimeout = null;
let validatedPromoCode = null;

async function checkPromoCode() {
    const input = document.getElementById('promoCodeInput');
    const statusEl = document.getElementById('promoCodeStatus');
    const previewEl = document.getElementById('promoBonusPreview');
    const bonusAmountEl = document.getElementById('promoBonusAmount');
    const totalPreviewEl = document.getElementById('totalDepositPreview');
    const totalAmountEl = document.getElementById('totalDepositAmount');
    const depositAmountEl = document.getElementById('depositAmount');
    const applyBtn = document.getElementById('promoApplyBtn');

    const code = input ? input.value.trim() : '';

    // Reset if empty
    if (!code) {
        if (statusEl) statusEl.innerHTML = '';
        if (previewEl) previewEl.style.display = 'none';
        if (totalPreviewEl) totalPreviewEl.style.display = 'none';
        validatedPromoCode = null;
        return;
    }

    // Show loading state
    if (statusEl) statusEl.innerHTML = '<span class="spinner-border spinner-border-sm text-primary"></span> <span class="text-muted">Проверка...</span>';
    if (applyBtn) applyBtn.disabled = true;

    try {
        const response = await fetch(`/api/promo/validate?code=${encodeURIComponent(code)}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const result = await response.json();

        if (result.valid) {
            // Valid promo code - show success message
            if (statusEl) statusEl.innerHTML = '';
            const bonusAmount = parseFloat(result.promo.bonusAmount) || 100;
            if (bonusAmountEl) {
                bonusAmountEl.textContent = bonusAmount;
            }
            if (previewEl) previewEl.style.display = 'flex';

            // Calculate and show total deposit amount
            const depositAmount = parseFloat(depositAmountEl ? depositAmountEl.value : 100) || 100;
            const totalAmount = depositAmount + bonusAmount;
            if (totalAmountEl) totalAmountEl.textContent = totalAmount.toFixed(0);
            if (totalPreviewEl) totalPreviewEl.style.display = 'flex';

            // Store bonus amount for recalculation
            window.currentPromoBonus = bonusAmount;
            validatedPromoCode = code;
        } else {
            // Invalid promo code - show error
            if (statusEl) statusEl.innerHTML = `<i class="bi bi-x-circle-fill text-danger"></i> <span class="text-danger">${result.error || 'Промокод недействителен'}</span>`;
            if (previewEl) previewEl.style.display = 'none';
            if (totalPreviewEl) totalPreviewEl.style.display = 'none';
            window.currentPromoBonus = 0;
            validatedPromoCode = null;
        }
    } catch (error) {
        console.error('Promo validation error:', error);
        if (statusEl) statusEl.innerHTML = '<i class="bi bi-exclamation-circle-fill text-warning"></i> <span class="text-warning">Ошибка проверки</span>';
        if (previewEl) previewEl.style.display = 'none';
        if (totalPreviewEl) totalPreviewEl.style.display = 'none';
        window.currentPromoBonus = 0;
        validatedPromoCode = null;
    } finally {
        if (applyBtn) applyBtn.disabled = false;
    }
}

/**
 * Reset promo code input
 */
function resetPromoCode() {
    const input = document.getElementById('promoCodeInput');
    const statusEl = document.getElementById('promoCodeStatus');
    const previewEl = document.getElementById('promoBonusPreview');
    const totalPreviewEl = document.getElementById('totalDepositPreview');

    if (input) input.value = '';
    if (statusEl) statusEl.innerHTML = '';
    if (previewEl) previewEl.style.display = 'none';
    if (totalPreviewEl) totalPreviewEl.style.display = 'none';
    window.currentPromoBonus = 0;
    validatedPromoCode = null;
}

/**
 * Update total deposit amount when deposit input changes
 */
function updateTotalDepositAmount() {
    const depositAmountEl = document.getElementById('depositAmount');
    const totalPreviewEl = document.getElementById('totalDepositPreview');
    const totalAmountEl = document.getElementById('totalDepositAmount');

    // Only update if promo code is applied and total preview is visible
    if (!totalPreviewEl || totalPreviewEl.style.display === 'none') return;

    const depositAmount = parseFloat(depositAmountEl ? depositAmountEl.value : 100) || 100;
    const bonusAmount = window.currentPromoBonus || 0;
    const totalAmount = depositAmount + bonusAmount;

    if (totalAmountEl) totalAmountEl.textContent = totalAmount.toFixed(0);
}

/**
 * Show alert
 */
// showAlert() is provided by security.js (loaded first)
// getToken() is provided by auth.js (loaded first)
