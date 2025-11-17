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
            { text: 'Dashboard', href: '/dashboard.html', page: 'dashboard' },
            { text: 'Купить ссылки', href: '/placements.html', page: 'placements' },
            { text: 'Мои ссылки', href: '/placements-manager.html', page: 'placements-manager' },
            { text: 'Мои Проекты', href: '/projects.html', page: 'projects' },
            { text: 'Баланс', href: '/balance.html', page: 'balance' },
            { text: 'Сайты', href: '/sites.html', page: 'sites' }
        ],
        rightSection: 'balance' // Shows balance display
    },

    // Admin navbar configuration
    admin: {
        brandText: '🔗 Link Manager Admin',
        brandLink: '/admin-dashboard.html',
        menuItems: [
            { text: 'Админ Dashboard', href: '/admin-dashboard.html', page: 'admin-dashboard' },
            { text: 'Пользователи', href: '/admin-users.html', page: 'admin-users' },
            { text: 'Мои сайты', href: '/sites.html', page: 'sites' },
            { text: 'Размещения', href: '/admin-placements.html', page: 'admin-placements' }
        ],
        rightSection: 'admin-badge' // Shows "Администратор" badge
    },

    // Admin dropdown menu (same for both user and admin navbars)
    adminDropdown: [
        { icon: 'bi-speedometer2', text: 'Dashboard', href: '/admin-dashboard.html' },
        { icon: 'bi-people', text: 'Пользователи', href: '/admin-users.html' },
        { icon: 'bi-bookmark-star', text: 'Размещения', href: '/admin-placements.html' }
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
