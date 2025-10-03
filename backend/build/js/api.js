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
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }
        
        return await response.json();
    } catch (error) {
        showNotification(error.message, 'error');
        throw error;
    }
}

// Projects API
const ProjectsAPI = {
    getAll: () => apiCall('/projects'),
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
    getAll: () => apiCall('/sites'),
    get: (id) => apiCall(`/sites/${id}`),
    create: (data) => apiCall('/sites', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiCall(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiCall(`/sites/${id}`, { method: 'DELETE' }),
    getQuota: (id) => apiCall(`/sites/${id}/quota`),
    regenerateApiKey: (id) => apiCall(`/sites/${id}/regenerate-key`, { method: 'POST' })
};

// Placements API
const PlacementsAPI = {
    getAll: (filters = {}) => {
        const params = new URLSearchParams(filters);
        return apiCall(`/placements?${params}`);
    },
    get: (id) => apiCall(`/placements/${id}`),
    create: (data) => apiCall('/placements', { method: 'POST', body: JSON.stringify(data) }),
    createBatch: (data) => apiCall('/placements/batch/create', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiCall(`/placements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiCall(`/placements/${id}`, { method: 'DELETE' }),
    getStatistics: () => apiCall('/placements/statistics')
};
