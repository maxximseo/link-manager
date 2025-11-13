<?php
/**
 * Link Manager Widget for Static PHP Sites
 * Version: 1.0.0
 *
 * Universal widget that automatically detects the current domain
 * and fetches links from the Link Manager API
 *
 * Installation:
 * 1. Upload this file to your website's root directory
 * 2. Add <?php include 'link-manager-widget.php'; ?> where you want links to appear
 * 3. Register your domain in Link Manager dashboard as "Static PHP Site"
 *
 * Features:
 * - Automatic domain detection
 * - 5-minute file-based caching
 * - XSS protection
 * - Error handling with fallback
 * - No configuration needed
 */

// Configuration
define('LM_API_URL', 'https://shark-app-9kv6u.ondigitalocean.app/api/static/get-content-by-domain');
define('LM_CACHE_DIR', sys_get_temp_dir() . '/link-manager-cache');
define('LM_CACHE_TTL', 300); // 5 minutes in seconds
define('LM_TIMEOUT', 5); // API timeout in seconds

/**
 * Get current domain from HTTP_HOST
 */
function lm_get_current_domain() {
    // Get domain from HTTP_HOST
    $domain = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';

    // Remove port if present
    $domain = preg_replace('/:\d+$/', '', $domain);

    // Remove www. prefix
    $domain = preg_replace('/^www\./i', '', $domain);

    // Validate domain format
    if (!preg_match('/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/', $domain)) {
        return false;
    }

    return strtolower($domain);
}

/**
 * Check if cache directory is available and writable
 */
function lm_is_cache_available() {
    // Try to create cache directory if it doesn't exist
    if (!is_dir(LM_CACHE_DIR)) {
        if (!@mkdir(LM_CACHE_DIR, 0755, true)) {
            return false;
        }
    }

    // Verify directory is writable
    if (!is_writable(LM_CACHE_DIR)) {
        return false;
    }

    return true;
}

/**
 * Get cache file path for current domain
 */
function lm_get_cache_path($domain) {
    // Use MD5 of domain as filename for security
    $hash = md5($domain);
    return LM_CACHE_DIR . '/lm_' . $hash . '.json';
}

/**
 * Get cached content if valid
 */
function lm_get_cache($domain) {
    // Check if cache is available before attempting to read
    if (!lm_is_cache_available()) {
        return false;
    }

    $cache_file = lm_get_cache_path($domain);

    // Check if cache file exists and is not expired
    if (file_exists($cache_file)) {
        $age = time() - filemtime($cache_file);

        if ($age < LM_CACHE_TTL) {
            $content = @file_get_contents($cache_file);
            if ($content !== false) {
                $data = @json_decode($content, true);
                if ($data !== null) {
                    return $data;
                }
            }
        }
    }

    return false;
}

/**
 * Save content to cache
 */
function lm_set_cache($domain, $data) {
    // Check if cache is available before attempting to write
    if (!lm_is_cache_available()) {
        return false;
    }

    $cache_file = lm_get_cache_path($domain);
    $content = json_encode($data);

    // Atomic write using temp file + rename
    $temp_file = $cache_file . '.tmp';
    if (@file_put_contents($temp_file, $content) !== false) {
        return @rename($temp_file, $cache_file);
    }

    return false;
}

/**
 * Fetch links from API
 */
function lm_fetch_links($domain) {
    // Check cache first
    $cached = lm_get_cache($domain);
    if ($cached !== false) {
        return $cached;
    }

    // Build API URL
    $url = LM_API_URL . '?domain=' . urlencode($domain);

    // Use cURL if available, otherwise file_get_contents
    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, LM_TIMEOUT);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        $response = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($http_code !== 200 || $response === false) {
            return false;
        }
    } else {
        // Fallback to file_get_contents
        $context = stream_context_create([
            'http' => [
                'timeout' => LM_TIMEOUT,
                'ignore_errors' => true
            ]
        ]);

        $response = @file_get_contents($url, false, $context);

        if ($response === false) {
            return false;
        }

        // Check HTTP status code
        if (isset($http_response_header) && count($http_response_header) > 0) {
            // First line contains status: "HTTP/1.1 200 OK"
            $status_line = $http_response_header[0];
            if (preg_match('{HTTP\/\S*\s(\d{3})}', $status_line, $match)) {
                $status_code = (int)$match[1];
                if ($status_code !== 200) {
                    // Non-200 status code (404, 500, etc.)
                    return false;
                }
            }
        }
    }

    // Parse JSON response
    $data = @json_decode($response, true);

    if ($data === null || !isset($data['links'])) {
        return false;
    }

    // Cache the result
    lm_set_cache($domain, $data);

    return $data;
}

/**
 * Escape HTML to prevent XSS
 */
function lm_esc_html($text) {
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
}

/**
 * Escape URL to prevent XSS
 */
function lm_esc_url($url) {
    // Basic URL validation
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return '#';
    }

    // Only allow http and https protocols
    $parsed = parse_url($url);
    if (!isset($parsed['scheme']) || !in_array($parsed['scheme'], ['http', 'https'])) {
        return '#';
    }

    return htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
}

/**
 * Render links widget
 */
function lm_render_widget() {
    // Get current domain
    $domain = lm_get_current_domain();

    if ($domain === false) {
        // Silent fail - domain detection failed
        return;
    }

    // Fetch links from API
    $data = lm_fetch_links($domain);

    if ($data === false || empty($data['links'])) {
        // Silent fail - no links or API error
        return;
    }

    $links = $data['links'];

    // Render links
    echo '<div class="link-manager-widget">';
    echo '<ul class="lm-links-list">';

    foreach ($links as $link) {
        if (!isset($link['url']) || !isset($link['anchor_text'])) {
            continue;
        }

        $url = lm_esc_url($link['url']);
        $anchor = lm_esc_html($link['anchor_text']);

        echo '<li class="lm-link-item">';
        echo '<a href="' . $url . '" rel="nofollow" target="_blank">' . $anchor . '</a>';
        echo '</li>';
    }

    echo '</ul>';
    echo '</div>';
}

// Auto-render widget when file is included
lm_render_widget();
?>
