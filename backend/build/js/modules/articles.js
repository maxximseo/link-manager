/**
 * Модуль управления статьями
 */
window.ArticlesModule = {
    
    // Добавление статьи к проекту
    async addArticleToProject(event, projectId) {
        event.preventDefault();
        
        try {
            const titleEl = AppUtils.checkElement(`articleTitle_${projectId}`);
            const contentEl = AppUtils.checkElement(`articleContent_${projectId}`);
            
            if (!titleEl || !contentEl) {
                throw new Error('Не найдены поля формы');
            }
            
            const title = titleEl.value.trim();
            let content = '';
            
            // Получаем контент из Quill редактора
            const quillEditor = window[`quillEditor_${projectId}`];
            if (quillEditor) {
                content = quillEditor.root.innerHTML;
                
                // Проверяем на пустоту (Quill добавляет <p><br></p> для пустого контента)
                const textContent = quillEditor.getText().trim();
                if (!textContent) {
                    content = '';
                }
            }
            
            if (!title) {
                AppUtils.showNotification('Введите заголовок статьи', 'warning');
                return;
            }
            
            if (!content) {
                AppUtils.showNotification('Введите содержимое статьи', 'warning');
                return;
            }
            
            console.log('Adding article to project:', projectId);
            
            // Создаем слаг из заголовка
            const slug = AppUtils.generateSlug(title);
            
            const response = await api.addProjectArticle(projectId, title, content, slug);
            
            if (response.success) {
                // Очищаем форму
                titleEl.value = '';
                if (quillEditor) {
                    quillEditor.setContents([]);
                }
                
                // Обновляем отображение проекта
                AppUtils.showNotification('Статья добавлена успешно!', 'success');
                
                // Перезагружаем детали проекта если модальное окно открыто
                const modal = document.getElementById('projectModal');
                if (modal && modal.classList.contains('active')) {
                    const projectNameEl = document.getElementById('modalProjectName');
                    if (projectNameEl && projectNameEl.textContent) {
                        // Найти ID проекта и обновить модальное окно
                        await this.refreshProjectModal(projectId);
                    }
                }
                
                // Обновляем список проектов
                if (window.ProjectsModule) {
                    await window.ProjectsModule.load();
                }
                
            } else {
                throw new Error(response.error || 'Неизвестная ошибка');
            }
            
        } catch (error) {
            console.error('Error adding article:', error);
            AppUtils.showNotification(`Ошибка добавления статьи: ${error.message}`, 'error');
        }
    },

    // Редактирование статьи
    async editArticle(projectId, articleId) {
        try {
            console.log('Editing article:', articleId);
            
            // Загружаем данные статьи
            const article = await api.getArticle(projectId, articleId);
            
            if (!article) {
                throw new Error('Статья не найдена');
            }
            
            // Открываем модальное окно редактирования
            const modal = document.getElementById('editArticleModal');
            const modalBody = document.getElementById('editArticleModalBody');
            
            modalBody.innerHTML = this.generateEditArticleForm(article, projectId);
            modal.classList.add('active');
            
            // Инициализируем Quill редактор
            setTimeout(() => {
                this.initializeEditQuillEditor(article.content);
            }, 100);
            
        } catch (error) {
            console.error('Error editing article:', error);
            AppUtils.showNotification(`Ошибка редактирования статьи: ${error.message}`, 'error');
        }
    },

    // Генерация формы редактирования статьи
    generateEditArticleForm(article, projectId) {
        return `
            <form onsubmit="ArticlesModule.updateArticle(event)" style="padding: 0;">
                <input type="hidden" id="editArticleId" value="${article.id}">
                <input type="hidden" id="editProjectId" value="${projectId}">
                
                <div class="form-group">
                    <label for="editArticleTitle">Заголовок статьи:</label>
                    <input type="text" id="editArticleTitle" value="${AppUtils.escapeHtml(article.title)}" required>
                </div>
                
                <div class="form-group">
                    <label for="editArticleSlug">Слаг (URL):</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="editArticleSlug" value="${AppUtils.escapeHtml(article.slug)}" style="flex: 1;">
                        <button type="button" onclick="ArticlesModule.generateEditSlug()" class="btn btn-secondary">
                            Сгенерировать
                        </button>
                    </div>
                    <small style="color: #666;">Оставьте пустым для автогенерации из заголовка</small>
                </div>
                
                <div class="form-group">
                    <label>Содержимое статьи:</label>
                    <div id="editQuillEditor" style="min-height: 300px; border: 1px solid #ccc; border-radius: 4px;"></div>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: space-between;">
                    <div>
                        <button type="button" onclick="ArticlesModule.openHtmlEditor()" class="btn btn-secondary">
                            HTML код
                        </button>
                    </div>
                    <div>
                        <button type="button" onclick="ArticlesModule.closeEditArticleModal()" class="btn btn-secondary">
                            Отмена
                        </button>
                        <button type="submit" class="btn" style="margin-left: 10px;">
                            Сохранить
                        </button>
                    </div>
                </div>
            </form>
        `;
    },

    // Инициализация Quill редактора для редактирования
    initializeEditQuillEditor(content) {
        if (!window.Quill) {
            console.error('Quill is not loaded');
            return;
        }
        
        // Уничтожаем существующий редактор если есть
        if (window.editQuillInstance) {
            window.editQuillInstance = null;
        }
        
        const container = document.getElementById('editQuillEditor');
        if (!container) {
            console.error('Edit Quill container not found');
            return;
        }
        
        // Создаем новый редактор
        window.editQuillInstance = new Quill('#editQuillEditor', {
            theme: 'snow',
            placeholder: 'Начните писать статью...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    ['blockquote', 'code-block'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'script': 'sub'}, { 'script': 'super' }],
                    [{ 'indent': '-1'}, { 'indent': '+1' }],
                    [{ 'direction': 'rtl' }],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'font': [] }],
                    [{ 'align': [] }],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        });
        
        // Загружаем содержимое
        if (content) {
            window.editQuillInstance.root.innerHTML = content;
        }
    },

    // Генерация слага для редактируемой статьи
    generateEditSlug() {
        const titleEl = document.getElementById('editArticleTitle');
        const slugEl = document.getElementById('editArticleSlug');
        
        if (titleEl && slugEl) {
            const slug = AppUtils.generateSlug(titleEl.value);
            slugEl.value = slug;
        }
    },

    // Обновление статьи
    async updateArticle(event) {
        event.preventDefault();
        
        try {
            const articleId = document.getElementById('editArticleId').value;
            const projectId = document.getElementById('editProjectId').value;
            const title = document.getElementById('editArticleTitle').value.trim();
            const slug = document.getElementById('editArticleSlug').value.trim();
            
            if (!title) {
                AppUtils.showNotification('Введите заголовок статьи', 'warning');
                return;
            }
            
            let content = '';
            if (window.editQuillInstance) {
                content = window.editQuillInstance.root.innerHTML;
                
                // Проверяем на пустоту
                const textContent = window.editQuillInstance.getText().trim();
                if (!textContent) {
                    AppUtils.showNotification('Введите содержимое статьи', 'warning');
                    return;
                }
            }
            
            console.log('Updating article:', articleId);
            
            // Генерируем слаг если не указан
            const finalSlug = slug || AppUtils.generateSlug(title);
            
            const response = await api.updateArticle(projectId, articleId, title, content, finalSlug);
            
            if (response.success) {
                AppUtils.showNotification('Статья обновлена успешно!', 'success');
                this.closeEditArticleModal();
                
                // Обновляем проекты и модальное окно
                if (window.ProjectsModule) {
                    await window.ProjectsModule.load();
                }
                
                // Если модальное окно проекта открыто, обновляем его
                await this.refreshProjectModal(projectId);
                
            } else {
                throw new Error(response.error || 'Неизвестная ошибка');
            }
            
        } catch (error) {
            console.error('Error updating article:', error);
            AppUtils.showNotification(`Ошибка обновления статьи: ${error.message}`, 'error');
        }
    },

    // Закрытие модального окна редактирования статьи
    closeEditArticleModal() {
        const modal = document.getElementById('editArticleModal');
        modal.classList.remove('active');
        
        // Уничтожаем редактор
        if (window.editQuillInstance) {
            window.editQuillInstance = null;
        }
    },

    // Открытие HTML редактора
    openHtmlEditor() {
        if (!window.editQuillInstance) {
            AppUtils.showNotification('Редактор не инициализирован', 'warning');
            return;
        }
        
        // Получаем HTML контент
        const htmlContent = window.editQuillInstance.root.innerHTML;
        
        // Показываем модальное окно HTML редактора
        const modal = document.getElementById('htmlEditorModal');
        const textarea = document.getElementById('htmlSourceEditor');
        
        if (modal && textarea) {
            textarea.value = this.formatHtml(htmlContent);
            modal.classList.add('active');
            this.updateLineNumbers();
        }
    },

    // Форматирование HTML для читаемости
    formatHtml(html) {
        // Простое форматирование HTML
        return html
            .replace(/></g, '>\n<')
            .replace(/^\s+|\s+$/g, '')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');
    },

    // Обновление номеров строк
    updateLineNumbers() {
        const textarea = document.getElementById('htmlSourceEditor');
        const lineNumbers = document.getElementById('lineNumbers');
        
        if (textarea && lineNumbers) {
            const lines = textarea.value.split('\n').length;
            const numbers = Array.from({length: lines}, (_, i) => i + 1).join('\n');
            lineNumbers.textContent = numbers;
        }
    },

    // Очистка HTML
    clearHtml() {
        const textarea = document.getElementById('htmlSourceEditor');
        if (textarea) {
            textarea.value = '';
            this.updateLineNumbers();
        }
    },

    // Сохранение HTML контента
    saveHtmlContent() {
        const textarea = document.getElementById('htmlSourceEditor');
        if (textarea && window.editQuillInstance) {
            window.editQuillInstance.root.innerHTML = textarea.value;
            this.closeHtmlEditor();
        }
    },

    // Закрытие HTML редактора
    closeHtmlEditor() {
        const modal = document.getElementById('htmlEditorModal');
        modal.classList.remove('active');
    },

    // Удаление статьи из проекта
    async deleteArticleFromProject(projectId, articleId) {
        if (!confirm('Вы уверены, что хотите удалить эту статью?')) {
            return;
        }
        
        try {
            console.log('Deleting article:', articleId, 'from project:', projectId);
            
            const response = await api.deleteProjectArticle(projectId, articleId);
            
            if (response.success) {
                AppUtils.showNotification('Статья удалена успешно!', 'success');
                
                // Обновляем список проектов
                if (window.ProjectsModule) {
                    await window.ProjectsModule.load();
                }
                
                // Обновляем модальное окно проекта если открыто
                await this.refreshProjectModal(projectId);
                
            } else {
                throw new Error(response.error || 'Неизвестная ошибка');
            }
            
        } catch (error) {
            console.error('Error deleting article:', error);
            AppUtils.showNotification(`Ошибка удаления статьи: ${error.message}`, 'error');
        }
    },

    // Обновление модального окна проекта
    async refreshProjectModal(projectId) {
        const modal = document.getElementById('projectModal');
        if (!modal || !modal.classList.contains('active')) {
            return;
        }
        
        try {
            // Загружаем обновленные данные проекта
            const project = await api.getProject(projectId);
            const placements = await api.getProjectPlacements(projectId);
            
            if (window.ProjectsModule && window.ProjectsModule.showProjectModal) {
                // Закрываем и открываем заново
                modal.classList.remove('active');
                setTimeout(() => {
                    window.ProjectsModule.showProjectModal(project, placements);
                }, 100);
            }
            
        } catch (error) {
            console.error('Error refreshing project modal:', error);
        }
    },

    // Инициализация Quill редактора для проекта
    initializeQuillEditor(projectId) {
        if (!window.Quill) {
            console.error('Quill is not loaded');
            return;
        }
        
        const containerId = `quillEditor_${projectId}`;
        const container = document.getElementById(containerId);
        
        if (!container) {
            console.error(`Quill container ${containerId} not found`);
            return;
        }
        
        // Проверяем, не инициализирован ли уже
        if (window[`quillEditor_${projectId}`]) {
            return;
        }
        
        // Создаем редактор
        const quill = new Quill(`#${containerId}`, {
            theme: 'snow',
            placeholder: 'Начните писать статью...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    ['blockquote', 'code-block'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'script': 'sub'}, { 'script': 'super' }],
                    [{ 'indent': '-1'}, { 'indent': '+1' }],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'font': [] }],
                    [{ 'align': [] }],
                    ['link'],
                    ['clean']
                ]
            }
        });
        
        // Сохраняем экземпляр
        window[`quillEditor_${projectId}`] = quill;
        
        console.log(`Quill editor initialized for project ${projectId}`);
    },

    // Уничтожение Quill редактора
    destroyQuillEditor(projectId) {
        const editorInstance = window[`quillEditor_${projectId}`];
        if (editorInstance) {
            // Quill не имеет метода destroy, поэтому просто удаляем ссылку
            delete window[`quillEditor_${projectId}`];
            console.log(`Quill editor destroyed for project ${projectId}`);
        }
    },

    // Инициализация модуля
    init() {
        console.log('Articles module initialized');
        
        // Добавляем обработчик для HTML редактора
        const htmlTextarea = document.getElementById('htmlSourceEditor');
        if (htmlTextarea) {
            htmlTextarea.addEventListener('input', () => {
                this.updateLineNumbers();
            });
        }
    }
};

// Глобальные функции для совместимости
window.addArticleToProject = (event, projectId) => {
    return window.ArticlesModule.addArticleToProject(event, projectId);
};

window.editArticle = (projectId, articleId) => {
    return window.ArticlesModule.editArticle(projectId, articleId);
};

window.deleteArticleFromProject = (projectId, articleId) => {
    return window.ArticlesModule.deleteArticleFromProject(projectId, articleId);
};

window.generateEditSlug = () => {
    return window.ArticlesModule.generateEditSlug();
};

window.updateArticle = (event) => {
    return window.ArticlesModule.updateArticle(event);
};

window.closeEditArticleModal = () => {
    return window.ArticlesModule.closeEditArticleModal();
};

window.openHtmlEditor = () => {
    return window.ArticlesModule.openHtmlEditor();
};

window.formatHtml = () => {
    return window.ArticlesModule.formatHtml();
};

window.clearHtml = () => {
    return window.ArticlesModule.clearHtml();
};

window.saveHtmlContent = () => {
    return window.ArticlesModule.saveHtmlContent();
};

window.closeHtmlEditor = () => {
    return window.ArticlesModule.closeHtmlEditor();
};

// Инициализируем модуль при загрузке
document.addEventListener('DOMContentLoaded', () => {
    window.ArticlesModule.init();
});