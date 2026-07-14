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
        // Gate on edit_users so an SEO Manager (full admin minus user management)
        // cannot reach the connect/disconnect screen and unhook the connector.
        add_options_page('AHM Core', 'AHM Core', 'edit_users', 'ahm-core', array($this, 'render'));
    }

    public function render() {
        if (!current_user_can('edit_users')) {
            return;
        }
        $connection = AHM_Core::connection();
        $connected = !empty($connection['connectionId']);
        $api_url = AHM_Core::api_url();
        $locked = AHM_Core::api_url_locked();
        ?>
        <div class="wrap">
            <h1>AHM Core</h1>
            <p>Securely connect this website to AHM Webdev Manager.</p>
            <?php if (!empty($_GET['ahm_message'])) : ?>
                <div class="notice notice-<?php echo esc_attr($_GET['ahm_status'] ?? 'info'); ?> is-dismissible"><p><?php echo esc_html(wp_unslash($_GET['ahm_message'])); ?></p></div>
            <?php endif; ?>
            <?php if ($connected) : ?>
                <div class="notice notice-success inline" style="max-width:720px"><p><strong>Connected.</strong> This site is securely linked to AHM Webdev Manager.</p></div>
                <table class="widefat striped" style="max-width:720px">
                    <tbody>
                        <tr><th style="width:180px">Status</th><td>Connected</td></tr>
                        <tr><th>Connection ID</th><td><code><?php echo esc_html($connection['connectionId']); ?></code></td></tr>
                        <tr><th>Manager API</th><td><?php echo esc_html($connection['apiUrl'] ?? $api_url); ?></td></tr>
                        <tr><th>Connected</th><td><?php echo esc_html($connection['connectedAt'] ?? '—'); ?></td></tr>
                        <tr><th>Plugin version</th><td><?php echo esc_html(AHM_CORE_VERSION); ?></td></tr>
                        <tr><th>Capabilities</th><td><?php echo esc_html(implode(', ', AHM_Core::capabilities())); ?></td></tr>
                    </tbody>
                </table>
                <p class="description" style="max-width:720px">The secret is stored encrypted and never leaves this site in plain text. Disconnecting revokes access immediately.</p>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-top:16px">
                    <?php wp_nonce_field('ahm_core_disconnect'); ?>
                    <input type="hidden" name="action" value="ahm_core_disconnect">
                    <?php submit_button('Disconnect', 'secondary delete', 'submit', false); ?>
                </form>
            <?php else : ?>
                <ol style="max-width:720px;font-size:14px">
                    <li>In AHM Webdev Manager, open the website and choose <strong>Connect AHM Core</strong>.</li>
                    <li>Copy the 8-digit pairing code it shows<?php echo $locked ? '' : ' (and the Manager API URL)'; ?>.</li>
                    <li>Paste it below and click <strong>Connect to AHM</strong>. The code expires shortly, so connect promptly.</li>
                </ol>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="max-width:720px">
                    <?php wp_nonce_field('ahm_core_pair'); ?>
                    <input type="hidden" name="action" value="ahm_core_pair">
                    <table class="form-table">
                        <tr>
                            <th><label for="ahm_api_url">Manager API URL</label></th>
                            <td>
                                <?php if ($locked) : ?>
                                    <code><?php echo esc_html($api_url); ?></code>
                                    <p class="description">Pre-configured for this site.</p>
                                <?php else : ?>
                                    <input class="regular-text" type="url" id="ahm_api_url" name="api_url" value="<?php echo esc_attr($api_url); ?>" placeholder="https://manager-api.example.com" required>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <tr>
                            <th><label for="ahm_pairing_code">Pairing code</label></th>
                            <td><input class="regular-text" type="text" id="ahm_pairing_code" name="pairing_code" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="off" required></td>
                        </tr>
                    </table>
                    <?php submit_button('Connect to AHM'); ?>
                </form>
            <?php endif; ?>
        </div>
        <?php
    }

    public function pair() {
        if (!current_user_can('edit_users')) {
            wp_die('Unauthorized.');
        }
        check_admin_referer('ahm_core_pair');
        $api_url = AHM_Core::api_url_locked()
            ? AHM_Core::api_url()
            : untrailingslashit(esc_url_raw(wp_unslash($_POST['api_url'] ?? '')));
        $code = sanitize_text_field(wp_unslash($_POST['pairing_code'] ?? ''));
        if (empty($api_url)) {
            $this->redirect('Enter the AHM Manager API URL.', 'error');
        }
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
        AHM_Core::remember_api_url($api_url);
        $this->redirect('AHM Core is connected.', 'success');
    }

    public function disconnect() {
        if (!current_user_can('edit_users')) {
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
