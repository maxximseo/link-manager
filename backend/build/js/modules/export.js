/**
 * Модуль экспорта данных
 */
window.ExportModule = {
    
    // Экспорт проекта в TXT
    async exportProjectToTXT(projectId) {
        try {
            console.log('Exporting project to TXT:', projectId);
            
            // Показываем индикатор загрузки
            const progressId = window.NotificationsComponent.showProgress('Подготовка экспорта...', 0);
            
            // Загружаем данные проекта
            const [project, placements] = await Promise.all([
                api.getProject(projectId),
                api.getProjectPlacements(projectId)
            ]);
            
            window.NotificationsComponent.updateProgress(progressId, 30, 'Загрузка размещений...');
            
            if (!project) {
                throw new Error('Проект не найден');
            }
            
            // Собираем все URL размещений
            const allUrls = [];
            
            if (placements && placements.length > 0) {
                // Группируем размещения по сайтам
                const placementsBySite = {};
                
                for (const placement of placements) {
                    const siteUrl = placement.site_url;
                    if (!placementsBySite[siteUrl]) {
                        placementsBySite[siteUrl] = {
                            site_url: siteUrl,
                            links: [],
                            articles: []
                        };
                    }
                    
                    // Добавляем ссылки
                    if (placement.links && placement.links.length > 0) {
                        for (const link of placement.links) {
                            allUrls.push(siteUrl); // Добавляем URL сайта для каждой ссылки
                        }
                    }
                    
                    // Добавляем статьи
                    if (placement.articles && placement.articles.length > 0) {
                        for (const article of placement.articles) {
                            // Для статей добавляем полный URL со слагом
                            const articleUrl = article.slug ? 
                                `${siteUrl.replace(/\/$/, '')}/${article.slug}` : 
                                siteUrl;
                            allUrls.push(articleUrl);
                        }
                    }
                }
            }
            
            window.NotificationsComponent.updateProgress(progressId, 60, 'Формирование файла...');
            
            // Создаем содержимое TXT файла
            let txtContent = `# Экспорт проекта: ${project.name}\n`;
            txtContent += `# Дата экспорта: ${new Date().toLocaleString('ru-RU')}\n`;
            txtContent += `# Всего URL: ${allUrls.length}\n\n`;
            
            if (allUrls.length > 0) {
                txtContent += allUrls.join('\n');
            } else {
                txtContent += '# Размещения отсутствуют';
            }
            
            window.NotificationsComponent.updateProgress(progressId, 80, 'Создание файла...');
            
            // Создаем и скачиваем файл
            this.downloadTextFile(
                txtContent, 
                `project_${AppUtils.generateSlug(project.name)}_export.txt`
            );
            
            window.NotificationsComponent.updateProgress(progressId, 100, 'Экспорт завершен!');
            
            AppUtils.showNotification('Проект экспортирован в TXT!', 'success');
            
        } catch (error) {
            console.error('Error exporting project:', error);
            AppUtils.showNotification(`Ошибка экспорта: ${error.message}`, 'error');
        }
    },

    // Экспорт всех проектов
    async exportAllProjects() {
        try {
            console.log('Exporting all projects...');
            
            const progressId = window.NotificationsComponent.showProgress('Загрузка всех проектов...', 0);
            
            // Получаем все проекты
            const projects = await window.ProjectsModule.getAllProjects();
            
            if (projects.length === 0) {
                AppUtils.showNotification('Нет проектов для экспорта', 'warning');
                return;
            }
            
            let allContent = `# Экспорт всех проектов\n`;
            allContent += `# Дата экспорта: ${new Date().toLocaleString('ru-RU')}\n`;
            allContent += `# Количество проектов: ${projects.length}\n\n`;
            
            for (let i = 0; i < projects.length; i++) {
                const project = projects[i];
                const progress = Math.round((i / projects.length) * 80) + 10;
                
                window.NotificationsComponent.updateProgress(
                    progressId, 
                    progress, 
                    `Обработка проекта: ${project.name}`
                );
                
                // Загружаем размещения проекта
                const placements = await api.getProjectPlacements(project.id);
                
                allContent += `\n## Проект: ${project.name}\n`;
                
                if (placements && placements.length > 0) {
                    const allUrls = [];
                    
                    for (const placement of placements) {
                        const siteUrl = placement.site_url;
                        
                        // Добавляем ссылки
                        if (placement.links && placement.links.length > 0) {
                            for (const link of placement.links) {
                                allUrls.push(siteUrl);
                            }
                        }
                        
                        // Добавляем статьи
                        if (placement.articles && placement.articles.length > 0) {
                            for (const article of placement.articles) {
                                const articleUrl = article.slug ? 
                                    `${siteUrl.replace(/\/$/, '')}/${article.slug}` : 
                                    siteUrl;
                                allUrls.push(articleUrl);
                            }
                        }
                    }
                    
                    if (allUrls.length > 0) {
                        allContent += allUrls.join('\n') + '\n';
                    } else {
                        allContent += '# Размещения отсутствуют\n';
                    }
                } else {
                    allContent += '# Размещения отсутствуют\n';
                }
            }
            
            window.NotificationsComponent.updateProgress(progressId, 90, 'Создание файла...');
            
            // Создаем и скачиваем файл
            this.downloadTextFile(allContent, `all_projects_export_${Date.now()}.txt`);
            
            window.NotificationsComponent.updateProgress(progressId, 100, 'Экспорт завершен!');
            AppUtils.showNotification('Все проекты экспортированы!', 'success');
            
        } catch (error) {
            console.error('Error exporting all projects:', error);
            AppUtils.showNotification(`Ошибка экспорта: ${error.message}`, 'error');
        }
    },

    // Экспорт в CSV формате
    async exportProjectToCSV(projectId) {
        try {
            console.log('Exporting project to CSV:', projectId);
            
            const progressId = window.NotificationsComponent.showProgress('Подготовка CSV экспорта...', 0);
            
            const [project, placements] = await Promise.all([
                api.getProject(projectId),
                api.getProjectPlacements(projectId)
            ]);
            
            window.NotificationsComponent.updateProgress(progressId, 50, 'Формирование CSV...');
            
            // Заголовки CSV
            let csvContent = 'Проект,Тип,Заголовок/Текст,URL,Сайт размещения,Дата размещения\n';
            
            if (placements && placements.length > 0) {
                for (const placement of placements) {
                    const siteUrl = placement.site_url;
                    const placedAt = placement.placed_at ? 
                        new Date(placement.placed_at).toLocaleDateString('ru-RU') : '';
                    
                    // Добавляем ссылки
                    if (placement.links && placement.links.length > 0) {
                        for (const link of placement.links) {
                            csvContent += `"${this.escapeCsv(project.name)}",`;
                            csvContent += `"Ссылка",`;
                            csvContent += `"${this.escapeCsv(link.anchor_text || '')}",`;
                            csvContent += `"${this.escapeCsv(link.target_url || '')}",`;
                            csvContent += `"${this.escapeCsv(siteUrl)}",`;
                            csvContent += `"${placedAt}"\n`;
                        }
                    }
                    
                    // Добавляем статьи
                    if (placement.articles && placement.articles.length > 0) {
                        for (const article of placement.articles) {
                            const articleUrl = article.slug ? 
                                `${siteUrl.replace(/\/$/, '')}/${article.slug}` : 
                                siteUrl;
                            
                            csvContent += `"${this.escapeCsv(project.name)}",`;
                            csvContent += `"Статья",`;
                            csvContent += `"${this.escapeCsv(article.title || '')}",`;
                            csvContent += `"${this.escapeCsv(articleUrl)}",`;
                            csvContent += `"${this.escapeCsv(siteUrl)}",`;
                            csvContent += `"${placedAt}"\n`;
                        }
                    }
                }
            }
            
            window.NotificationsComponent.updateProgress(progressId, 90, 'Создание файла...');
            
            // Создаем и скачиваем файл
            this.downloadTextFile(
                csvContent, 
                `project_${AppUtils.generateSlug(project.name)}_export.csv`,
                'text/csv'
            );
            
            window.NotificationsComponent.updateProgress(progressId, 100, 'CSV экспорт завершен!');
            AppUtils.showNotification('Проект экспортирован в CSV!', 'success');
            
        } catch (error) {
            console.error('Error exporting to CSV:', error);
            AppUtils.showNotification(`Ошибка CSV экспорта: ${error.message}`, 'error');
        }
    },

    // Экранирование для CSV
    escapeCsv(text) {
        if (typeof text !== 'string') return '';
        return text.replace(/"/g, '""');
    },

    // Скачивание текстового файла
    downloadTextFile(content, filename, mimeType = 'text/plain') {
        // Создаем Blob
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
        
        // Создаем URL
        const url = URL.createObjectURL(blob);
        
        // Создаем временную ссылку для скачивания
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        // Добавляем в DOM, кликаем и удаляем
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Освобождаем URL
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 100);
        
        console.log(`File downloaded: ${filename}`);
    },

    // Экспорт статистики проекта
    async exportProjectStats(projectId) {
        try {
            const [project, placements] = await Promise.all([
                api.getProject(projectId),
                api.getProjectPlacements(projectId)
            ]);
            
            if (!project) {
                throw new Error('Проект не найден');
            }
            
            // Собираем статистику
            let totalLinks = 0;
            let totalArticles = 0;
            let totalSites = new Set();
            
            const siteStats = {};
            
            if (placements && placements.length > 0) {
                for (const placement of placements) {
                    const siteUrl = placement.site_url;
                    totalSites.add(siteUrl);
                    
                    if (!siteStats[siteUrl]) {
                        siteStats[siteUrl] = { links: 0, articles: 0 };
                    }
                    
                    if (placement.links) {
                        totalLinks += placement.links.length;
                        siteStats[siteUrl].links += placement.links.length;
                    }
                    
                    if (placement.articles) {
                        totalArticles += placement.articles.length;
                        siteStats[siteUrl].articles += placement.articles.length;
                    }
                }
            }
            
            // Формируем отчет
            let report = `# Статистика проекта: ${project.name}\n`;
            report += `# Дата создания отчета: ${new Date().toLocaleString('ru-RU')}\n\n`;
            report += `## Общая статистика\n`;
            report += `- Всего сайтов: ${totalSites.size}\n`;
            report += `- Всего ссылок: ${totalLinks}\n`;
            report += `- Всего статей: ${totalArticles}\n`;
            report += `- Всего размещений: ${totalLinks + totalArticles}\n\n`;
            
            if (Object.keys(siteStats).length > 0) {
                report += `## Статистика по сайтам\n\n`;
                
                for (const [siteUrl, stats] of Object.entries(siteStats)) {
                    report += `### ${siteUrl}\n`;
                    report += `- Ссылки: ${stats.links}\n`;
                    report += `- Статьи: ${stats.articles}\n`;
                    report += `- Всего: ${stats.links + stats.articles}\n\n`;
                }
            }
            
            this.downloadTextFile(
                report,
                `project_${AppUtils.generateSlug(project.name)}_stats.txt`
            );
            
            AppUtils.showNotification('Статистика проекта экспортирована!', 'success');
            
        } catch (error) {
            console.error('Error exporting project stats:', error);
            AppUtils.showNotification(`Ошибка экспорта статистики: ${error.message}`, 'error');
        }
    },

    // Инициализация модуля
    init() {
        console.log('Export module initialized');
    }
};

// Глобальные функции для совместимости
window.exportProjectToTXT = (projectId) => {
    return window.ExportModule.exportProjectToTXT(projectId);
};

// Инициализируем модуль при загрузке
document.addEventListener('DOMContentLoaded', () => {
    window.ExportModule.init();
});