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
                        <span class="badge bg-light text-dark rounded-pill position-absolute" id="notificationBadge" style="display: none; top: -2px; right: -8px; font-size: 0.55rem; padding: 2px 5px;">0</span>
                    </a>
                    <ul class="dropdown-menu dropdown-menu-end notification-dropdown" id="notificationsList" style="min-width: 350px; max-height: 400px; overflow-y: auto;">
                        <li class="dropdown-header d-flex justify-content-between align-items-center px-3 py-2">
                            <span class="fw-bold">Уведомления</span>
                            <button class="btn btn-sm btn-light" onclick="Navbar.markAllNotificationsRead(event)" title="Отметить все как прочитанные">
                                <i class="bi bi-check2-all"></i> Прочитать
                            </button>
                        </li>
                        <li><hr class="dropdown-divider m-0"></li>
                        <li id="notificationsEmpty"><span class="dropdown-item text-muted small">Загрузка...</span></li>
                    </ul>
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
    const listContainer = document.getElementById('notificationsList');
    if (!listContainer) return;

    // Recreate header and divider (cloning doesn't work after innerHTML clear)
    const headerHtml = `
        <li class="dropdown-header d-flex justify-content-between align-items-center px-3 py-2">
            <span class="fw-bold">Уведомления</span>
            <button class="btn btn-sm btn-light" onclick="Navbar.markAllNotificationsRead(event)" title="Отметить все как прочитанные">
                <i class="bi bi-check2-all"></i> Прочитать
            </button>
        </li>
        <li><hr class="dropdown-divider m-0"></li>
    `;

    if (!notifications || notifications.length === 0) {
        listContainer.innerHTML = headerHtml + '<li id="notificationsEmpty"><span class="dropdown-item text-muted small">Нет уведомлений</span></li>';
        return;
    }

    let notificationsHtml = '';
    notifications.forEach(notification => {
        const isUnread = !notification.read;
        const bgClass = isUnread ? 'bg-light' : '';
        const fontClass = isUnread ? 'fw-semibold' : '';

        // Format date
        const date = new Date(notification.created_at);
        const dateStr = date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        notificationsHtml += `
            <li class="notification-item">
                <div class="dropdown-item ${bgClass} py-2" style="white-space: normal;">
                    <div class="${fontClass} small">${Navbar.escapeHtml(notification.title)}</div>
                    <div class="text-muted small" style="max-width: 300px;">${Navbar.escapeHtml(notification.message)}</div>
                    <div class="text-muted" style="font-size: 0.7rem;">${dateStr}</div>
                </div>
            </li>
        `;
    });

    listContainer.innerHTML = headerHtml + notificationsHtml;
};

/**
 * Escape HTML to prevent XSS
 */
Navbar.escapeHtml = function(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
