<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Guided installer for the required plugins. Shows an admin notice listing what
 * is missing/inactive with a one-click "Install & activate all" button.
 * Repo plugins install by slug; bundled plugins install from /bundled/*.zip.
 */
class AHM_Core_Installer {
    const ACTION = 'ahm_core_install_required';
    const RESULT = 'ahm_core_install_result';

    public function __construct() {
        add_action('admin_notices', array($this, 'notice'));
        add_action('admin_post_' . self::ACTION, array($this, 'handle'));
    }

    public function notice() {
        if (!current_user_can('install_plugins')) {
            return;
        }

        $result = get_transient(self::RESULT);
        if ($result) {
            delete_transient(self::RESULT);
            printf(
                '<div class="notice notice-%s is-dismissible"><p>%s</p></div>',
                esc_attr($result['status']),
                esc_html($result['message'])
            );
        }

        $pending = AHM_Core_Required::pending();
        if (empty($pending)) {
            return;
        }
        $names = array();
        foreach ($pending as $plugin) {
            $names[] = $plugin['name'];
        }
        ?>
        <div class="notice notice-warning">
            <p><strong>AHM Core:</strong> the following required plugins are missing or inactive — <?php echo esc_html(implode(', ', $names)); ?>.</p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-bottom:8px">
                <?php wp_nonce_field(self::ACTION); ?>
                <input type="hidden" name="action" value="<?php echo esc_attr(self::ACTION); ?>">
                <?php submit_button('Install & activate all', 'primary', 'submit', false); ?>
            </form>
        </div>
        <?php
    }

    public function handle() {
        if (!current_user_can('install_plugins')) {
            wp_die('Unauthorized.');
        }
        check_admin_referer(self::ACTION);

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/misc.php';
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';

        $installed = 0;
        $activated = 0;
        $failed = array();

        foreach (AHM_Core_Required::plugins() as $plugin) {
            $file = $plugin['file'];

            if (!AHM_Core_Required::is_installed($file)) {
                $package = self::package($plugin);
                if (is_wp_error($package)) {
                    $failed[] = $plugin['name'] . ' (' . $package->get_error_message() . ')';
                    continue;
                }
                $upgrader = new Plugin_Upgrader(new Automatic_Upgrader_Skin());
                $result = $upgrader->install($package);
                if (is_wp_error($result) || !$result) {
                    $failed[] = $plugin['name'] . ' (install failed)';
                    continue;
                }
                $installed++;
            }

            if (!AHM_Core_Required::is_active($file)) {
                $activate = activate_plugin($file);
                if (is_wp_error($activate)) {
                    $failed[] = $plugin['name'] . ' (activation failed)';
                    continue;
                }
                $activated++;
            }
        }

        $message = sprintf('AHM Core: installed %d and activated %d required plugin(s).', $installed, $activated);
        if (!empty($failed)) {
            $message .= ' Could not complete: ' . implode('; ', $failed) . '.';
        }
        set_transient(self::RESULT, array(
            'message' => $message,
            'status' => empty($failed) ? 'success' : 'error',
        ), 120);

        wp_safe_redirect(admin_url('plugins.php'));
        exit;
    }

    /** Resolves the install package: a repo download link or a bundled zip path. */
    private static function package($plugin) {
        if ($plugin['source'] === 'bundled') {
            $zip = AHM_CORE_DIR . 'bundled/' . $plugin['zip'];
            if (!file_exists($zip)) {
                return new WP_Error('ahm_missing_zip', 'bundled zip not found: ' . $plugin['zip']);
            }
            return $zip;
        }
        $api = plugins_api('plugin_information', array('slug' => $plugin['slug'], 'fields' => array('sections' => false)));
        if (is_wp_error($api) || empty($api->download_link)) {
            return new WP_Error('ahm_repo', 'could not look up ' . $plugin['slug'] . ' on wordpress.org');
        }
        return $api->download_link;
    }
}
