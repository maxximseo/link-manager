<?php
/**
 * Plugin Name: Link Manager Widget Pro
 * Plugin URI: https://github.com/maxximseo/link-manager
 * Description: Display placed links and articles from Link Manager system
 * Version: 2.7.0
 * Author: Link Manager Team
 * License: GPL v2 or later
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('LMW_VERSION', '2.7.0');
define('LMW_PLUGIN_URL', plugin_dir_url(__FILE__));
define('LMW_PLUGIN_PATH', plugin_dir_path(__FILE__));

// Default API endpoint - always use production
if (!defined('LMW_API_ENDPOINT')) {
    define('LMW_API_ENDPOINT', 'https://shark-app-9kv6u.ondigitalocean.app/api');
}

// Persistent cache TTL (7 days) for fallback when API is unavailable
define('LMW_PERSISTENT_TTL', 604800);
// File cache is UNLIMITED - survives until API returns successful response

/**
 * Main plugin class
 */
class LinkManagerWidget {
    
    private $api_key;
    private $api_endpoint;
    private $cache_duration = 300; // 5 minutes cache
    
    public function __construct() {
        $this->api_key = get_option('lmw_api_key', '');
        $this->api_endpoint = get_option('lmw_api_endpoint', LMW_API_ENDPOINT);
        
        // Initialize hooks
        add_action('init', array($this, 'init'));
        add_action('widgets_init', array($this, 'register_widgets'));
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_shortcode('link_manager', array($this, 'shortcode_handler'));
        add_shortcode('lm_links', array($this, 'links_shortcode'));
        // Articles are now only published as posts, not as shortcodes
        
        // Add styles
        add_action('wp_enqueue_scripts', array($this, 'enqueue_styles'));
        
        // AJAX handlers for dynamic content
        add_action('wp_ajax_lmw_get_content', array($this, 'ajax_get_content'));
        add_action('wp_ajax_nopriv_lmw_get_content', array($this, 'ajax_get_content'));
        
        // REST API endpoints for article creation
        add_action('rest_api_init', array($this, 'register_rest_routes'));

        // Auto-update hooks
        add_filter('pre_set_site_transient_update_plugins', array($this, 'check_for_plugin_update'));
        add_filter('plugins_api', array($this, 'get_plugin_update_info'), 10, 3);
        add_filter('upgrader_post_install', array($this, 'after_plugin_install'), 10, 3);
    }
    
    /**
     * Initialize plugin
     */
    public function init() {
        // API key is now set manually or via registration token
        // No auto-generation - allows Quick Registration form to show
    }
    
    /**
     * Register widgets
     */
    public function register_widgets() {
        register_widget('LMW_Links_Widget');
        // Articles are now only published as posts, not as widgets
    }
    
    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_options_page(
            'Link Manager Widget Settings',
            'Link Manager Widget',
            'manage_options',
            'link-manager-widget',
            array($this, 'admin_page')
        );
    }
    
    /**
     * Admin settings page
     */
    public function admin_page() {
        // Handle registration form submission
        if (isset($_POST['register_site'])) {
            if (!isset($_POST['lmw_register_nonce']) || !wp_verify_nonce($_POST['lmw_register_nonce'], 'lmw_register_site')) {
                echo '<div class="notice notice-error"><p>Security check failed. Please try again.</p></div>';
            } else {
                $registration_token = sanitize_text_field($_POST['registration_token']);
                $result = $this->register_site_with_token($registration_token);

                if ($result['success']) {
                    echo '<div class="notice notice-success"><p><strong>✅ Site registered successfully!</strong></p>';
                    echo '<p>Your site has been added to the Link Manager system.</p>';
                    if (isset($result['api_key'])) {
                        update_option('lmw_api_key', $result['api_key']);
                        echo '<p>API key has been saved automatically.</p>';
                    }
                    echo '</div>';
                } else {
                    echo '<div class="notice notice-error"><p><strong>❌ Registration failed:</strong> ' . esc_html($result['error']) . '</p></div>';
                }
            }
        }

        // Handle settings form submission
        if (isset($_POST['submit'])) {
            // Verify nonce for CSRF protection
            if (!isset($_POST['lmw_settings_nonce']) || !wp_verify_nonce($_POST['lmw_settings_nonce'], 'lmw_save_settings')) {
                echo '<div class="notice notice-error"><p>Security check failed. Please try again.</p></div>';
            } else {
                update_option('lmw_api_key', sanitize_text_field($_POST['api_key']));
                update_option('lmw_api_endpoint', esc_url_raw($_POST['api_endpoint']));
                update_option('lmw_cache_duration', intval($_POST['cache_duration']));
                echo '<div class="notice notice-success"><p>Settings saved!</p></div>';
            }
        }
        
        $api_key = get_option('lmw_api_key', '');
        $api_endpoint = get_option('lmw_api_endpoint', LMW_API_ENDPOINT);
        $cache_duration = get_option('lmw_cache_duration', 300);
        ?>
        <div class="wrap">
            <h1>Link Manager Widget Settings</h1>

            <?php if (empty($api_key)): ?>
            <!-- Quick Registration Form (shown when no API key) -->
            <div class="notice notice-info" style="padding: 20px; border-left: 4px solid #00a0d2;">
                <h2 style="margin-top: 0;">🚀 Quick Site Registration</h2>
                <p>Don't have an API key yet? Use a registration token from your Link Manager dashboard to quickly register this site.</p>

                <form method="post" action="" style="max-width: 600px;" autocomplete="off">
                    <?php wp_nonce_field('lmw_register_site', 'lmw_register_nonce'); ?>
                    <table class="form-table">
                        <tr>
                            <th scope="row">Registration Token</th>
                            <td>
                                <p class="description" style="margin-bottom: 8px;">
                                    <strong>Step 1:</strong> Get a registration token from your Link Manager dashboard (Sites page)<br>
                                    <strong>Step 2:</strong> Paste it below and click "Register This Site"
                                </p>
                                <input type="text" name="registration_token" value="" class="regular-text" placeholder="Paste your registration token here..." autocomplete="off" required />
                                <p class="description" style="margin-top: 8px;">
                                    The token should start with <code>reg_</code> and be about 68 characters long.<br>
                                    <em>Don't have a token? Contact your Link Manager administrator.</em>
                                </p>
                            </td>
                        </tr>
                    </table>
                    <p>
                        <button type="submit" name="register_site" class="button button-primary">Register This Site</button>
                    </p>
                </form>
                <hr>
            </div>
            <?php endif; ?>

            <h2>Status</h2>
            <?php
            // Get placed content
            $content = $this->fetch_content_from_api();

            // Get site quotas from verify endpoint
            $site_info = $this->verify_api_connection();

            if ($content || $site_info) {
                echo '<p style="color: green;">✅ Connected to Link Manager API</p>';

                if ($site_info && $site_info['success']) {
                    echo '<div style="margin: 15px 0; padding: 15px; background: #f0f0f1; border-left: 4px solid #2271b1;">';

                    // Site name
                    if (isset($site_info['site_name'])) {
                        echo '<p style="margin: 5px 0;"><strong>Site:</strong> ' . esc_html($site_info['site_name']) . '</p>';
                    }

                    // Placed content
                    if ($content) {
                        $link_count = count($content['links'] ?? []);
                        $article_count = count($content['articles'] ?? []);
                        echo '<p style="margin: 5px 0;"><strong>Placed content:</strong> ' . $link_count . ' links, ' . $article_count . ' articles</p>';
                    }

                    // Available quotas
                    echo '<p style="margin: 5px 0;"><strong>Links quota:</strong> ' . esc_html($site_info['used_links']) . ' / ' . esc_html($site_info['max_links']) . ' used';
                    if ($site_info['available_links'] > 0) {
                        echo ' <span style="color: #2271b1;">(' . esc_html($site_info['available_links']) . ' available)</span>';
                    } else {
                        echo ' <span style="color: #d63638;">(quota exhausted)</span>';
                    }
                    echo '</p>';

                    echo '<p style="margin: 5px 0;"><strong>Articles quota:</strong> ' . esc_html($site_info['used_articles']) . ' / ' . esc_html($site_info['max_articles']) . ' used';
                    if ($site_info['available_articles'] > 0) {
                        echo ' <span style="color: #2271b1;">(' . esc_html($site_info['available_articles']) . ' available)</span>';
                    } else {
                        echo ' <span style="color: #d63638;">(quota exhausted)</span>';
                    }
                    echo '</p>';

                    echo '</div>';
                } else if ($content) {
                    // Fallback if verify endpoint fails but get-content works
                    $link_count = count($content['links'] ?? []);
                    $article_count = count($content['articles'] ?? []);
                    echo '<p><strong>Placed content on this site:</strong> ' . $link_count . ' links, ' . $article_count . ' articles</p>';
                }
            } else {
                echo '<p style="color: red;">❌ Not connected to Link Manager API</p>';
                echo '<p>Please check your API key and endpoint settings.</p>';
            }
            ?>

            <form method="post" action="">
                <?php wp_nonce_field('lmw_save_settings', 'lmw_settings_nonce'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row">API Key</th>
                        <td>
                            <input type="text" name="api_key" value="<?php echo esc_attr($api_key); ?>" class="regular-text" />
                            <p class="description">Your site's API key for Link Manager system</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">API Endpoint</th>
                        <td>
                            <input type="url" name="api_endpoint" value="<?php echo esc_attr($api_endpoint); ?>" class="regular-text" />
                            <p class="description">Link Manager API endpoint URL</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Cache Duration</th>
                        <td>
                            <input type="number" name="cache_duration" value="<?php echo esc_attr($cache_duration); ?>" class="small-text" /> seconds
                            <p class="description">How long to cache content from API</p>
                        </td>
                    </tr>
                </table>
                
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }
    
    /**
     * Enqueue styles
     */
    public function enqueue_styles() {
        wp_enqueue_style('lmw-styles', LMW_PLUGIN_URL . 'assets/styles.css', array(), LMW_VERSION);
    }

    /**
     * Check for plugin updates
     * WordPress calls this periodically (every 12 hours)
     */
    public function check_for_plugin_update($transient) {
        if (empty($transient->checked)) {
            return $transient;
        }

        // Check cache first (12 hours)
        $cache_key = 'lmw_update_check';
        $update_data = get_transient($cache_key);

        if ($update_data === false) {
            // Call our API to check for updates
            $response = wp_remote_get(
                $this->api_endpoint . '/plugin-updates/check',
                array(
                    'timeout' => 10,
                    'headers' => array(
                        'Accept' => 'application/json'
                    )
                )
            );

            if (!is_wp_error($response)) {
                $body = wp_remote_retrieve_body($response);
                $update_data = json_decode($body, true);

                if ($update_data && isset($update_data['new_version'])) {
                    // Cache for 12 hours
                    set_transient($cache_key, $update_data, 12 * HOUR_IN_SECONDS);
                }
            }
        }

        // If we have update data and newer version available, add to transient
        if ($update_data && isset($update_data['new_version'])) {
            if (version_compare(LMW_VERSION, $update_data['new_version'], '<')) {
                $plugin_slug = 'link-manager-widget/link-manager-widget.php';

                $transient->response[$plugin_slug] = (object) array(
                    'id' => 'link-manager-widget',
                    'slug' => 'link-manager-widget',
                    'plugin' => $plugin_slug,
                    'new_version' => $update_data['new_version'],
                    'url' => $update_data['url'] ?? 'https://github.com/maxximseo/link-manager',
                    'package' => $update_data['package'],
                    'icons' => array(),
                    'banners' => array(),
                    'requires' => $update_data['requires'] ?? '5.0',
                    'requires_php' => $update_data['requires_php'] ?? '7.2',
                    'tested' => $update_data['tested'] ?? '6.4',
                    'compatibility' => new stdClass()
                );
            }
        }

        return $transient;
    }

    /**
     * Get plugin info for "View details" popup
     */
    public function get_plugin_update_info($res, $action, $args) {
        // Only respond for our plugin
        if ($action !== 'plugin_information') {
            return $res;
        }

        if (!isset($args->slug) || $args->slug !== 'link-manager-widget') {
            return $res;
        }

        // Call our API to get detailed info
        $response = wp_remote_get(
            $this->api_endpoint . '/plugin-updates/info',
            array(
                'timeout' => 10,
                'headers' => array(
                    'Accept' => 'application/json'
                )
            )
        );

        if (is_wp_error($response)) {
            return $res;
        }

        $body = wp_remote_retrieve_body($response);
        $plugin_info = json_decode($body);

        if ($plugin_info && isset($plugin_info->name)) {
            return $plugin_info;
        }

        return $res;
    }

    /**
     * After plugin install - fix folder name if needed
     * WordPress extracts ZIP and may have wrong folder name
     */
    public function after_plugin_install($response, $hook_extra, $result) {
        global $wp_filesystem;

        // Only run for our plugin
        if (!isset($hook_extra['plugin']) || strpos($hook_extra['plugin'], 'link-manager-widget') === false) {
            return $response;
        }

        // Check if the folder needs to be renamed
        $proper_destination = WP_PLUGIN_DIR . '/link-manager-widget';
        $current_destination = $result['destination'];

        // If destination doesn't match expected, rename it
        if ($current_destination !== $proper_destination) {
            // Remove old folder if exists
            if ($wp_filesystem->exists($proper_destination)) {
                $wp_filesystem->delete($proper_destination, true);
            }

            // Move to correct location
            $wp_filesystem->move($current_destination, $proper_destination);

            // Update result
            $result['destination'] = $proper_destination;
            $result['destination_name'] = 'link-manager-widget';
        }

        // Clear update cache
        delete_transient('lmw_update_check');

        return $response;
    }

    /**
     * Register site with token
     */
    private function register_site_with_token($registration_token) {
        // Auto-generate API key for this site
        $api_key = 'api_' . substr(md5(site_url() . time()), 0, 24);

        // Call backend registration endpoint
        $response = wp_remote_post(
            $this->api_endpoint . '/sites/register-from-wordpress',
            array(
                'timeout' => 30,
                'headers' => array(
                    'Content-Type' => 'application/json'
                ),
                'body' => json_encode(array(
                    'registration_token' => $registration_token,
                    'site_url' => site_url(),
                    'api_key' => $api_key
                ))
            )
        );

        if (is_wp_error($response)) {
            return array(
                'success' => false,
                'error' => 'Connection error: ' . $response->get_error_message()
            );
        }

        $status_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if ($status_code === 200 && isset($data['success']) && $data['success']) {
            return array(
                'success' => true,
                'api_key' => $api_key,
                'site_id' => $data['site_id'] ?? null
            );
        } else {
            return array(
                'success' => false,
                'error' => $data['error'] ?? 'Unknown error (Status: ' . $status_code . ')'
            );
        }
    }

    /**
     * Verify API connection and get site info
     */
    private function verify_api_connection() {
        if (empty($this->api_key)) {
            return false;
        }

        // Check cache first
        $cache_key = 'lmw_verify_' . md5($this->api_key);
        $cached = get_transient($cache_key);

        if ($cached !== false) {
            return $cached;
        }

        // Call verify endpoint
        // SECURITY: Send API key in header instead of body to prevent logging
        $response = wp_remote_post(
            $this->api_endpoint . '/wordpress/verify',
            array(
                'timeout' => 30,
                'headers' => array(
                    'Content-Type' => 'application/json',
                    'X-API-Key' => $this->api_key
                ),
                'body' => json_encode(array()) // Empty body, key is in header
            )
        );

        if (is_wp_error($response)) {
            return false;
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if ($data && isset($data['success'])) {
            // Cache for 5 minutes
            set_transient($cache_key, $data, 300);
            return $data;
        }

        return false;
    }

    /**
     * Get content from persistent storage (wp_options)
     * Used as fallback when API is unavailable (7-day TTL)
     */
    private function get_persistent_storage() {
        $option_key = 'lmw_persistent_content_' . md5($this->api_key);
        $data = get_option($option_key);

        if (!$data || !isset($data['timestamp']) || !isset($data['content'])) {
            return false;
        }

        // Check if data is still valid (7 days)
        $age = time() - $data['timestamp'];
        if ($age > LMW_PERSISTENT_TTL) {
            return false;
        }

        return $data['content'];
    }

    /**
     * Update persistent storage with fresh content
     * autoload = false to avoid loading on every page
     */
    private function update_persistent_storage($content) {
        $option_key = 'lmw_persistent_content_' . md5($this->api_key);
        $data = array(
            'content' => $content,
            'timestamp' => time(),
            'endpoint' => $this->api_endpoint
        );
        update_option($option_key, $data, false);
    }

    /**
     * Get content from file cache (emergency fallback)
     * UNLIMITED TTL - survives until API returns successful response
     */
    private function get_file_cache() {
        $cache_dir = WP_CONTENT_DIR . '/cache/link-manager';
        $cache_file = $cache_dir . '/lmw_' . md5($this->api_key) . '.json';

        if (!file_exists($cache_file)) {
            return false;
        }

        $content = @file_get_contents($cache_file);
        if ($content === false) {
            return false;
        }

        $data = json_decode($content, true);
        if (!$data || !isset($data['links'])) {
            return false;
        }

        return $data;
    }

    /**
     * Update file cache with fresh content
     */
    private function update_file_cache($content) {
        $cache_dir = WP_CONTENT_DIR . '/cache/link-manager';

        // Create cache directory if it doesn't exist
        if (!is_dir($cache_dir)) {
            @mkdir($cache_dir, 0755, true);
        }

        $cache_file = $cache_dir . '/lmw_' . md5($this->api_key) . '.json';
        @file_put_contents($cache_file, json_encode($content));
    }

    /**
     * Check for endpoint update from API response and apply automatically
     */
    private function check_endpoint_update($api_response) {
        if (!isset($api_response['endpoint_update'])) {
            return;
        }

        $update = $api_response['endpoint_update'];
        if (!isset($update['available']) || !$update['available']) {
            return;
        }

        if (!isset($update['new_endpoint']) || empty($update['new_endpoint'])) {
            return;
        }

        $new_endpoint = esc_url_raw($update['new_endpoint']);
        $current_endpoint = get_option('lmw_api_endpoint', LMW_API_ENDPOINT);

        if ($new_endpoint === $current_endpoint) {
            return;
        }

        // Save old endpoint for potential rollback
        update_option('lmw_previous_endpoint', $current_endpoint);

        // Update to new endpoint
        update_option('lmw_api_endpoint', $new_endpoint);
        $this->api_endpoint = $new_endpoint;

        error_log('[Link Manager] Endpoint auto-updated: ' . $current_endpoint . ' -> ' . $new_endpoint);

        // Confirm update to the OLD endpoint (so server knows we received the migration)
        $this->confirm_endpoint_update($current_endpoint);
    }

    /**
     * Confirm endpoint update to the server
     * Called after plugin successfully updates to new endpoint
     */
    private function confirm_endpoint_update($old_endpoint) {
        $response = wp_remote_post(
            $old_endpoint . '/wordpress/confirm-endpoint-update',
            array(
                'timeout' => 10,
                'headers' => array(
                    'Content-Type' => 'application/json',
                    'X-API-Key' => $this->api_key
                ),
                'body' => json_encode(array(
                    'api_key' => $this->api_key
                ))
            )
        );

        if (is_wp_error($response)) {
            error_log('[Link Manager] Failed to confirm endpoint update: ' . $response->get_error_message());
            return false;
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if (isset($data['success']) && $data['success']) {
            error_log('[Link Manager] Endpoint update confirmed to server');
            return true;
        }

        error_log('[Link Manager] Endpoint update confirmation failed: ' . print_r($data, true));
        return false;
    }

    /**
     * Fetch content from API with multi-layer fallback
     * Layer 1: Transient cache (5 min)
     * Layer 2: wp_options persistent cache (7 days)
     * Layer 3: File cache (UNLIMITED)
     */
    private function fetch_content_from_api() {
        // Layer 1: Check transient cache first (fast, 5 min TTL)
        $cache_key = 'lmw_content_' . md5($this->api_key);
        $cached = get_transient($cache_key);

        if ($cached !== false) {
            return $cached;
        }

        // Try to fetch from API
        $response = wp_remote_get(
            $this->api_endpoint . '/wordpress/get-content',
            array(
                'timeout' => 15, // Reduced from 30 for faster fallback
                'headers' => array(
                    'Accept' => 'application/json',
                    'X-API-Key' => $this->api_key
                )
            )
        );

        if (!is_wp_error($response)) {
            $body = wp_remote_retrieve_body($response);
            $data = json_decode($body, true);

            if ($data && isset($data['links'])) {
                // SUCCESS: Update ALL cache layers
                set_transient($cache_key, $data, $this->cache_duration);
                $this->update_persistent_storage($data);
                $this->update_file_cache($data);

                // Check for endpoint update from server
                $this->check_endpoint_update($data);

                return $data;
            }
        }

        // API FAILED - use fallback layers
        error_log('[Link Manager] API unavailable, trying fallback caches');

        // Layer 2: Try persistent storage (7 days)
        $persistent = $this->get_persistent_storage();
        if ($persistent) {
            error_log('[Link Manager] Serving from persistent storage (wp_options)');
            return $persistent;
        }

        // Layer 3: Try file cache (UNLIMITED - last resort)
        $file_cache = $this->get_file_cache();
        if ($file_cache) {
            error_log('[Link Manager] WARNING: Serving from emergency file cache');
            return $file_cache;
        }

        // All caches empty - return false
        error_log('[Link Manager] CRITICAL: No cached content available');
        return false;
    }
    
    /**
     * Main shortcode handler
     */
    public function shortcode_handler($atts) {
        $atts = shortcode_atts(array(
            'type' => 'all', // all, links, articles
            'position' => '',
            'limit' => 0
        ), $atts);
        
        $content = $this->fetch_content_from_api();
        if (!$content) {
            return '<!-- Link Manager: No content available -->';
        }
        
        $output = '<div class="lmw-content">';
        
        if ($atts['type'] === 'all' || $atts['type'] === 'links') {
            $output .= $this->render_links($content['links'] ?? [], $atts);
        }
        
        if ($atts['type'] === 'all' || $atts['type'] === 'articles') {
            $output .= $this->render_articles($content['articles'] ?? [], $atts);
        }
        
        $output .= '</div>';
        
        return $output;
    }
    
    /**
     * Links shortcode
     */
    public function links_shortcode($atts) {
        $atts = shortcode_atts(array(
            'position' => '',
            'limit' => 0,
            'style' => 'list', // list, inline, grid
            'home_only' => 'true' // Show only on homepage by default
        ), $atts);

        // By default, show only on homepage (unless home_only="false")
        if ($atts['home_only'] === 'true' && !is_front_page()) {
            return '';
        }

        $content = $this->fetch_content_from_api();
        if (!$content || empty($content['links'])) {
            return '';
        }

        return $this->render_links($content['links'], $atts);
    }
    
    // Articles are now only published as WordPress posts, not as shortcodes
    
    /**
     * Render links with flexible template support (v2.5.0+)
     * Supports extended fields: image_url, link_attributes, wrapper_config, custom_data
     */
    private function render_links($links, $atts) {
        if (empty($links)) {
            return '';
        }

        // Filter by position if specified
        if (!empty($atts['position'])) {
            $links = array_filter($links, function($link) use ($atts) {
                return isset($link['position']) && $link['position'] == $atts['position'];
            });
        }

        // Apply limit
        if ($atts['limit'] > 0) {
            $links = array_slice($links, 0, $atts['limit']);
        }

        // Get template from attributes (default, with_image, card, custom)
        $template = isset($atts['template']) ? $atts['template'] : 'default';

        // Render each link with template
        $output = '';
        foreach ($links as $link) {
            $output .= $this->render_single_link($link, $template);
        }

        return $output;
    }

    /**
     * Render a single link with template support
     */
    private function render_single_link($link, $template = 'default') {
        switch ($template) {
            case 'with_image':
                return $this->render_link_with_image($link);
            case 'card':
                return $this->render_link_card($link);
            case 'custom':
                return $this->render_custom_link($link);
            default:
                return $this->render_default_link($link);
        }
    }

    /**
     * Render default link (html_context or simple anchor)
     */
    private function render_default_link($link) {
        $output = '';

        // Wrapper start (if configured)
        if (!empty($link['wrapper_config']) && !empty($link['wrapper_config']['wrapper_tag'])) {
            $wrapper_tag = esc_attr($link['wrapper_config']['wrapper_tag']);
            $wrapper_class = !empty($link['wrapper_config']['wrapper_class']) ? ' class="' . esc_attr($link['wrapper_config']['wrapper_class']) . '"' : '';
            $wrapper_style = !empty($link['wrapper_config']['wrapper_style']) ? ' style="' . esc_attr($link['wrapper_config']['wrapper_style']) . '"' : '';
            $output .= '<' . $wrapper_tag . $wrapper_class . $wrapper_style . '>';
        }

        // If html_context exists, use it with safe HTML tags
        if (!empty($link['html_context'])) {
            $allowed_tags = array(
                'a' => array('href' => array(), 'target' => array(), 'rel' => array(), 'class' => array(), 'style' => array(), 'title' => array()),
                'strong' => array(), 'em' => array(), 'b' => array(), 'i' => array(),
                'span' => array('class' => array(), 'style' => array()),
                'img' => array('src' => array(), 'alt' => array(), 'class' => array(), 'style' => array())
            );
            $output .= wp_kses($link['html_context'], $allowed_tags);
        } else {
            // Fallback: build anchor with custom attributes
            $output .= $this->build_anchor_tag($link);
        }

        // Wrapper end
        if (!empty($link['wrapper_config']) && !empty($link['wrapper_config']['wrapper_tag'])) {
            $output .= '</' . esc_attr($link['wrapper_config']['wrapper_tag']) . '>';
        }

        $output .= '<br><br>' . "\n";
        return $output;
    }

    /**
     * Render link with image
     */
    private function render_link_with_image($link) {
        $output = '<div class="lmw-link-with-image">';

        if (!empty($link['image_url'])) {
            $output .= '<img src="' . esc_url($link['image_url']) . '" alt="' . esc_attr($link['anchor_text']) . '" class="lmw-link-image" /> ';
        }

        $output .= $this->build_anchor_tag($link);
        $output .= '</div>' . "\n";

        return $output;
    }

    /**
     * Render link as card
     */
    private function render_link_card($link) {
        $output = '<div class="lmw-link-card">';

        if (!empty($link['image_url'])) {
            $output .= '<div class="lmw-card-image"><img src="' . esc_url($link['image_url']) . '" alt="' . esc_attr($link['anchor_text']) . '" /></div>';
        }

        $output .= '<div class="lmw-card-content">';
        $output .= '<h4 class="lmw-card-title">' . $this->build_anchor_tag($link) . '</h4>';

        if (!empty($link['custom_data']['description'])) {
            $output .= '<p class="lmw-card-description">' . esc_html($link['custom_data']['description']) . '</p>';
        }

        $output .= '</div></div>' . "\n";

        return $output;
    }

    /**
     * Render completely custom link (full control via custom_data)
     */
    private function render_custom_link($link) {
        if (!empty($link['custom_data']['html'])) {
            // If custom HTML provided, use it (with safe tags)
            $allowed_tags = array(
                'div' => array('class' => array(), 'style' => array(), 'data-*' => array()),
                'span' => array('class' => array(), 'style' => array()),
                'a' => array('href' => array(), 'target' => array(), 'rel' => array(), 'class' => array(), 'style' => array(), 'title' => array()),
                'img' => array('src' => array(), 'alt' => array(), 'class' => array(), 'style' => array()),
                'strong' => array(), 'em' => array(), 'b' => array(), 'i' => array()
            );
            return wp_kses($link['custom_data']['html'], $allowed_tags) . "\n";
        }

        // Fallback to default rendering
        return $this->render_default_link($link);
    }

    /**
     * Build anchor tag with custom attributes
     */
    private function build_anchor_tag($link) {
        $attrs = '';

        // URL
        $attrs .= ' href="' . esc_url($link['url']) . '"';

        // Custom attributes from link_attributes field
        if (!empty($link['link_attributes'])) {
            foreach ($link['link_attributes'] as $key => $value) {
                if (in_array($key, array('class', 'style', 'rel', 'target', 'title', 'id'))) {
                    $attrs .= ' ' . esc_attr($key) . '="' . esc_attr($value) . '"';
                } elseif (strpos($key, 'data-') === 0) {
                    // Allow data-* attributes
                    $attrs .= ' ' . esc_attr($key) . '="' . esc_attr($value) . '"';
                }
            }
        } else {
            // Default target="_blank" if no custom attributes
            $attrs .= ' target="_blank"';
        }

        return '<a' . $attrs . '>' . esc_html($link['anchor_text']) . '</a>';
    }
    
    /**
     * Render articles
     */
    private function render_articles($articles, $atts) {
        if (empty($articles)) {
            return '';
        }
        
        // Apply limit
        if ($atts['limit'] > 0) {
            $articles = array_slice($articles, 0, $atts['limit']);
        }
        
        $excerpt_length = isset($atts['excerpt']) ? intval($atts['excerpt']) : 150;
        $style = isset($atts['style']) ? $atts['style'] : 'list';
        
        $output = '<div class="lmw-articles lmw-style-' . esc_attr($style) . '">';
        
        foreach ($articles as $article) {
            $output .= '<article class="lmw-article">';
            $output .= '<h3 class="lmw-article-title">' . esc_html($article['title']) . '</h3>';
            
            $content = $article['content'];
            if ($excerpt_length > 0 && strlen($content) > $excerpt_length) {
                $content = substr($content, 0, $excerpt_length) . '...';
            }
            
            $output .= '<div class="lmw-article-content">' . wp_kses_post($content) . '</div>';
            $output .= '</article>';
        }
        
        $output .= '</div>';
        
        return $output;
    }
    
    /**
     * AJAX handler for dynamic content
     */
    public function ajax_get_content() {
        $content = $this->fetch_content_from_api();
        
        if ($content) {
            wp_send_json_success($content);
        } else {
            wp_send_json_error('Failed to fetch content');
        }
    }
    
    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        register_rest_route('link-manager/v1', '/create-article', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_create_article'),
            'permission_callback' => array($this, 'verify_rest_api_key')
        ));
    }
    
    /**
     * Verify REST API key
     */
    public function verify_rest_api_key($request) {
        $api_key = $request->get_header('X-API-Key');
        if (empty($api_key)) {
            $api_key = $request->get_param('api_key');
        }
        
        $stored_api_key = get_option('lmw_api_key');
        
        return !empty($api_key) && $api_key === $stored_api_key;
    }
    
    /**
     * REST endpoint to create article as WordPress post
     */
    public function rest_create_article($request) {
        // Get article data from request
        $title = sanitize_text_field($request->get_param('title'));
        $content = wp_kses_post($request->get_param('content'));
        $category = sanitize_text_field($request->get_param('category'));
        $slug = sanitize_title($request->get_param('slug'));
        
        if (empty($title) || empty($content)) {
            return new WP_REST_Response(array(
                'success' => false,
                'error' => 'Title and content are required'
            ), 400);
        }
        
        // Create WordPress post
        $post_data = array(
            'post_title'    => $title,
            'post_content'  => $content,
            'post_status'   => 'publish',
            'post_type'     => 'post',
            'post_author'   => 1  // Default to admin user
        );
        
        // Add slug if provided
        if (!empty($slug)) {
            $post_data['post_name'] = $slug;
        }
        
        // Insert the post
        $post_id = wp_insert_post($post_data, true);
        
        if (is_wp_error($post_id)) {
            return new WP_REST_Response(array(
                'success' => false,
                'error' => $post_id->get_error_message()
            ), 500);
        }
        
        // Articles will use WordPress default category (usually "Uncategorized")
        
        // Get the post URL
        $post_url = get_permalink($post_id);
        
        return new WP_REST_Response(array(
            'success' => true,
            'post_id' => $post_id,
            'post_url' => $post_url,
            'message' => 'Article published successfully'
        ), 200);
    }
}

/**
 * Links Widget Class
 */
class LMW_Links_Widget extends WP_Widget {
    
    public function __construct() {
        parent::__construct(
            'lmw_links_widget',
            'Link Manager Links',
            array('description' => 'Display links from Link Manager')
        );
    }
    
    public function widget($args, $instance) {
        echo $args['before_widget'];
        
        if (!empty($instance['title'])) {
            echo $args['before_title'] . apply_filters('widget_title', $instance['title']) . $args['after_title'];
        }
        
        echo do_shortcode('[lm_links style="' . esc_attr($instance['style']) . '"]');
        
        echo $args['after_widget'];
    }
    
    public function form($instance) {
        $title = !empty($instance['title']) ? $instance['title'] : 'Links';
        $style = !empty($instance['style']) ? $instance['style'] : 'list';
        ?>
        <p>
            <label for="<?php echo $this->get_field_id('title'); ?>">Title:</label>
            <input class="widefat" id="<?php echo $this->get_field_id('title'); ?>"
                   name="<?php echo $this->get_field_name('title'); ?>" type="text"
                   value="<?php echo esc_attr($title); ?>">
        </p>
        <p>
            <label for="<?php echo $this->get_field_id('style'); ?>">Style:</label>
            <select id="<?php echo $this->get_field_id('style'); ?>"
                    name="<?php echo $this->get_field_name('style'); ?>">
                <option value="list" <?php selected($style, 'list'); ?>>List</option>
                <option value="inline" <?php selected($style, 'inline'); ?>>Inline</option>
            </select>
        </p>
        <?php
    }
    
    public function update($new_instance, $old_instance) {
        $instance = array();
        $instance['title'] = (!empty($new_instance['title'])) ? strip_tags($new_instance['title']) : '';
        $instance['style'] = (!empty($new_instance['style'])) ? strip_tags($new_instance['style']) : 'list';
        return $instance;
    }
}

// Articles are now only published as WordPress posts, not as widgets

// Initialize the plugin
new LinkManagerWidget();