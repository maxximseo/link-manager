/**
 * Модуль управления проектами
 */
window.ProjectsModule = {
    // Загрузка проектов
    async load(page = null) {
        try {
            const currentPage = page || app.getCurrentPage('projects');
            const limit = app.getItemsPerPage();
            
            console.log('Loading projects...');
            const response = await api.getProjects(currentPage, limit);
            
            if (Array.isArray(response)) {
                // Простой ответ без пагинации
                this.display(response);
                window.PaginationComponent.hide('projects');
            } else {
                // Ответ с пагинацией
                this.display(response.data || []);
                window.PaginationComponent.update('projects', response.pagination);
                app.setCurrentPage('projects', response.pagination.page);
            }
            
        } catch (error) {
            console.error('Error loading projects:', error);
            AppUtils.showNotification('Ошибка загрузки проектов', 'error');
        }
    },

    // Отображение списка проектов
    display(projects) {
        const container = AppUtils.checkElement('projectsList');
        if (!container) return;
        
        if (projects.length === 0) {
            container.innerHTML = `
                <p style="color: #718096; text-align: center; padding: 40px;">
                    Проектов пока нет. Создайте свой первый проект выше!
                </p>
            `;
            return;
        }
        
        const projectsHTML = projects.map(project => {
            const totalPlacements = (project.placed_links_count || 0) + (project.placed_articles_count || 0);
            const createdDate = AppUtils.formatDate(project.created_at);
            
            return `
                <div class="project-card">
                    <div class="project-info">
                        <div class="project-header">
                            <h4 onclick="ProjectsModule.openProject(${project.id})" style="cursor: pointer; color: #667eea;">
                                ${AppUtils.escapeHtml(project.name)}
                            </h4>
                            <div class="project-actions">
                                <button onclick="ProjectsModule.openProject(${project.id})" class="btn btn-sm">
                                    Открыть
                                </button>
                                <button onclick="ProjectsModule.deleteProject(${project.id})" 
                                        class="btn btn-sm btn-danger"
                                        title="Удалить проект">
                                    ✕
                                </button>
                            </div>
                        </div>
                        <p class="project-description">${AppUtils.escapeHtml(project.description || 'Описание не указано')}</p>
                        <div class="project-stats">
                            <span>📅 Создан: ${createdDate}</span>
                            <span>🔗 Ссылок: ${project.links_count || 0}</span>
                            <span>📝 Статей: ${project.articles_count || 0}</span>
                            <span>📍 Размещений: ${AppUtils.formatNumber(totalPlacements)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = projectsHTML;
    },

    // Создание нового проекта
    async handleCreateProject(event) {
        event.preventDefault();
        
        try {
            const nameEl = AppUtils.checkElement('projectName');
            const descriptionEl = AppUtils.checkElement('projectDescription');
            
            if (!nameEl || !descriptionEl) {
                throw new Error('Не найдены поля формы');
            }
            
            const name = nameEl.value.trim();
            const description = descriptionEl.value.trim();
            
            if (!name) {
                AppUtils.showNotification('Введите название проекта', 'warning');
                return;
            }
            
            console.log('Creating project:', name);
            await api.createProject(name, description);
            
            // Очищаем форму
            nameEl.value = '';
            descriptionEl.value = '';
            
            // Перезагружаем список
            await this.load();
            
            AppUtils.showNotification('Проект создан успешно!', 'success');
            
        } catch (error) {
            console.error('Error creating project:', error);
            AppUtils.showNotification(`Ошибка создания проекта: ${error.message}`, 'error');
        }
    },

    // Удаление проекта
    async deleteProject(id) {
        if (!confirm('Вы уверены, что хотите удалить этот проект? Это действие нельзя отменить.')) {
            return;
        }
        
        try {
            console.log('Deleting project:', id);
            await api.deleteProject(id);
            
            // Перезагружаем список
            await this.load();
            
            AppUtils.showNotification('Проект удален', 'success');
            
        } catch (error) {
            console.error('Error deleting project:', error);
            AppUtils.showNotification(`Ошибка удаления проекта: ${error.message}`, 'error');
        }
    },

    // Открытие детального просмотра проекта
    async openProject(id) {
        try {
            console.log('Opening project:', id);
            
            // Загружаем детальную информацию
            const project = await api.getProject(id);
            
            if (window.ProjectModal && typeof window.ProjectModal.show === 'function') {
                window.ProjectModal.show(project);
            } else {
                console.warn('ProjectModal недоступен — используем уведомление для вывода данных');
                AppUtils.showNotification('Не удалось открыть окно проекта', 'warning');
            }
            
        } catch (error) {
            console.error('Error opening project:', error);
            AppUtils.showNotification(`Ошибка загрузки проекта: ${error.message}`, 'error');
        }
    },

    // Переиспользуется другими модулями для повторного рендера модального окна
    showProjectModal(project, placements = []) {
        if (window.ProjectModal && typeof window.ProjectModal.show === 'function') {
            // Пока размещения не используются, но сохраняем сигнатуру для совместимости
            window.ProjectModal.show(project);
        }
    },

    // Обновление статистики размещений
    async updatePlacementStats() {
        // Перезагружаем проекты для обновления счетчиков размещений
        await this.load();
    },

    // Cyrillic to Latin transliteration mapping
    cyrillicToLatin: {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
        'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        // Uppercase
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
        'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
        'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
        'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '',
        'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    },

    // Transliterate Russian text to Latin
    transliterate(text) {
        return text.split('').map(char => this.cyrillicToLatin[char] || char).join('');
    },

    // Generate slug from title with Russian support
    generateSlug(projectId) {
        const title = document.getElementById(`articleTitle_${projectId}`).value;
        const slugField = document.getElementById(`articleSlug_${projectId}`);
        
        if (slugField && !slugField.dataset.userModified) {
            // Transliterate Russian characters
            const transliterated = this.transliterate(title);
            
            // Convert to slug format
            const slug = transliterated
                .toLowerCase()
                .replace(/[^\w\s-]/g, '') // Remove special characters
                .replace(/\s+/g, '-')     // Replace spaces with hyphens
                .replace(/-+/g, '-')      // Replace multiple hyphens with single hyphen
                .replace(/^-+|-+$/g, '')  // Remove leading/trailing hyphens
                .trim();
            
            slugField.value = slug;
        }
    },

    // Add link to project
    async addLinkToProject(event, projectId) {
        event.preventDefault();
        
        const htmlInput = document.getElementById('linkHtml').value;
        
        // Parse HTML to extract link and context
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlInput, 'text/html');
        const linkElement = doc.querySelector('a');
        
        if (!linkElement) {
            AppUtils.showNotification('Please include a link in HTML format: <a href="url">text</a>', 'error');
            return;
        }
        
        const url = linkElement.getAttribute('href');
        const anchor_text = linkElement.textContent;
        const html_context = htmlInput.trim();
        
        if (!url || !anchor_text) {
            AppUtils.showNotification('Invalid link format. Please check your HTML.', 'error');
            return;
        }
        
        try {
            const response = await api.request(`/api/projects/${projectId}/links`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url, anchor_text, html_context })
            });
            
            if (response.ok) {
                const addLinkForm = document.getElementById('addLinkForm');
                if (addLinkForm) {
                    addLinkForm.reset();
                }
                
                // Reload project details if project modal is open
                if (window.ProjectModal && window.ProjectModal.isOpen) {
                    await window.ProjectModal.loadProject(projectId);
                }
                
                AppUtils.showNotification('Link added successfully!', 'success');
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error adding link:', error);
            AppUtils.showNotification(`Failed to add link: ${error.message}`, 'error');
        }
    },

    // Delete link from project
    async deleteLinkFromProject(projectId, linkId) {
        if (!confirm('Are you sure you want to delete this link?')) return;
        
        try {
            const response = await api.request(`/api/projects/${projectId}/links/${linkId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                // Reload project details if project modal is open
                if (window.ProjectModal && window.ProjectModal.isOpen) {
                    await window.ProjectModal.loadProject(projectId);
                }
                
                AppUtils.showNotification('Link deleted successfully!', 'success');
            } else {
                throw new Error('Failed to delete link');
            }
        } catch (error) {
            console.error('Error deleting link:', error);
            AppUtils.showNotification('Error deleting link', 'error');
        }
    },


    // Initialize slug field event listeners
    initSlugFieldListeners() {
        // Mark slug field as user-modified when manually edited
        document.addEventListener('input', function(e) {
            if (e.target.id && e.target.id.includes('articleSlug_')) {
                e.target.dataset.userModified = 'true';
            }
        });
    }
};

// Global function exports for HTML onclick handlers
window.addLinkToProject = (event, projectId) => {
    return window.ProjectsModule.addLinkToProject(event, projectId);
};

window.deleteLinkFromProject = (projectId, linkId) => {
    return window.ProjectsModule.deleteLinkFromProject(projectId, linkId);
};


window.generateSlug = (projectId) => {
    return window.ProjectsModule.generateSlug(projectId);
};

// Initialize slug field listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.ProjectsModule.initSlugFieldListeners();
});

const PROJECT_MODAL_IDS = {
    modal: 'projectModal',
    title: 'modalProjectName',
    content: 'modalProjectContent'
};

function projectModalElement() {
    return document.getElementById(PROJECT_MODAL_IDS.modal);
}

function projectModalTitleElement() {
    return document.getElementById(PROJECT_MODAL_IDS.title);
}

function projectModalContentElement() {
    return document.getElementById(PROJECT_MODAL_IDS.content);
}

function formatProjectModalDate(value) {
    try {
        return new Date(value).toLocaleString('ru-RU');
    } catch (error) {
        return value || '';
    }
}

function renderProjectModalLinks(project) {
    const links = project.links || [];
    const projectId = project.id;

    const listHtml = links.length > 0
        ? links.map(link => `
            <div class="project-item">
                <div class="project-item-main">
                    <div class="project-item-title">${AppUtils.escapeHtml(link.anchor_text || link.url || 'Без названия')}</div>
                    <div class="project-item-meta">${AppUtils.escapeHtml(link.url || '')}</div>
                    ${link.html_context ? `<div class="project-item-context">${link.html_context}</div>` : ''}
                </div>
                <div class="project-item-actions">
                    <button class="btn btn-sm btn-danger" onclick="deleteLinkFromProject(${projectId}, ${link.id})">✕</button>
                </div>
            </div>`).join('')
        : '<p style="color:#718096;">Ссылки ещё не добавлены.</p>';

    return `
        <section class="modal-section">
            <div class="modal-section-header">
                <h4>Ссылки <span class="badge">${links.length}</span></h4>
            </div>
            <div class="modal-section-body">
                ${listHtml}
            </div>
            <div class="modal-section-footer">
                <form id="addLinkForm" onsubmit="ProjectsModule.addLinkToProject(event, ${projectId})" class="form-vertical">
                    <label for="linkHtml">HTML ссылка:</label>
                    <textarea id="linkHtml" rows="3" placeholder="&lt;a href=&quot;https://example.com&quot;&gt;Анкор&lt;/a&gt;" required></textarea>
                    <div class="form-actions">
                        <button type="submit" class="btn">Добавить ссылку</button>
                    </div>
                </form>
                <div class="bulk-section">
                    <h5>Массовый импорт</h5>
                    <textarea id="bulkLinksInput" rows="4" placeholder="Одна ссылка на строку или HTML"></textarea>
                    <div class="form-actions" style="gap:10px;">
                        <button class="btn btn-secondary" type="button" onclick="BulkLinksModule.previewBulkLinks(${projectId})">Предпросмотр</button>
                        <button class="btn" type="button" onclick="BulkLinksModule.importBulkLinks(${projectId})">Импортировать</button>
                    </div>
                    <div id="bulkPreview" style="display:none;"></div>
                </div>
            </div>
        </section>
    `;
}

function renderProjectModalArticles(project) {
    const articles = project.articles || [];
    const projectId = project.id;

    const listHtml = articles.length > 0
        ? articles.map(article => {
            const created = article.created_at ? formatProjectModalDate(article.created_at) : '';
            return `
                <div class="project-item">
                    <div class="project-item-main">
                        <div class="project-item-title">${AppUtils.escapeHtml(article.title || 'Без заголовка')}</div>
                        <div class="project-item-meta">${article.slug ? AppUtils.escapeHtml(article.slug) : '&lt;без слага&gt;'}</div>
                        ${created ? `<div class="project-item-meta">Создано: ${created}</div>` : ''}
                    </div>
                    <div class="project-item-actions" style="gap:6px;">
                        <button class="btn btn-sm" onclick="ArticlesModule.editArticle(${projectId}, ${article.id})">✎</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteArticleFromProject(${projectId}, ${article.id})">✕</button>
                    </div>
                </div>`;
        }).join('')
        : '<p style="color:#718096;">Статей пока нет.</p>';

    return `
        <section class="modal-section">
            <div class="modal-section-header">
                <h4>Статьи <span class="badge">${articles.length}</span></h4>
            </div>
            <div class="modal-section-body">
                ${listHtml}
            </div>
            <div class="modal-section-footer">
                <form onsubmit="ArticlesModule.addArticleToProject(event, ${projectId})" class="form-vertical">
                    <label for="articleTitle_${projectId}">Заголовок</label>
                    <input id="articleTitle_${projectId}" type="text" placeholder="Новый заголовок" required>
                    <label for="articleSlug_${projectId}">Слаг (необязательно)</label>
                    <input id="articleSlug_${projectId}" type="text" placeholder="будет сгенерирован автоматически">
                    <textarea id="articleContent_${projectId}" style="display:none;"></textarea>
                    <label>Содержимое</label>
                    <div id="quillEditor_${projectId}" class="quill-editor"></div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="ProjectsModule.generateSlug(${projectId})">Сгенерировать слаг</button>
                        <button type="submit" class="btn">Сохранить статью</button>
                    </div>
                </form>
            </div>
        </section>
    `;
}

function renderProjectModalMeta(project) {
    const created = project.created_at ? formatProjectModalDate(project.created_at) : '-';
    const updated = project.updated_at ? formatProjectModalDate(project.updated_at) : '-';
    const description = project.description ? AppUtils.escapeHtml(project.description) : 'Описание не указано';

    return `
        <section class="modal-section">
            <div class="modal-section-header">
                <h4>Информация</h4>
            </div>
            <div class="modal-section-body project-meta">
                <p><strong>ID проекта:</strong> ${project.id}</p>
                <p><strong>Создан:</strong> ${created}</p>
                <p><strong>Обновлён:</strong> ${updated}</p>
                <p><strong>Описание:</strong> ${description}</p>
            </div>
        </section>
    `;
}

function renderProjectModal(project) {
    const titleEl = projectModalTitleElement();
    const contentEl = projectModalContentElement();

    if (!titleEl || !contentEl) {
        console.error('ProjectModal: не удалось найти элементы модального окна');
        return;
    }

    titleEl.textContent = project.name || 'Проект';

    const sections = [
        renderProjectModalMeta(project),
        renderProjectModalLinks(project),
        renderProjectModalArticles(project)
    ];

    contentEl.innerHTML = sections.join('\n');

    if (window.ArticlesModule && typeof window.ArticlesModule.initializeQuillEditor === 'function') {
        setTimeout(() => {
            window.ArticlesModule.initializeQuillEditor(project.id);
        }, 0);
    }
}

window.ProjectModal = {
    currentProjectId: null,

    show(project) {
        if (!project || typeof project !== 'object') {
            console.error('ProjectModal.show: некорректные данные проекта', project);
            return;
        }

        this.currentProjectId = project.id;
        renderProjectModal(project);

        if (window.ModalsComponent) {
            window.ModalsComponent.openModal(PROJECT_MODAL_IDS.modal);
        } else {
            const modal = projectModalElement();
            if (modal) {
                modal.classList.add('active');
            }
        }
    },

    close() {
        this.currentProjectId = null;

        if (window.ModalsComponent) {
            window.ModalsComponent.closeModal(PROJECT_MODAL_IDS.modal);
        } else {
            const modal = projectModalElement();
            if (modal) {
                modal.classList.remove('active');
            }
        }
    },

    async loadProject(projectId) {
        try {
            const id = projectId || this.currentProjectId;
            if (!id) {
                return;
            }

            const project = await window.api.getProject(id);
            if (!project) {
                throw new Error('Проект не найден');
            }

            this.show(project);
        } catch (error) {
            console.error('ProjectModal.loadProject error:', error);
            AppUtils.showNotification(`Не удалось обновить проект: ${error.message}`, 'error');
        }
    }
};

Object.defineProperty(window.ProjectModal, 'isOpen', {
    get() {
        const modal = projectModalElement();
        return !!(modal && modal.classList.contains('active'));
    }
});

