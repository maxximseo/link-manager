/**
 * Утилиты и helper функции
 */
window.AppUtils = {
    // Escape HTML для безопасности
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    // Форматирование даты
    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('ru-RU');
    },

    // Генерация slug из заголовка
    generateSlug(title) {
        const transliterationMap = {
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 
            'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm', 
            'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 
            'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 
            'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
        };
        
        return title.toLowerCase()
            .split('')
            .map(char => transliterationMap[char] || char)
            .join('')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    },

    // Debounce функция
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Показать уведомление
    showNotification(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Стили для уведомлений
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 400px;
            word-wrap: break-word;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        
        // Цвета для разных типов
        const colors = {
            'success': '#10B981',
            'error': '#EF4444',
            'warning': '#F59E0B',
            'info': '#3B82F6'
        };
        
        notification.style.backgroundColor = colors[type] || colors.info;
        
        document.body.appendChild(notification);
        
        // Автоматическое скрытие
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, duration);
    },

    // Парсинг HTML для извлечения ссылок
    parseLinksFromHtml(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const links = [];
        
        doc.querySelectorAll('a').forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent.trim();
            const contextBefore = link.previousSibling?.textContent?.trim() || '';
            const contextAfter = link.nextSibling?.textContent?.trim() || '';
            
            if (href && text) {
                links.push({
                    url: href,
                    anchor: text,
                    context: `${contextBefore} ${text} ${contextAfter}`.trim()
                });
            }
        });
        
        return links;
    },

    // Валидация email
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    // Валидация URL
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    // Получение параметров URL
    getURLParams() {
        const params = {};
        const searchParams = new URLSearchParams(window.location.search);
        for (const [key, value] of searchParams) {
            params[key] = value;
        }
        return params;
    },

    // Установка параметра URL без перезагрузки страницы
    setURLParam(key, value) {
        const url = new URL(window.location);
        url.searchParams.set(key, value);
        window.history.replaceState({}, '', url);
    },

    // Копирование текста в буфер обмена
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showNotification('Текст скопирован в буфер обмена', 'success');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            this.showNotification('Не удалось скопировать текст', 'error');
        }
    },

    // Загрузка данных с обработкой ошибок
    async safeCall(funcName, func) {
        try {
            console.log(`Executing: ${funcName}`);
            const result = await func();
            console.log(`Success: ${funcName}`);
            return result;
        } catch (error) {
            console.error(`ERROR in ${funcName}:`, error);
            this.showNotification(`Ошибка в ${funcName}: ${error.message}`, 'error');
            throw error;
        }
    },

    // Проверка существования элемента DOM
    checkElement(id, required = true) {
        const element = document.getElementById(id);
        if (!element && required) {
            console.error(`CRITICAL: Missing required element ${id}`);
            this.showNotification(`Ошибка: отсутствует элемент ${id}`, 'error');
        }
        return element;
    },

    // Безопасный доступ к элементам DOM
    safeElement(id, callback, fallback = null) {
        const element = document.getElementById(id);
        if (element && callback) {
            return callback(element);
        } else if (fallback) {
            return fallback();
        }
        return null;
    },

    // Форматирование чисел
    formatNumber(num) {
        return new Intl.NumberFormat('ru-RU').format(num);
    },

    // Получение случайного ID
    generateId() {
        return Math.random().toString(36).substr(2, 9);
    },

    // Очистка localStorage от устаревших данных
    cleanupStorage() {
        const keysToCheck = ['token', 'user'];
        keysToCheck.forEach(key => {
            try {
                const value = localStorage.getItem(key);
                if (value && key === 'user') {
                    JSON.parse(value); // Проверяем валидность JSON
                }
            } catch (error) {
                console.warn(`Removing invalid ${key} from localStorage:`, error);
                localStorage.removeItem(key);
            }
        });
    },

    // Проверка поддержки браузером
    checkBrowserSupport() {
        const features = {
            fetch: typeof fetch !== 'undefined',
            localStorage: typeof localStorage !== 'undefined',
            Promise: typeof Promise !== 'undefined',
            async: (async function() {}).constructor !== undefined
        };
        
        const unsupported = Object.entries(features)
            .filter(([, supported]) => !supported)
            .map(([feature]) => feature);
            
        if (unsupported.length > 0) {
            this.showNotification(
                `Ваш браузер не поддерживает: ${unsupported.join(', ')}`, 
                'warning'
            );
        }
        
        return unsupported.length === 0;
    }
};