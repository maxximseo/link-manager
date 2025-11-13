// Authentication & Authorization Module
const API_BASE = window.location.origin + '/api';

// Check if user is authenticated
function isAuthenticated() {
    return !!localStorage.getItem('token');
}

// Get auth token
function getAuthToken() {
    return localStorage.getItem('token');
}

// Alias for compatibility
function getToken() {
    return localStorage.getItem('token');
}

// Get current user
function getCurrentUser() {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
}

// Check if current user is admin
function isAdmin() {
    const user = getCurrentUser();
    return user && user.role === 'admin';
}

// Login function
async function login(username, password) {
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        // Save token and user info
        localStorage.setItem('token', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));

        return data;
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

// Logout function
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('authToken'); // Remove old key for compatibility
    localStorage.removeItem('currentUser');
    window.location.href = '/';
}

// Check auth on page load
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = '/';
        return false;
    }
    return true;
}

// API request with auth header
async function authenticatedFetch(url, options = {}) {
    const token = getAuthToken();

    if (!token) {
        logout();
        throw new Error('Not authenticated');
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        logout();
        throw new Error('Session expired');
    }

    return response;
}

// Load and update balance in navigation bar
async function updateNavBalance() {
    const navBalance = document.getElementById('navBalance');
    if (!navBalance) return; // Element doesn't exist on this page

    try {
        const response = await fetch(`${API_BASE}/billing/balance`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            console.error('Failed to load balance:', response.statusText);
            return;
        }

        const result = await response.json();
        const balance = parseFloat(result.data?.balance || 0);
        navBalance.textContent = balance.toFixed(2);
    } catch (error) {
        console.error('Error updating nav balance:', error);
        // Don't show error to user, just keep default value
    }
}

// Auto-update balance on authenticated pages
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (isAuthenticated()) {
            updateNavBalance();
        }
    });
} else {
    if (isAuthenticated()) {
        updateNavBalance();
    }
}
