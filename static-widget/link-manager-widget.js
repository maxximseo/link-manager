/**
 * Link Manager Widget for Static HTML Sites
 * Version: 1.0.0
 *
 * Universal JavaScript widget that automatically detects the current domain
 * and fetches links from the Link Manager API
 *
 * Installation:
 * 1. Upload this file to your website (e.g., /js/link-manager-widget.js)
 * 2. Add this code to your HTML where you want links to appear:
 *    <div id="link-manager-widget"></div>
 *    <script src="/js/link-manager-widget.js"></script>
 * 3. Register your domain in Link Manager dashboard as "Static PHP Site"
 *
 * Features:
 * - Automatic domain detection
 * - AJAX content loading
 * - XSS protection
 * - Error handling with silent fallback
 * - No configuration needed
 */

(function() {
    'use strict';

    // Configuration
    const API_URL = 'https://shark-app-9kv6u.ondigitalocean.app/api/static/get-content-by-domain';
    const CONTAINER_ID = 'link-manager-widget';
    const TIMEOUT = 5000; // 5 seconds

    /**
     * Get current domain from window.location
     */
    function getCurrentDomain() {
        var domain = window.location.hostname;

        // Remove www. prefix
        domain = domain.replace(/^www\./i, '');

        // Validate domain format
        if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
            return null;
        }

        return domain.toLowerCase();
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Validate URL to prevent XSS
     */
    function isValidUrl(url) {
        try {
            var parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch (e) {
            return false;
        }
    }

    /**
     * Fetch links from API
     */
    function fetchLinks(domain, callback) {
        var xhr = new XMLHttpRequest();
        var url = API_URL + '?domain=' + encodeURIComponent(domain);

        xhr.timeout = TIMEOUT;
        xhr.open('GET', url, true);

        xhr.onload = function() {
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    callback(null, data);
                } catch (e) {
                    callback(e, null);
                }
            } else {
                callback(new Error('HTTP ' + xhr.status), null);
            }
        };

        xhr.onerror = function() {
            callback(new Error('Network error'), null);
        };

        xhr.ontimeout = function() {
            callback(new Error('Request timeout'), null);
        };

        xhr.send();
    }

    /**
     * Render links widget
     */
    function renderWidget(data) {
        var container = document.getElementById(CONTAINER_ID);

        if (!container) {
            console.warn('Link Manager: Container #' + CONTAINER_ID + ' not found');
            return;
        }

        if (!data.links || data.links.length === 0) {
            // Silent fail - no links available
            return;
        }

        var html = '<div class="link-manager-widget"><ul class="lm-links-list">';

        for (var i = 0; i < data.links.length; i++) {
            var link = data.links[i];

            if (!link.url || !link.anchor_text) {
                continue;
            }

            if (!isValidUrl(link.url)) {
                continue;
            }

            var url = escapeHtml(link.url);
            var anchor = escapeHtml(link.anchor_text);

            html += '<li class="lm-link-item">';
            html += '<a href="' + url + '" rel="nofollow" target="_blank">' + anchor + '</a>';
            html += '</li>';
        }

        html += '</ul></div>';

        container.innerHTML = html;
    }

    /**
     * Initialize widget
     */
    function init() {
        var domain = getCurrentDomain();

        if (!domain) {
            console.warn('Link Manager: Could not detect domain');
            return;
        }

        fetchLinks(domain, function(error, data) {
            if (error) {
                // Silent fail - don't show errors to users
                console.warn('Link Manager: Failed to fetch links', error.message);
                return;
            }

            renderWidget(data);
        });
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
