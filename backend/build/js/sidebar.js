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
  adminExpanded: false,
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

    // Load admin expanded state from localStorage
    this.adminExpanded = localStorage.getItem('adminExpanded') === 'true';

    // Auto-expand if we're on an admin page
    if (this.adminItems.some((item) => item.id === config.activePage)) {
      this.adminExpanded = true;
    }

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

    // Admin section (if admin) - collapsible
    if (this.isAdmin()) {
      navHTML += '<div class="nav-divider"></div>';

      // Check if any admin item is active
      const isAdminActive = this.adminItems.some((item) => item.id === activePage);
      const adminActiveClass = isAdminActive ? 'active' : '';
      const expandedClass = this.adminExpanded ? 'expanded' : '';
      const chevronClass = this.adminExpanded ? 'bi-chevron-down' : 'bi-chevron-right';

      // Admin toggle button
      navHTML += `
        <button class="nav-item admin-toggle ${adminActiveClass} ${expandedClass}" onclick="SidebarNav.toggleAdmin()" title="Админка">
          <i class="bi bi-person-gear"></i>
          <span>Админка</span>
          <i class="bi ${chevronClass} admin-chevron"></i>
        </button>
      `;

      // Admin submenu
      const submenuStyle = this.adminExpanded ? '' : 'style="display: none;"';
      navHTML += `<div class="admin-submenu" id="adminSubmenu" ${submenuStyle}>`;

      navHTML += this.adminItems
        .map((item) => {
          const isActive = activePage === item.id;
          const activeClass = isActive ? 'active' : '';
          const badgeHTML = item.badge
            ? '<span class="badge bg-danger ms-auto" id="moderationBadge" style="display:none;">0</span>'
            : '';

          return `
          <a href="${item.href}" class="nav-item nav-subitem ${activeClass}" title="${item.label}">
            <i class="bi ${item.icon}"></i>
            <span>${item.label}</span>
            ${badgeHTML}
          </a>
        `;
        })
        .join('');

      navHTML += '</div>';
    }

    return `<nav class="sidebar-nav">${navHTML}</nav>`;
  },

  /**
   * Toggle admin submenu
   */
  toggleAdmin() {
    this.adminExpanded = !this.adminExpanded;
    localStorage.setItem('adminExpanded', this.adminExpanded);

    const submenu = document.getElementById('adminSubmenu');
    const toggle = document.querySelector('.admin-toggle');
    const chevron = document.querySelector('.admin-chevron');

    if (submenu) {
      if (this.adminExpanded) {
        submenu.style.display = 'block';
        toggle?.classList.add('expanded');
        if (chevron) {
          chevron.classList.remove('bi-chevron-right');
          chevron.classList.add('bi-chevron-down');
        }
      } else {
        submenu.style.display = 'none';
        toggle?.classList.remove('expanded');
        if (chevron) {
          chevron.classList.remove('bi-chevron-down');
          chevron.classList.add('bi-chevron-right');
        }
      }
    }
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
          <div class="notification-header-gradient">
            <div class="notification-header-content">
              <div class="notification-header-title">
                <h6>Уведомления</h6>
                <span class="notification-header-count" id="notificationHeaderCount">0 непрочитанных</span>
              </div>
              <button class="notification-mark-all-btn" onclick="SidebarNav.markAllAsRead(event)">
                <i class="bi bi-check2-all"></i>
                <span>Отметить все как прочитанные</span>
              </button>
            </div>
          </div>
          <div class="notification-list" id="notificationList">
            <div class="notification-empty">
              <i class="bi bi-bell-slash"></i>
              <p>Нет новых уведомлений</p>
            </div>
          </div>
          <div class="notification-footer">
            <a href="#" onclick="SidebarNav.deleteAllNotifications(event)" class="notification-delete-all-btn">
              <i class="bi bi-trash3"></i> Удалить все
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
    document.querySelectorAll('.sidebar .nav-item:not(.admin-toggle)').forEach((item) => {
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
        const result = await response.json();
        // API returns { success, data: notifications[], pagination: { unread } }
        const notifications = result.data || [];
        this.unreadCount = result.pagination?.unread || (Array.isArray(notifications) ? notifications.length : 0);
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
    const headerCount = document.getElementById('notificationHeaderCount');
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

    // Update header count text
    if (headerCount) {
      headerCount.textContent = this.unreadCount > 0
        ? `${this.unreadCount} непрочитанных`
        : 'Все прочитано';
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
          .slice(0, 10)
          .map((n) => this.renderNotificationCard(n))
          .join('');
      }
    }
  },

  /**
   * Render a single notification card
   * Supports special types: placement, bulk-purchase
   */
  renderNotificationCard(notification) {
    const metadata = notification.metadata || {};
    const timeAgo = this.formatTimeAgo(notification.created_at);

    // Determine notification type and styling
    const notificationType = this.getNotificationType(notification);
    const typeClass = `type-${notificationType}`;
    const icon = this.getNotificationIcon(notificationType);

    // Special rendering for placement notifications (link placement)
    if (notificationType === 'placement' || metadata.siteUrl || metadata.site_url) {
      return this.renderPlacementNotification(notification, metadata, timeAgo);
    }

    // Special rendering for bulk purchase notifications
    if (notificationType === 'bulk-purchase' || metadata.count) {
      return this.renderBulkPurchaseNotification(notification, metadata, timeAgo);
    }

    // Amount badge if present
    const amountBadge = metadata.amount
      ? `<span class="notification-amount-badge"><i class="bi bi-currency-dollar"></i>${parseFloat(metadata.amount).toFixed(2)}</span>`
      : '';

    return `
      <div class="notification-card ${typeClass}" data-id="${notification.id}">
        <div class="notification-icon">
          <i class="bi ${icon}"></i>
        </div>
        <div class="notification-content">
          <div class="notification-content-header">
            <div class="notification-title">${this.escapeHtml(notification.title || '')}</div>
            ${amountBadge}
          </div>
          <div class="notification-message">${this.escapeHtml(notification.message || '')}</div>
          <div class="notification-meta">
            <span class="notification-time">
              <i class="bi bi-clock"></i> ${timeAgo}
            </span>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Get notification type from notification data
   * Maps backend notification types to display categories
   */
  getNotificationType(notification) {
    const type = notification.type || 'info';

    // Exact type mapping (order matters - specific before general)
    const typeMap = {
      // Batch/bulk - check BEFORE placement
      'batch_placement_purchased': 'batch',
      'admin_batch_purchased': 'batch',
      // Single placement
      'placement_purchased': 'purchase',
      'admin_placement_purchased': 'purchase',
      'placement_renewed': 'renewal',
      'placement_published': 'success',
      'placement_failed': 'error',
      'placement_failed_refund': 'refund',
      // Balance & Discount
      'balance_deposited': 'deposit',
      'discount_tier_achieved': 'success',
      'discount_tier_changed': 'info',
      // Referral
      'referral_commission': 'commission',
      // Security
      'security_alert': 'warning',
      'error_alert': 'error'
    };

    return typeMap[type] || type;
  },

  /**
   * Get icon for notification type
   */
  getNotificationIcon(type) {
    const iconMap = {
      success: 'bi-check-circle-fill',
      error: 'bi-x-circle-fill',
      warning: 'bi-exclamation-triangle-fill',
      info: 'bi-info-circle-fill',
      placement: 'bi-link-45deg',
      'bulk-purchase': 'bi-cart-check-fill'
    };
    return iconMap[type] || iconMap.info;
  },

  /**
   * Render placement notification with fromUrl → toUrl
   */
  renderPlacementNotification(notification, metadata, timeAgo) {
    const siteUrl = metadata.siteUrl || metadata.site_url || metadata.toUrl || '';
    const contentUrl = metadata.contentUrl || metadata.fromUrl || metadata.url || '';
    const amount = metadata.amount || metadata.price || metadata.final_price;

    // Extract domain from URL for display
    const siteDomain = siteUrl ? this.extractDomain(siteUrl) : 'Сайт';
    const contentDomain = contentUrl ? this.extractDomain(contentUrl) : '';

    const amountBadge = amount
      ? `<span class="notification-amount-badge"><i class="bi bi-currency-dollar"></i>${parseFloat(amount).toFixed(2)}</span>`
      : '';

    return `
      <div class="notification-card type-placement" data-id="${notification.id}">
        <div class="notification-icon">
          <i class="bi bi-link-45deg"></i>
        </div>
        <div class="notification-content">
          <div class="notification-content-header">
            <div class="notification-title">${this.escapeHtml(notification.title || 'Размещение')}</div>
            ${amountBadge}
          </div>
          <div class="notification-placement-info">
            ${contentUrl ? `
              <span class="notification-from-url">${this.escapeHtml(contentDomain || contentUrl)}</span>
              <i class="bi bi-arrow-right"></i>
            ` : ''}
            <a href="${this.escapeHtml(siteUrl)}" target="_blank" class="notification-to-url" onclick="event.stopPropagation()">
              ${this.escapeHtml(siteDomain)}
              <i class="bi bi-box-arrow-up-right"></i>
            </a>
          </div>
          <div class="notification-meta">
            <span class="notification-time">
              <i class="bi bi-clock"></i> ${timeAgo}
            </span>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Render bulk purchase notification
   */
  renderBulkPurchaseNotification(notification, metadata, timeAgo) {
    const projectName = metadata.projectName || metadata.project_name || 'Проект';
    const count = metadata.count || metadata.total || 1;
    const amount = metadata.amount || metadata.total_price;

    const amountBadge = amount
      ? `<span class="notification-amount-badge"><i class="bi bi-currency-dollar"></i>${parseFloat(amount).toFixed(2)}</span>`
      : '';

    return `
      <div class="notification-card type-bulk-purchase" data-id="${notification.id}">
        <div class="notification-icon">
          <i class="bi bi-cart-check-fill"></i>
        </div>
        <div class="notification-content">
          <div class="notification-content-header">
            <div class="notification-title">${this.escapeHtml(notification.title || 'Массовая покупка')}</div>
            ${amountBadge}
          </div>
          <div class="notification-bulk-info">
            <span class="notification-project-name">
              <i class="bi bi-folder"></i> ${this.escapeHtml(projectName)}
            </span>
            <span class="notification-count-badge">${count} размещений</span>
          </div>
          <div class="notification-meta">
            <span class="notification-time">
              <i class="bi bi-clock"></i> ${timeAgo}
            </span>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  },

  /**
   * Mark all notifications as read
   * Note: Only hides the badge, doesn't remove notifications from list
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

        // Hide badge
        const badge = document.getElementById('notificationBadge');
        if (badge) {
          badge.style.display = 'none';
        }

        // Update header count text
        const headerCount = document.getElementById('notificationHeaderCount');
        if (headerCount) {
          headerCount.textContent = 'Все прочитано';
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
