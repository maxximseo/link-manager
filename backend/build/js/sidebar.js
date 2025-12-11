/**
 * Sidebar Navigation Component
 * Replaces the old top navbar with a collapsible sidebar
 *
 * Usage:
 *   SidebarNav.init({
 *     activePage: 'dashboard',
 *     pageTitle: 'Мои Проекты',
 *     pageSubtitle: 'Управление проектами'
 *   });
 */

const SidebarNav = {
  // State
  collapsed: false,
  mobileOpen: false,
  user: null,
  balance: 0,
  unreadCount: 0,

  // Menu configuration
  menuItems: [
    { id: 'projects', label: 'Проекты', icon: 'bi-bullseye', href: '/dashboard.html' },
    { id: 'links', label: 'Ссылки', icon: 'bi-link-45deg', href: '/placements-manager.html' },
    { id: 'sites', label: 'Сайты', icon: 'bi-globe', href: '/sites.html' },
    { id: 'purchase', label: 'Покупка', icon: 'bi-cart', href: '/placements.html' },
    { id: 'balance', label: 'Баланс', icon: 'bi-wallet2', href: '/balance.html' },
    { id: 'analytics', label: 'Статистика', icon: 'bi-pie-chart', href: '/statistics.html' },
    { id: 'partners', label: 'Партнёрка', icon: 'bi-people', href: '/referrals.html' }
  ],

  adminItems: [
    { id: 'admin-dashboard', label: 'Статистика', icon: 'bi-graph-up', href: '/admin-dashboard.html' },
    { id: 'admin-users', label: 'Пользователи', icon: 'bi-people', href: '/admin-users.html' },
    { id: 'admin-sites', label: 'Сайты', icon: 'bi-globe2', href: '/admin-site-params.html' },
    { id: 'admin-placements', label: 'Размещения', icon: 'bi-bookmark-star', href: '/admin-placements.html' },
    { id: 'admin-moderation', label: 'Модерация', icon: 'bi-check2-square', href: '/admin-moderation.html', badge: true },
    { id: 'admin-withdrawals', label: 'Выводы', icon: 'bi-cash-stack', href: '/admin-referral-withdrawals.html' }
  ],

  /**
   * Initialize the sidebar
   * @param {Object} config - Configuration object
   * @param {string} config.activePage - Current page ID
   * @param {string} config.pageTitle - Page title for header
   * @param {string} [config.pageSubtitle] - Optional subtitle
   */
  init(config) {
    this.config = config;

    // Load collapsed state from localStorage
    this.collapsed = localStorage.getItem('sidebarCollapsed') === 'true';

    // Parse user from token
    this.user = this.getUserFromToken();

    // Check authentication
    if (!this.user || !this.user.userId) {
      window.location.href = '/login.html';
      return;
    }

    // Render sidebar and header
    this.render();

    // Bind events
    this.bindEvents();

    // Load balance
    this.loadBalance();

    // Load notifications
    this.loadNotifications();

    // Initialize notification dropdown if Navbar exists
    if (typeof Navbar !== 'undefined' && Navbar.initNotificationDropdown) {
      setTimeout(() => {
        Navbar.initNotificationDropdown();
      }, 100);
    }
  },

  /**
   * Get user info from JWT token
   */
  getUserFromToken() {
    const token = localStorage.getItem('token');
    if (!token) return null;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        userId: payload.userId,
        username: payload.username,
        email: payload.email || '',
        role: payload.role
      };
    } catch (e) {
      console.error('Failed to parse token:', e);
      return null;
    }
  },

  /**
   * Check if current user is admin
   */
  isAdmin() {
    return this.user && this.user.role === 'admin';
  },

  /**
   * Render the sidebar and header
   */
  render() {
    // Add body class
    document.body.classList.add('has-sidebar');
    if (this.collapsed) {
      document.body.classList.add('sidebar-collapsed');
    }

    // Get page content before clearing
    const originalContent = document.querySelector('.container-fluid, .container, main, #main-content');
    const contentHTML = originalContent ? originalContent.outerHTML : '';

    // Preserve modals and other elements outside the main container
    const modals = document.querySelectorAll('.modal');
    const stickyButtons = document.querySelectorAll('.delete-selected-btn, [style*="position: fixed"]');

    // Create sidebar HTML
    const sidebarHTML = this.renderSidebar();

    // Create main wrapper with header
    const mainWrapperHTML = this.renderMainWrapper(contentHTML);

    // Insert into body
    document.body.innerHTML = sidebarHTML + mainWrapperHTML;

    // Re-append modals to body
    modals.forEach((modal) => {
      document.body.appendChild(modal.cloneNode(true));
    });

    // Re-append sticky buttons to body
    stickyButtons.forEach((btn) => {
      document.body.appendChild(btn.cloneNode(true));
    });

    // Re-initialize any scripts that need the DOM
    this.reinitializeScripts();
  },

  /**
   * Render sidebar HTML
   */
  renderSidebar() {
    const collapsedClass = this.collapsed ? 'collapsed' : '';

    return `
      <aside class="sidebar ${collapsedClass}" id="sidebar">
        ${this.renderSidebarHeader()}
        ${this.renderSidebarNav()}
        ${this.renderSidebarFooter()}
      </aside>
      <div class="sidebar-overlay" id="sidebarOverlay"></div>
    `;
  },

  /**
   * Render sidebar header with logo
   */
  renderSidebarHeader() {
    return `
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <i class="bi bi-link-45deg"></i>
        </div>
        <span class="sidebar-brand-text">Link Manager</span>
      </div>
    `;
  },

  /**
   * Render navigation items
   */
  renderSidebarNav() {
    const activePage = this.config.activePage;

    // Regular menu items
    let navHTML = this.menuItems
      .map((item) => {
        const isActive = item.id === activePage;
        const activeClass = isActive ? 'active' : '';

        return `
        <a href="${item.href}" class="nav-item ${activeClass}" title="${item.label}">
          <i class="bi ${item.icon}"></i>
          <span>${item.label}</span>
        </a>
      `;
      })
      .join('');

    // Admin items (if admin)
    if (this.isAdmin()) {
      navHTML += '<div class="nav-divider"></div>';
      navHTML += this.adminItems
        .map((item) => {
          const isActive = activePage === item.id;
          const activeClass = isActive ? 'active' : '';
          const badgeHTML = item.badge
            ? '<span class="badge bg-danger ms-auto" id="moderationBadge" style="display:none;">0</span>'
            : '';

          return `
          <a href="${item.href}" class="nav-item ${activeClass}" title="${item.label}">
            <i class="bi ${item.icon}"></i>
            <span>${item.label}</span>
            ${badgeHTML}
          </a>
        `;
        })
        .join('');
    }

    return `<nav class="sidebar-nav">${navHTML}</nav>`;
  },

  /**
   * Render sidebar footer with collapse and settings buttons
   */
  renderSidebarFooter() {
    const collapseIcon = this.collapsed ? 'bi-chevron-right' : 'bi-chevron-left';
    const collapseText = this.collapsed ? 'Развернуть' : 'Свернуть';

    return `
      <div class="sidebar-footer">
        <button onclick="SidebarNav.toggleCollapse()" class="nav-item" title="${collapseText}">
          <i class="bi ${collapseIcon}" id="collapseIcon"></i>
          <span id="collapseText">${collapseText}</span>
        </button>
        <a href="/settings.html" class="nav-item" title="Настройки">
          <i class="bi bi-gear"></i>
          <span>Настройки</span>
        </a>
      </div>
    `;
  },

  /**
   * Render main wrapper with header and content area
   */
  renderMainWrapper(contentHTML) {
    const pageTitle = this.config.pageTitle || 'Dashboard';
    const pageSubtitle = this.config.pageSubtitle || '';
    const pageIcon = this.config.pageIcon || null;
    const pageIconGradient = this.config.pageIconGradient || 'from-yellow-400 to-orange-500';

    // Render page icon if provided
    const iconHTML = pageIcon
      ? `<div class="page-title-icon ${pageIconGradient}"><i class="bi bi-${pageIcon}"></i></div>`
      : '';

    return `
      <div class="main-wrapper">
        <header class="main-header">
          <button class="mobile-menu-toggle d-lg-none" onclick="SidebarNav.toggleMobile()">
            <i class="bi bi-list"></i>
          </button>
          <div class="page-title">
            <div class="page-title-row">
              ${iconHTML}
              <div class="page-title-text">
                <h1>${pageTitle}</h1>
                ${pageSubtitle ? `<p>${pageSubtitle}</p>` : ''}
              </div>
            </div>
          </div>
          <div class="header-right">
            ${this.renderBalanceBox()}
            ${this.renderAddLinkButton()}
            ${this.renderNotificationButton()}
            ${this.renderUserProfile()}
          </div>
        </header>
        <main class="main-content" id="main-content">
          ${contentHTML}
        </main>
      </div>
    `;
  },

  /**
   * Render balance box
   */
  renderBalanceBox() {
    return `
      <div class="balance-box">
        <i class="bi bi-wallet2"></i>
        <div class="balance-box-content">
          <span class="balance-label">Баланс</span>
          <span class="balance-amount">$<span id="navBalance">0.00</span></span>
        </div>
      </div>
    `;
  },

  /**
   * Render add link button
   */
  renderAddLinkButton() {
    return `
      <a href="/placements.html" class="btn-add-link">
        <i class="bi bi-plus-lg"></i>
        <span>Добавить ссылку</span>
      </a>
    `;
  },

  /**
   * Render notification button with dropdown
   */
  renderNotificationButton() {
    return `
      <div class="dropdown notification-dropdown-wrapper">
        <button class="notification-btn" id="notificationsDropdown" data-bs-toggle="dropdown" aria-expanded="false">
          <i class="bi bi-bell"></i>
          <span class="notification-badge" id="notificationBadge" style="display: none;">0</span>
        </button>
        <div class="dropdown-menu dropdown-menu-end notification-dropdown" aria-labelledby="notificationsDropdown">
          <div class="notification-header">
            <h6 class="mb-0">Уведомления</h6>
            <a href="#" class="mark-all-read" onclick="SidebarNav.markAllAsRead(event)">
              Отметить все как прочитанные
            </a>
          </div>
          <div class="notification-list" id="notificationList">
            <div class="notification-empty">
              <i class="bi bi-bell-slash"></i>
              <p>Нет новых уведомлений</p>
            </div>
          </div>
          <div class="notification-footer">
            <a href="#" onclick="SidebarNav.deleteAllNotifications(event)" class="text-danger">
              <i class="bi bi-trash"></i> Удалить все
            </a>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Render user profile section
   */
  renderUserProfile() {
    const username = this.user?.username || 'Пользователь';
    const email = this.user?.email || '';

    return `
      <a href="/profile.html" class="user-profile">
        <div class="user-info">
          <span class="user-name">${this.escapeHtml(username)}</span>
          ${email ? `<span class="user-email">${this.escapeHtml(email)}</span>` : ''}
        </div>
        <div class="user-avatar">
          <i class="bi bi-person"></i>
        </div>
      </a>
    `;
  },

  /**
   * Toggle sidebar collapsed state
   */
  toggleCollapse() {
    this.collapsed = !this.collapsed;
    localStorage.setItem('sidebarCollapsed', this.collapsed);

    const sidebar = document.getElementById('sidebar');
    const collapseIcon = document.getElementById('collapseIcon');
    const collapseText = document.getElementById('collapseText');

    if (this.collapsed) {
      sidebar.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
      collapseIcon.className = 'bi bi-chevron-right';
      collapseText.textContent = 'Развернуть';
    } else {
      sidebar.classList.remove('collapsed');
      document.body.classList.remove('sidebar-collapsed');
      collapseIcon.className = 'bi bi-chevron-left';
      collapseText.textContent = 'Свернуть';
    }

    // Update collapse button title
    const collapseBtn = collapseIcon.closest('.nav-item');
    if (collapseBtn) {
      collapseBtn.title = this.collapsed ? 'Развернуть' : 'Свернуть';
    }
  },

  /**
   * Toggle mobile sidebar
   */
  toggleMobile() {
    this.mobileOpen = !this.mobileOpen;
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (this.mobileOpen) {
      sidebar.classList.add('mobile-open');
      overlay.classList.add('active');
    } else {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    }
  },

  /**
   * Bind events
   */
  bindEvents() {
    // Close mobile sidebar on overlay click
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
      overlay.addEventListener('click', () => this.toggleMobile());
    }

    // Close mobile sidebar on navigation
    document.querySelectorAll('.sidebar .nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        if (this.mobileOpen) {
          this.toggleMobile();
        }
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + B to toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        this.toggleCollapse();
      }
      // Escape to close mobile sidebar
      if (e.key === 'Escape' && this.mobileOpen) {
        this.toggleMobile();
      }
    });
  },

  /**
   * Load user balance
   */
  async loadBalance() {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/billing/balance', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.balance = parseFloat(data.balance) || 0;
        this.updateBalanceDisplay();
      }
    } catch (error) {
      console.error('Failed to load balance:', error);
    }
  },

  /**
   * Update balance display in header
   */
  updateBalanceDisplay() {
    const balanceEl = document.getElementById('navBalance');
    if (balanceEl) {
      balanceEl.textContent = this.balance.toFixed(2);
    }
  },

  /**
   * Load notifications
   */
  async loadNotifications() {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/notifications?unread=true', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const notifications = await response.json();
        this.unreadCount = Array.isArray(notifications) ? notifications.length : 0;
        this.updateNotificationDisplay(notifications);
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  },

  /**
   * Update notification display
   */
  updateNotificationDisplay(notifications) {
    const badge = document.getElementById('notificationBadge');
    const list = document.getElementById('notificationList');

    // Show/hide notification badge with count
    if (badge) {
      if (this.unreadCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
      } else {
        badge.style.display = 'none';
      }
    }

    // Render notification list
    if (list) {
      if (!notifications || notifications.length === 0) {
        list.innerHTML = `
          <div class="notification-empty">
            <i class="bi bi-bell-slash"></i>
            <p>Нет новых уведомлений</p>
          </div>
        `;
      } else {
        list.innerHTML = notifications
          .slice(0, 5)
          .map((n) => this.renderNotificationCard(n))
          .join('');
      }
    }
  },

  /**
   * Render a single notification card
   */
  renderNotificationCard(notification) {
    const typeClass = `type-${notification.type || 'info'}`;
    const iconMap = {
      success: 'bi-check-circle',
      error: 'bi-x-circle',
      warning: 'bi-exclamation-triangle',
      info: 'bi-info-circle'
    };
    const icon = iconMap[notification.type] || iconMap.info;
    const timeAgo = this.formatTimeAgo(notification.created_at);

    return `
      <div class="notification-card ${typeClass}" data-id="${notification.id}">
        <div class="notification-icon">
          <i class="bi ${icon}"></i>
        </div>
        <div class="notification-content">
          <div class="notification-title">${this.escapeHtml(notification.title || '')}</div>
          <div class="notification-time">
            <i class="bi bi-clock"></i> ${timeAgo}
          </div>
          <div class="notification-message">${this.escapeHtml(notification.message || '')}</div>
        </div>
      </div>
    `;
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(event) {
    if (event) event.preventDefault();

    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        this.unreadCount = 0;
        const badge = document.getElementById('notificationBadge');
        if (badge) {
          badge.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }
  },

  /**
   * Delete all notifications
   */
  async deleteAllNotifications(event) {
    if (event) event.preventDefault();

    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/notifications/all', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        this.unreadCount = 0;
        this.updateNotificationDisplay([]);
      }
    } catch (error) {
      console.error('Failed to delete notifications:', error);
    }
  },

  /**
   * Reinitialize scripts after DOM manipulation
   */
  reinitializeScripts() {
    // Re-initialize Bootstrap dropdowns
    if (typeof bootstrap !== 'undefined') {
      document.querySelectorAll('[data-bs-toggle="dropdown"]').forEach((el) => {
        new bootstrap.Dropdown(el);
      });
    }
  },

  /**
   * Format time ago
   */
  formatTimeAgo(dateString) {
    if (!dateString) return '';

    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'только что';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} мин назад`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч назад`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)} дн назад`;

    return date.toLocaleDateString('ru-RU');
  },

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// Make available globally
window.SidebarNav = SidebarNav;
