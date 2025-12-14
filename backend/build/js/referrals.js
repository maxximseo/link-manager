/**
 * Referrals Page JavaScript
 * Handles affiliate program functionality
 */

// Global state
let currentReferralCode = '';
let currentBalance = 0;
let currentWallet = null;
const MINIMUM_WITHDRAWAL = 200;

/**
 * Initialize page on load
 */
document.addEventListener('DOMContentLoaded', async () => {
  if (!isAuthenticated()) {
    window.location.href = '/login.html';
    return;
  }

  // SidebarNav.init() is called in HTML, no need for initNavbar

  await Promise.all([
    loadReferralStats(),
    loadReferredUsers(),
    loadTransactions(),
    loadWallet()
  ]);

  // Setup preview for code editing
  const newCodeInput = document.getElementById('newReferralCode');
  if (newCodeInput) {
    newCodeInput.addEventListener('input', (e) => {
      const preview = document.getElementById('previewCode');
      if (preview) {
        preview.textContent = e.target.value || '...';
      }
    });
  }

  // Setup withdraw type radio change handler
  const withdrawTypeRadios = document.querySelectorAll('input[name="withdrawType"]');
  withdrawTypeRadios.forEach(radio => {
    radio.addEventListener('change', updateWithdrawModalState);
  });
});

/**
 * Load referral statistics
 */
async function loadReferralStats() {
  try {
    const response = await fetch('/api/referrals/stats', {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load stats');
    }

    const result = await response.json();
    const stats = result.data || result;

    // Update stats cards
    document.getElementById('referralBalance').textContent = parseFloat(stats.referralBalance || 0).toFixed(2);
    document.getElementById('totalEarnings').textContent = parseFloat(stats.totalEarnings || 0).toFixed(2);
    document.getElementById('totalReferrals').textContent = stats.totalReferrals || 0;
    document.getElementById('activeReferrals').textContent = stats.activeReferrals || 0;
    document.getElementById('totalWithdrawn').textContent = parseFloat(stats.totalWithdrawn || 0).toFixed(2);

    // Update referral code input
    currentReferralCode = stats.referralCode || '';
    document.getElementById('referralCode').value = currentReferralCode;

    // Update balance for withdrawal
    currentBalance = parseFloat(stats.referralBalance || 0);

    // Enable/disable withdraw button based on minimum
    const withdrawBtn = document.getElementById('withdrawBtn');
    if (withdrawBtn) {
      withdrawBtn.disabled = currentBalance < MINIMUM_WITHDRAWAL;
    }

  } catch (error) {
    console.error('Error loading referral stats:', error);
    showAlert('Ошибка загрузки статистики', 'danger');
  }
}

/**
 * Load referred users list
 */
async function loadReferredUsers() {
  try {
    const response = await fetch('/api/referrals/referred-users', {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load referred users');
    }

    const result = await response.json();
    const users = result.data || [];
    const tbody = document.getElementById('referredUsersTable');

    if (!users || users.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted py-4">
            <i class="bi bi-people"></i> ${t('noReferralsYet') || 'Пока нет привлечённых пользователей'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = users.map(user => `
      <tr>
        <td>
          <i class="bi bi-person"></i> ${escapeHtml(user.username)}
        </td>
        <td>${formatDate(user.registeredAt)}</td>
        <td>$${parseFloat(user.totalSpent || 0).toFixed(2)}</td>
        <td class="text-success fw-bold">$${parseFloat(user.commissionEarned || 0).toFixed(2)}</td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Error loading referred users:', error);
    document.getElementById('referredUsersTable').innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-danger">Ошибка загрузки данных</td>
      </tr>
    `;
  }
}

/**
 * Load transactions history
 */
async function loadTransactions() {
  try {
    const response = await fetch('/api/referrals/transactions?limit=50', {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load transactions');
    }

    const result = await response.json();
    const transactions = result.data || [];
    const tbody = document.getElementById('transactionsTable');

    if (!transactions || transactions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted">
            <i class="bi bi-clock-history"></i> Пока нет начислений
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = transactions.map(tx => `
      <tr>
        <td>${formatDateTime(tx.createdAt)}</td>
        <td>${escapeHtml(tx.refereeUsername)}</td>
        <td>$${parseFloat(tx.transactionAmount || 0).toFixed(2)}</td>
        <td>${tx.commissionRate}%</td>
        <td class="text-success fw-bold">$${parseFloat(tx.commissionAmount || 0).toFixed(2)}</td>
        <td>${getTransactionStatusBadge(tx.status)}</td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Error loading transactions:', error);
    document.getElementById('transactionsTable').innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger">Ошибка загрузки данных</td>
      </tr>
    `;
  }
}

/**
 * Copy referral link to clipboard
 */
async function copyReferralLink() {
  const code = document.getElementById('referralCode').value;
  const link = `https://serparium.com/go/${code}`;

  try {
    await navigator.clipboard.writeText(link);
    showAlert('Ссылка скопирована!', 'success');
  } catch (error) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = link;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showAlert('Ссылка скопирована!', 'success');
  }
}

/**
 * Show edit code modal
 */
function showEditCodeModal() {
  const modal = new bootstrap.Modal(document.getElementById('editCodeModal'));
  document.getElementById('newReferralCode').value = currentReferralCode;
  document.getElementById('previewCode').textContent = currentReferralCode;
  modal.show();
}

/**
 * Save new referral code
 */
async function saveReferralCode() {
  const newCode = document.getElementById('newReferralCode').value.trim();

  // Validate format
  if (!newCode || !/^[a-zA-Z0-9_-]{3,30}$/.test(newCode)) {
    showAlert('Код должен содержать 3-30 символов: буквы, цифры, подчёркивание, дефис', 'danger');
    return;
  }

  try {
    const response = await fetch('/api/referrals/update-code', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code: newCode })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update code');
    }

    // Close modal and update UI
    bootstrap.Modal.getInstance(document.getElementById('editCodeModal')).hide();
    currentReferralCode = newCode;
    document.getElementById('referralCode').value = newCode;
    showAlert('Код успешно изменён!', 'success');

  } catch (error) {
    console.error('Error updating referral code:', error);
    showAlert(error.message || 'Ошибка обновления кода', 'danger');
  }
}

// Global wallet cooldown state
let canChangeWallet = true;
let walletChangeAvailableAt = null;

/**
 * Load wallet address
 */
async function loadWallet() {
  try {
    const response = await fetch('/api/referrals/wallet', {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load wallet');
    }

    const result = await response.json();
    currentWallet = result.data?.wallet || null;
    canChangeWallet = result.data?.canChangeWallet !== false;
    walletChangeAvailableAt = result.data?.walletChangeAvailableAt || null;

    // Update wallet input and status
    const walletInput = document.getElementById('usdtWallet');
    const walletStatus = document.getElementById('walletStatus');
    const saveBtn = document.querySelector('.ref-wallet-save-btn');
    const cooldownInfo = document.getElementById('walletCooldownInfo');
    const cooldownText = document.getElementById('walletCooldownText');

    if (currentWallet) {
      walletInput.value = currentWallet;
      walletStatus.textContent = t('walletSaved') || 'Сохранён';
      walletStatus.className = 'ref-wallet-badge saved';

      // Show cooldown info if wallet cannot be changed
      if (!canChangeWallet && walletChangeAvailableAt) {
        walletInput.disabled = true;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="bi bi-lock"></i> <span>' + (t('locked') || 'Заблокировано') + '</span>';

        // Calculate days left
        const availableDate = new Date(walletChangeAvailableAt);
        const daysLeft = Math.ceil((availableDate - new Date()) / (1000 * 60 * 60 * 24));

        if (cooldownInfo) {
          cooldownInfo.style.display = 'flex';
          const changeAvailableIn = t('changeAvailableIn') || 'Изменение доступно через';
          const daysWord = t('days') || 'дней';
          cooldownText.textContent = `${changeAvailableIn} ${daysLeft} ${daysWord} (${availableDate.toLocaleDateString('ru-RU')})`;
        }
      } else {
        walletInput.disabled = false;
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-save"></i> <span data-i18n="saveWalletBtn">' + (t('saveWalletBtn') || 'Сохранить') + '</span>';
        if (cooldownInfo) {
          cooldownInfo.style.display = 'none';
        }
      }
    } else {
      walletInput.value = '';
      walletInput.disabled = false;
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="bi bi-save"></i> <span data-i18n="saveWalletBtn">' + (t('saveWalletBtn') || 'Сохранить') + '</span>';
      walletStatus.textContent = t('notSpecified') || 'Не указан';
      walletStatus.className = 'ref-wallet-badge not-set';
      if (cooldownInfo) {
        cooldownInfo.style.display = 'none';
      }
    }

  } catch (error) {
    console.error('Error loading wallet:', error);
  }
}

/**
 * Save wallet address
 */
async function saveWallet() {
  const walletInput = document.getElementById('usdtWallet');
  const wallet = walletInput.value.trim();
  const saveBtn = document.querySelector('.ref-wallet-save-btn');
  const walletStatus = document.getElementById('walletStatus');

  // Validate TRC20 format
  if (!wallet || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(wallet)) {
    showAlert(t('invalidTrc20Format') || 'Неверный формат TRC20 адреса. Должен начинаться с T и содержать 34 символа.', 'danger');
    return;
  }

  // Show loading state
  const originalBtnText = saveBtn.innerHTML;
  saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ' + (t('saving') || 'Сохранение...');
  saveBtn.disabled = true;

  try {
    const response = await fetch('/api/referrals/wallet', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ wallet })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to save wallet');
    }

    currentWallet = wallet;
    walletStatus.textContent = t('walletSaved') || 'Сохранён';
    walletStatus.className = 'ref-wallet-badge saved';

    showAlert(t('walletSavedSuccess') || 'Кошелёк успешно сохранён!', 'success');

  } catch (error) {
    console.error('Error saving wallet:', error);
    showAlert(error.message || (t('walletSaveError') || 'Ошибка сохранения кошелька'), 'danger');
  } finally {
    // Restore button state
    saveBtn.innerHTML = originalBtnText;
    saveBtn.disabled = false;
  }
}

/**
 * Show withdraw modal
 */
function showWithdrawModal() {
  document.getElementById('withdrawAvailable').textContent = currentBalance.toFixed(2);

  // Reset to balance option
  document.getElementById('withdrawToBalance').checked = true;

  // Update wallet info
  updateWithdrawModalState();

  const modal = new bootstrap.Modal(document.getElementById('withdrawModal'));
  modal.show();
}

/**
 * Update withdraw modal state based on selected type
 */
function updateWithdrawModalState() {
  const withdrawType = document.querySelector('input[name="withdrawType"]:checked').value;
  const walletInfo = document.getElementById('walletWithdrawInfo');
  const noWalletWarning = document.getElementById('noWalletWarning');
  const confirmBtn = document.getElementById('confirmWithdrawBtn');
  const walletAddressSpan = document.getElementById('withdrawWalletAddress');

  if (withdrawType === 'wallet') {
    if (currentWallet) {
      walletInfo.classList.remove('d-none');
      noWalletWarning.classList.add('d-none');
      walletAddressSpan.textContent = currentWallet.slice(0, 10) + '...' + currentWallet.slice(-6);
      confirmBtn.disabled = false;
    } else {
      walletInfo.classList.add('d-none');
      noWalletWarning.classList.remove('d-none');
      confirmBtn.disabled = true;
    }
  } else {
    walletInfo.classList.add('d-none');
    noWalletWarning.classList.add('d-none');
    confirmBtn.disabled = false;
  }
}

/**
 * Confirm withdrawal (either to balance or wallet)
 */
async function confirmWithdraw() {
  if (currentBalance < MINIMUM_WITHDRAWAL) {
    showAlert(`Минимальная сумма вывода: $${MINIMUM_WITHDRAWAL}`, 'warning');
    return;
  }

  const withdrawType = document.querySelector('input[name="withdrawType"]:checked').value;

  if (withdrawType === 'wallet') {
    await withdrawToWallet();
  } else {
    await withdrawToBalance();
  }
}

/**
 * Withdraw balance to main account
 */
async function withdrawToBalance() {
  try {
    const response = await fetch('/api/referrals/withdraw', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to withdraw');
    }

    // Close modal and refresh stats
    bootstrap.Modal.getInstance(document.getElementById('withdrawModal')).hide();
    const withdrawnAmount = data.data?.withdrawnAmount || data.withdrawnAmount || 0;
    showAlert(`Успешно выведено $${withdrawnAmount.toFixed(2)} на основной баланс!`, 'success');

    // Reload stats to update balances
    await loadReferralStats();
    await loadTransactions();

  } catch (error) {
    console.error('Error withdrawing to balance:', error);
    showAlert(error.message || 'Ошибка вывода средств', 'danger');
  }
}

/**
 * Withdraw balance to USDT wallet
 */
async function withdrawToWallet() {
  if (!currentWallet) {
    showAlert('Сначала сохраните адрес USDT TRC20 кошелька', 'warning');
    return;
  }

  try {
    const response = await fetch('/api/referrals/withdraw-to-wallet', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to withdraw');
    }

    // Close modal and refresh stats
    bootstrap.Modal.getInstance(document.getElementById('withdrawModal')).hide();
    const amount = data.data?.amount || 0;
    showAlert(`Заявка на вывод $${amount.toFixed(2)} на USDT кошелёк создана! Обработка до 24 часов.`, 'success');

    // Reload stats to update balances
    await loadReferralStats();
    await loadTransactions();

  } catch (error) {
    console.error('Error withdrawing to wallet:', error);
    showAlert(error.message || 'Ошибка создания заявки на вывод', 'danger');
  }
}

// Keep old function name for backward compatibility
async function withdrawBalance() {
  await withdrawToBalance();
}

/**
 * Get transaction status badge
 */
function getTransactionStatusBadge(status) {
  const badges = {
    'credited': '<span class="badge bg-success">Зачислено</span>',
    'withdrawn': '<span class="badge bg-info">Выведено</span>',
    'pending': '<span class="badge bg-warning">Ожидание</span>'
  };
  return badges[status] || `<span class="badge bg-secondary">${escapeHtml(status)}</span>`;
}

/**
 * Format date to DD.MM.YYYY
 */
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Format datetime to DD.MM.YYYY HH:MM
 */
function formatDateTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
