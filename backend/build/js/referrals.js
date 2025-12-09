/**
 * Referrals Page JavaScript
 * Handles affiliate program functionality
 */

// Global state
let currentReferralCode = '';
let currentBalance = 0;
const MINIMUM_WITHDRAWAL = 200;

/**
 * Initialize page on load
 */
document.addEventListener('DOMContentLoaded', async () => {
  if (!isAuthenticated()) {
    window.location.href = '/login.html';
    return;
  }

  await Promise.all([
    loadReferralStats(),
    loadReferredUsers(),
    loadTransactions()
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

    const data = await response.json();
    const tbody = document.getElementById('referredUsersTable');

    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted">
            <i class="bi bi-people"></i> Пока нет привлечённых пользователей
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.users.map(user => `
      <tr>
        <td>
          <i class="bi bi-person"></i> ${escapeHtml(user.username)}
        </td>
        <td>${formatDate(user.created_at)}</td>
        <td>$${parseFloat(user.total_spent || 0).toFixed(2)}</td>
        <td class="text-success fw-bold">$${parseFloat(user.commission_earned || 0).toFixed(2)}</td>
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

    const data = await response.json();
    const tbody = document.getElementById('transactionsTable');

    if (!data.transactions || data.transactions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted">
            <i class="bi bi-clock-history"></i> Пока нет начислений
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.transactions.map(tx => `
      <tr>
        <td>${formatDateTime(tx.created_at)}</td>
        <td>${escapeHtml(tx.referee_username)}</td>
        <td>$${parseFloat(tx.transaction_amount || 0).toFixed(2)}</td>
        <td>${tx.commission_rate}%</td>
        <td class="text-success fw-bold">$${parseFloat(tx.commission_amount || 0).toFixed(2)}</td>
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
  const link = `https://serparium.com/ref/${code}`;

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
      body: JSON.stringify({ newCode })
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

/**
 * Show withdraw modal
 */
function showWithdrawModal() {
  document.getElementById('withdrawAvailable').textContent = currentBalance.toFixed(2);
  const modal = new bootstrap.Modal(document.getElementById('withdrawModal'));
  modal.show();
}

/**
 * Withdraw balance to main account
 */
async function withdrawBalance() {
  if (currentBalance < MINIMUM_WITHDRAWAL) {
    showAlert(`Минимальная сумма вывода: $${MINIMUM_WITHDRAWAL}`, 'warning');
    return;
  }

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
    showAlert(`Успешно выведено $${data.amount.toFixed(2)} на основной баланс!`, 'success');

    // Reload stats to update balances
    await loadReferralStats();
    await loadTransactions();

  } catch (error) {
    console.error('Error withdrawing balance:', error);
    showAlert(error.message || 'Ошибка вывода средств', 'danger');
  }
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
