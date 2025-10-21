/**
 * Модуль управления сайтами
 */
window.SitesModule = {
    // Загрузка сайтов
    async load(page = null) {
        try {
            const currentPage = page || app.getCurrentPage('sites');
            const limit = app.getItemsPerPage();
            
            console.log('Loading sites...');
            const response = await api.getSites(currentPage, limit);
            
            if (Array.isArray(response)) {
                // Простой ответ без пагинации
                this.display(response);
                window.PaginationComponent.hide('sites');
            } else {
                // Ответ с пагинацией
                this.display(response.data || []);
                window.PaginationComponent.update('sites', response.pagination);
                app.setCurrentPage('sites', response.pagination.page);
            }
            
        } catch (error) {
            console.error('Error loading sites:', error);
            AppUtils.showNotification('Ошибка загрузки сайтов', 'error');
        }
    },

    // Отображение списка сайтов
    display(sites) {
        const container = AppUtils.checkElement('sitesList');
        if (!container) return;
        
        if (sites.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: #718096; padding: 40px;">
                        Сайтов пока нет. Добавьте свой первый сайт выше!
                    </td>
                </tr>
            `;
            return;
        }
        
        const sitesHTML = sites.map(site => {
            const createdDate = AppUtils.formatDate(site.created_at);
            const apiKeyDisplay = site.api_key ? '✓' : '✗';
            const usedLinks = site.used_links || 0;
            const usedArticles = site.used_articles || 0;
            const maxLinks = site.max_links || 0;
            const maxArticles = site.max_articles || 0;
            
            return `
                <tr>
                    <td>
                        <div class="site-info">
                            <strong>${AppUtils.escapeHtml(site.site_url)}</strong>
                            <small style="display: block; color: #718096;">
                                Добавлен: ${createdDate}
                            </small>
                        </div>
                    </td>
                    <td class="text-center">${apiKeyDisplay}</td>
                    <td class="text-center">
                        <span class="usage-info ${usedLinks >= maxLinks ? 'usage-full' : ''}">
                            ${usedLinks}/${maxLinks}
                        </span>
                    </td>
                    <td class="text-center">
                        <span class="usage-info ${usedArticles >= maxArticles ? 'usage-full' : ''}">
                            ${usedArticles}/${maxArticles}
                        </span>
                    </td>
                    <td class="text-center">
                        <button onclick="SitesModule.editSiteLimits(${site.id}, '${AppUtils.escapeHtml(site.site_url)}', ${maxLinks}, ${maxArticles})" 
                                class="btn btn-sm">
                            Изменить
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        container.innerHTML = sitesHTML;
    },

    // Создание нового сайта
    async handleCreateSite(event) {
        event.preventDefault();
        
        try {
            const siteUrlEl = AppUtils.checkElement('siteUrl');
            const apiKeyEl = AppUtils.checkElement('apiKey');
            const maxLinksEl = AppUtils.checkElement('maxLinks');
            const maxArticlesEl = AppUtils.checkElement('maxArticles');
            
            if (!siteUrlEl || !apiKeyEl || !maxLinksEl || !maxArticlesEl) {
                throw new Error('Не найдены поля формы');
            }
            
            const siteUrl = siteUrlEl.value.trim();
            const apiKey = apiKeyEl.value.trim();
            const maxLinks = parseInt(maxLinksEl.value) || 10;
            const maxArticles = parseInt(maxArticlesEl.value) || 5;

            if (!siteUrl) {
                AppUtils.showNotification('Введите URL сайта', 'warning');
                return;
            }

            if (!apiKey) {
                AppUtils.showNotification('Введите API ключ от WordPress плагина', 'warning');
                return;
            }
            
            // Валидация URL
            if (!AppUtils.isValidUrl(siteUrl)) {
                AppUtils.showNotification('Введите корректный URL сайта', 'warning');
                return;
            }
            
            console.log('Creating site:', siteUrl);
            await api.createSite(siteUrl, apiKey, maxLinks, maxArticles);
            
            // Очищаем форму
            siteUrlEl.value = '';
            apiKeyEl.value = '';
            maxLinksEl.value = '';
            maxArticlesEl.value = '';
            
            // Перезагружаем список
            await this.load();
            
            AppUtils.showNotification('Сайт добавлен успешно!', 'success');
            
        } catch (error) {
            console.error('Error creating site:', error);
            AppUtils.showNotification(`Ошибка добавления сайта: ${error.message}`, 'error');
        }
    },

    // Редактирование лимитов сайта
    editSiteLimits(siteId, siteUrl, maxLinks, maxArticles) {
        try {
            // Заполняем форму редактирования
            AppUtils.safeElement('editSiteId', (el) => el.value = siteId);
            AppUtils.safeElement('editSiteName', (el) => el.textContent = `Сайт: ${siteUrl}`);
            AppUtils.safeElement('editMaxLinks', (el) => el.value = maxLinks);
            AppUtils.safeElement('editMaxArticles', (el) => el.value = maxArticles);
            
            // Показываем модальное окно
            AppUtils.safeElement('editSiteModal', (modal) => {
                modal.classList.add('active');
            });
            
        } catch (error) {
            console.error('Error opening edit modal:', error);
            AppUtils.showNotification('Ошибка открытия формы редактирования', 'error');
        }
    },

    // Обновление лимитов сайта
    async handleUpdateSiteLimits(event) {
        event.preventDefault();
        
        try {
            const siteIdEl = AppUtils.checkElement('editSiteId');
            const maxLinksEl = AppUtils.checkElement('editMaxLinks');
            const maxArticlesEl = AppUtils.checkElement('editMaxArticles');
            
            if (!siteIdEl || !maxLinksEl || !maxArticlesEl) {
                throw new Error('Не найдены поля формы');
            }
            
            const siteId = parseInt(siteIdEl.value);
            const maxLinks = parseInt(maxLinksEl.value);
            const maxArticles = parseInt(maxArticlesEl.value);
            
            if (!siteId || maxLinks < 0 || maxArticles < 0) {
                AppUtils.showNotification('Проверьте корректность введенных данных', 'warning');
                return;
            }
            
            console.log('Updating site limits:', siteId);
            await api.updateSite(siteId, maxLinks, maxArticles);
            
            // Закрываем модальное окно
            this.closeEditSiteModal();
            
            // Перезагружаем список
            await this.load();
            
            AppUtils.showNotification('Лимиты обновлены успешно!', 'success');
            
        } catch (error) {
            console.error('Error updating site limits:', error);
            AppUtils.showNotification(`Ошибка обновления лимитов: ${error.message}`, 'error');
        }
    },

    // Закрытие модального окна редактирования
    closeEditSiteModal() {
        AppUtils.safeElement('editSiteModal', (modal) => {
            modal.classList.remove('active');
        });
    },

    // Получение всех сайтов для использования в других модулях
    async getAllSites() {
        try {
            // Загружаем все сайты без пагинации
            const response = await api.getSites();
            return Array.isArray(response) ? response : (response.data || []);
        } catch (error) {
            console.error('Error getting all sites:', error);
            return [];
        }
    },

    // Инициализация модуля
    init() {
        // Устанавливаем обработчик для формы обновления лимитов
        AppUtils.safeElement('updateSiteLimitsForm', (form) => {
            form.addEventListener('submit', (e) => this.handleUpdateSiteLimits(e));
        });
        
        console.log('Sites module initialized');
    }
};

// Инициализируем модуль при загрузке
document.addEventListener('DOMContentLoaded', () => {
    window.SitesModule.init();
});