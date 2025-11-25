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
     * Generate notifications dropdown HTML (for balance.html)
     */
    renderNotifications() {
        if (!this.options.hasNotifications) {
            return '';
        }

        return `<li class="nav-item dropdown">
                    <a class="nav-link dropdown-toggle" href="#" id="notificationsDropdown" role="button" data-bs-toggle="dropdown">
                        <i class="bi bi-bell"></i>
                        <span class="badge bg-danger" id="notificationBadge" style="display: none;">0</span>
                    </a>
                    <ul class="dropdown-menu dropdown-menu-end" id="notificationsList">
                        <li><h6 class="dropdown-header">Уведомления</h6></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-muted" href="#">Нет новых уведомлений</a></li>
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
