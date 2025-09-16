/**
 * Модуль управления размещениями
 */
window.PlacementsModule = {
    
    // Загрузка размещений
    async loadPlacements(page = null) {
        try {
            const currentPage = page || app.getCurrentPage('placements');
            const limit = app.getItemsPerPage();
            
            console.log('Loading placements...');
            const response = await api.getPlacements(currentPage, limit);
            
            if (Array.isArray(response)) {
                // Простой ответ без пагинации
                this.displayPlacements(response);
                window.PaginationComponent.hide('placements');
            } else {
                // Ответ с пагинацией
                this.displayPlacements(response.data || []);
                window.PaginationComponent.update('placements', response.pagination);
                app.setCurrentPage('placements', response.pagination.page);
            }
            
        } catch (error) {
            console.error('Error loading placements:', error);
            AppUtils.showNotification('Ошибка загрузки размещений', 'error');
        }
    },

    // Отображение списка размещений
    displayPlacements(placements) {
        const container = AppUtils.checkElement('placementsList');
        if (!container) return;
        
        if (placements.length === 0) {
            container.innerHTML = `
                <div class="text-center" style="color: #718096; padding: 40px;">
                    Размещений пока нет. Создайте первое размещение!
                </div>
            `;
            return;
        }
        
        const placementsHTML = placements.map(placement => {
            const createdDate = AppUtils.formatDate(placement.created_at);
            const siteName = placement.site_url || 'Unknown Site';
            const projectName = placement.project_name || 'Unknown Project';
            const linksCount = placement.links_count || 0;
            const articlesCount = placement.articles_count || 0;
            
            return `
                <div class="project-card">
                    <div class="project-header">
                        <div>
                            <h4 class="project-title">${AppUtils.escapeHtml(projectName)}</h4>
                            <p class="project-description">
                                На сайте: <strong>${AppUtils.escapeHtml(siteName)}</strong><br>
                                Создано: ${createdDate}
                            </p>
                        </div>
                        <div class="project-actions">
                            <button onclick="PlacementsModule.deletePlacement(${placement.id})" 
                                    class="btn btn-danger btn-small">
                                Удалить
                            </button>
                        </div>
                    </div>
                    <div class="project-stats">
                        <span>📎 Ссылок: ${linksCount}</span>
                        <span>📄 Статей: ${articlesCount}</span>
                        <span>🆔 ID: ${placement.id}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = placementsHTML;
    },

    // Открытие модального окна для создания размещения
    async openPlacementModal() {
        try {
            // Загружаем проекты и сайты
            const [projects, sites] = await Promise.all([
                window.ProjectsModule.getAllProjects(),
                window.SitesModule.getAllSites()
            ]);
            
            if (projects.length === 0) {
                AppUtils.showNotification('Сначала создайте проект!', 'warning');
                return;
            }
            
            if (sites.length === 0) {
                AppUtils.showNotification('Сначала добавьте сайт!', 'warning');
                return;
            }
            
            // Показываем модальное окно
            const modal = document.getElementById('placementModal');
            const modalContent = document.getElementById('placementModalContent');
            
            modalContent.innerHTML = this.generatePlacementModalContent(projects, sites);
            modal.classList.add('active');
            
            // Инициализируем выбор проекта
            this.initializeProjectSelection();
            
        } catch (error) {
            console.error('Error opening placement modal:', error);
            AppUtils.showNotification('Ошибка открытия модального окна', 'error');
        }
    },

    // Генерация содержимого модального окна размещения
    generatePlacementModalContent(projects, sites) {
        return `
            <div class="modal-body">
                <div class="form-section">
                    <h4>Выберите проект</h4>
                    <select id="placementProject" onchange="PlacementsModule.onProjectChange()" required>
                        <option value="">-- Выберите проект --</option>
                        ${projects.map(p => `<option value="${p.id}">${AppUtils.escapeHtml(p.name)}</option>`).join('')}
                    </select>
                </div>

                <!-- Batch Mode Toggle -->
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                        <input type="checkbox" id="batchModeToggle" onchange="QueueModule.toggleBatchMode()" style="margin: 0;">
                        <span>Batch Mode (5+ sites for async processing)</span>
                    </label>
                </div>

                <!-- Single Site Selection -->
                <div id="singleSiteSection" class="form-group">
                    <label>Select Site</label>
                    <select id="placementSite" class="form-group">
                        <option value="">-- Выберите сайт --</option>
                        ${sites.map(s => `<option value="${s.id}">${AppUtils.escapeHtml(s.site_url)} (Links: ${s.used_links || 0}/${s.max_links || 10}, Articles: ${s.used_articles || 0}/${s.max_articles || 5})</option>`).join('')}
                    </select>
                </div>

                <!-- Batch Site Selection -->
                <div id="batchSiteSection" class="form-group" style="display: none;">
                    <label>Select Multiple Sites (minimum 5 required for batch processing)</label>
                    <div style="border: 1px solid #d1d5db; border-radius: 5px; padding: 10px; max-height: 300px; overflow-y: auto; background: #f9fafb;">
                        <div style="margin-bottom: 10px;">
                            <button type="button" onclick="QueueModule.selectAllSites()" class="btn-small">Select All</button>
                            <button type="button" onclick="QueueModule.deselectAllSites()" class="btn-small" style="background: #6b7280;">Deselect All</button>
                            <span id="selectedSiteCount" style="margin-left: 10px; font-weight: bold; color: #059669;">0 sites selected</span>
                        </div>
                        <div id="batchSiteList">
                            ${sites.map(site => `
                                <label style="display: block; padding: 5px; cursor: pointer; border-radius: 3px;" class="site-checkbox-label" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='transparent'">
                                    <input type="checkbox" name="batchSites" value="${site.id}" onchange="QueueModule.updateSelectedSiteCount()" style="margin-right: 8px;">
                                    <span>${AppUtils.escapeHtml(site.site_url)}</span>
                                    <small style="color: #6b7280; margin-left: 10px;">Links: ${site.used_links || 0}/${site.max_links || 10}, Articles: ${site.used_articles || 0}/${site.max_articles || 5}</small>
                                </label>
                            `).join('')}
                        </div>
                        <div id="batchWarning" style="display: none; margin-top: 10px; padding: 8px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px; color: #92400e;">
                            ⚠️ Batch mode requires at least 5 sites selected for optimal performance.
                        </div>
                    </div>
                </div>

                <div id="contentSelectionContainer" style="display: none;">
                    <div class="form-section">
                        <h4>Выберите контент для размещения</h4>
                        
                        <div id="linksSelection">
                            <h5>Ссылки</h5>
                            <div id="projectLinks" style="max-height: 150px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
                                <!-- Ссылки будут загружены динамически -->
                            </div>
                        </div>
                        
                        <div id="articlesSelection" style="margin-top: 20px;">
                            <h5>Статьи</h5>
                            <div id="projectArticles" style="max-height: 150px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
                                <!-- Статьи будут загружены динамически -->
                            </div>
                        </div>
                    </div>
                </div>

                <div id="placementActions" style="margin-top: 20px;">
                    <button onclick="PlacementsModule.createPlacement()" class="btn" id="createPlacementBtn">Create Placement</button>
                    <div id="batchProgress" style="display: none; margin-top: 15px; padding: 15px; background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                            <div class="spinner" style="width: 20px; height: 20px; border: 2px solid #e5e7eb; border-top: 2px solid #0ea5e9; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                            <span style="font-weight: bold;">Processing batch placement...</span>
                        </div>
                        <div id="batchProgressBar" style="width: 100%; background: #e5e7eb; border-radius: 10px; height: 8px; overflow: hidden;">
                            <div id="batchProgressFill" style="height: 100%; background: #0ea5e9; width: 0%; transition: width 0.3s;"></div>
                        </div>
                        <div id="batchStatus" style="font-size: 14px; color: #374151; margin-top: 5px;">Initializing...</div>
                        <button type="button" onclick="QueueModule.cancelBatchJob()" class="btn-small" style="background: #dc2626; margin-top: 10px;">Cancel Job</button>
                    </div>

                    <div style="text-align: right; margin-top: 20px;">
                        <button onclick="PlacementsModule.closePlacementModal()" class="btn btn-secondary" style="margin-right: 10px;">
                            Отмена
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // Инициализация выбора проекта
    initializeProjectSelection() {
        // Сохраняем сайты для использования
        const sitesResponse = window.SitesModule.getAllSites();
        sitesResponse.then(sites => {
            window.allSites = sites;
        });
    },

    // Обработка изменения проекта
    async onProjectChange() {
        const projectSelect = document.getElementById('placementProject');
        const projectId = projectSelect.value;
        
        if (!projectId) {
            document.getElementById('contentSelectionContainer').style.display = 'none';
            return;
        }
        
        try {
            // Загружаем ссылки и статьи проекта
            const [links, articles] = await Promise.all([
                api.getProjectLinks(projectId),
                api.getProjectArticles(projectId)
            ]);
            
            this.populateProjectContent(links, articles);
            document.getElementById('contentSelectionContainer').style.display = 'block';
            
        } catch (error) {
            console.error('Error loading project content:', error);
            AppUtils.showNotification('Ошибка загрузки контента проекта', 'error');
        }
    },

    // Load project content for placement (from original implementation)
    async loadProjectContent() {
        const projectId = document.getElementById('placementProject').value;
        if (!projectId) {
            const contentSelection = document.getElementById('projectContentSelection');
            if (contentSelection) {
                contentSelection.style.display = 'none';
            }
            return;
        }
        
        try {
            const token = localStorage.getItem('token');
            
            // Fetch the project - it already includes links and articles!
            const projectResponse = await fetch(`${window.API_URL || ''}/api/projects/${projectId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!projectResponse.ok) {
                throw new Error(`Failed to load project: ${projectResponse.status}`);
            }
            
            const project = await projectResponse.json();
            
            // Links and articles are already included in the project response
            const data = {
                project: project,
                links: project.links || [],
                articles: project.articles || []
            };
            
            // Validate data structure
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid response format from server');
            }
            
            // Display links (without placement status since we don't have that data)
            const linksDiv = document.getElementById('availableLinks');
            if (linksDiv) {
                linksDiv.innerHTML = `
                    <h5>Links (${data.links?.length || 0})</h5>
                    ${data.links?.length ? data.links.map(link => `
                        <label style="display: block; margin: 10px 0; padding: 10px; background: #f7fafc; border-radius: 5px; cursor: pointer;">
                            <input type="checkbox" name="selectedLinks" value="${link.id}">
                            ${AppUtils.escapeHtml(link.anchor_text || 'No anchor')} - ${AppUtils.escapeHtml(link.url || 'No URL')}
                        </label>
                    `).join('') : '<p style="color: #718096;">No links available in this project</p>'}
                `;
            }
            
            // Display articles (without placement status since we don't have that data)
            const articlesDiv = document.getElementById('availableArticles');
            if (articlesDiv) {
                articlesDiv.innerHTML = `
                    <h5>Articles (${data.articles?.length || 0})</h5>
                    ${data.articles?.length > 0 ? `
                        <div style="background: #d4f4dd; padding: 10px; border-radius: 5px; margin-bottom: 10px; border: 1px solid #52c41a;">
                            <p style="margin: 0; font-weight: 500; color: #237804;">
                                ✅ Articles will be published as full WordPress posts
                            </p>
                            <p style="margin: 5px 0 0 0; font-size: 12px; color: #135200;">
                                Selected articles will be created as WordPress posts with proper permalinks and categories.
                            </p>
                        </div>
                    ` : ''}
                    ${data.articles?.length ? data.articles.map(article => {
                        const isPlaced = article.is_placed;
                        const placedStyle = isPlaced ? 'opacity: 0.6; cursor: not-allowed; background: #e2e8f0;' : 'cursor: pointer;';
                        const disabledAttr = isPlaced ? 'disabled' : '';
                        
                        return `
                            <label style="display: block; margin: 10px 0; padding: 10px; background: #f7fafc; border-radius: 5px; ${placedStyle}">
                                <input type="checkbox" name="selectedArticles" value="${article.id}" ${disabledAttr}>
                                ${AppUtils.escapeHtml(article.title || 'Untitled Article')}
                                ${isPlaced ? `<span style="color: #48bb78; font-size: 12px; margin-left: 10px;">✓ Already placed on: ${AppUtils.escapeHtml(article.placed_on_site || '')}</span>` : ''}
                            </label>
                        `;
                    }).join('') : '<p style="color: #718096;">No articles available in this project</p>'}
                `;
            }
            
            const contentSelection = document.getElementById('projectContentSelection');
            if (contentSelection) {
                contentSelection.style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading project content:', error);
            
            let errorMessage = 'Error loading project content: ';
            
            // Check for specific status codes in our error message
            if (error.message && error.message.includes('Failed to load project')) {
                // Extract status code from our custom error message
                const statusMatch = error.message.match(/(\d{3})/);
                if (statusMatch) {
                    const status = statusMatch[1];
                    if (status === '401' || status === '403') {
                        errorMessage += 'Authentication expired. Please refresh the page (Ctrl+F5 or Cmd+Shift+R) and login again.';
                    } else if (status === '404') {
                        errorMessage += 'Project not found.';
                    } else if (status === '500') {
                        errorMessage += 'Server error. Please try again.';
                    } else {
                        errorMessage += `Server returned status ${status}.`;
                    }
                } else {
                    errorMessage += error.message;
                }
            } else if (error.message) {
                errorMessage += error.message;
            } else {
                errorMessage += 'Unknown error occurred. Please refresh the page and try again.';
            }
            
            if (window.NotificationsComponent) {
                window.NotificationsComponent.error(errorMessage);
            } else {
                alert(errorMessage);
            }
            
            const contentSelection = document.getElementById('projectContentSelection');
            if (contentSelection) {
                contentSelection.style.display = 'none';
            }
        }
    },

    // Заполнение контента проекта
    populateProjectContent(links, articles) {
        const linksContainer = document.getElementById('projectLinks');
        const articlesContainer = document.getElementById('projectArticles');
        
        // Ссылки
        if (links.length === 0) {
            linksContainer.innerHTML = '<p style="color: #666;">Ссылки отсутствуют</p>';
        } else {
            linksContainer.innerHTML = links.map(link => `
                <label style="display: block; margin-bottom: 8px;">
                    <input type="checkbox" value="${link.id}" class="content-checkbox link-checkbox">
                    ${AppUtils.escapeHtml(link.anchor_text)} → ${AppUtils.escapeHtml(link.target_url)}
                </label>
            `).join('');
        }
        
        // Статьи
        if (articles.length === 0) {
            articlesContainer.innerHTML = '<p style="color: #666;">Статьи отсутствуют</p>';
        } else {
            articlesContainer.innerHTML = articles.map(article => `
                <label style="display: block; margin-bottom: 8px;">
                    <input type="checkbox" value="${article.id}" class="content-checkbox article-checkbox">
                    ${AppUtils.escapeHtml(article.title)}
                </label>
            `).join('');
        }
    },

    // Переключение типа размещения
    togglePlacementType() {
        const placementType = document.querySelector('input[name="placementType"]:checked').value;
        const singleSelect = document.getElementById('singleSiteSelect');
        const batchSelect = document.getElementById('batchSiteSelect');
        
        if (placementType === 'single') {
            singleSelect.style.display = 'block';
            batchSelect.style.display = 'none';
        } else {
            singleSelect.style.display = 'none';
            batchSelect.style.display = 'block';
        }
    },

    // Создание размещения
    async createPlacement() {
        try {
            const projectId = document.getElementById('placementProject').value;
            if (!projectId) {
                AppUtils.showNotification('Выберите проект', 'warning');
                return;
            }
            
            // Получаем выбранные ссылки и статьи
            const selectedLinks = Array.from(document.querySelectorAll('.link-checkbox:checked')).map(cb => cb.value);
            const selectedArticles = Array.from(document.querySelectorAll('.article-checkbox:checked')).map(cb => cb.value);
            
            if (selectedLinks.length === 0 && selectedArticles.length === 0) {
                AppUtils.showNotification('Выберите хотя бы одну ссылку или статью', 'warning');
                return;
            }
            
            // Check if batch mode is enabled
            const isBatchMode = window.QueueModule && window.QueueModule.isBatchMode();
            
            if (isBatchMode) {
                // Batch mode - use queue processing
                const selectedSites = window.QueueModule.getSelectedSites();
                
                if (selectedSites.length === 0) {
                    AppUtils.showNotification('Выберите хотя бы один сайт для пакетного размещения', 'warning');
                    return;
                }
                
                if (!window.QueueModule.validateBatchSelection()) {
                    return; // Validation failed, error already shown
                }
                
                await window.QueueModule.createBatchPlacement(projectId, selectedSites, selectedLinks, selectedArticles);
                
            } else {
                // Single mode
                const siteId = document.getElementById('placementSite').value;
                if (!siteId) {
                    AppUtils.showNotification('Выберите сайт', 'warning');
                    return;
                }
                
                await this.createSinglePlacement(projectId, siteId, selectedLinks, selectedArticles);
            }
            
        } catch (error) {
            console.error('Error creating placement:', error);
            AppUtils.showNotification(`Ошибка создания размещения: ${error.message}`, 'error');
        }
    },

    // Создание одиночного размещения
    async createSinglePlacement(projectId, siteId, selectedLinks, selectedArticles) {
        console.log('Creating single placement...');
        
        try {
            // Use WordPress module for intelligent placement processing
            if (window.WordPressModule) {
                const results = await window.WordPressModule.processWordPressPlacement(
                    projectId, 
                    siteId, 
                    selectedLinks, 
                    selectedArticles
                );
                
                window.WordPressModule.showWordPressPlacementResult(results);
                this.closePlacementModal();
                
                // Перезагружаем проекты если нужно
                if (window.ProjectsModule) {
                    await window.ProjectsModule.load();
                }
            } else {
                // Fallback to API client
                const response = await api.createPlacement(projectId, siteId, selectedLinks, selectedArticles);
                
                if (response.success) {
                    AppUtils.showNotification('Размещение создано успешно!', 'success');
                    this.closePlacementModal();
                    
                    // Перезагружаем проекты если нужно
                    if (window.ProjectsModule) {
                        await window.ProjectsModule.load();
                    }
                } else {
                    throw new Error(response.message || 'Неизвестная ошибка');
                }
            }
        } catch (error) {
            console.error('Error in createSinglePlacement:', error);
            throw error;
        }
    },

    // Создание пакетного размещения
    async createBatchPlacement(projectId, siteIds, selectedLinks, selectedArticles) {
        console.log('Creating batch placement...');
        
        const response = await api.createBatchPlacement(projectId, siteIds, selectedLinks, selectedArticles);
        
        if (response.success) {
            AppUtils.showNotification(`Пакетное размещение создано для ${siteIds.length} сайтов!`, 'success');
            this.closePlacementModal();
            
            // Перезагружаем проекты если нужно
            if (window.ProjectsModule) {
                await window.ProjectsModule.load();
            }
        } else {
            throw new Error(response.message || 'Неизвестная ошибка');
        }
    },

    // Закрытие модального окна размещения
    closePlacementModal() {
        const modal = document.getElementById('placementModal');
        modal.classList.remove('active');
    },

    // Удаление размещения
    async deletePlacement(id) {
        if (!confirm('Вы уверены, что хотите удалить это размещение?')) {
            return;
        }
        
        try {
            console.log('Deleting placement:', id);
            await api.deletePlacement(id);
            
            AppUtils.showNotification('Размещение удалено успешно!', 'success');
            
            // Перезагружаем список размещений
            await this.loadPlacements();
            
            // Обновляем проекты если нужно
            if (window.ProjectsModule) {
                await window.ProjectsModule.load();
            }
            
        } catch (error) {
            console.error('Error deleting placement:', error);
            AppUtils.showNotification(`Ошибка удаления размещения: ${error.message}`, 'error');
        }
    },

    // Удаление множественных размещений
    async deleteMultiplePlacements(placementIds) {
        if (!confirm(`Вы уверены, что хотите удалить ${placementIds.length} размещений?`)) {
            return;
        }
        
        try {
            console.log('Deleting multiple placements:', placementIds);
            await api.deleteMultiplePlacements(placementIds);
            
            AppUtils.showNotification(`${placementIds.length} размещений удалены успешно!`, 'success');
            
            // Перезагружаем список размещений
            await this.loadPlacements();
            
            // Обновляем проекты если нужно
            if (window.ProjectsModule) {
                await window.ProjectsModule.load();
            }
            
        } catch (error) {
            console.error('Error deleting multiple placements:', error);
            AppUtils.showNotification(`Ошибка удаления размещений: ${error.message}`, 'error');
        }
    },

    // Загрузка деталей размещения для проекта
    async loadPlacementDetails(projectId) {
        try {
            console.log('Loading placement details for project:', projectId);
            const placements = await api.getProjectPlacements(projectId);
            
            this.displayPlacementDetails(placements);
            
        } catch (error) {
            console.error('Error loading placement details:', error);
            AppUtils.showNotification('Ошибка загрузки деталей размещения', 'error');
        }
    },

    // Отображение деталей размещения
    displayPlacementDetails(placementsBySite) {
        // Эта функция будет использоваться в проектах
        // для отображения статистики размещений
        const container = document.getElementById('placementDetails');
        if (!container) return;
        
        if (!placementsBySite || placementsBySite.length === 0) {
            container.innerHTML = '<p style="color: #666;">Размещения отсутствуют</p>';
            return;
        }
        
        const html = placementsBySite.map(site => `
            <div class="placement-site">
                <h5>${AppUtils.escapeHtml(site.site_url)}</h5>
                <div class="placement-stats">
                    <span>Ссылки: ${site.links_count || 0}</span>
                    <span>Статьи: ${site.articles_count || 0}</span>
                </div>
            </div>
        `).join('');
        
        container.innerHTML = html;
    },

    // Инициализация модуля
    init() {
        console.log('Placements module initialized');
    }
};

// Global function exports for HTML onclick handlers
window.loadProjectContent = () => {
    return window.PlacementsModule.loadProjectContent();
};

// Инициализируем модуль при загрузке
document.addEventListener('DOMContentLoaded', () => {
    window.PlacementsModule.init();
});