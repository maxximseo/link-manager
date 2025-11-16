// API Helper Functions
// Note: API_BASE is defined in auth.js

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// API call wrapper
async function apiCall(endpoint, options = {}) {
    try {
        const response = await authenticatedFetch(`${API_BASE}${endpoint}`, options);

        // Check if response is JSON before parsing
        const contentType = response.headers.get('content-type');
        const isJson = contentType && contentType.includes('application/json');

        if (!response.ok) {
            if (isJson) {
                try {
                    const error = await response.json();
                    throw new Error(error.error || 'Request failed');
                } catch (jsonError) {
                    // JSON parsing failed even though content-type says JSON
                    const text = await response.text();
                    console.error('Failed to parse error JSON:', text);
                    throw new Error(`Server error (${response.status}): ${response.statusText}`);
                }
            } else {
                // Non-JSON error response (HTML error page, plain text, etc.)
                const text = await response.text();
                console.error('Non-JSON error response:', text);
                throw new Error(`Server error (${response.status}): ${response.statusText}`);
            }
        }

        // Parse successful response
        if (isJson) {
            try {
                return await response.json();
            } catch (jsonError) {
                const text = await response.text();
                console.error('Failed to parse success JSON:', text);
                throw new Error('Server returned invalid JSON');
            }
        } else {
            const text = await response.text();
            console.error('Non-JSON success response:', text);
            throw new Error('Server returned non-JSON response');
        }
    } catch (error) {
        // Don't show notification twice for our custom errors
        if (!error.message.includes('Server error') && !error.message.includes('invalid JSON')) {
            showNotification(error.message, 'error');
        } else {
            showNotification(error.message, 'error');
        }
        throw error;
    }
}

// Projects API
const ProjectsAPI = {
    getAll: async () => {
        const response = await apiCall('/projects');
        return response.data || response; // Extract data array if paginated
    },
    get: (id) => apiCall(`/projects/${id}`),
    create: (data) => apiCall('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiCall(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiCall(`/projects/${id}`, { method: 'DELETE' }),
    getLinks: (id) => apiCall(`/projects/${id}/links`),
    addLink: (id, data) => apiCall(`/projects/${id}/links`, { method: 'POST', body: JSON.stringify(data) }),
    updateLink: (id, linkId, data) => apiCall(`/projects/${id}/links/${linkId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteLink: (id, linkId) => apiCall(`/projects/${id}/links/${linkId}`, { method: 'DELETE' }),
    getArticles: (id) => apiCall(`/projects/${id}/articles`),
    addArticle: (id, data) => apiCall(`/projects/${id}/articles`, { method: 'POST', body: JSON.stringify(data) }),
    updateArticle: (id, articleId, data) => apiCall(`/projects/${id}/articles/${articleId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteArticle: (id, articleId) => apiCall(`/projects/${id}/articles/${articleId}`, { method: 'DELETE' })
};

// Sites API
const SitesAPI = {
    getAll: async (page = 1, limit = 100) => {
        const params = new URLSearchParams({ page, limit });
        const response = await apiCall(`/sites?${params}`);
        return response; // Returns { data: [...], pagination: {...} }
    },
    getMarketplace: async () => {
        const response = await apiCall('/sites/marketplace');
        return response.data || response; // Returns public sites + user's own sites
    },
    get: (id) => apiCall(`/sites/${id}`),
    create: (data) => apiCall('/sites', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiCall(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiCall(`/sites/${id}`, { method: 'DELETE' }),
    getQuota: (id) => apiCall(`/sites/${id}/quota`),
    regenerateApiKey: (id) => apiCall(`/sites/${id}/regenerate-key`, { method: 'POST' })
};

// Placements API
const PlacementsAPI = {
    getAll: async (filters = {}) => {
        const params = new URLSearchParams(filters);
        const response = await apiCall(`/placements?${params}`);
        return response.data || response; // Extract data array if paginated
    },
    get: (id) => apiCall(`/placements/${id}`),
    getBySite: (siteId) => apiCall(`/placements/by-site/${siteId}`),
    // REMOVED: create - endpoint deprecated (410 Gone), use BillingAPI.purchase instead
    // REMOVED: createBatch - use BillingAPI.purchase instead
    update: (id, data) => apiCall(`/placements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiCall(`/placements/${id}`, { method: 'DELETE' }),
    getStatistics: () => apiCall('/placements/statistics'),
    getAvailableSites: (projectId) => apiCall(`/placements/available-sites/${projectId}`)
};

// Billing API
const BillingAPI = {
    getBalance: () => apiCall('/billing/balance'),
    deposit: (amount, description) => apiCall('/billing/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount, description })
    }),
    getTransactions: (filters = {}) => {
        const params = new URLSearchParams(filters);
        return apiCall(`/billing/transactions?${params}`);
    },
    getPricing: () => apiCall('/billing/pricing'),
    getDiscountTiers: () => apiCall('/billing/discount-tiers'),
    purchase: (data) => apiCall('/billing/purchase', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    renewPlacement: (placementId) => apiCall(`/billing/renew/${placementId}`, {
        method: 'POST'
    }),
    toggleAutoRenewal: (placementId, enabled) => apiCall(`/billing/auto-renewal/${placementId}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled })
    })
};

// #8: Table Sorting Utility
class TableSorter {
    constructor(tableId, storageKey) {
        this.table = document.getElementById(tableId);
        this.tbody = this.table ? this.table.querySelector('tbody') : null;
        this.storageKey = storageKey || `table-sort-${tableId}`;
        this.currentSort = this.loadSortState();
    }

    loadSortState() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            return saved ? JSON.parse(saved) : { column: null, direction: 'asc' };
        } catch {
            return { column: null, direction: 'asc' };
        }
    }

    saveSortState() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.currentSort));
        } catch {}
    }

    initSortableHeaders() {
        if (!this.table) return;

        const headers = this.table.querySelectorAll('th.sortable');
        headers.forEach((header, index) => {
            header.addEventListener('click', () => this.sortByColumn(index));

            // Apply saved sort state
            if (this.currentSort.column === index) {
                header.classList.add(`sort-${this.currentSort.direction}`);
            }
        });
    }

    sortByColumn(columnIndex) {
        if (!this.tbody) return;

        const headers = this.table.querySelectorAll('th');
        const header = headers[columnIndex];

        // Toggle sort direction
        if (this.currentSort.column === columnIndex) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = columnIndex;
            this.currentSort.direction = 'asc';
        }

        // Update header classes
        headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
        header.classList.add(`sort-${this.currentSort.direction}`);

        // Sort rows
        const rows = Array.from(this.tbody.querySelectorAll('tr'));
        rows.sort((a, b) => {
            const aCell = a.cells[columnIndex];
            const bCell = b.cells[columnIndex];

            if (!aCell || !bCell) return 0;

            const aText = aCell.textContent.trim();
            const bText = bCell.textContent.trim();

            // Try numeric comparison first
            const aNum = parseFloat(aText.replace(/[^0-9.-]/g, ''));
            const bNum = parseFloat(bText.replace(/[^0-9.-]/g, ''));

            if (!isNaN(aNum) && !isNaN(bNum)) {
                return this.currentSort.direction === 'asc' ? aNum - bNum : bNum - aNum;
            }

            // Fallback to string comparison
            return this.currentSort.direction === 'asc'
                ? aText.localeCompare(bText)
                : bText.localeCompare(aText);
        });

        // Re-append sorted rows
        rows.forEach(row => this.tbody.appendChild(row));

        // Save state
        this.saveSortState();
    }
}
