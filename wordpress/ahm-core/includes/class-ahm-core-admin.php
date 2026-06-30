<?php

if (!defined('ABSPATH')) {
    exit;
}

class AHM_Core_Admin {
    public function __construct() {
        add_action('admin_menu', array($this, 'menu'));
        add_action('admin_post_ahm_core_pair', array($this, 'pair'));
        add_action('admin_post_ahm_core_disconnect', array($this, 'disconnect'));
    }

    public function menu() {
        add_options_page('AHM Core', 'AHM Core', 'manage_options', 'ahm-core', array($this, 'render'));
    }

    public function render() {
        if (!current_user_can('manage_options')) {
            return;
        }
        $connection = AHM_Core::connection();
        $connected = !empty($connection['connectionId']);
        ?>
        <div class="wrap">
            <h1>AHM Core</h1>
            <p>Securely connect this website to AHM Webdev Manager.</p>
            <?php if (!empty($_GET['ahm_message'])) : ?>
                <div class="notice notice-<?php echo esc_attr($_GET['ahm_status'] ?? 'info'); ?> is-dismissible"><p><?php echo esc_html(wp_unslash($_GET['ahm_message'])); ?></p></div>
            <?php endif; ?>
            <?php if ($connected) : ?>
                <table class="widefat striped" style="max-width:720px">
                    <tbody>
                        <tr><th>Connection</th><td>Connected</td></tr>
                        <tr><th>Connection ID</th><td><code><?php echo esc_html($connection['connectionId']); ?></code></td></tr>
                        <tr><th>AHM API</th><td><?php echo esc_html($connection['apiUrl']); ?></td></tr>
                        <tr><th>Plugin version</th><td><?php echo esc_html(AHM_CORE_VERSION); ?></td></tr>
                    </tbody>
                </table>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-top:16px">
                    <?php wp_nonce_field('ahm_core_disconnect'); ?>
                    <input type="hidden" name="action" value="ahm_core_disconnect">
                    <?php submit_button('Disconnect', 'secondary delete', 'submit', false); ?>
                </form>
            <?php else : ?>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="max-width:720px">
                    <?php wp_nonce_field('ahm_core_pair'); ?>
                    <input type="hidden" name="action" value="ahm_core_pair">
                    <table class="form-table">
                        <tr>
                            <th><label for="ahm_api_url">AHM API URL</label></th>
                            <td><input class="regular-text" type="url" id="ahm_api_url" name="api_url" placeholder="https://manager-api.example.com" required></td>
                        </tr>
                        <tr>
                            <th><label for="ahm_pairing_code">Pairing code</label></th>
                            <td><input class="regular-text" type="text" id="ahm_pairing_code" name="pairing_code" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" required></td>
                        </tr>
                    </table>
                    <?php submit_button('Connect to AHM'); ?>
                </form>
            <?php endif; ?>
        </div>
        <?php
    }

    public function pair() {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized.');
        }
        check_admin_referer('ahm_core_pair');
        $api_url = untrailingslashit(esc_url_raw(wp_unslash($_POST['api_url'] ?? '')));
        $code = sanitize_text_field(wp_unslash($_POST['pairing_code'] ?? ''));
        $url = $api_url . '/api/v1/connectors/wordpress/pair';
        $response = wp_remote_post($url, array(
            'timeout' => 30,
            'headers' => array('Content-Type' => 'application/json'),
            'body' => wp_json_encode(array(
                'code' => $code,
                'siteUrl' => home_url('/'),
                'pluginVersion' => AHM_CORE_VERSION,
                'capabilities' => AHM_Core::capabilities(),
                'snapshot' => AHM_Core::snapshot(),
            )),
        ));
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) >= 300) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            $message = is_wp_error($response) ? $response->get_error_message() : ($body['error']['message'] ?? 'Pairing failed.');
            $this->redirect($message, 'error');
        }
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (empty($body['connectionId']) || empty($body['secret'])) {
            $this->redirect('The AHM API returned an invalid pairing response.', 'error');
        }
        AHM_Core::save_connection(array(
            'apiUrl' => $api_url,
            'connectionId' => sanitize_text_field($body['connectionId']),
            'secret' => sanitize_text_field($body['secret']),
            'connectedAt' => gmdate('c'),
        ));
        $this->redirect('AHM Core is connected.', 'success');
    }

    public function disconnect() {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized.');
        }
        check_admin_referer('ahm_core_disconnect');
        AHM_Core::disconnect();
        $this->redirect('AHM Core was disconnected.', 'success');
    }

    private function redirect($message, $status) {
        wp_safe_redirect(add_query_arg(array(
            'page' => 'ahm-core',
            'ahm_message' => $message,
            'ahm_status' => $status,
        ), admin_url('options-general.php')));
        exit;
    }
}
