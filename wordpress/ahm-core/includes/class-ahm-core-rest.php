<?php

if (!defined('ABSPATH')) {
    exit;
}

class AHM_Core_REST {
    public function __construct() {
        add_action('rest_api_init', array($this, 'routes'));
    }

    public function routes() {
        register_rest_route('ahm-core/v1', '/status', array(
            'methods' => 'GET',
            'callback' => array($this, 'status'),
            'permission_callback' => array($this, 'authorize'),
        ));
        register_rest_route('ahm-core/v1', '/snapshot', array(
            'methods' => 'GET',
            'callback' => array($this, 'snapshot'),
            'permission_callback' => array($this, 'authorize'),
        ));
    }

    public function authorize(WP_REST_Request $request) {
        $connection = AHM_Core::connection();
        $connection_id = $request->get_header('x-ahm-connection');
        $timestamp = $request->get_header('x-ahm-timestamp');
        $nonce = $request->get_header('x-ahm-nonce');
        $received = $request->get_header('x-ahm-signature');
        if (empty($connection['connectionId']) || empty($connection['secret']) || !hash_equals($connection['connectionId'], (string) $connection_id)) {
            return new WP_Error('ahm_unauthorized', 'Unknown AHM connection.', array('status' => 401));
        }
        if (!$timestamp || abs(time() - (int) $timestamp) > 300 || !$nonce || !$received) {
            return new WP_Error('ahm_expired', 'Expired or incomplete AHM signature.', array('status' => 401));
        }
        $nonce_key = 'ahm_nonce_' . hash('sha256', $nonce);
        if (get_transient($nonce_key)) {
            return new WP_Error('ahm_replay', 'AHM request replay rejected.', array('status' => 401));
        }
        set_transient($nonce_key, 1, 10 * MINUTE_IN_SECONDS);
        $body_hash = hash('sha256', $request->get_body());
        $path = '/wp-json' . $request->get_route();
        $canonical = implode("\n", array($timestamp, $nonce, $request->get_method(), $path, $body_hash));
        $expected = hash_hmac('sha256', $canonical, $connection['secret']);
        if (!hash_equals($expected, $received)) {
            return new WP_Error('ahm_signature', 'Invalid AHM signature.', array('status' => 401));
        }
        return true;
    }

    public function status() {
        return rest_ensure_response(array(
            'connected' => true,
            'pluginVersion' => AHM_CORE_VERSION,
            'capabilities' => AHM_Core::capabilities(),
            'serverTime' => gmdate('c'),
        ));
    }

    public function snapshot() {
        return rest_ensure_response(AHM_Core::snapshot());
    }
}
