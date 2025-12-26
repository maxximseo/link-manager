// Admin Users Management

// Check authentication
if (!isAuthenticated()) {
    window.location.href = '/index.html';
}

// Check admin role
const user = getCurrentUser();
if (user && user.role !== 'admin') {
    window.location.href = '/dashboard.html';
}

let users = [];
let filteredUsers = [];
let currentPage = 1;
const usersPerPage = 20;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await loadUsers();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Search input
    document.getElementById('searchInput').addEventListener('input', debounce(() => {
        applyFilters();
    }, 500));

    // Adjust amount input - calculate new balance
    document.getElementById('adjustAmount').addEventListener('input', () => {
        calculateNewBalance();
    });
}

// debounce() is provided by security.js (loaded first)

// Load users from API
async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load users');
        }

        const result = await response.json();
        users = result.data || [];
        filteredUsers = [...users];

        updateStatistics();
        applyFilters();
    } catch (error) {
        console.error('Error loading users:', error);
        showAlert('Ошибка загрузки пользователей: ' + error.message, 'danger');
    }
}

// Update statistics cards
function updateStatistics() {
    const totalUsers = users.length;
    const activeUsers = users.filter(u => parseFloat(u.balance) > 0).length;
    const totalBalance = users.reduce((sum, u) => sum + parseFloat(u.balance || 0), 0);
    const totalSpent = users.reduce((sum, u) => sum + parseFloat(u.total_spent || 0), 0);

    document.getElementById('totalUsers').textContent = totalUsers;
    document.getElementById('activeUsers').textContent = activeUsers;
    document.getElementById('totalBalance').textContent = totalBalance.toFixed(2);
    document.getElementById('totalSpent').textContent = totalSpent.toFixed(2);
}

// Apply filters
function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const roleFilter = document.getElementById('roleFilter').value;
    const discountFilter = document.getElementById('discountFilter').value;

    filteredUsers = users.filter(user => {
        // Search filter
        const matchesSearch = !searchTerm ||
            user.username.toLowerCase().includes(searchTerm) ||
            (user.email && user.email.toLowerCase().includes(searchTerm));

        // Role filter
        const matchesRole = !roleFilter || user.role === roleFilter;

        // Discount filter
        const matchesDiscount = !discountFilter ||
            parseInt(user.current_discount || 0) === parseInt(discountFilter);

        return matchesSearch && matchesRole && matchesDiscount;
    });

    currentPage = 1;
    renderUsers();
    renderPagination();
}

// Render users table
function renderUsers() {
    const tbody = document.getElementById('usersTableBody');
    const start = (currentPage - 1) * usersPerPage;
    const end = start + usersPerPage;
    const pageUsers = filteredUsers.slice(start, end);

    document.getElementById('usersCount').textContent = filteredUsers.length;

    if (pageUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted">
                    <i class="bi bi-inbox"></i> Пользователи не найдены
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = pageUsers.map(user => {
        const balance = parseFloat(user.balance || 0);
        const totalSpent = parseFloat(user.total_spent || 0);
        const discount = parseInt(user.current_discount || 0);

        // Determine discount tier name using shared function
        const tierName = getDiscountTierName(discount);

        // Format dates
        const lastLogin = user.last_login
            ? new Date(user.last_login).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Никогда';
        const createdAt = new Date(user.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

        // Role badge using shared function
        const roleBadge = getUserRoleBadge(user.role);

        // Balance color
        const balanceClass = balance > 0 ? 'text-success' : 'text-muted';

        return `
            <tr>
                <td>${user.id}</td>
                <td><strong>${escapeHtml(user.username)}</strong></td>
                <td>${escapeHtml(user.email || 'N/A')}</td>
                <td>${roleBadge}</td>
                <td class="${balanceClass} fw-bold">$${balance.toFixed(2)}</td>
                <td class="text-primary">$${totalSpent.toFixed(2)}</td>
                <td>
                    <span class="badge bg-info">${discount}%</span>
                    <small class="text-muted">${tierName}</small>
                </td>
                <td><small>${lastLogin}</small></td>
                <td><small>${createdAt}</small></td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="openAdjustBalanceModal(${user.id})" title="Корректировка баланса">
                            <i class="bi bi-wallet2"></i>
                        </button>
                        <button class="btn btn-outline-info" onclick="viewUserTransactions(${user.id}, '${escapeHtml(user.username)}')" title="История транзакций">
                            <i class="bi bi-clock-history"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Render pagination
function renderPagination() {
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const pagination = document.getElementById('pagination');

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';

    // Previous button
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1}); return false;">Назад</a>
        </li>
    `;

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `
                <li class="page-item ${currentPage === i ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a>
                </li>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }

    // Next button
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1}); return false;">Вперед</a>
        </li>
    `;

    pagination.innerHTML = html;
}

// Change page
function changePage(page) {
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    if (page < 1 || page > totalPages) return;

    currentPage = page;
    renderUsers();
    renderPagination();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Open adjust balance modal
function openAdjustBalanceModal(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('adjustUserId').value = user.id;
    document.getElementById('adjustUsername').value = user.username;
    document.getElementById('adjustCurrentBalance').value = parseFloat(user.balance || 0).toFixed(2);
    document.getElementById('adjustAmount').value = '';
    document.getElementById('adjustReason').value = '';
    document.getElementById('adjustNewBalance').textContent = parseFloat(user.balance || 0).toFixed(2);

    const modal = new bootstrap.Modal(document.getElementById('adjustBalanceModal'));
    modal.show();
}

// Calculate new balance in modal
function calculateNewBalance() {
    const currentBalance = parseFloat(document.getElementById('adjustCurrentBalance').value || 0);
    const adjustAmount = parseFloat(document.getElementById('adjustAmount').value || 0);
    const newBalance = currentBalance + adjustAmount;

    document.getElementById('adjustNewBalance').textContent = newBalance.toFixed(2);
}

// Confirm adjust balance
async function confirmAdjustBalance() {
    const userId = document.getElementById('adjustUserId').value;
    const amount = parseFloat(document.getElementById('adjustAmount').value);
    const reason = document.getElementById('adjustReason').value.trim();

    // Validation
    if (!amount || amount === 0) {
        alert('Введите сумму корректировки');
        return;
    }

    // Reason is optional - no validation required

    const currentBalance = parseFloat(document.getElementById('adjustCurrentBalance').value);
    const newBalance = currentBalance + amount;

    if (newBalance < 0) {
        if (!confirm(`Новый баланс будет отрицательным ($${newBalance.toFixed(2)}). Продолжить?`)) {
            return;
        }
    }

    try {
        const response = await fetch(`/api/admin/users/${userId}/adjust-balance`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount,
                reason: reason
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to adjust balance');
        }

        const result = await response.json();

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('adjustBalanceModal'));
        modal.hide();

        // Show success message
        showAlert(`Баланс успешно изменен. Новый баланс: $${result.data.newBalance.toFixed(2)}`, 'success');

        // Reload users
        await loadUsers();

    } catch (error) {
        console.error('Error adjusting balance:', error);
        showAlert('Ошибка изменения баланса: ' + error.message, 'danger');
    }
}

// View user transactions
async function viewUserTransactions(userId, username) {
    document.getElementById('transactionsUsername').textContent = username;

    const tbody = document.getElementById('userTransactionsBody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Загрузка...</td></tr>';

    const modal = new bootstrap.Modal(document.getElementById('userTransactionsModal'));
    modal.show();

    try {
        // Fetch user's transactions through billing API
        const response = await fetch(`/api/billing/transactions?userId=${userId}&limit=50`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load transactions');
        }

        const result = await response.json();
        const transactions = result.data?.transactions || [];

        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Транзакций не найдено</td></tr>';
            return;
        }

        tbody.innerHTML = transactions.map(tx => {
            // Use shared badge-utils functions
            const amount = parseFloat(tx.amount);
            const amountClass = getAmountColorClass(amount);
            const amountSign = amount >= 0 ? '+' : '';
            const date = new Date(tx.created_at).toLocaleString('ru-RU');

            return `
                <tr>
                    <td>${tx.id}</td>
                    <td>${getTransactionTypeBadge(tx.type)}</td>
                    <td class="${amountClass} fw-bold">${amountSign}$${Math.abs(amount).toFixed(2)}</td>
                    <td>$${parseFloat(tx.balance_before).toFixed(2)}</td>
                    <td>$${parseFloat(tx.balance_after).toFixed(2)}</td>
                    <td><small>${escapeHtml(tx.description || 'N/A')}</small></td>
                    <td><small>${date}</small></td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading transactions:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Ошибка загрузки: ${error.message}</td></tr>`;
    }
}

// Helper functions
// escapeHtml() is provided by security.js (loaded first)
// showAlert() is provided by security.js - use showAlert(message, 'success') or showAlert(message, 'danger')
// getToken() is provided by auth.js (loaded first)
// logout() is provided by auth.js (loaded first)
