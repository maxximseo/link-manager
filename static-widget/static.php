<?php
/**
 * Link Manager Widget for Static PHP Sites (API Key Version)
 * Version: 1.1.0
 *
 * Uses API key instead of domain detection - same as WordPress plugin
 *
 * Installation:
 * 1. Copy your API key from Link Manager dashboard
 * 2. Replace 'YOUR_API_KEY_HERE' below with your actual API key
 * 3. Upload this file to your website's root directory
 * 4. Add <?php include 'link-manager-widget.php'; ?> where you want links
 *
 * Features:
 * - Works with API key (like WordPress)
 * - 5-minute file-based caching
 * - XSS protection
 * - No domain detection needed
 */

// ========================================
// CONFIGURATION - EDIT THIS!
// ========================================
define('LM_API_KEY', 'YOUR_API_KEY_HERE'); // Replace with your actual API key from dashboard
define('LM_API_URL', 'https://shark-app-9kv6u.ondigitalocean.app/api/wordpress/get-content');
// ========================================
define('LM_CACHE_DIR', sys_get_temp_dir() . '/link-manager-cache');
define('LM_CACHE_TTL', 300); // 5 minutes
define('LM_TIMEOUT', 5); // API timeout in seconds

/**
 * Check if cache directory is available and writable
 */
function lm_is_cache_available() {
    if (!is_dir(LM_CACHE_DIR)) {
        if (!@mkdir(LM_CACHE_DIR, 0755, true)) {
            return false;
        }
    }
    return is_writable(LM_CACHE_DIR);
}

/**
 * Get cache file path
 */
function lm_get_cache_path($apiKey) {
    $hash = md5($apiKey);
    return LM_CACHE_DIR . '/lm_api_' . $hash . '.json';
}

/**
 * Get cached content if valid
 */
function lm_get_cache($apiKey) {
    if (!lm_is_cache_available()) {
        return false;
    }

    $cache_file = lm_get_cache_path($apiKey);

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
function lm_set_cache($apiKey, $data) {
    if (!lm_is_cache_available()) {
        return false;
    }

    $cache_file = lm_get_cache_path($apiKey);
    $content = json_encode($data);

    $temp_file = $cache_file . '.tmp';
    if (@file_put_contents($temp_file, $content) !== false) {
        return @rename($temp_file, $cache_file);
    }

    return false;
}

/**
 * Fetch links from API using API key
 */
function lm_fetch_links($apiKey) {
    // Check cache first
    $cached = lm_get_cache($apiKey);
    if ($cached !== false) {
        return $cached;
    }

    // Build API URL with query parameter
    $url = LM_API_URL . '?api_key=' . urlencode($apiKey);

    // Use cURL
    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, LM_TIMEOUT);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Disable SSL verification for compatibility

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
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false
            ]
        ]);

        $response = @file_get_contents($url, false, $context);

        if ($response === false) {
            return false;
        }
    }

    // Parse JSON response
    $data = @json_decode($response, true);

    if ($data === null || !isset($data['links'])) {
        return false;
    }

    // Cache the result
    lm_set_cache($apiKey, $data);

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
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return '#';
    }

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
    // Validate API key
    if (!defined('LM_API_KEY') || LM_API_KEY === 'YOUR_API_KEY_HERE' || empty(LM_API_KEY)) {
        // Silent fail - API key not configured
        return;
    }

    // Fetch links from API
    $data = lm_fetch_links(LM_API_KEY);

    if ($data === false || empty($data['links'])) {
        // Silent fail - no links or API error
        return;
    }

    $links = $data['links'];

    // Render links
    foreach ($links as $link) {
        if (!isset($link['url']) || !isset($link['anchor_text'])) {
            continue;
        }

        $url = lm_esc_url($link['url']);
        $anchor = lm_esc_html($link['anchor_text']);

        echo '<a href="' . $url . '" target="_blank">' . $anchor . '</a><br>';
    }
}

// Auto-render widget when file is included
lm_render_widget();
?>
