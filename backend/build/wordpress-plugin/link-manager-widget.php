<?php
/**
 * Plugin Name: Link Manager Widget Pro
 * Plugin URI: https://github.com/maxximseo/wp-link-manager
 * Description: Display placed links and articles from Link Manager system
 * Version: 2.2.2
 * Author: Link Manager Team
 * License: GPL v2 or later
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('LMW_VERSION', '2.2.0');
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
    private $cache_duration = 3600; // 1 hour cache
    
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
        if (isset($_POST['submit'])) {
            update_option('lmw_api_key', sanitize_text_field($_POST['api_key']));
            update_option('lmw_api_endpoint', esc_url_raw($_POST['api_endpoint']));
            update_option('lmw_cache_duration', intval($_POST['cache_duration']));
            echo '<div class="notice notice-success"><p>Settings saved!</p></div>';
        }
        
        $api_key = get_option('lmw_api_key', '');
        $api_endpoint = get_option('lmw_api_endpoint', LMW_API_ENDPOINT);
        $cache_duration = get_option('lmw_cache_duration', 3600);
        ?>
        <div class="wrap">
            <h1>Link Manager Widget Settings</h1>
            
            <form method="post" action="">
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
                        var resultHtml = '<div class="notice notice-success"><p>✅ <strong>Connection successful!</strong></p>';
                        resultHtml += '<p>Site: ' + data.site.site_name + '</p>';
                        resultHtml += '<p>URL: ' + data.site.site_url + '</p>';
                        resultHtml += '<p>Limits: ' + data.site.used_links + '/' + data.site.max_links + ' links, ';
                        resultHtml += data.site.used_articles + '/' + data.site.max_articles + ' articles used</p></div>';
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
            <ul>
                <li><code>[link_manager]</code> - Display all placed content</li>
                <li><code>[lm_links position="header"]</code> - Display links (optional: position="header|footer|sidebar")</li>
            </ul>
            
            <h2>Widgets</h2>
            <p>You can also add Link Manager widgets through Appearance → Widgets:</p>
            <ul>
                <li><strong>Link Manager Links</strong> - Display placed links in widget areas</li>
            </ul>
            <p><strong>Note:</strong> Articles are now published as full WordPress posts, not as widgets.</p>
            <ul style="display:none;">
            </ul>
            
            <h2>Status</h2>
            <?php
            $content = $this->fetch_content_from_api();
            if ($content) {
                $link_count = count($content['links'] ?? []);
                $article_count = count($content['articles'] ?? []);
                echo '<p style="color: green;">✅ Connected to Link Manager API</p>';
                echo '<p>Available content: ' . $link_count . ' links, ' . $article_count . ' articles</p>';
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
        $response = wp_remote_get(
            $this->api_endpoint . '/wordpress/get-content/' . $this->api_key,
            array(
                'timeout' => 30,
                'headers' => array(
                    'Accept' => 'application/json'
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
            'style' => 'list' // list, inline, grid
        ), $atts);
        
        $content = $this->fetch_content_from_api();
        if (!$content || empty($content['links'])) {
            return '';
        }
        
        return $this->render_links($content['links'], $atts);
    }
    
    // Articles are now only published as WordPress posts, not as shortcodes
    
    /**
     * Render links
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
        
        $style = isset($atts['style']) ? $atts['style'] : 'list';
        $output = '<div class="lmw-links lmw-style-' . esc_attr($style) . '">';
        
        if ($style === 'inline') {
            $link_html = array();
            foreach ($links as $link) {
                $link_html[] = '<a href="' . esc_url($link['url']) . '" target="_blank">' . 
                              esc_html($link['anchor_text']) . '</a>';
            }
            $output .= implode(' | ', $link_html);
        } else {
            $output .= '<ul class="lmw-link-list">';
            foreach ($links as $link) {
                $output .= '<li>';
                $output .= '<a href="' . esc_url($link['url']) . '" target="_blank">';
                $output .= esc_html($link['anchor_text']);
                $output .= '</a>';
                $output .= '</li>';
            }
            $output .= '</ul>';
        }
        
        $output .= '</div>';
        
        return $output;
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
        
        echo do_shortcode('[lm_links limit="' . intval($instance['limit']) . '" style="' . esc_attr($instance['style']) . '"]');
        
        echo $args['after_widget'];
    }
    
    public function form($instance) {
        $title = !empty($instance['title']) ? $instance['title'] : 'Links';
        $limit = !empty($instance['limit']) ? $instance['limit'] : 10;
        $style = !empty($instance['style']) ? $instance['style'] : 'list';
        ?>
        <p>
            <label for="<?php echo $this->get_field_id('title'); ?>">Title:</label>
            <input class="widefat" id="<?php echo $this->get_field_id('title'); ?>" 
                   name="<?php echo $this->get_field_name('title'); ?>" type="text" 
                   value="<?php echo esc_attr($title); ?>">
        </p>
        <p>
            <label for="<?php echo $this->get_field_id('limit'); ?>">Number of links:</label>
            <input class="tiny-text" id="<?php echo $this->get_field_id('limit'); ?>" 
                   name="<?php echo $this->get_field_name('limit'); ?>" type="number" 
                   value="<?php echo esc_attr($limit); ?>">
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
        $instance['limit'] = (!empty($new_instance['limit'])) ? intval($new_instance['limit']) : 10;
        $instance['style'] = (!empty($new_instance['style'])) ? strip_tags($new_instance['style']) : 'list';
        return $instance;
    }
}

// Articles are now only published as WordPress posts, not as widgets

// Initialize the plugin
new LinkManagerWidget();