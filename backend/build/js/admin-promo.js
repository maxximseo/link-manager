/**
 * Admin Promo Codes Management
 * Handles CRUD operations for promo codes
 */

let promoCodes = [];
let users = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  if (!isAuthenticated() || !isAdmin()) {
    window.location.href = '/login.html';
    return;
  }

  loadUsers();
  loadPromoCodes();

  // Form submit handler
  document.getElementById('createPromoForm').addEventListener('submit', handleCreatePromo);
});

// Load users list for owner dropdown
async function loadUsers() {
  try {
    const response = await fetch('/api/admin/users?limit=1000', {
      headers: { Authorization: `Bearer ${getToken()}` }
    });

    if (!response.ok) throw new Error('Failed to load users');

    const data = await response.json();
    users = data.data || [];

    // Populate owner dropdown
    const select = document.getElementById('promoOwner');
    users.forEach((user) => {
      const option = document.createElement('option');
      option.value = user.id;
      option.textContent = `${user.username} (ID: ${user.id})`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

// Load promo codes
async function loadPromoCodes() {
  try {
    const response = await fetch('/api/promo', {
      headers: { Authorization: `Bearer ${getToken()}` }
    });

    if (!response.ok) throw new Error('Failed to load promo codes');

    const data = await response.json();
    promoCodes = data.data || [];

    updateStatistics();
    renderPromoCodesTable();
  } catch (error) {
    console.error('Error loading promo codes:', error);
    document.getElementById('promoCodesTableBody').innerHTML = `
            <tr>
                <td colspan="11" class="text-center text-danger">
                    <i class="bi bi-exclamation-triangle"></i> ${escapeHtml(error.message)}
                </td>
            </tr>
        `;
  }
}

// Update statistics cards
function updateStatistics() {
  const total = promoCodes.length;
  const active = promoCodes.filter((p) => p.isActive).length;
  const totalActivations = promoCodes.reduce((sum, p) => sum + parseInt(p.totalActivations || 0), 0);
  const totalRewards = promoCodes.reduce((sum, p) => {
    const activations = parseInt(p.totalActivations || 0);
    const reward = parseFloat(p.partnerReward || 0);
    return sum + activations * reward;
  }, 0);

  document.getElementById('totalPromoCodes').textContent = total;
  document.getElementById('activePromoCodes').textContent = active;
  document.getElementById('totalActivations').textContent = totalActivations;
  document.getElementById('totalPartnerRewards').textContent = totalRewards.toFixed(2);
  document.getElementById('promoCodesCount').textContent = total;
}

// Render promo codes table
function renderPromoCodesTable() {
  const tbody = document.getElementById('promoCodesTableBody');

  if (promoCodes.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center text-muted">
                    <i class="bi bi-tags"></i> Промокоды не найдены
                </td>
            </tr>
        `;
    return;
  }

  tbody.innerHTML = promoCodes.map((promo) => renderPromoRow(promo)).join('');
}

// Render single promo code row
function renderPromoRow(promo) {
  const isExpired = promo.expiresAt && new Date(promo.expiresAt) < new Date();
  const isExhausted = promo.maxUses > 0 && promo.currentUses >= promo.maxUses;
  const statusClass = !promo.isActive ? 'bg-secondary' : isExpired ? 'bg-danger' : isExhausted ? 'bg-warning' : 'bg-success';
  const statusText = !promo.isActive ? 'Неактивен' : isExpired ? 'Истёк' : isExhausted ? 'Исчерпан' : 'Активен';

  return `
        <tr class="${!promo.isActive ? 'table-secondary' : ''}">
            <td>${promo.id}</td>
            <td>
                <code class="fs-6">${escapeHtml(promo.code)}</code>
            </td>
            <td>
                ${promo.ownerUsername ? `<span class="text-primary">${escapeHtml(promo.ownerUsername)}</span>` : '<span class="text-muted">-</span>'}
            </td>
            <td>$${parseFloat(promo.bonusAmount).toFixed(2)}</td>
            <td>$${parseFloat(promo.partnerReward).toFixed(2)}</td>
            <td>$${parseFloat(promo.minDeposit).toFixed(2)}</td>
            <td>
                <span class="badge ${promo.currentUses >= promo.maxUses && promo.maxUses > 0 ? 'bg-warning' : 'bg-info'}">
                    ${promo.currentUses}${promo.maxUses > 0 ? `/${promo.maxUses}` : '/∞'}
                </span>
                ${promo.totalActivations > 0 ? `<small class="text-success ms-1">(${promo.totalActivations} актив.)</small>` : ''}
            </td>
            <td>
                <span class="badge ${statusClass}">${statusText}</span>
            </td>
            <td>
                ${promo.expiresAt ? formatDate(promo.expiresAt) : '<span class="text-muted">∞</span>'}
            </td>
            <td>${formatDate(promo.createdAt)}</td>
            <td>
                ${
                  promo.isActive
                    ? `<button class="btn btn-sm btn-outline-danger" onclick="deactivatePromo(${promo.id})" title="Деактивировать">
                        <i class="bi bi-x-circle"></i>
                    </button>`
                    : `<span class="text-muted">-</span>`
                }
            </td>
        </tr>
    `;
}

// Handle create promo code form submit
async function handleCreatePromo(e) {
  e.preventDefault();

  const code = document.getElementById('promoCode').value.trim().toUpperCase();
  const ownerUserId = document.getElementById('promoOwner').value || null;
  const bonusAmount = parseFloat(document.getElementById('promoBonusAmount').value) || 100;
  const partnerReward = parseFloat(document.getElementById('promoPartnerReward').value) || 50;
  const minDeposit = parseFloat(document.getElementById('promoMinDeposit').value) || 100;
  const maxUses = parseInt(document.getElementById('promoMaxUses').value) || 0;
  const expiresAtInput = document.getElementById('promoExpiresAt').value;
  const expiresAt = expiresAtInput ? new Date(expiresAtInput).toISOString() : null;

  if (!code) {
    showAlert('error', 'Введите код промокода');
    return;
  }

  try {
    const response = await fetch('/api/promo', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        ownerUserId: ownerUserId ? parseInt(ownerUserId) : null,
        bonusAmount,
        partnerReward,
        minDeposit,
        maxUses,
        expiresAt
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create promo code');
    }

    showAlert('success', `Промокод "${code}" успешно создан!`);

    // Reset form
    document.getElementById('createPromoForm').reset();
    document.getElementById('promoBonusAmount').value = '100';
    document.getElementById('promoPartnerReward').value = '50';
    document.getElementById('promoMinDeposit').value = '100';
    document.getElementById('promoMaxUses').value = '0';

    // Reload promo codes
    loadPromoCodes();
  } catch (error) {
    console.error('Error creating promo code:', error);
    showAlert('error', error.message);
  }
}

// Deactivate promo code
async function deactivatePromo(promoId) {
  if (!confirm('Вы уверены, что хотите деактивировать этот промокод?')) {
    return;
  }

  try {
    const response = await fetch(`/api/promo/${promoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` }
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to deactivate promo code');
    }

    showAlert('success', 'Промокод деактивирован');
    loadPromoCodes();
  } catch (error) {
    console.error('Error deactivating promo code:', error);
    showAlert('error', error.message);
  }
}
