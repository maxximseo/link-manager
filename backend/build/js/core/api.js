/**
 * API клиент для работы с backend
 */
class APIClient {
    constructor() {
        this.baseURL = '';  // Use relative URLs
        this.token = localStorage.getItem('token');
    }

    // Установить токен авторизации
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
        }
    }

    // Получить заголовки для запроса
    getHeaders(includeAuth = true) {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (includeAuth && this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }
        
        return headers;
    }

    // Базовый метод для выполнения запросов
    async request(method, endpoint, data = null, includeAuth = true) {
        const url = `${this.baseURL}${endpoint}`;
        const options = {
            method,
            headers: this.getHeaders(includeAuth)
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            const responseData = await response.json();

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${responseData.error || response.statusText}`);
            }

            return responseData;
        } catch (error) {
            console.error(`API ${method} ${endpoint} error:`, error);
            throw error;
        }
    }

    // GET запрос
    async get(endpoint, includeAuth = true) {
        return this.request('GET', endpoint, null, includeAuth);
    }

    // POST запрос
    async post(endpoint, data, includeAuth = true) {
        return this.request('POST', endpoint, data, includeAuth);
    }

    // PUT запрос
    async put(endpoint, data, includeAuth = true) {
        return this.request('PUT', endpoint, data, includeAuth);
    }

    // DELETE запрос
    async delete(endpoint, includeAuth = true) {
        return this.request('DELETE', endpoint, null, includeAuth);
    }

    // --- Методы для авторизации ---
    async login(username, password) {
        const data = await this.post('/api/auth/login', { username, password }, false);
        if (data.token) {
            this.setToken(data.token);
        }
        return data;
    }

    logout() {
        this.setToken(null);
        localStorage.removeItem('user');
    }

    // --- Методы для проектов ---
    async getProjects(page = null, limit = null) {
        let endpoint = '/api/projects';
        if (page && limit) {
            endpoint += `?page=${page}&limit=${limit}`;
        }
        return this.get(endpoint);
    }

    async createProject(name, description) {
        return this.post('/api/projects', { name, description });
    }

    async deleteProject(id) {
        return this.delete(`/api/projects/${id}`);
    }

    async getProject(id) {
        return this.get(`/api/projects/${id}`);
    }

    // --- Методы для сайтов ---
    async getSites(page = null, limit = null) {
        let endpoint = '/api/sites';
        if (page && limit) {
            endpoint += `?page=${page}&limit=${limit}`;
        }
        return this.get(endpoint);
    }

    async createSite(site_url, api_key, max_links, max_articles) {
        return this.post('/api/sites', { site_url, api_key, max_links, max_articles });
    }

    async updateSite(id, max_links, max_articles) {
        return this.put(`/api/sites/${id}`, { max_links, max_articles });
    }

    // --- Методы для размещений ---
    async getPlacements() {
        return this.get('/api/placements');
    }

    async createPlacement(project_id, site_id, link_ids, article_ids) {
        return this.post('/api/placements', {
            project_id,
            site_id,
            link_ids,
            article_ids
        });
    }

    // Batch placement
    async createBatchPlacement(project_id, site_ids, link_ids, article_ids) {
        return this.post('/api/placements/batch/create', {
            project_id,
            site_ids,
            link_ids,
            article_ids
        });
    }

    async deletePlacements(placement_ids) {
        return this.post('/api/placements/delete-multiple', { placement_ids });
    }

    // --- Методы для статей ---
    async createArticle(project_id, title, content, slug) {
        return this.post(`/api/projects/${project_id}/articles`, {
            title,
            content,
            slug
        });
    }

    async updateArticle(project_id, article_id, title, content, slug) {
        return this.put(`/api/projects/${project_id}/articles/${article_id}`, {
            title,
            content,
            slug
        });
    }

    // --- Методы для ссылок ---
    async createLink(project_id, html) {
        return this.post(`/api/projects/${project_id}/links`, { html });
    }

    async createBulkLinks(project_id, html) {
        return this.post(`/api/projects/${project_id}/links/bulk`, { html });
    }

    // --- Методы для Queue мониторинга ---
    async getQueueJob(queueName, jobId) {
        return this.get(`/api/queue/jobs/${queueName}/${jobId}`);
    }

    async getQueueJobs(queueName = null, status = null, limit = 20) {
        let endpoint = '/api/queue/jobs';
        const params = new URLSearchParams();
        
        if (queueName) params.append('queueName', queueName);
        if (status) params.append('status', status);
        if (limit) params.append('limit', limit);
        
        if (params.toString()) {
            endpoint += '?' + params.toString();
        }
        
        return this.get(endpoint);
    }

    // --- Методы для WordPress ---
    async publishArticle(project_id, site_id, article_ids) {
        return this.post('/api/wordpress/publish', {
            project_id,
            site_id,
            article_ids
        });
    }
}

// Создаем глобальный экземпляр API клиента
window.api = new APIClient();