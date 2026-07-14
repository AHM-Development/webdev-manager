<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The "SEO Manager" role: full Administrator capabilities EXCEPT user management
 * (no Users area at all), and cannot deactivate or delete the required plugins.
 * WordPress has no per-plugin capability, so plugin protection is enforced with
 * action-link removal plus a hard server-side guard.
 */
class AHM_Core_Roles {
    const ROLE = 'seo_manager';

    public function __construct() {
        add_filter('plugin_action_links', array($this, 'lock_action_links'), 20, 2);
        add_action('admin_init', array($this, 'guard_plugin_changes'));
        add_action('admin_menu', array($this, 'hide_users_menu'), 999);
    }

    /** Creates/refreshes the role from current Administrator caps, minus user management. */
    public static function add_role() {
        $admin = get_role('administrator');
        if (!$admin) {
            return;
        }
        $caps = $admin->capabilities;
        foreach (array('create_users', 'edit_users', 'delete_users', 'promote_users', 'remove_users', 'list_users') as $cap) {
            unset($caps[$cap]);
        }
        remove_role(self::ROLE);
        add_role(self::ROLE, 'SEO Manager', $caps);
    }

    public static function remove_role() {
        remove_role(self::ROLE);
    }

    private static function is_seo_manager() {
        $user = wp_get_current_user();
        return $user && in_array(self::ROLE, (array) $user->roles, true);
    }

    /** Removes the Deactivate/Delete links on protected plugins for SEO Managers. */
    public function lock_action_links($actions, $plugin_file) {
        if (self::is_seo_manager() && in_array($plugin_file, AHM_Core_Required::protected_files(), true)) {
            unset($actions['deactivate'], $actions['delete']);
        }
        return $actions;
    }

    /** Blocks deactivate/delete of protected plugins by an SEO Manager via any route. */
    public function guard_plugin_changes() {
        if (!self::is_seo_manager()) {
            return;
        }
        global $pagenow;
        if ($pagenow !== 'plugins.php') {
            return;
        }

        $action = isset($_REQUEST['action']) ? sanitize_text_field(wp_unslash($_REQUEST['action'])) : '';
        if (($action === '' || $action === '-1') && isset($_REQUEST['action2'])) {
            $action = sanitize_text_field(wp_unslash($_REQUEST['action2']));
        }

        $targets = array();
        if (!empty($_REQUEST['plugin'])) {
            $targets[] = sanitize_text_field(wp_unslash($_REQUEST['plugin']));
        }
        if (!empty($_REQUEST['checked']) && is_array($_REQUEST['checked'])) {
            foreach (wp_unslash($_REQUEST['checked']) as $checked) {
                $targets[] = sanitize_text_field($checked);
            }
        }

        $blocked_actions = array('deactivate', 'deactivate-selected', 'delete-selected');
        if (in_array($action, $blocked_actions, true) && array_intersect($targets, AHM_Core_Required::protected_files())) {
            wp_die('These plugins are required by AHM Core and cannot be deactivated or deleted by an SEO Manager.');
        }
    }

    public function hide_users_menu() {
        if (self::is_seo_manager()) {
            remove_menu_page('users.php');
        }
    }
}
