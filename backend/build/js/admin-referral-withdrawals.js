/**
 * Admin Referral Withdrawals Page JavaScript
 * Handles wallet withdrawal request management
 */

// Global state
let withdrawals = [];
let currentStatus = '';
let currentWithdrawalId = null;

/**
 * Initialize page on load
 */
document.addEventListener('DOMContentLoaded', async () => {
  if (!isAuthenticated()) {
    window.location.href = '/login.html';
    return;
  }

  // Check admin access
  if (!isAdmin()) {
    showAlert('Доступ запрещён. Требуются права администратора.', 'danger');
    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 2000);
    return;
  }

  // Initialize admin navbar
  initNavbar('admin', 'admin-referral-withdrawals');

  await loadWithdrawals();
});

/**
 * Load withdrawals list
 */
async function loadWithdrawals(status = '') {
  currentStatus = status;

  try {
    let url = '/api/admin/referral-withdrawals?limit=100';
    if (status) {
      url += `&status=${status}`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load withdrawals');
    }

    const result = await response.json();
    withdrawals = result.data || [];
    const statusCounts = result.statusCounts || {};

    // Update status counts
    updateStatusCounts(statusCounts);

    // Render table
    renderWithdrawalsTable();

  } catch (error) {
    console.error('Error loading withdrawals:', error);
    document.getElementById('withdrawalsTable').innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-danger">Ошибка загрузки данных</td>
      </tr>
    `;
  }
}

/**
 * Update status count badges
 */
function updateStatusCounts(counts) {
  const pending = counts.pending || 0;
  const completed = counts.completed || 0;
  const rejected = counts.rejected || 0;
  const all = pending + completed + rejected;

  document.getElementById('pendingCount').textContent = `${pending} ожидают`;
  document.getElementById('allCount').textContent = all;
  document.getElementById('pendingTabCount').textContent = pending;
  document.getElementById('completedCount').textContent = completed;
  document.getElementById('rejectedCount').textContent = rejected;
}

/**
 * Filter by status (tab click)
 */
function filterByStatus(event, status) {
  event.preventDefault();

  // Update active tab
  document.querySelectorAll('#statusTabs .nav-link').forEach(tab => {
    tab.classList.remove('active');
  });
  event.target.closest('.nav-link').classList.add('active');

  loadWithdrawals(status);
}

/**
 * Render withdrawals table
 */
function renderWithdrawalsTable() {
  const tbody = document.getElementById('withdrawalsTable');

  if (!withdrawals || withdrawals.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted">
          <i class="bi bi-inbox"></i> Нет заявок на вывод
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = withdrawals.map(w => `
    <tr class="${w.status === 'pending' ? 'table-warning' : ''}">
      <td>#${w.id}</td>
      <td>
        <strong>${escapeHtml(w.username)}</strong>
        ${w.email ? `<br><small class="text-muted">${escapeHtml(w.email)}</small>` : ''}
      </td>
      <td class="fw-bold">$${w.amount.toFixed(2)}</td>
      <td>
        <code class="small">${escapeHtml(w.walletAddress.slice(0, 10))}...${escapeHtml(w.walletAddress.slice(-6))}</code>
        <button class="btn btn-sm btn-outline-secondary ms-1" onclick="copyToClipboard('${escapeHtml(w.walletAddress)}')">
          <i class="bi bi-clipboard"></i>
        </button>
      </td>
      <td>${formatDateTime(w.createdAt)}</td>
      <td>${getWithdrawalStatusBadge(w.status, w.adminComment)}</td>
      <td>
        ${w.status === 'pending' ? `
          <button class="btn btn-sm btn-success me-1" onclick="showApproveModal(${w.id})">
            <i class="bi bi-check"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="showRejectModal(${w.id})">
            <i class="bi bi-x"></i>
          </button>
        ` : `
          <span class="text-muted small">
            ${w.processedByUsername ? `${escapeHtml(w.processedByUsername)}` : '-'}
            ${w.processedAt ? `<br>${formatDateTime(w.processedAt)}` : ''}
          </span>
        `}
      </td>
    </tr>
  `).join('');
}

/**
 * Get withdrawal status badge
 */
function getWithdrawalStatusBadge(status, comment) {
  const badges = {
    'pending': '<span class="badge bg-warning text-dark">Ожидает</span>',
    'completed': '<span class="badge bg-success">Выполнено</span>',
    'rejected': `<span class="badge bg-danger" title="${escapeHtml(comment || '')}">Отклонено</span>`
  };
  return badges[status] || `<span class="badge bg-secondary">${escapeHtml(status)}</span>`;
}

/**
 * Show approve modal
 */
function showApproveModal(withdrawalId) {
  const withdrawal = withdrawals.find(w => w.id === withdrawalId);
  if (!withdrawal) return;

  currentWithdrawalId = withdrawalId;

  document.getElementById('approveUsername').textContent = withdrawal.username;
  document.getElementById('approveAmount').textContent = withdrawal.amount.toFixed(2);
  document.getElementById('approveWallet').value = withdrawal.walletAddress;

  const modal = new bootstrap.Modal(document.getElementById('approveModal'));
  modal.show();
}

/**
 * Copy wallet address
 */
async function copyWallet() {
  const wallet = document.getElementById('approveWallet').value;
  await copyToClipboard(wallet);
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showAlert('Скопировано!', 'success');
  } catch (error) {
    // Fallback
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showAlert('Скопировано!', 'success');
  }
}

/**
 * Confirm approve
 */
async function confirmApprove() {
  if (!currentWithdrawalId) return;

  try {
    const response = await fetch(`/api/admin/referral-withdrawals/${currentWithdrawalId}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to approve');
    }

    // Close modal and reload
    bootstrap.Modal.getInstance(document.getElementById('approveModal')).hide();
    showAlert(`Вывод для ${data.data?.username || 'пользователя'} подтверждён!`, 'success');
    await loadWithdrawals(currentStatus);

  } catch (error) {
    console.error('Error approving withdrawal:', error);
    showAlert(error.message || 'Ошибка подтверждения', 'danger');
  }
}

/**
 * Show reject modal
 */
function showRejectModal(withdrawalId) {
  const withdrawal = withdrawals.find(w => w.id === withdrawalId);
  if (!withdrawal) return;

  currentWithdrawalId = withdrawalId;

  document.getElementById('rejectUsername').textContent = withdrawal.username;
  document.getElementById('rejectAmount').textContent = withdrawal.amount.toFixed(2);
  document.getElementById('rejectComment').value = '';

  const modal = new bootstrap.Modal(document.getElementById('rejectModal'));
  modal.show();
}

/**
 * Confirm reject
 */
async function confirmReject() {
  if (!currentWithdrawalId) return;

  const comment = document.getElementById('rejectComment').value.trim();

  try {
    const response = await fetch(`/api/admin/referral-withdrawals/${currentWithdrawalId}/reject`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ comment })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to reject');
    }

    // Close modal and reload
    bootstrap.Modal.getInstance(document.getElementById('rejectModal')).hide();
    showAlert(`Заявка отклонена. Средства возвращены на реферальный баланс.`, 'info');
    await loadWithdrawals(currentStatus);

  } catch (error) {
    console.error('Error rejecting withdrawal:', error);
    showAlert(error.message || 'Ошибка отклонения', 'danger');
  }
}

/**
 * Format datetime
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
