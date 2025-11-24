/**
 * Компонент системы уведомлений
 */
window.NotificationsComponent = {
    
    // Показ уведомления
    show(message, type = 'info', duration = 5000) {
        // Создаем элемент уведомления
        const notification = document.createElement('div');
        const notificationId = 'notification_' + Date.now();
        
        notification.id = notificationId;
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>${AppUtils.escapeHtml(message)}</span>
                <button onclick="NotificationsComponent.hide('${notificationId}')" 
                        style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; margin-left: 15px;">
                    ×
                </button>
            </div>
        `;
        
        // Добавляем в DOM
        document.body.appendChild(notification);
        
        // Анимация появления
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        // Автоскрытие
        if (duration > 0) {
            setTimeout(() => {
                this.hide(notificationId);
            }, duration);
        }
        
        return notificationId;
    },

    // Скрытие уведомления
    hide(notificationId) {
        const notification = document.getElementById(notificationId);
        if (notification) {
            // Анимация исчезновения
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            
            // Удаляем после анимации
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    },

    // Показ успешного уведомления
    success(message, duration = 4000) {
        return this.show(message, 'success', duration);
    },

    // Показ ошибки
    error(message, duration = 6000) {
        return this.show(message, 'error', duration);
    },

    // Показ предупреждения
    warning(message, duration = 5000) {
        return this.show(message, 'warning', duration);
    },

    // Показ информационного сообщения
    info(message, duration = 4000) {
        return this.show(message, 'info', duration);
    },

    // Очистка всех уведомлений
    clearAll() {
        const notifications = document.querySelectorAll('.notification');
        notifications.forEach(notification => {
            this.hide(notification.id);
        });
    },

    // Показ уведомления с действием
    showWithAction(message, actionText, actionCallback, type = 'info', duration = 8000) {
        const notification = document.createElement('div');
        const notificationId = 'notification_' + Date.now();
        
        notification.id = notificationId;
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>${AppUtils.escapeHtml(message)}</span>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <button onclick="NotificationsComponent.handleAction('${notificationId}')" 
                            style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 14px;">
                        ${AppUtils.escapeHtml(actionText)}
                    </button>
                    <button onclick="NotificationsComponent.hide('${notificationId}')" 
                            style="background: none; border: none; color: white; font-size: 18px; cursor: pointer;">
                        ×
                    </button>
                </div>
            </div>
        `;
        
        // Сохраняем callback
        this.actionCallbacks = this.actionCallbacks || {};
        this.actionCallbacks[notificationId] = actionCallback;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        if (duration > 0) {
            setTimeout(() => {
                this.hide(notificationId);
            }, duration);
        }
        
        return notificationId;
    },

    // Обработка действия
    handleAction(notificationId) {
        const callback = this.actionCallbacks && this.actionCallbacks[notificationId];
        if (callback) {
            callback();
            delete this.actionCallbacks[notificationId];
        }
        this.hide(notificationId);
    },

    // Показ уведомления с прогрессом
    showProgress(message, progress = 0) {
        const notificationId = 'progress_' + Date.now();
        const notification = document.createElement('div');
        
        notification.id = notificationId;
        notification.className = 'notification info';
        notification.innerHTML = `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span>${AppUtils.escapeHtml(message)}</span>
                    <span id="${notificationId}_percent">${progress}%</span>
                </div>
                <div style="background: rgba(255,255,255,0.3); height: 4px; border-radius: 2px; overflow: hidden;">
                    <div id="${notificationId}_bar" style="background: white; height: 100%; width: ${progress}%; transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        return notificationId;
    },

    // Обновление прогресса
    updateProgress(notificationId, progress, message = null) {
        const notification = document.getElementById(notificationId);
        if (notification) {
            const bar = document.getElementById(notificationId + '_bar');
            const percent = document.getElementById(notificationId + '_percent');
            
            if (bar) {
                bar.style.width = progress + '%';
            }
            
            if (percent) {
                percent.textContent = progress + '%';
            }
            
            if (message) {
                const messageEl = notification.querySelector('span:first-child');
                if (messageEl) {
                    messageEl.textContent = message;
                }
            }
            
            // Автоскрытие при 100%
            if (progress >= 100) {
                setTimeout(() => {
                    this.hide(notificationId);
                }, 2000);
            }
        }
    },

    // Показ стикки уведомления (не исчезает автоматически)
    showSticky(message, type = 'info') {
        return this.show(message, type, 0);
    },

    // Получение количества активных уведомлений
    getActiveCount() {
        return document.querySelectorAll('.notification').length;
    },

    // Инициализация компонента
    init() {
        console.log('Notifications component initialized');
        
        // Добавляем стили если их нет
        this.addNotificationStyles();
    },

    // Добавление стилей для уведомлений
    addNotificationStyles() {
        const existingStyles = document.getElementById('notification-styles');
        if (existingStyles) return;
        
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 16px 20px;
                border-radius: 8px;
                color: white;
                font-weight: 500;
                z-index: 2000;
                max-width: 400px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                opacity: 0;
                transform: translateX(100px);
                transition: all 0.3s ease;
                word-wrap: break-word;
            }
            
            .notification.success {
                background: linear-gradient(45deg, #10b981, #047857);
            }
            
            .notification.error {
                background: linear-gradient(45deg, #ef4444, #dc2626);
            }
            
            .notification.warning {
                background: linear-gradient(45deg, #f59e0b, #d97706);
            }
            
            .notification.info {
                background: linear-gradient(45deg, #667eea, #764ba2);
            }
            
            .notification:not(:last-child) {
                margin-bottom: 10px;
            }
            
            @media (max-width: 768px) {
                .notification {
                    right: 10px;
                    left: 10px;
                    max-width: none;
                }
            }
        `;
        
        document.head.appendChild(styles);
    }
};

// Интегрируем с AppUtils для совместимости
if (window.AppUtils) {
    window.AppUtils.showNotification = (message, type, duration) => {
        return window.NotificationsComponent.show(message, type, duration);
    };
}

// Глобальные функции для удобства
window.showNotification = (message, type = 'info', duration = 5000) => {
    return window.NotificationsComponent.show(message, type, duration);
};

window.showSuccess = (message, duration) => {
    return window.NotificationsComponent.success(message, duration);
};

window.showError = (message, duration) => {
    return window.NotificationsComponent.error(message, duration);
};

window.showWarning = (message, duration) => {
    return window.NotificationsComponent.warning(message, duration);
};

window.showInfo = (message, duration) => {
    return window.NotificationsComponent.info(message, duration);
};

// Инициализируем компонент при загрузке
document.addEventListener('DOMContentLoaded', () => {
    window.NotificationsComponent.init();
});