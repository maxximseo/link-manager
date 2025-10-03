/**
 * Компонент пагинации
 */
window.PaginationComponent = {
    // Обновление пагинации
    update(section, pagination) {
        const containerId = `${section}Pagination`;
        let container = document.getElementById(containerId);
        
        if (!container) {
            // Создаем контейнер пагинации если его нет
            const listContainer = this.getListContainer(section);
            if (listContainer) {
                container = document.createElement('div');
                container.id = containerId;
                container.className = 'pagination';
                listContainer.appendChild(container);
            }
        }
        
        if (container && pagination) {
            container.innerHTML = this.generatePaginationHTML(section, pagination);
            container.style.display = 'flex';
        }
    },

    // Скрытие пагинации
    hide(section) {
        const container = document.getElementById(`${section}Pagination`);
        if (container) {
            container.style.display = 'none';
        }
    },

    // Получение контейнера списка для секции
    getListContainer(section) {
        switch (section) {
            case 'projects':
                const projectsList = document.getElementById('projectsList');
                return projectsList?.parentElement;
            case 'sites':
                const sitesList = document.getElementById('sitesList');
                return sitesList?.parentElement;
            case 'placements':
                const placementsList = document.getElementById('placementsList');
                return placementsList?.parentElement;
            default:
                return null;
        }
    },

    // Генерация HTML для пагинации
    generatePaginationHTML(section, pagination) {
        const { page, pages, total, hasNext, hasPrev } = pagination;
        
        return `
            <button onclick="PaginationComponent.loadPage('${section}', ${page - 1})" 
                    ${!hasPrev ? 'disabled' : ''} 
                    class="pagination-btn">
                ← Назад
            </button>
            <span class="page-info">
                Страница ${page} из ${pages} 
                (всего: ${AppUtils.formatNumber(total)})
            </span>
            <button onclick="PaginationComponent.loadPage('${section}', ${page + 1})" 
                    ${!hasNext ? 'disabled' : ''} 
                    class="pagination-btn">
                Вперед →
            </button>
            <select onchange="PaginationComponent.changeItemsPerPage(this.value)" 
                    class="pagination-select">
                <option value="10" ${app.getItemsPerPage() === 10 ? 'selected' : ''}>10 на странице</option>
                <option value="20" ${app.getItemsPerPage() === 20 ? 'selected' : ''}>20 на странице</option>
                <option value="50" ${app.getItemsPerPage() === 50 ? 'selected' : ''}>50 на странице</option>
                <option value="100" ${app.getItemsPerPage() === 100 ? 'selected' : ''}>100 на странице</option>
            </select>
        `;
    },

    // Загрузка определенной страницы
    async loadPage(section, page) {
        try {
            if (page < 1) return;
            
            console.log(`Loading page ${page} for section ${section}`);
            
            switch (section) {
                case 'projects':
                    await window.ProjectsModule.load(page);
                    break;
                case 'sites':
                    await window.SitesModule.load(page);
                    break;
                case 'placements':
                    // await window.PlacementsModule.load(page);
                    break;
            }
            
        } catch (error) {
            console.error('Error loading page:', error);
            AppUtils.showNotification(`Ошибка загрузки страницы: ${error.message}`, 'error');
        }
    },

    // Изменение количества элементов на странице
    changeItemsPerPage(value) {
        try {
            app.changeItemsPerPage(value);
            AppUtils.showNotification(`Показывать по ${value} элементов на странице`, 'info', 2000);
        } catch (error) {
            console.error('Error changing items per page:', error);
        }
    }
};