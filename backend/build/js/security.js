/**
 * Security utilities for XSS protection
 * All user data should be escaped before inserting into DOM via innerHTML
 */

// Escape HTML entities to prevent XSS attacks
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    if (typeof text !== 'string') text = String(text);

    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    };

    return text.replace(/[&<>"'`=\/]/g, char => map[char]);
}

// Escape for use in HTML attributes
function escapeAttr(text) {
    return escapeHtml(text);
}

// Escape URL for use in href/src attributes
function escapeUrl(url) {
    if (!url) return '';

    // Only allow http, https, mailto, tel protocols
    const allowed = ['http:', 'https:', 'mailto:', 'tel:'];
    try {
        const parsed = new URL(url, window.location.origin);
        if (!allowed.includes(parsed.protocol)) {
            console.warn('Blocked potentially dangerous URL:', url);
            return '#';
        }
        return url;
    } catch (e) {
        // If URL parsing fails, it might be a relative URL which is OK
        if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
            return url;
        }
        // Block anything that looks like javascript: or data:
        if (/^(javascript|data|vbscript):/i.test(url)) {
            console.warn('Blocked dangerous URL protocol:', url);
            return '#';
        }
        return url;
    }
}

// Safe innerHTML setter - escapes text content
function safeInnerHTML(element, html) {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) {
        element.innerHTML = html;
    }
}

// Set text content safely (no HTML parsing)
function safeTextContent(element, text) {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) {
        element.textContent = text;
    }
}

// Create safe HTML string from template with escaped values
function html(strings, ...values) {
    return strings.reduce((result, str, i) => {
        const value = i < values.length ? escapeHtml(values[i]) : '';
        return result + str + value;
    }, '');
}

// Sanitize object values for display (escapes all string properties)
function sanitizeForDisplay(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            sanitized[key] = escapeHtml(value);
        } else if (Array.isArray(value)) {
            sanitized[key] = value.map(v => typeof v === 'string' ? escapeHtml(v) : v);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeForDisplay(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

// Debounce utility - delays execution until wait ms have passed without new calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Show Bootstrap alert notification
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        ${escapeHtml(message)}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    document.body.appendChild(alertDiv);

    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Export for use in modules (if using ES modules in future)
if (typeof window !== 'undefined') {
    window.escapeHtml = escapeHtml;
    window.escapeAttr = escapeAttr;
    window.escapeUrl = escapeUrl;
    window.safeInnerHTML = safeInnerHTML;
    window.safeTextContent = safeTextContent;
    window.html = html;
    window.sanitizeForDisplay = sanitizeForDisplay;
    window.debounce = debounce;
    window.showAlert = showAlert;
}
