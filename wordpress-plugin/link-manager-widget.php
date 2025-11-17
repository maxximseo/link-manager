<?php
/**
 * Plugin Name: Link Manager Widget Pro
 * Plugin URI: https://github.com/maxximseo/link-manager
 * Description: Display placed links and articles from Link Manager system
 * Version: 2.5.0
 * Author: Link Manager Team
 * License: GPL v2 or later
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('LMW_VERSION', '2.5.0');
define('LMW_PLUGIN_URL', plugin_dir_url(__FILE__));
define('LMW_PLUGIN_PATH', plugin_dir_path(__FILE__));

// Default API endpoint - always use production
if (!defined('LMW_API_ENDPOINT')) {
    define('LMW_API_ENDPOINT', 'https://shark-app-9kv6u.ondigitalocean.app/api');
}

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
    }
    
    /**
     * Initialize plugin
     */
    public function init() {
        // Auto-generate API key if not set
        if (empty($this->api_key)) {
            $this->api_key = 'api_' . substr(md5(site_url() . time()), 0, 12);
            update_option('lmw_api_key', $this->api_key);
        }
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
            
            <h2>Test Connection</h2>
            <p>Click the button below to test your connection to the Link Manager API:</p>
            <button type="button" class="button button-secondary" onclick="testLinkManagerConnection()">Test Connection</button>
            <div id="test-connection-result" style="margin-top: 15px;"></div>
            
            <script>
            function testLinkManagerConnection() {
                var apiKey = document.querySelector('input[name="api_key"]').value;
                var apiEndpoint = document.querySelector('input[name="api_endpoint"]').value || '<?php echo LMW_API_ENDPOINT; ?>';
                
                if (!apiKey) {
                    document.getElementById('test-connection-result').innerHTML = 
                        '<div class="notice notice-error"><p>Please enter an API key first.</p></div>';
                    return;
                }
                
                document.getElementById('test-connection-result').innerHTML = 
                    '<div class="notice notice-info"><p>Testing connection...</p></div>';
                
                // Test connection to the API
                fetch(apiEndpoint + '/wordpress/verify', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ api_key: apiKey })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        var resultHtml = '<div class="notice notice-success">';
                        resultHtml += '<p><strong>✅ Connected to Link Manager API</strong></p>';
                        if (data.site_name) {
                            resultHtml += '<p><strong>Site:</strong> ' + data.site_name + '</p>';
                        }

                        // Display available content
                        var availableLinks = data.available_links || 0;
                        var availableArticles = data.available_articles || 0;
                        resultHtml += '<p><strong>Available content:</strong> ' + availableLinks + ' links, ' + availableArticles + ' articles</p>';

                        // Display usage statistics
                        if (typeof data.used_links !== 'undefined' && typeof data.max_links !== 'undefined') {
                            resultHtml += '<p><strong>Links:</strong> ' + data.used_links + ' / ' + data.max_links + ' used</p>';
                        }
                        if (typeof data.used_articles !== 'undefined' && typeof data.max_articles !== 'undefined') {
                            resultHtml += '<p><strong>Articles:</strong> ' + data.used_articles + ' / ' + data.max_articles + ' used</p>';
                        }

                        resultHtml += '</div>';
                        document.getElementById('test-connection-result').innerHTML = resultHtml;
                    } else {
                        document.getElementById('test-connection-result').innerHTML =
                            '<div class="notice notice-error"><p>❌ Connection failed: ' + (data.error || 'Unknown error') + '</p></div>';
                    }
                })
                .catch(error => {
                    document.getElementById('test-connection-result').innerHTML = 
                        '<div class="notice notice-error"><p>❌ Connection error: ' + error.message + '</p>' +
                        '<p>Make sure the API endpoint is correct: <strong>' + apiEndpoint + '</strong></p></div>';
                });
            }
            </script>
            
            <h2>Usage</h2>
            <p>Use these shortcodes to display content:</p>

            <h3>Basic Usage</h3>
            <ul>
                <li><code>[lm_links]</code> - <strong>Display links on homepage only (default template)</strong></li>
                <li><code>[lm_links home_only="false"]</code> - Display links on all pages</li>
                <li><code>[lm_links limit="5"]</code> - Limit number of links</li>
            </ul>

            <h3>Templates (NEW in v2.5.0)</h3>
            <ul>
                <li><code>[lm_links template="default"]</code> - Default rendering (html_context or simple anchor)</li>
                <li><code>[lm_links template="with_image"]</code> - Display with image (if image_url provided)</li>
                <li><code>[lm_links template="card"]</code> - Card layout with image and description</li>
                <li><code>[lm_links template="custom"]</code> - Fully custom HTML (via custom_data)</li>
            </ul>

            <h3>Extended Fields Support</h3>
            <p>Version 2.5.0+ supports flexible content through API:</p>
            <ul>
                <li><strong>image_url</strong> - Add images to links</li>
                <li><strong>link_attributes</strong> - Custom class, style, rel, target, data-* attributes</li>
                <li><strong>wrapper_config</strong> - Wrap links in custom HTML tags with classes/styles</li>
                <li><strong>custom_data</strong> - Any additional data (description, category, etc.)</li>
            </ul>
            <p><strong>Default behavior:</strong> Links show only on homepage with 5 minutes cache.</p>
            
            <h2>Widgets</h2>
            <p>You can also add Link Manager widgets through Appearance → Widgets:</p>
            <ul>
                <li><strong>Link Manager Links</strong> - Display placed links in widget areas</li>
            </ul>
            <p><strong>Note:</strong> Articles are now published as full WordPress posts, not as widgets.</p>

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
        $response = wp_remote_post(
            $this->api_endpoint . '/wordpress/verify',
            array(
                'timeout' => 30,
                'headers' => array(
                    'Content-Type' => 'application/json'
                ),
                'body' => json_encode(array(
                    'api_key' => $this->api_key
                ))
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
     * Fetch content from API
     */
    private function fetch_content_from_api() {
        // Check cache first
        $cache_key = 'lmw_content_' . md5($this->api_key);
        $cached = get_transient($cache_key);

        if ($cached !== false) {
            return $cached;
        }

        // Fetch from API
        // SECURITY: Send API key in header instead of URL to prevent logging
        $response = wp_remote_get(
            $this->api_endpoint . '/wordpress/get-content',
            array(
                'timeout' => 30,
                'headers' => array(
                    'Accept' => 'application/json',
                    'X-API-Key' => $this->api_key
                )
            )
        );

        if (is_wp_error($response)) {
            return false;
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if ($data && isset($data['links'])) {
            // Cache the result
            set_transient($cache_key, $data, $this->cache_duration);
            return $data;
        }

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