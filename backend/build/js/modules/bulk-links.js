/**
 * Bulk Links Import Module
 * Handles bulk import of links from various formats (HTML, pipe-separated, plain URLs)
 */
window.BulkLinksModule = {

    // Parse HTML links from text
    parseHTMLLinks(text) {
        const regex = /<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
        const matches = [...text.matchAll(regex)];
        return matches.map(match => ({
            url: match[1],
            anchor_text: match[2].trim(),
            position: 0
        }));
    },

    // Helper function to generate slug from title (server-side compatible)
    generateSlugFromTitle(title) {
        // Use the transliteration functionality from projects module
        if (window.ProjectsModule && window.ProjectsModule.transliterate) {
            const transliterated = window.ProjectsModule.transliterate(title);
            return transliterated.toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-+|-+$/g, '')
                .trim();
        }
        
        // Fallback if transliteration not available
        return title.toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '')
            .trim();
    },

    // Preview bulk links
    previewBulkLinks(projectId) {
        const input = AppUtils.checkElement('bulkLinksInput');
        const previewDiv = AppUtils.checkElement('bulkPreview');
        
        if (!input || !previewDiv) {
            AppUtils.showNotification('Bulk import elements not found', 'error');
            return;
        }
        
        const inputValue = input.value;
        if (!inputValue.trim()) {
            AppUtils.showNotification('Please enter some links', 'warning');
            return;
        }
        
        const lines = inputValue.trim().split('\n');
        const links = [];
        const errors = [];
        
        lines.forEach((line, index) => {
            if (!line.trim()) return;
            
            // Check for HTML format
            if (line.includes('<a ') && line.includes('href=')) {
                const htmlLinks = this.parseHTMLLinks(line);
                if (htmlLinks.length > 0) {
                    htmlLinks.forEach(link => {
                        if (!link.url.startsWith('http')) {
                            errors.push(`Line ${index + 1}: Invalid URL in HTML - ${link.url}`);
                        } else {
                            links.push(link);
                        }
                    });
                } else {
                    errors.push(`Line ${index + 1}: No valid HTML links found`);
                }
            }
            // Check for pipe format
            else if (line.includes('|')) {
                const parts = line.split('|').map(p => p.trim());
                const url = parts[0];
                const anchor_text = parts[1] || url;
                const position = parseInt(parts[2]) || 0;
                
                if (!url.startsWith('http')) {
                    errors.push(`Line ${index + 1}: Invalid URL - ${url}`);
                } else {
                    links.push({ url, anchor_text, position });
                }
            }
            // Plain URL format
            else {
                const url = line.trim();
                if (!url.startsWith('http')) {
                    errors.push(`Line ${index + 1}: Invalid URL - ${url}`);
                } else {
                    // Extract domain name as anchor text for plain URLs
                    let anchor_text = url;
                    try {
                        const urlObj = new URL(url);
                        anchor_text = urlObj.hostname.replace('www.', '');
                    } catch (e) {}
                    links.push({ url, anchor_text, position: 0 });
                }
            }
        });
        
        previewDiv.innerHTML = `
            <h5>Preview (${links.length} links${errors.length ? `, ${errors.length} errors` : ''})</h5>
            ${errors.length ? `
                <div style="background: #fee; padding: 10px; margin: 10px 0; border-radius: 5px;">
                    <strong style="color: #dc2626;">Errors:</strong><br>
                    ${errors.join('<br>')}
                </div>
            ` : ''}
            <div style="max-height: 200px; overflow-y: auto; background: #f9fafb; padding: 10px; border-radius: 5px;">
                ${links.map((link, i) => `
                    <div style="margin: 5px 0; padding: 5px; background: white; border-radius: 3px;">
                        ${i + 1}. <strong>${AppUtils.escapeHtml(link.anchor_text)}</strong> → ${AppUtils.escapeHtml(link.url)} ${link.position ? `(pos: ${link.position})` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        previewDiv.style.display = 'block';
    },

    // Import bulk links
    async importBulkLinks(projectId) {
        const input = AppUtils.checkElement('bulkLinksInput');
        
        if (!input) {
            AppUtils.showNotification('Bulk import input not found', 'error');
            return;
        }
        
        const inputValue = input.value;
        if (!inputValue.trim()) {
            AppUtils.showNotification('Please enter some links', 'warning');
            return;
        }
        
        const lines = inputValue.trim().split('\n');
        const links = [];
        
        lines.forEach(line => {
            if (!line.trim()) return;
            
            // Check for HTML format
            if (line.includes('<a ') && line.includes('href=')) {
                const htmlLinks = this.parseHTMLLinks(line);
                htmlLinks.forEach(link => {
                    if (link.url.startsWith('http')) {
                        links.push(link);
                    }
                });
            }
            // Check for pipe format
            else if (line.includes('|')) {
                const parts = line.split('|').map(p => p.trim());
                const url = parts[0];
                const anchor_text = parts[1] || url;
                const position = parseInt(parts[2]) || 0;
                
                if (url.startsWith('http')) {
                    links.push({ url, anchor_text, position });
                }
            }
            // Plain URL format
            else {
                const url = line.trim();
                if (url.startsWith('http')) {
                    let anchor_text = url;
                    try {
                        const urlObj = new URL(url);
                        anchor_text = urlObj.hostname.replace('www.', '');
                    } catch (e) {}
                    links.push({ url, anchor_text, position: 0 });
                }
            }
        });
        
        if (links.length === 0) {
            AppUtils.showNotification('No valid links to import', 'warning');
            return;
        }
        
        if (!confirm(`Import ${links.length} links?`)) return;
        
        try {
            const response = await api.request(`/api/projects/${projectId}/links/bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ links })
            });
            
            if (response.ok) {
                const result = await response.json();
                
                let message = `Successfully imported ${result.added} links`;
                if (result.failed > 0) {
                    message += `\n${result.failed} links failed to import`;
                    if (result.errors && result.errors.length > 0) {
                        message += '\n\nErrors:';
                        result.errors.forEach(err => {
                            message += `\nLine ${err.line}: ${err.error}`;
                        });
                    }
                }
                
                AppUtils.showNotification(message, result.failed > 0 ? 'warning' : 'success');
                
                // Clear form and reload
                input.value = '';
                const previewDiv = AppUtils.checkElement('bulkPreview');
                if (previewDiv) {
                    previewDiv.style.display = 'none';
                }
                
                // Reload project view if project modal is open
                if (window.ProjectModal && window.ProjectModal.isOpen) {
                    await window.ProjectModal.loadProject(projectId);
                }
                
                // Also refresh projects list
                if (window.ProjectsModule) {
                    await window.ProjectsModule.load();
                }
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to import links');
            }
        } catch (error) {
            console.error('Error importing links:', error);
            AppUtils.showNotification(`Error importing links: ${error.message}`, 'error');
        }
    },

    // Validation helper
    validateBulkLinksInput(input) {
        if (!input || !input.trim()) {
            return { valid: false, error: 'Please enter some links' };
        }
        
        const lines = input.trim().split('\n').filter(line => line.trim());
        if (lines.length === 0) {
            return { valid: false, error: 'No valid lines found' };
        }
        
        return { valid: true, lineCount: lines.length };
    },

    // Helper to extract domain from URL
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch (e) {
            return url;
        }
    },

    // Initialize bulk links functionality
    init() {
        console.log('Bulk Links module initialized');
        
        // Add event listeners if bulk import elements exist
        const bulkLinksInput = document.getElementById('bulkLinksInput');
        if (bulkLinksInput) {
            // Auto-resize textarea
            bulkLinksInput.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
            });
        }
    }
};

// Global function exports for HTML onclick handlers
window.parseHTMLLinks = (text) => {
    return window.BulkLinksModule.parseHTMLLinks(text);
};

window.previewBulkLinks = (projectId) => {
    return window.BulkLinksModule.previewBulkLinks(projectId);
};

window.importBulkLinks = (projectId) => {
    return window.BulkLinksModule.importBulkLinks(projectId);
};

window.generateSlugFromTitle = (title) => {
    return window.BulkLinksModule.generateSlugFromTitle(title);
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.BulkLinksModule.init();
});