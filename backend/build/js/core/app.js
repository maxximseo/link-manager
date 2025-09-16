/**
 * Основное приложение и система управления состоянием
 */
class LinkManagerApp {
    constructor() {
        this.user = null;
        this.currentPage = {
            projects: 1,
            sites: 1,
            placements: 1
        };
        this.itemsPerPage = 20;
        this.totalPages = {
            projects: 1,
            sites: 1,
            placements: 1
        };
        
        // Привязываем контекст методов
        this.handleLogin = this.handleLogin.bind(this);
        this.showApp = this.showApp.bind(this);
        this.switchTab = this.switchTab.bind(this);
    }

    // Инициализация приложения
    async init() {
        try {
            console.log('Initializing Link Manager App...');
            
            // Проверяем поддержку браузера
            AppUtils.checkBrowserSupport();
            
            // Очищаем некорректные данные из localStorage
            AppUtils.cleanupStorage();
            
            // Пытаемся восстановить пользователя
            await this.restoreUserSession();
            
            // Устанавливаем обработчики событий
            this.setupEventListeners();
            
            // Показываем соответствующий интерфейс
            if (this.user && api.token) {
                await this.showApp();
            } else {
                this.showLoginScreen();
            }
            
            console.log('App initialized successfully');
        } catch (error) {
            console.error('App initialization error:', error);
            AppUtils.showNotification('Ошибка инициализации приложения', 'error');
        }
    }

    // Восстановление сессии пользователя
    async restoreUserSession() {
        try {
            const storedUser = localStorage.getItem('user');
            const token = localStorage.getItem('token');
            
            if (storedUser && token) {
                this.user = JSON.parse(storedUser);
                api.setToken(token);
                console.log('User session restored:', this.user.username);
            }
        } catch (error) {
            console.error('Failed to restore user session:', error);
            // Очищаем поврежденные данные
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            api.setToken(null);
        }
    }

    // Показать экран входа
    showLoginScreen() {
        const loginScreen = AppUtils.checkElement('loginScreen');
        const app = AppUtils.checkElement('app');
        
        if (loginScreen && app) {
            loginScreen.style.display = 'flex';
            app.style.display = 'none';
        }
    }

    // Показать основное приложение
    async showApp() {
        try {
            console.log('showApp: Starting app initialization');
            
            const loginScreen = AppUtils.checkElement('loginScreen');
            const app = AppUtils.checkElement('app');
            const userDisplay = AppUtils.checkElement('userDisplay');
            
            if (!loginScreen || !app || !userDisplay) {
                throw new Error('Missing required app elements');
            }
            
            console.log('showApp: Hiding login screen, showing app');
            loginScreen.style.display = 'none';
            app.style.display = 'block';
            userDisplay.textContent = `Welcome, ${this.user?.username || 'User'}`;
            
            console.log('showApp: Switching to projects tab');
            await this.switchTab(null, 'projects');
            
            console.log('showApp: App initialization complete');
            AppUtils.showNotification('Добро пожаловать!', 'success', 3000);
        } catch (error) {
            console.error('ERROR in showApp:', error);
            AppUtils.showNotification(`Ошибка загрузки приложения: ${error.message}`, 'error');
        }
    }

    // Обработка входа
    async handleLogin(event) {
        event.preventDefault();
        
        try {
            console.log('Login form submitted');
            
            const usernameEl = AppUtils.checkElement('username');
            const passwordEl = AppUtils.checkElement('password');
            const messageDiv = AppUtils.checkElement('loginMessage');
            
            if (!usernameEl || !passwordEl || !messageDiv) {
                throw new Error('Missing login form elements');
            }
            
            const username = usernameEl.value.trim();
            const password = passwordEl.value;
            
            if (!username || !password) {
                messageDiv.innerHTML = '<div class="error">Заполните все поля</div>';
                return;
            }
            
            console.log('Attempting login for user:', username);
            messageDiv.innerHTML = '<div class="info">Вход в систему...</div>';
            
            // Выполняем запрос логина
            const data = await api.login(username, password);
            
            if (data.token && data.user) {
                this.user = data.user;
                localStorage.setItem('user', JSON.stringify(data.user));
                
                console.log('Login successful, redirecting...');
                messageDiv.innerHTML = '<div class="success">Вход выполнен успешно!</div>';
                
                // Небольшая задержка для показа сообщения
                setTimeout(() => this.showApp(), 500);
            } else {
                throw new Error('Сервер не вернул токен или данные пользователя');
            }
            
        } catch (error) {
            console.error('Login error:', error);
            const messageDiv = document.getElementById('loginMessage');
            if (messageDiv) {
                let errorMessage = 'Ошибка входа: ';
                if (error.message.includes('401')) {
                    errorMessage += 'Неверный логин или пароль';
                } else if (error.message.includes('429')) {
                    errorMessage += 'Слишком много попыток входа. Попробуйте позже';
                } else {
                    errorMessage += error.message;
                }
                messageDiv.innerHTML = `<div class="error">${errorMessage}</div>`;
            }
        }
    }

    // Выход из системы
    logout() {
        api.logout();
        this.user = null;
        this.showLoginScreen();
        AppUtils.showNotification('Вы успешно вышли из системы', 'info');
    }

    // Переключение вкладок
    async switchTab(event, tab) {
        try {
            if (event && event.preventDefault) {
                event.preventDefault();
            }
            
            console.log('Switching to tab:', tab);
            
            // Убираем активные классы
            document.querySelectorAll('.section').forEach(section => 
                section.classList.remove('active')
            );
            
            // Активируем нужную секцию и загружаем данные
            if (tab === 'projects') {
                const section = AppUtils.checkElement('projectsSection');
                if (section) {
                    section.classList.add('active');
                    await window.ProjectsModule.load();
                }
            } else if (tab === 'sites') {
                const section = AppUtils.checkElement('sitesSection');
                if (section) {
                    section.classList.add('active');
                    await window.SitesModule.load();
                }
            }
            
            console.log('Tab switch completed:', tab);
        } catch (error) {
            console.error('Error switching tabs:', error);
            AppUtils.showNotification(`Ошибка переключения вкладки: ${error.message}`, 'error');
        }
    }

    // Смена количества элементов на странице
    changeItemsPerPage(value) {
        this.itemsPerPage = parseInt(value);
        this.currentPage.projects = 1;
        this.currentPage.sites = 1;
        this.currentPage.placements = 1;
        
        // Перезагружаем текущую вкладку
        const activeTab = document.querySelector('.section.active')?.id;
        if (activeTab === 'projectsSection') {
            window.ProjectsModule.load();
        } else if (activeTab === 'sitesSection') {
            window.SitesModule.load();
        }
    }

    // Установка обработчиков событий
    setupEventListeners() {
        try {
            // Обработчик формы входа
            AppUtils.safeElement('loginForm', (form) => {
                console.log('Setting up login form handler');
                form.addEventListener('submit', this.handleLogin);
            });
            
            // Обработчик формы добавления проекта
            AppUtils.safeElement('projectForm', (form) => {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await window.ProjectsModule.handleCreateProject(e);
                });
            });
            
            // Обработчик формы добавления сайта
            AppUtils.safeElement('siteForm', (form) => {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await window.SitesModule.handleCreateSite(e);
                });
            });
            
            // Глобальные обработчики ошибок
            window.addEventListener('unhandledrejection', (event) => {
                console.error('Unhandled Promise Rejection:', event.reason);
                AppUtils.showNotification('Произошла неожиданная ошибка', 'error');
            });
            
            // Обработчик очистки кэша
            AppUtils.safeElement('clearCacheBtn', (btn) => {
                btn.addEventListener('click', () => {
                    localStorage.clear();
                    sessionStorage.clear();
                    AppUtils.showNotification('Кэш очищен. Обновите страницу.', 'success');
                });
            });
            
        } catch (error) {
            console.error('Error setting up event listeners:', error);
        }
    }

    // Получить текущую страницу для секции
    getCurrentPage(section) {
        return this.currentPage[section] || 1;
    }

    // Установить текущую страницу для секции
    setCurrentPage(section, page) {
        this.currentPage[section] = page;
    }

    // Получить количество элементов на странице
    getItemsPerPage() {
        return this.itemsPerPage;
    }
}

// Создаем глобальный экземпляр приложения
window.app = new LinkManagerApp();

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    window.app.init();
});