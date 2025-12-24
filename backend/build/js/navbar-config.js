/**
 * Navbar Configuration
 * Single source of truth for all navbar menus across the application
 */

const NavbarConfig = {
    // User navbar configuration
    user: {
        brandText: '🔗 Link Manager',
        brandLink: '/dashboard.html',
        menuItems: [
            { text: 'Проекты', href: '/dashboard.html', page: 'dashboard' },
            { text: 'Ссылки', href: '/placements-manager.html', page: 'placements-manager' },
            { text: 'Сайты', href: '/sites.html', page: 'sites' },
            { text: 'Аренды', href: '/rentals.html', page: 'rentals' },
            { text: 'Покупка', href: '/placements.html', page: 'placements' },
            { text: 'Баланс', href: '/balance.html', page: 'balance' },
            { text: 'Статистика', href: '/statistics.html', page: 'statistics' },
            { text: 'Партнёрка', href: '/referrals.html', page: 'referrals' }
        ],
        rightSection: 'balance' // Shows balance display
    },

    // Admin navbar configuration
    admin: {
        brandText: '🔗 Link Manager Admin',
        brandLink: '/admin-dashboard.html',
        menuItems: [
            { text: 'Админ Dashboard', href: '/admin-dashboard.html', page: 'admin-dashboard' },
            { text: 'Модерация', href: '/admin-moderation.html', page: 'admin-moderation', hasBadge: true, badgeId: 'moderation-badge' },
            { text: 'Пользователи', href: '/admin-users.html', page: 'admin-users' },
            { text: 'Мои сайты', href: '/sites.html', page: 'sites' },
            { text: 'Размещения', href: '/admin-placements.html', page: 'admin-placements' },
            { text: 'Параметры сайтов', href: '/admin-site-params.html', page: 'admin-site-params' },
            { text: 'Дашборд', href: '/dashboard.html', page: 'dashboard' }
        ],
        rightSection: 'admin-badge' // Shows "Администратор" badge
    },

    // Admin dropdown menu (same for both user and admin navbars)
    adminDropdown: [
        { icon: 'bi-speedometer2', text: 'Dashboard', href: '/admin-dashboard.html' },
        { icon: 'bi-shield-check', text: 'Модерация', href: '/admin-moderation.html', hasBadge: true, badgeId: 'moderation-dropdown-badge' },
        { icon: 'bi-people', text: 'Пользователи', href: '/admin-users.html' },
        { icon: 'bi-bookmark-star', text: 'Размещения', href: '/admin-placements.html' },
        { icon: 'bi-sliders', text: 'Параметры сайтов', href: '/admin-site-params.html' },
        { icon: 'bi-wallet2', text: 'Выводы рефералов', href: '/admin-referral-withdrawals.html' }
    ],

    // Special pages configuration (for pages with unique navbar needs)
    special: {
        // balance.html has notifications dropdown in addition to balance
        'balance': {
            hasNotifications: true
        },
        // project-detail.html uses 'projects' as active page
        'project-detail': {
            activePage: 'projects'
        }
    }
};
