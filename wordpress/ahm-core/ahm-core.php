<?php
/**
 * Plugin Name: AHM Core
 * Description: Securely connects WordPress to AHM Webdev Manager and provides extensible site operations capabilities.
 * Version: 1.0.0
 * Author: Allied Health Media
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Text Domain: ahm-core
 */

if (!defined('ABSPATH')) {
    exit;
}

define('AHM_CORE_VERSION', '1.0.0');
define('AHM_CORE_FILE', __FILE__);
define('AHM_CORE_DIR', plugin_dir_path(__FILE__));

require_once AHM_CORE_DIR . 'includes/class-ahm-core-required.php';
require_once AHM_CORE_DIR . 'includes/class-ahm-core.php';
require_once AHM_CORE_DIR . 'includes/class-ahm-core-admin.php';
require_once AHM_CORE_DIR . 'includes/class-ahm-core-rest.php';
require_once AHM_CORE_DIR . 'includes/class-ahm-core-installer.php';
require_once AHM_CORE_DIR . 'includes/class-ahm-core-roles.php';

register_activation_hook(__FILE__, array('AHM_Core', 'activate'));
register_deactivation_hook(__FILE__, array('AHM_Core', 'deactivate'));
register_uninstall_hook(__FILE__, array('AHM_Core', 'uninstall'));

AHM_Core::instance();
