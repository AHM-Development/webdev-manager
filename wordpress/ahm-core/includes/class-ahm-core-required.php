<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The canonical list of plugins AHM Core requires on a managed site, plus
 * helpers used by the installer (part A) and the SEO Manager guards (part B).
 *
 * `file`   – the plugin's main file relative to wp-content/plugins (used to
 *            check install/active state and to activate).
 * `source` – 'wporg' (installed from the repo by `slug`) or 'bundled'
 *            (installed from a zip shipped in this plugin's /bundled folder).
 *
 * NOTE: the `file` paths for the bundled plugins are best-effort — if a real
 * zip unpacks to a different folder/main file, update it here.
 */
class AHM_Core_Required {
    public static function plugins() {
        return array(
            array('name' => 'Elementor',        'file' => 'elementor/elementor.php',                        'source' => 'wporg',   'slug' => 'elementor'),
            array('name' => 'Rank Math SEO',    'file' => 'seo-by-rank-math/rank-math.php',                 'source' => 'wporg',   'slug' => 'seo-by-rank-math'),
            array('name' => 'UpdraftPlus',      'file' => 'updraftplus/updraftplus.php',                    'source' => 'wporg',   'slug' => 'updraftplus'),
            array('name' => 'WP Activity Log',  'file' => 'wp-security-audit-log/wp-security-audit-log.php', 'source' => 'wporg',   'slug' => 'wp-security-audit-log'),
            array('name' => 'PRO Elements',     'file' => 'pro-elements/pro-elements.php',                  'source' => 'bundled', 'zip' => 'pro-elements.zip'),
            array('name' => 'Kadence Security', 'file' => 'kadence-security/kadence-security.php',          'source' => 'bundled', 'zip' => 'kadence-security.zip'),
        );
    }

    /**
     * Plugin files that must not be deactivated/deleted by an SEO Manager,
     * including AHM Core itself.
     */
    public static function protected_files() {
        $files = array(plugin_basename(AHM_CORE_FILE));
        foreach (self::plugins() as $plugin) {
            $files[] = $plugin['file'];
        }
        return array_values(array_unique($files));
    }

    public static function is_installed($file) {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $all = get_plugins();
        return isset($all[$file]);
    }

    public static function is_active($file) {
        if (!function_exists('is_plugin_active')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        return is_plugin_active($file);
    }

    /** Required plugins that are currently missing or inactive. */
    public static function pending() {
        $pending = array();
        foreach (self::plugins() as $plugin) {
            if (!self::is_installed($plugin['file']) || !self::is_active($plugin['file'])) {
                $pending[] = $plugin;
            }
        }
        return $pending;
    }
}
