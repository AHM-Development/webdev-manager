<?php

if (!defined('ABSPATH')) {
    exit;
}

final class AHM_Core {
    const OPTION = 'ahm_core_connection';
    const API_URL_OPTION = 'ahm_core_api_url';
    const CRON_HOOK = 'ahm_core_heartbeat';

    private static $instance;

    public static function instance() {
        if (!self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        new AHM_Core_Admin();
        new AHM_Core_REST();
        new AHM_Core_Installer();
        new AHM_Core_Roles();
        add_action(self::CRON_HOOK, array($this, 'send_heartbeat'));
        add_action('wp_login', array($this, 'record_login'), 10, 2);
        add_action('after_password_reset', array($this, 'record_password_reset'), 10, 2);
        add_action('user_register', array($this, 'record_user_created'));
    }

    public static function activate() {
        if (!wp_next_scheduled(self::CRON_HOOK)) {
            wp_schedule_event(time() + 300, 'hourly', self::CRON_HOOK);
        }
        AHM_Core_Roles::add_role();
    }

    public static function deactivate() {
        wp_clear_scheduled_hook(self::CRON_HOOK);
    }

    public static function uninstall() {
        AHM_Core_Roles::remove_role();
        delete_option(self::OPTION);
        delete_option(self::API_URL_OPTION);
    }

    public function record_login($login, $user) {
        update_user_meta($user->ID, '_ahm_last_login_at', gmdate('c'));
    }

    public function record_password_reset($user) {
        update_user_meta($user->ID, '_ahm_password_updated_at', gmdate('c'));
    }

    public function record_user_created($user_id) {
        update_user_meta($user_id, '_ahm_password_updated_at', gmdate('c'));
    }

    public static function connection() {
        $value = get_option(self::OPTION, array());
        return is_array($value) ? $value : array();
    }

    public static function save_connection($value) {
        update_option(self::OPTION, $value, false);
    }

    public static function disconnect() {
        delete_option(self::OPTION);
    }

    /**
     * Resolves the AHM Manager API URL. A site owner can pre-bake it with a
     * `AHM_API_URL` constant (wp-config.php) or the `ahm_core_api_url` filter,
     * so admins only paste the pairing code. Otherwise the last URL used to
     * connect is remembered.
     */
    public static function api_url() {
        if (defined('AHM_API_URL') && AHM_API_URL) {
            return untrailingslashit(AHM_API_URL);
        }
        $url = apply_filters('ahm_core_api_url', get_option(self::API_URL_OPTION, ''));
        if (empty($url)) {
            $connection = self::connection();
            $url = isset($connection['apiUrl']) ? $connection['apiUrl'] : '';
        }
        return $url ? untrailingslashit($url) : '';
    }

    /** True when the API URL is fixed by a constant/filter (admin can't change it). */
    public static function api_url_locked() {
        return (defined('AHM_API_URL') && AHM_API_URL) || has_filter('ahm_core_api_url');
    }

    public static function remember_api_url($url) {
        if ($url) {
            update_option(self::API_URL_OPTION, untrailingslashit($url), false);
        }
    }

    public static function capabilities() {
        return array('snapshot', 'wordpress', 'plugins', 'users', 'activity', 'security', 'heartbeat', 'forms', 'required-plugins', 'seo-manager-role');
    }

    public static function snapshot() {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        require_once ABSPATH . 'wp-admin/includes/update.php';

        $plugin_updates = get_site_transient('update_plugins');
        $plugins = array();
        foreach (get_plugins() as $file => $data) {
            $update = isset($plugin_updates->response[$file]) ? $plugin_updates->response[$file] : null;
            $plugins[] = array(
                'name' => $data['Name'],
                'file' => $file,
                'version' => $data['Version'],
                'latestVersion' => $update && !empty($update->new_version) ? $update->new_version : $data['Version'],
                'active' => is_plugin_active($file),
                'updateAvailable' => (bool) $update,
            );
        }

        $users = array();
        foreach (get_users() as $user) {
            $users[] = array(
                'id' => (string) $user->ID,
                'name' => $user->display_name,
                'email' => $user->user_email,
                'role' => !empty($user->roles[0]) ? $user->roles[0] : 'unknown',
                'lastLoginAt' => get_user_meta($user->ID, '_ahm_last_login_at', true) ?: null,
                'passwordUpdatedAt' => get_user_meta($user->ID, '_ahm_password_updated_at', true) ?: null,
            );
        }

        $core_updates = get_site_transient('update_core');
        $latest_core = get_bloginfo('version');
        if (!empty($core_updates->updates[0]->current)) {
            $latest_core = $core_updates->updates[0]->current;
        }

        $theme = wp_get_theme();
        $latest_post = get_posts(array(
            'post_type' => 'any',
            'post_status' => array('publish', 'private'),
            'posts_per_page' => 1,
            'orderby' => 'modified',
            'order' => 'DESC',
        ));
        // Content-age signals: newest/oldest published blog post + counts.
        $newest_blog = get_posts(array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => 1,
            'orderby' => 'date',
            'order' => 'DESC',
        ));
        $oldest_blog = get_posts(array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => 1,
            'orderby' => 'date',
            'order' => 'ASC',
        ));
        $post_counts = wp_count_posts('post');
        $page_counts = wp_count_posts('page');

        // Operational service configuration (read-only option probes).
        $smtp_options = get_option('wp_mail_smtp', array());
        $smtp_mailer = (is_array($smtp_options) && !empty($smtp_options['mail']['mailer'])) ? $smtp_options['mail']['mailer'] : '';
        $backup_interval = get_option('updraft_interval', '');
        $backup_interval = is_string($backup_interval) ? $backup_interval : '';

        return array(
            'pluginVersion' => AHM_CORE_VERSION,
            'siteUrl' => home_url('/'),
            'lastActivityAt' => !empty($latest_post[0]) ? get_post_modified_time('c', true, $latest_post[0]) : null,
            'content' => array(
                'lastModifiedAt' => !empty($latest_post[0]) ? get_post_modified_time('c', true, $latest_post[0]) : null,
                'lastPostPublishedAt' => !empty($newest_blog[0]) ? get_post_time('c', true, $newest_blog[0]) : null,
                'firstPostPublishedAt' => !empty($oldest_blog[0]) ? get_post_time('c', true, $oldest_blog[0]) : null,
                'publishedPosts' => isset($post_counts->publish) ? (int) $post_counts->publish : 0,
                'draftPosts' => isset($post_counts->draft) ? (int) $post_counts->draft : 0,
                'publishedPages' => isset($page_counts->publish) ? (int) $page_counts->publish : 0,
            ),
            'services' => array(
                'smtpMailer' => $smtp_mailer,
                'smtpConfigured' => $smtp_mailer !== '' && $smtp_mailer !== 'mail',
                'backupInterval' => $backup_interval,
                'backupScheduled' => $backup_interval !== '' && $backup_interval !== 'manual',
            ),
            'wordpress' => array(
                'version' => get_bloginfo('version'),
                'latestVersion' => $latest_core,
                'multisite' => is_multisite(),
            ),
            'phpVersion' => PHP_VERSION,
            'theme' => array(
                'name' => $theme->get('Name'),
                'version' => $theme->get('Version'),
                'parent' => $theme->parent() ? $theme->parent()->get('Name') : null,
            ),
            'plugins' => $plugins,
            'users' => $users,
            'security' => array(
                'ssl' => is_ssl(),
                'debug' => defined('WP_DEBUG') && WP_DEBUG,
                'debugDisplay' => defined('WP_DEBUG_DISPLAY') && WP_DEBUG_DISPLAY,
                'fileEditDisabled' => defined('DISALLOW_FILE_EDIT') && DISALLOW_FILE_EDIT,
                'wpCronDisabled' => defined('DISABLE_WP_CRON') && DISABLE_WP_CRON,
                'xmlrpcEnabled' => apply_filters('xmlrpc_enabled', true),
            ),
            'generatedAt' => gmdate('c'),
        );
    }

    private static function split_emails($value) {
        if (is_array($value)) {
            $value = implode(',', $value);
        }
        $parts = preg_split('/[,;]+/', (string) $value);
        $out = array();
        foreach ($parts as $part) {
            $part = trim($part);
            if ($part !== '') {
                $out[] = $part;
            }
        }
        return array_values(array_unique($out));
    }

    // Parse "Cc:" / "Bcc:" recipients out of a Contact Form 7 additional-headers block.
    private static function header_emails($headers, $name) {
        $out = array();
        foreach (preg_split('/\r\n|\r|\n/', (string) $headers) as $line) {
            if (stripos($line, $name . ':') === 0) {
                $out = array_merge($out, self::split_emails(substr($line, strlen($name) + 1)));
            }
        }
        return array_values(array_unique($out));
    }

    // Recursively collect Elementor form widgets from decoded _elementor_data.
    private static function find_elementor_forms($nodes, &$found) {
        if (!is_array($nodes)) {
            return;
        }
        foreach ($nodes as $node) {
            if (!is_array($node)) {
                continue;
            }
            if (isset($node['widgetType']) && $node['widgetType'] === 'form') {
                $found[] = $node;
            }
            if (!empty($node['elements'])) {
                self::find_elementor_forms($node['elements'], $found);
            }
        }
    }

    // Enumerate forms across Contact Form 7, WPForms, and Elementor Forms with
    // their fields and mail recipients (to / cc / bcc). Read-only.
    public static function forms() {
        $forms = array();

        if (class_exists('WPCF7_ContactForm')) {
            $cf7_forms = WPCF7_ContactForm::find(array('posts_per_page' => -1));
            foreach ($cf7_forms as $cf) {
                $mail = $cf->prop('mail');
                if (!is_array($mail)) {
                    $mail = array();
                }
                $headers = isset($mail['additional_headers']) ? $mail['additional_headers'] : '';
                $fields = array();
                foreach ($cf->scan_form_tags() as $tag) {
                    if (empty($tag->name)) {
                        continue;
                    }
                    $fields[] = array(
                        'name' => $tag->name,
                        'type' => $tag->basetype,
                        'required' => substr($tag->type, -1) === '*',
                    );
                }
                $forms[] = array(
                    'plugin' => 'Contact Form 7',
                    'id' => (string) $cf->id(),
                    'title' => $cf->title(),
                    'recipients' => self::split_emails(isset($mail['recipient']) ? $mail['recipient'] : ''),
                    'cc' => self::header_emails($headers, 'Cc'),
                    'bcc' => self::header_emails($headers, 'Bcc'),
                    'subject' => isset($mail['subject']) ? $mail['subject'] : '',
                    'from' => isset($mail['sender']) ? $mail['sender'] : '',
                    'fields' => $fields,
                    'locator' => '[contact-form-7 id="' . $cf->id() . '"]',
                    'pageUrl' => null,
                );
            }
        }

        if (post_type_exists('wpforms')) {
            $wpforms_posts = get_posts(array('post_type' => 'wpforms', 'post_status' => 'publish', 'posts_per_page' => -1));
            foreach ($wpforms_posts as $post) {
                $data = json_decode($post->post_content, true);
                if (!is_array($data)) {
                    continue;
                }
                $fields = array();
                if (!empty($data['fields']) && is_array($data['fields'])) {
                    foreach ($data['fields'] as $field) {
                        $fields[] = array(
                            'name' => isset($field['label']) && $field['label'] !== '' ? $field['label'] : (isset($field['id']) ? 'Field ' . $field['id'] : 'Field'),
                            'type' => isset($field['type']) ? $field['type'] : '',
                            'required' => !empty($field['required']),
                        );
                    }
                }
                $recipients = array();
                $cc = array();
                if (!empty($data['settings']['notifications']) && is_array($data['settings']['notifications'])) {
                    foreach ($data['settings']['notifications'] as $notification) {
                        if (!empty($notification['email'])) {
                            $recipients = array_merge($recipients, self::split_emails($notification['email']));
                        }
                        if (!empty($notification['carboncopy']) && !empty($notification['carboncopy_email'])) {
                            $cc = array_merge($cc, self::split_emails($notification['carboncopy_email']));
                        }
                    }
                }
                $forms[] = array(
                    'plugin' => 'WPForms',
                    'id' => (string) $post->ID,
                    'title' => get_the_title($post),
                    'recipients' => array_values(array_unique($recipients)),
                    'cc' => array_values(array_unique($cc)),
                    'bcc' => array(),
                    'subject' => '',
                    'from' => '',
                    'fields' => $fields,
                    'locator' => '[wpforms id="' . $post->ID . '"]',
                    'pageUrl' => null,
                );
            }
        }

        if (did_action('elementor/loaded')) {
            $elementor_posts = get_posts(array(
                'post_type' => 'any',
                'post_status' => 'publish',
                'posts_per_page' => -1,
                'meta_key' => '_elementor_edit_mode',
                'meta_value' => 'builder',
            ));
            foreach ($elementor_posts as $post) {
                $raw = get_post_meta($post->ID, '_elementor_data', true);
                if (empty($raw)) {
                    continue;
                }
                $decoded = json_decode($raw, true);
                if (!is_array($decoded)) {
                    continue;
                }
                $widgets = array();
                self::find_elementor_forms($decoded, $widgets);
                foreach ($widgets as $widget) {
                    $settings = isset($widget['settings']) && is_array($widget['settings']) ? $widget['settings'] : array();
                    $fields = array();
                    if (!empty($settings['form_fields']) && is_array($settings['form_fields'])) {
                        foreach ($settings['form_fields'] as $field) {
                            $label = isset($field['field_label']) && $field['field_label'] !== '' ? $field['field_label'] : (isset($field['custom_id']) ? $field['custom_id'] : '');
                            $fields[] = array(
                                'name' => $label,
                                'type' => isset($field['field_type']) ? $field['field_type'] : '',
                                'required' => !empty($field['required']),
                            );
                        }
                    }
                    // Elementor stores the Email action recipients under these keys;
                    // fall back across known variants for robustness.
                    $to = isset($settings['email_to']) ? $settings['email_to'] : '';
                    $cc = isset($settings['email_to_cc']) ? $settings['email_to_cc'] : (isset($settings['email_cc']) ? $settings['email_cc'] : '');
                    $bcc = isset($settings['email_to_bcc']) ? $settings['email_to_bcc'] : (isset($settings['email_bcc']) ? $settings['email_bcc'] : '');
                    $forms[] = array(
                        'plugin' => 'Elementor Forms',
                        'id' => (string) $post->ID . ':' . (isset($widget['id']) ? $widget['id'] : ''),
                        'title' => isset($settings['form_name']) && $settings['form_name'] !== '' ? $settings['form_name'] : get_the_title($post),
                        'recipients' => self::split_emails($to),
                        'cc' => self::split_emails($cc),
                        'bcc' => self::split_emails($bcc),
                        'subject' => isset($settings['email_subject']) ? $settings['email_subject'] : '',
                        'from' => isset($settings['email_from']) ? $settings['email_from'] : '',
                        'fields' => $fields,
                        'locator' => null,
                        'pageUrl' => get_permalink($post->ID),
                    );
                }
            }
        }

        return array('forms' => $forms, 'generatedAt' => gmdate('c'));
    }

    // Sends one clearly-marked test email to a supplied address, reusing the
    // form's From/subject where available. Does NOT run the form's submission
    // pipeline (no CAPTCHA, no CRM/webhook side effects) — it only exercises
    // the site's mail transport (e.g. WP Mail SMTP) to confirm deliverability.
    public static function send_form_test($form_id, $to) {
        $to = sanitize_email((string) $to);
        if (!is_email($to)) {
            return array('sent' => false, 'error' => 'A valid test recipient address is required.');
        }
        $match = null;
        $catalog = self::forms();
        foreach ($catalog['forms'] as $form) {
            if ($form['id'] === (string) $form_id) {
                $match = $form;
                break;
            }
        }
        $title = $match ? $match['title'] : (string) $form_id;
        $plugin = $match ? $match['plugin'] : 'unknown plugin';
        $subject = '[AHM Test] ' . ($match && !empty($match['subject']) ? $match['subject'] : ('Delivery test for "' . $title . '"'));
        $headers = array('Content-Type: text/html; charset=UTF-8');
        if ($match && !empty($match['from'])) {
            $headers[] = 'From: ' . $match['from'];
        }
        $body = '<p>This is an automated <strong>delivery test</strong> sent by AHM Core for the form '
            . '<strong>' . esc_html($title) . '</strong> (' . esc_html($plugin) . ') on ' . esc_html(home_url('/')) . '.</p>'
            . '<p>No form was actually submitted. If you received this, the site\'s email delivery is working. '
            . 'Sent ' . esc_html(gmdate('c')) . '.</p>';
        $sent = wp_mail($to, $subject, $body, $headers);
        return array('sent' => (bool) $sent, 'to' => $to, 'form' => $title, 'plugin' => $plugin);
    }

    public static function signature_headers($method, $url, $body) {
        $connection = self::connection();
        if (empty($connection['connectionId']) || empty($connection['secret'])) {
            return array();
        }
        $timestamp = (string) time();
        $nonce = wp_generate_password(24, false, false);
        $path = wp_parse_url($url, PHP_URL_PATH);
        $body_hash = hash('sha256', $body);
        $canonical = implode("\n", array($timestamp, $nonce, strtoupper($method), $path, $body_hash));
        return array(
            'X-AHM-Connection' => $connection['connectionId'],
            'X-AHM-Timestamp' => $timestamp,
            'X-AHM-Nonce' => $nonce,
            'X-AHM-Signature' => hash_hmac('sha256', $canonical, $connection['secret']),
            'Content-Type' => 'application/json',
        );
    }

    public function send_heartbeat() {
        $connection = self::connection();
        if (empty($connection['apiUrl']) || empty($connection['connectionId'])) {
            return;
        }
        $url = untrailingslashit($connection['apiUrl']) . '/api/v1/connectors/wordpress/heartbeat';
        $body = wp_json_encode(array(
            'pluginVersion' => AHM_CORE_VERSION,
            'capabilities' => self::capabilities(),
            'snapshot' => self::snapshot(),
        ));
        wp_remote_post($url, array(
            'timeout' => 20,
            'headers' => self::signature_headers('POST', $url, $body),
            'body' => $body,
        ));
    }
}
