/**
 * WordPress Integration Module
 * Handles publishing articles to WordPress sites and processing WordPress-specific placement logic
 */
window.WordPressModule = {

    // Initialize WordPress module
    init() {
        console.log('WordPress module initialized');
    },

    // Check if a site is a WordPress site (has API key)
    isWordPressSite(site) {
        return site && site.api_key && site.api_key.trim() !== '';
    },

    // Publish a single article to WordPress
    async publishArticleToWordPress(siteId, articleId) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${window.API_URL || ''}/api/wordpress/publish-article`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    site_id: parseInt(siteId),
                    article_id: parseInt(articleId)
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                console.log(`Article ${articleId} published to WordPress:`, result);
                return { success: true, data: result };
            } else {
                console.error(`Failed to publish article ${articleId}:`, result.error);
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error(`Error publishing article ${articleId}:`, error);
            return { success: false, error: error.message };
        }
    },

    // Publish multiple articles to WordPress
    async publishArticlesToWordPress(siteId, articleIds) {
        const results = {
            successful: 0,
            failed: 0,
            errors: []
        };

        for (const articleId of articleIds) {
            const result = await this.publishArticleToWordPress(siteId, articleId);
            
            if (result.success) {
                results.successful++;
            } else {
                results.failed++;
                results.errors.push(`Article ${articleId}: ${result.error}`);
            }
        }

        return results;
    },

    // Create placement for links (non-WordPress or when no articles)
    async createLinksPlacement(projectId, siteId, linkIds) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${window.API_URL || ''}/api/placements`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    project_id: parseInt(projectId),
                    site_id: parseInt(siteId),
                    link_ids: linkIds
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    linksPlaced: data.links_placed || linkIds.length,
                    data: data
                };
            } else {
                const error = await response.json();
                console.error('Failed to place links:', error);
                return { success: false, error: error.error || 'Failed to place links' };
            }
        } catch (error) {
            console.error('Error creating links placement:', error);
            return { success: false, error: error.message };
        }
    },

    // Create regular placement (for non-WordPress sites or mixed content)
    async createRegularPlacement(projectId, siteId, linkIds = [], articleIds = []) {
        try {
            const token = localStorage.getItem('token');
            const requestData = {
                project_id: parseInt(projectId),
                site_id: parseInt(siteId)
            };
            
            // Add only non-empty arrays
            if (linkIds.length > 0) {
                requestData.link_ids = linkIds;
            }
            if (articleIds.length > 0) {
                requestData.article_ids = articleIds;
            }
            
            console.log('Sending placement request:', requestData);
            
            const response = await fetch(`${window.API_URL || ''}/api/placements`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(requestData)
            });
            
            if (response.ok) {
                const data = await response.json();
                return { success: true, data: data };
            } else {
                const error = await response.json();
                return { success: false, error: error.error || 'Failed to create placement' };
            }
        } catch (error) {
            console.error('Error creating regular placement:', error);
            return { success: false, error: error.message };
        }
    },

    // Process WordPress placement with intelligent routing
    async processWordPressPlacement(projectId, siteId, linkIds = [], articleIds = []) {
        const selectedSite = window.allSites ? window.allSites.find(s => s.id === parseInt(siteId)) : null;
        const isWordPressSite = this.isWordPressSite(selectedSite);
        
        const results = {
            articles: { successful: 0, failed: 0, errors: [] },
            links: { success: false, placed: 0, error: null },
            messages: []
        };

        if (isWordPressSite && articleIds.length > 0) {
            // For WordPress sites with articles, publish directly to WordPress
            const articleResults = await this.publishArticlesToWordPress(siteId, articleIds);
            results.articles = articleResults;

            // Add article results to messages
            if (articleResults.successful > 0) {
                results.messages.push(`✅ ${articleResults.successful} article(s) published to WordPress`);
            }
            if (articleResults.failed > 0) {
                results.messages.push(`⚠️ ${articleResults.failed} article(s) failed to publish`);
            }

            // Handle links separately if there are any
            if (linkIds.length > 0) {
                const linksResult = await this.createLinksPlacement(projectId, siteId, linkIds);
                results.links = linksResult;

                if (linksResult.success) {
                    results.messages.push(`🔗 ${linksResult.linksPlaced} link(s) placed successfully`);
                } else {
                    results.messages.push(`❌ Failed to place links: ${linksResult.error}`);
                }
            }

            return results;
        } else {
            // For non-WordPress sites or only links, use regular placement
            const placementResult = await this.createRegularPlacement(projectId, siteId, linkIds, articleIds);
            
            if (placementResult.success) {
                const data = placementResult.data;
                let message = 'Placement created successfully';
                
                if (data.links_placed) {
                    message += `\n🔗 ${data.links_placed} link(s) placed`;
                }
                if (data.articles_placed) {
                    message += `\n📄 ${data.articles_placed} article(s) placed`;
                }
                
                results.messages.push(message);
                results.links = { success: true, placed: data.links_placed || 0 };
            } else {
                results.messages.push(`❌ Failed to create placement: ${placementResult.error}`);
                results.links = { success: false, error: placementResult.error };
            }

            return results;
        }
    },

    // Process batch WordPress placements (for queue integration)
    async processBatchWordPressPlacement(placements) {
        const batchResults = {
            totalProcessed: 0,
            successful: 0,
            failed: 0,
            results: []
        };

        for (const placement of placements) {
            const { projectId, siteId, linkIds = [], articleIds = [] } = placement;
            
            try {
                const result = await this.processWordPressPlacement(projectId, siteId, linkIds, articleIds);
                
                batchResults.totalProcessed++;
                
                if (result.articles.failed === 0 && result.links.success !== false) {
                    batchResults.successful++;
                } else {
                    batchResults.failed++;
                }
                
                batchResults.results.push({
                    siteId: siteId,
                    success: result.articles.failed === 0 && result.links.success !== false,
                    messages: result.messages,
                    details: result
                });
                
            } catch (error) {
                console.error(`Error processing placement for site ${siteId}:`, error);
                batchResults.totalProcessed++;
                batchResults.failed++;
                batchResults.results.push({
                    siteId: siteId,
                    success: false,
                    error: error.message
                });
            }
        }

        return batchResults;
    },

    // Get WordPress site info
    getWordPressSiteInfo(siteId) {
        const site = window.allSites ? window.allSites.find(s => s.id === parseInt(siteId)) : null;
        
        if (!site) {
            return { exists: false };
        }

        return {
            exists: true,
            isWordPress: this.isWordPressSite(site),
            url: site.site_url,
            apiKey: site.api_key,
            maxLinks: site.max_links,
            maxArticles: site.max_articles,
            usedLinks: site.used_links || 0,
            usedArticles: site.used_articles || 0
        };
    },

    // Check WordPress site capacity
    checkSiteCapacity(siteId, requiredLinks = 0, requiredArticles = 0) {
        const siteInfo = this.getWordPressSiteInfo(siteId);
        
        if (!siteInfo.exists) {
            return { valid: false, error: 'Site not found' };
        }

        const availableLinks = (siteInfo.maxLinks || 10) - (siteInfo.usedLinks || 0);
        const availableArticles = (siteInfo.maxArticles || 5) - (siteInfo.usedArticles || 0);

        const issues = [];
        
        if (requiredLinks > availableLinks) {
            issues.push(`Insufficient link capacity: need ${requiredLinks}, available ${availableLinks}`);
        }
        
        if (requiredArticles > availableArticles) {
            issues.push(`Insufficient article capacity: need ${requiredArticles}, available ${availableArticles}`);
        }

        return {
            valid: issues.length === 0,
            issues: issues,
            capacity: {
                links: { available: availableLinks, required: requiredLinks },
                articles: { available: availableArticles, required: requiredArticles }
            }
        };
    },

    // Format results message for display
    formatResultsMessage(results) {
        if (!results.messages || results.messages.length === 0) {
            return 'Operation completed';
        }
        
        return results.messages.join('\n');
    },

    // Show WordPress placement notification
    showWordPressPlacementResult(results) {
        const message = this.formatResultsMessage(results);
        
        // Determine notification type based on results
        let type = 'success';
        if (results.articles.failed > 0 || (results.links.success === false && results.links.error)) {
            type = 'warning';
        }
        if (results.articles.successful === 0 && results.links.success === false) {
            type = 'error';
        }

        if (window.NotificationsComponent) {
            window.NotificationsComponent.show(message, type, 6000);
        } else if (window.AppUtils && window.AppUtils.showNotification) {
            window.AppUtils.showNotification(message, type);
        } else {
            alert(message);
        }
    },

    // Validate WordPress placement before processing
    validateWordPressPlacement(siteId, linkIds = [], articleIds = []) {
        if (!siteId) {
            return { valid: false, error: 'Site ID is required' };
        }

        if (linkIds.length === 0 && articleIds.length === 0) {
            return { valid: false, error: 'At least one link or article must be selected' };
        }

        const capacityCheck = this.checkSiteCapacity(siteId, linkIds.length, articleIds.length);
        
        if (!capacityCheck.valid) {
            return { 
                valid: false, 
                error: 'Site capacity exceeded: ' + capacityCheck.issues.join(', ')
            };
        }

        return { valid: true };
    }
};

// Global functions for backward compatibility
window.publishArticleToWordPress = (siteId, articleId) => {
    return window.WordPressModule.publishArticleToWordPress(siteId, articleId);
};

window.processWordPressPlacement = (projectId, siteId, linkIds, articleIds) => {
    return window.WordPressModule.processWordPressPlacement(projectId, siteId, linkIds, articleIds);
};

window.isWordPressSite = (site) => {
    return window.WordPressModule.isWordPressSite(site);
};

// Initialize WordPress module when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.WordPressModule.init();
});