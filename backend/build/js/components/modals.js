/**
 * Компонент управления модальными окнами
 */
window.ModalsComponent = {
    
    // Открытие модального окна
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            
            // Добавляем ESC для закрытия
            this.addEscapeHandler(modalId);
        }
    },

    // Закрытие модального окна
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            
            // Удаляем обработчик ESC
            this.removeEscapeHandler();
        }
    },

    // Закрытие всех модальных окон
    closeAllModals() {
        const modals = document.querySelectorAll('.modal.active');
        modals.forEach(modal => {
            modal.classList.remove('active');
        });
        this.removeEscapeHandler();
    },

    // Добавление обработчика ESC
    addEscapeHandler(modalId) {
        this.currentModalId = modalId;
        
        if (!this.escapeHandler) {
            this.escapeHandler = (event) => {
                if (event.key === 'Escape') {
                    this.closeModal(this.currentModalId);
                }
            };
        }
        
        document.addEventListener('keydown', this.escapeHandler);
    },

    // Удаление обработчика ESC
    removeEscapeHandler() {
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
        }
        this.currentModalId = null;
    },

    // Создание модального окна программно
    createModal(id, title, content, options = {}) {
        const modalHTML = `
            <div id="${id}" class="modal" onclick="if(event.target === this) ModalsComponent.closeModal('${id}')">
                <div class="modal-content" style="max-width: ${options.maxWidth || '600px'};">
                    <div class="modal-header">
                        <h3>${AppUtils.escapeHtml(title)}</h3>
                        <button class="close-btn" onclick="ModalsComponent.closeModal('${id}')">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    ${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}
                </div>
            </div>
        `;
        
        // Добавляем в DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Открываем
        this.openModal(id);
        
        return id;
    },

    // Удаление модального окна
    removeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    },

    // Обновление содержимого модального окна
    updateModalContent(modalId, content) {
        const modal = document.getElementById(modalId);
        if (modal) {
            const body = modal.querySelector('.modal-body');
            if (body) {
                body.innerHTML = content;
            }
        }
    },

    // Обновление заголовка модального окна
    updateModalTitle(modalId, title) {
        const modal = document.getElementById(modalId);
        if (modal) {
            const titleEl = modal.querySelector('.modal-header h3');
            if (titleEl) {
                titleEl.textContent = title;
            }
        }
    },

    // Показ модального окна подтверждения
    showConfirmModal(title, message, onConfirm, onCancel = null) {
        const modalId = 'confirmModal_' + Date.now();
        
        const content = `
            <div style="padding: 20px; text-align: center;">
                <p style="margin-bottom: 30px; font-size: 16px;">${AppUtils.escapeHtml(message)}</p>
                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="ModalsComponent.handleConfirm('${modalId}', true)" class="btn">
                        Подтвердить
                    </button>
                    <button onclick="ModalsComponent.handleConfirm('${modalId}', false)" class="btn btn-secondary">
                        Отмена
                    </button>
                </div>
            </div>
        `;
        
        this.createModal(modalId, title, content, { maxWidth: '400px' });
        
        // Сохраняем callbacks
        this.confirmCallbacks = this.confirmCallbacks || {};
        this.confirmCallbacks[modalId] = { onConfirm, onCancel };
        
        return modalId;
    },

    // Обработка подтверждения
    handleConfirm(modalId, confirmed) {
        const callbacks = this.confirmCallbacks && this.confirmCallbacks[modalId];
        
        if (callbacks) {
            if (confirmed && callbacks.onConfirm) {
                callbacks.onConfirm();
            } else if (!confirmed && callbacks.onCancel) {
                callbacks.onCancel();
            }
            
            // Удаляем callbacks
            delete this.confirmCallbacks[modalId];
        }
        
        this.closeModal(modalId);
        this.removeModal(modalId);
    },

    // Показ модального окна с формой
    showFormModal(title, formHTML, onSubmit, options = {}) {
        const modalId = 'formModal_' + Date.now();
        
        const content = `
            <form onsubmit="ModalsComponent.handleFormSubmit(event, '${modalId}')" style="padding: 0;">
                ${formHTML}
                <div style="display: flex; gap: 15px; justify-content: flex-end; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                    <button type="button" onclick="ModalsComponent.closeModal('${modalId}')" class="btn btn-secondary">
                        ${options.cancelText || 'Отмена'}
                    </button>
                    <button type="submit" class="btn">
                        ${options.submitText || 'Сохранить'}
                    </button>
                </div>
            </form>
        `;
        
        this.createModal(modalId, title, content, options);
        
        // Сохраняем callback
        this.formCallbacks = this.formCallbacks || {};
        this.formCallbacks[modalId] = onSubmit;
        
        return modalId;
    },

    // Обработка отправки формы
    handleFormSubmit(event, modalId) {
        event.preventDefault();
        
        const callback = this.formCallbacks && this.formCallbacks[modalId];
        
        if (callback) {
            const formData = new FormData(event.target);
            const data = Object.fromEntries(formData.entries());
            
            const result = callback(data, event.target);
            
            // Если callback вернул true, закрываем модальное окно
            if (result === true || result instanceof Promise) {
                if (result instanceof Promise) {
                    result.then(success => {
                        if (success !== false) {
                            this.closeModal(modalId);
                            this.removeModal(modalId);
                        }
                    });
                } else {
                    this.closeModal(modalId);
                    this.removeModal(modalId);
                }
            }
            
            // Удаляем callback
            delete this.formCallbacks[modalId];
        }
    },

    // Показ информационного модального окна
    showInfoModal(title, content, options = {}) {
        const modalId = 'infoModal_' + Date.now();
        
        const bodyContent = `
            <div style="padding: 20px;">
                ${content}
                <div style="text-align: center; margin-top: 25px;">
                    <button onclick="ModalsComponent.closeModal('${modalId}')" class="btn">
                        ${options.buttonText || 'Закрыть'}
                    </button>
                </div>
            </div>
        `;
        
        this.createModal(modalId, title, bodyContent, options);
        
        // Автозакрытие если указано
        if (options.autoClose) {
            setTimeout(() => {
                this.closeModal(modalId);
                this.removeModal(modalId);
            }, options.autoClose);
        }
        
        return modalId;
    },

    // Показ модального окна загрузки
    showLoadingModal(title = 'Загрузка...', message = 'Пожалуйста, подождите...') {
        const modalId = 'loadingModal';
        
        // Удаляем существующее если есть
        this.removeModal(modalId);
        
        const content = `
            <div style="text-align: center; padding: 40px;">
                <div class="loading" style="margin: 0 auto 20px;"></div>
                <p>${AppUtils.escapeHtml(message)}</p>
            </div>
        `;
        
        const modalHTML = `
            <div id="${modalId}" class="modal">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3>${AppUtils.escapeHtml(title)}</h3>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.openModal(modalId);
        
        return modalId;
    },

    // Скрытие модального окна загрузки
    hideLoadingModal() {
        this.closeModal('loadingModal');
        this.removeModal('loadingModal');
    },

    // Проверка, открыто ли модальное окно
    isModalOpen(modalId) {
        const modal = document.getElementById(modalId);
        return modal && modal.classList.contains('active');
    },

    // Получение всех открытых модальных окон
    getOpenModals() {
        return Array.from(document.querySelectorAll('.modal.active')).map(modal => modal.id);
    },

    // Инициализация компонента
    init() {
        console.log('Modals component initialized');
        
        // Добавляем обработчик клика для закрытия модальных окон при клике на фон
        document.addEventListener('click', (event) => {
            if (event.target.classList.contains('modal')) {
                const modalId = event.target.id;
                if (modalId) {
                    this.closeModal(modalId);
                }
            }
        });
    }
};

// Глобальные функции для совместимости
window.closeModal = () => {
    const openModals = window.ModalsComponent.getOpenModals();
    if (openModals.length > 0) {
        window.ModalsComponent.closeModal(openModals[0]);
    }
};

window.closeEditSiteModal = () => {
    if (window.SitesModule && window.SitesModule.closeEditSiteModal) {
        window.SitesModule.closeEditSiteModal();
    } else {
        window.ModalsComponent.closeModal('editSiteModal');
    }
};

window.closePlacementModal = () => {
    if (window.PlacementsModule && window.PlacementsModule.closePlacementModal) {
        window.PlacementsModule.closePlacementModal();
    } else {
        window.ModalsComponent.closeModal('placementModal');
    }
};

// Инициализируем компонент при загрузке
document.addEventListener('DOMContentLoaded', () => {
    window.ModalsComponent.init();
});