/**
 * Navbar Component
 * Dynamically generates and injects navbar HTML based on configuration
 */

class Navbar {
    constructor(type, activePage, options = {}) {
        this.type = type; // 'user' or 'admin'
        this.activePage = activePage;
        this.options = options;
        this.config = NavbarConfig[type];

        if (!this.config) {
            console.error(`Invalid navbar type: ${type}. Must be 'user' or 'admin'`);
        }
    }

    /**
     * Generate menu items HTML
     */
    renderMenuItems() {
        return this.config.menuItems.map(item => {
            const activeClass = item.page === this.activePage ? 'active' : '';
            let badgeHtml = '';
            if (item.hasBadge && item.badgeId) {
                badgeHtml = `<span class="badge bg-danger ms-1" id="${item.badgeId}" style="display: none;">0</span>`;
            }
            return `<li class="nav-item"><a class="nav-link ${activeClass}" href="${item.href}">${item.text}${badgeHtml}</a></li>`;
        }).join('');
    }

    /**
     * Generate right section HTML (balance or admin badge)
     */
    renderRightSection() {
        if (this.config.rightSection === 'balance') {
            return `<li class="nav-item">
                        <span class="navbar-text me-3">
                            <i class="bi bi-wallet2"></i> $<span id="navBalance">0.00</span>
                        </span>
                    </li>`;
        } else {
            return `<li class="nav-item">
                        <span class="navbar-text me-3">
                            <i class="bi bi-person-badge"></i> Администратор
                        </span>
                    </li>`;
        }
    }

    /**
     * Generate notifications dropdown HTML (always shown)
     */
    renderNotifications() {
        return `<li class="nav-item dropdown">
                    <a class="nav-link position-relative" href="#" id="notificationsDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="bi bi-bell"></i>
                        <span class="badge bg-danger rounded-pill position-absolute" id="notificationBadge" style="display: none; top: -2px; right: -8px; font-size: 0.55rem; padding: 2px 5px;">0</span>
                    </a>
                    <div class="dropdown-menu dropdown-menu-end notification-dropdown" id="notificationsList">
                        <div class="notification-header">
                            <h6>Уведомления</h6>
                            <a href="#" class="mark-all-read" onclick="Navbar.markAllNotificationsRead(event)">Отметить все как прочитанные</a>
                        </div>
                        <div class="notification-list" id="notificationsListContent">
                            <div class="notification-empty">
                                <i class="bi bi-bell-slash"></i>
                                <p>Загрузка...</p>
                            </div>
                        </div>
                        <div class="notification-footer">
                            <a href="#" onclick="Navbar.showAllNotifications(event)">Показать все уведомления</a>
                        </div>
                    </div>
                </li>`;
    }

    /**
     * Generate admin dropdown menu HTML
     */
    renderAdminDropdown() {
        const adminDropdownItems = NavbarConfig.adminDropdown.map(item => {
            let badgeHtml = '';
            if (item.hasBadge && item.badgeId) {
                badgeHtml = `<span class="badge bg-danger ms-1" id="${item.badgeId}" style="display: none;">0</span>`;
            }
            return `<li><a class="dropdown-item" href="${item.href}">
                <i class="bi ${item.icon}"></i> ${item.text}${badgeHtml}
            </a></li>`;
        }).join('');

        return `<li class="nav-item dropdown" id="adminMenu" style="display: none;">
                    <a class="nav-link dropdown-toggle" href="#" id="adminDropdown" role="button"
                       data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="bi bi-shield-lock"></i> Admin
                        <span class="badge bg-danger ms-1" id="admin-menu-badge" style="display: none;">0</span>
                    </a>
                    <ul class="dropdown-menu" aria-labelledby="adminDropdown">
                        ${adminDropdownItems}
                    </ul>
                </li>`;
    }

    /**
     * Generate complete navbar HTML
     */
    render() {
        return `<nav class="navbar navbar-expand-lg navbar-dark navbar-gradient">
                    <div class="container-fluid">
                        <a class="navbar-brand" href="${this.config.brandLink}">${this.config.brandText}</a>
                        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                            <span class="navbar-toggler-icon"></span>
                        </button>
                        <div class="collapse navbar-collapse" id="navbarNav">
                            <ul class="navbar-nav">
                                ${this.renderMenuItems()}
                            </ul>
                            <ul class="navbar-nav ms-auto">
                                ${this.renderRightSection()}
                                ${this.renderAdminDropdown()}
                                ${this.renderNotifications()}
                                <li class="nav-item">
                                    <a class="nav-link" href="#" onclick="logout()">Выход</a>
                                </li>
                            </ul>
                        </div>
                    </div>
                </nav>`;
    }

    /**
     * Inject navbar HTML into target element
     */
    inject(targetId = 'navbar-container') {
        const container = document.getElementById(targetId);
        if (container) {
            container.innerHTML = this.render();
        } else {
            console.error(`Navbar container #${targetId} not found`);
        }
    }

    /**
     * Show admin menu if user is admin
     */
    static initAdminMenu() {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.role === 'admin') {
                    const adminMenu = document.getElementById('adminMenu');
                    if (adminMenu) {
                        adminMenu.style.display = 'flex';
                    }
                }
            } catch (e) {
                console.error('Error parsing token:', e);
            }
        }
    }
}

/**
 * Helper function for easy navbar initialization
 * @param {string} type - 'user' or 'admin'
 * @param {string} activePage - Page identifier (e.g., 'dashboard', 'projects')
 * @param {object} options - Additional options (e.g., { hasNotifications: true })
 */
function initNavbar(type, activePage, options = {}) {
    // Check for special page configurations
    const specialConfig = NavbarConfig.special[activePage];
    if (specialConfig) {
        // Override activePage if specified
        if (specialConfig.activePage) {
            activePage = specialConfig.activePage;
        }
        // Merge special options
        options = { ...options, ...specialConfig };
    }

    const navbar = new Navbar(type, activePage, options);
    navbar.inject();
    Navbar.initAdminMenu();

    // Load moderation badge count for admin users
    Navbar.loadModerationBadge();

    // Load notifications for all users
    Navbar.loadNotifications();

    // Refresh notifications every 60 seconds
    setInterval(Navbar.loadNotifications, 60000);

    // Prevent notifications dropdown from closing when clicking inside
    const notificationsList = document.getElementById('notificationsList');
    if (notificationsList) {
        notificationsList.addEventListener('click', function(e) {
            // Allow clicks on external links to work normally
            const link = e.target.closest('a[href]');
            if (link && !link.getAttribute('href').startsWith('#')) {
                return; // Let the link work and close dropdown
            }
            // Stop all other clicks from closing dropdown
            e.stopPropagation();
        });
    }
}

/**
 * Load moderation badge count for admin users
 * Updates all moderation-related badges in navbar
 */
Navbar.loadModerationBadge = async function() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role !== 'admin') return;

        const response = await fetch('/api/admin/moderation/count', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) return;

        const result = await response.json();
        const count = result.count || 0;

        // Update all moderation badges
        const badgeIds = ['moderation-badge', 'moderation-dropdown-badge', 'admin-menu-badge'];
        badgeIds.forEach(id => {
            const badge = document.getElementById(id);
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline-block' : 'none';
            }
        });

    } catch (e) {
        console.error('Error loading moderation badge:', e);
    }
};

/**
 * Load notifications for current user
 * Uses localStorage cache for instant display, then fetches fresh data
 */
Navbar.loadNotifications = async function() {
    const token = localStorage.getItem('token');
    if (!token) return;

    // 1. Show cached data immediately (instant UI)
    const cached = localStorage.getItem('notifications_cache');
    if (cached) {
        try {
            const { notifications, unreadCount, timestamp } = JSON.parse(cached);
            // Use cache if less than 5 minutes old
            if (Date.now() - timestamp < 300000) {
                Navbar.displayNotifications(notifications, unreadCount);
            }
        } catch (e) { /* ignore cache errors */ }
    }

    // 2. Fetch fresh data in background
    try {
        const response = await fetch('/api/notifications?limit=20', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) return;

        const result = await response.json();
        const notifications = result.data || [];
        const unreadCount = result.pagination?.unread || notifications.filter(n => !n.read).length;

        // Update UI
        Navbar.displayNotifications(notifications, unreadCount);

        // Cache for next page load
        localStorage.setItem('notifications_cache', JSON.stringify({
            notifications,
            unreadCount,
            timestamp: Date.now()
        }));

    } catch (e) {
        console.error('Error loading notifications:', e);
    }
};

/**
 * Display notifications in UI (extracted for reuse)
 */
Navbar.displayNotifications = function(notifications, unreadCount) {
    // Update badge
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }

    // Update dropdown list
    Navbar.updateNotificationsList(notifications);
};

/**
 * Update notifications dropdown list HTML
 */
Navbar.updateNotificationsList = function(notifications) {
    const listContent = document.getElementById('notificationsListContent');
    if (!listContent) return;

    if (!notifications || notifications.length === 0) {
        listContent.innerHTML = `
            <div class="notification-empty">
                <i class="bi bi-bell-slash"></i>
                <p>Нет уведомлений</p>
            </div>
        `;
        return;
    }

    let notificationsHtml = '';
    notifications.forEach(notification => {
        const isUnread = !notification.read;
        const unreadClass = isUnread ? 'unread' : '';
        const notificationType = Navbar.getNotificationType(notification);
        const iconClass = Navbar.getNotificationIcon(notificationType);

        // Format date/time
        const date = new Date(notification.created_at);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        let timeStr;
        if (diffMins < 1) {
            timeStr = 'Только что';
        } else if (diffMins < 60) {
            timeStr = `${diffMins} мин. назад`;
        } else if (diffHours < 24) {
            timeStr = `${diffHours} ч. назад`;
        } else if (diffDays < 7) {
            timeStr = `${diffDays} дн. назад`;
        } else {
            timeStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        }

        // Determine action link
        const actionLink = Navbar.getNotificationAction(notification);

        notificationsHtml += `
            <div class="notification-card type-${notificationType} ${unreadClass}" onclick="Navbar.handleNotificationClick(event, ${notification.id})">
                <div class="notification-icon">
                    <i class="bi ${iconClass}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-content-header">
                        <h6 class="notification-title">${Navbar.escapeHtml(notification.title)}</h6>
                        <span class="notification-time"><i class="bi bi-clock"></i> ${timeStr}</span>
                    </div>
                    <p class="notification-message">${Navbar.formatNotificationMessage(notification.message)}</p>
                    ${actionLink ? `<a href="${actionLink.url}" class="notification-action" onclick="event.stopPropagation()">${actionLink.text} <i class="bi bi-arrow-right"></i></a>` : ''}
                </div>
            </div>
        `;
    });

    listContent.innerHTML = notificationsHtml;
};

/**
 * Determine notification type based on content
 */
Navbar.getNotificationType = function(notification) {
    const title = (notification.title || '').toLowerCase();
    const type = (notification.type || '').toLowerCase();

    if (type.includes('security') || type.includes('error') || title.includes('безопасност') || title.includes('security')) {
        return 'security';
    }
    if (type.includes('error') || title.includes('ошибка') || title.includes('error') || title.includes('failed')) {
        return 'error';
    }
    if (type.includes('warning') || title.includes('предупреждение') || title.includes('warning')) {
        return 'warning';
    }
    if (type.includes('success') || title.includes('успеш') || title.includes('success') || title.includes('оплач')) {
        return 'success';
    }
    return 'info';
};

/**
 * Get icon class based on notification type
 */
Navbar.getNotificationIcon = function(type) {
    // Icons matching lucide-react from AlertsPanel.tsx
    const icons = {
        'security': 'bi-shield-exclamation',
        'error': 'bi-x-circle',           // XCircle
        'warning': 'bi-exclamation-triangle', // AlertTriangle
        'success': 'bi-check-circle',     // CheckCircle
        'info': 'bi-info-circle'          // Info
    };
    return icons[type] || icons.info;
};

/**
 * Get action link based on notification content
 */
Navbar.getNotificationAction = function(notification) {
    const title = (notification.title || '').toLowerCase();
    const message = (notification.message || '').toLowerCase();

    if (title.includes('размещен') || message.includes('placement')) {
        return { text: 'Просмотреть', url: '/placements-manager.html' };
    }
    if (title.includes('баланс') || title.includes('оплат') || message.includes('balance')) {
        return { text: 'К балансу', url: '/balance.html' };
    }
    if (title.includes('модерац') || message.includes('moderat')) {
        return { text: 'На модерацию', url: '/admin/moderation.html' };
    }
    return null;
};

/**
 * Handle notification click
 */
Navbar.handleNotificationClick = async function(event, notificationId) {
    event.preventDefault();

    // Mark as read if unread
    const token = localStorage.getItem('token');
    if (token) {
        try {
            await fetch(`/api/notifications/${notificationId}/read`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            // Reload notifications
            await Navbar.loadNotifications();
        } catch (e) {
            console.error('Error marking notification as read:', e);
        }
    }
};

/**
 * Mark all notifications as read
 */
Navbar.markAllNotificationsRead = async function(event) {
    event.preventDefault();
    event.stopPropagation();

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        await fetch('/api/notifications/read-all', {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        // Reload notifications
        localStorage.removeItem('notifications_cache');
        await Navbar.loadNotifications();
    } catch (e) {
        console.error('Error marking all notifications as read:', e);
    }
};

/**
 * Escape HTML to prevent XSS
 * Uses global escapeHtml() from security.js if available
 */
Navbar.escapeHtml = function(text) {
    if (typeof escapeHtml === 'function') {
        return escapeHtml(text);
    }
    // Fallback if security.js not loaded
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

/**
 * Format notification message with clickable URLs
 * Finds URLs in quotes and makes them clickable links
 */
Navbar.formatNotificationMessage = function(message) {
    if (!message) return '';

    // Find URLs in quotes BEFORE escaping, then escape and wrap
    // Pattern matches "https://example.com" or "http://example.com"
    const urlPattern = /"(https?:\/\/[^"]+)"/g;

    // Replace URLs with placeholders, escape everything, then restore links
    const urls = [];
    let processed = message.replace(urlPattern, function(match, url) {
        urls.push(url);
        return `__URL_PLACEHOLDER_${urls.length - 1}__`;
    });

    // Escape the message (placeholders are safe)
    processed = Navbar.escapeHtml(processed);

    // Restore URLs as clickable links
    urls.forEach((url, index) => {
        const safeUrl = Navbar.escapeHtml(url);
        processed = processed.replace(
            `__URL_PLACEHOLDER_${index}__`,
            `"<a href="${url}" target="_blank" rel="noopener" class="text-primary" style="text-decoration: underline;">${safeUrl}</a>"`
        );
    });

    return processed;
};

/**
 * Mark single notification as read
 */
Navbar.markNotificationRead = async function(event, notificationId) {
    event.preventDefault();
    event.stopPropagation();

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        await fetch(`/api/notifications/${notificationId}/read`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        // Reload notifications
        await Navbar.loadNotifications();
    } catch (e) {
        console.error('Error marking notification as read:', e);
    }
};

/**
 * Delete notification
 */
Navbar.deleteNotification = async function(event, notificationId) {
    event.preventDefault();
    event.stopPropagation();

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        await fetch(`/api/notifications/${notificationId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        // Reload notifications
        await Navbar.loadNotifications();
    } catch (e) {
        console.error('Error deleting notification:', e);
    }
};

/**
 * Delete all notifications
 */
Navbar.deleteAllNotifications = async function(event) {
    event.preventDefault();
    event.stopPropagation();

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        await fetch('/api/notifications/all', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        // Clear cache and reload
        localStorage.removeItem('notifications_cache');
        await Navbar.loadNotifications();
    } catch (e) {
        console.error('Error deleting notifications:', e);
    }
};

/**
 * Show all notifications (future: could open a dedicated notifications page)
 * For now: reloads with higher limit
 */
Navbar.showAllNotifications = async function(event) {
    event.preventDefault();
    event.stopPropagation();

    // For now, just reload notifications - could redirect to notifications page in future
    localStorage.removeItem('notifications_cache');
    await Navbar.loadNotifications();
};
