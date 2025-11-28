// Authentication & Authorization Module
const API_BASE = window.location.origin + '/api';

// Token refresh interval (refresh 5 minutes before expiry)
let tokenRefreshTimer = null;
const TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // 5 minutes before expiry

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

// Get refresh token
function getRefreshToken() {
    return localStorage.getItem('refreshToken');
}

// Get token expiry time
function getTokenExpiry() {
    return parseInt(localStorage.getItem('tokenExpiry') || '0');
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

// Save tokens to localStorage
function saveTokens(token, refreshToken, expiresIn) {
    localStorage.setItem('token', token);
    if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
    }
    // Store expiry time as timestamp
    const expiryTime = Date.now() + (expiresIn * 1000);
    localStorage.setItem('tokenExpiry', expiryTime.toString());

    // Schedule token refresh
    scheduleTokenRefresh(expiresIn);
}

// Schedule automatic token refresh
function scheduleTokenRefresh(expiresIn) {
    // Clear any existing timer
    if (tokenRefreshTimer) {
        clearTimeout(tokenRefreshTimer);
    }

    // Schedule refresh 5 minutes before expiry (or half if expiry < 10 min)
    const refreshIn = Math.max(
        (expiresIn * 1000) - TOKEN_REFRESH_MARGIN,
        (expiresIn * 1000) / 2
    );

    console.log(`Token refresh scheduled in ${Math.round(refreshIn / 1000 / 60)} minutes`);

    tokenRefreshTimer = setTimeout(async () => {
        await refreshAccessToken();
    }, refreshIn);
}

// Refresh the access token
async function refreshAccessToken() {
    const refreshToken = getRefreshToken();

    if (!refreshToken) {
        console.log('No refresh token available');
        logout();
        return false;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Token refresh failed:', error.error);
            logout();
            return false;
        }

        const data = await response.json();

        // Save new access token (keep existing refresh token)
        saveTokens(data.token, null, data.expiresIn);

        // Update user info if returned
        if (data.user) {
            localStorage.setItem('currentUser', JSON.stringify(data.user));
        }

        console.log('Token refreshed successfully');
        return true;

    } catch (error) {
        console.error('Token refresh error:', error);
        logout();
        return false;
    }
}

// Check and refresh token if needed
async function ensureValidToken() {
    const expiry = getTokenExpiry();
    const now = Date.now();

    // If token expires in less than 1 minute, refresh now
    if (expiry && (expiry - now) < 60000) {
        return await refreshAccessToken();
    }

    return true;
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

        // Save tokens with expiry
        saveTokens(data.token, data.refreshToken, data.expiresIn || 3600);
        localStorage.setItem('currentUser', JSON.stringify(data.user));

        return data;
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

// Logout function
function logout() {
    // Clear refresh timer
    if (tokenRefreshTimer) {
        clearTimeout(tokenRefreshTimer);
        tokenRefreshTimer = null;
    }

    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tokenExpiry');
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

// API request with auth header and automatic token refresh
async function authenticatedFetch(url, options = {}) {
    // Ensure token is valid before making request
    await ensureValidToken();

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

    let response = await fetch(url, { ...options, headers });

    // If 401, try to refresh token and retry once
    if (response.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            // Retry with new token
            const newToken = getAuthToken();
            headers['Authorization'] = `Bearer ${newToken}`;
            response = await fetch(url, { ...options, headers });
        }

        if (response.status === 401) {
            logout();
            throw new Error('Session expired');
        }
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

// Initialize token refresh on page load
function initTokenRefresh() {
    const expiry = getTokenExpiry();
    const now = Date.now();

    if (expiry && expiry > now) {
        const remainingSeconds = Math.floor((expiry - now) / 1000);
        scheduleTokenRefresh(remainingSeconds);
    }
}

// Auto-update balance and init token refresh on authenticated pages
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (isAuthenticated()) {
            updateNavBalance();
            initTokenRefresh();
        }
    });
} else {
    if (isAuthenticated()) {
        updateNavBalance();
        initTokenRefresh();
    }
}
