<?php

if (!defined('ABSPATH')) {
    exit;
}

final class AHM_Core {
    const OPTION = 'ahm_core_connection';
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
        add_action(self::CRON_HOOK, array($this, 'send_heartbeat'));
        add_action('wp_login', array($this, 'record_login'), 10, 2);
        add_action('after_password_reset', array($this, 'record_password_reset'), 10, 2);
        add_action('user_register', array($this, 'record_user_created'));
    }

    public static function activate() {
        if (!wp_next_scheduled(self::CRON_HOOK)) {
            wp_schedule_event(time() + 300, 'hourly', self::CRON_HOOK);
        }
    }

    public static function deactivate() {
        wp_clear_scheduled_hook(self::CRON_HOOK);
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

    public static function capabilities() {
        return array('snapshot', 'wordpress', 'plugins', 'users', 'activity', 'security', 'heartbeat');
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

        return array(
            'pluginVersion' => AHM_CORE_VERSION,
            'siteUrl' => home_url('/'),
            'lastActivityAt' => !empty($latest_post[0]) ? get_post_modified_time('c', true, $latest_post[0]) : null,
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
