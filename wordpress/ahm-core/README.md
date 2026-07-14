# AHM Core

Securely connects a WordPress site to **AHM Webdev Manager** so the Manager can read site health data (WordPress/theme/plugin state, users, content activity, forms) over signed, authenticated requests.

## Install

1. In the Manager, open the website and choose **Connect AHM Core** → **Download Plugin** (or build the zip, see below).
2. In WordPress: **Plugins → Add New → Upload Plugin**, upload `ahm-core.zip`, then **Activate**.
3. Go to **Settings → AHM Core**.
4. Paste the **Manager API URL** and the **8-digit pairing code** shown in the Manager, then **Connect to AHM**. (The code expires quickly — connect promptly.)

## Optional: pre-configure the API URL

So site admins only paste the pairing code, bake the Manager API URL into the site — either in `wp-config.php`:

```php
define('AHM_API_URL', 'https://manager-api.example.com');
```

or via a filter (e.g. in an mu-plugin):

```php
add_filter('ahm_core_api_url', fn() => 'https://manager-api.example.com');
```

When set, the API URL field on the connect screen is locked to this value.

## How the connection is secured

- Pairing issues a one-time `connectionId` + a 48-byte **secret**; the secret is stored in `wp_options` and never sent anywhere in plain text after pairing.
- Every request (both directions) is signed with **HMAC-SHA256** over `timestamp + nonce + method + path + body`, and verified with a 5-minute timestamp window and single-use nonce (replay protection).
- The plugin sends a signed **heartbeat** hourly (WP-Cron).
- **Disconnect** (or revoke from the Manager) invalidates access immediately.

## Required plugins

AHM Core keeps a canonical set of required plugins ([`class-ahm-core-required.php`](includes/class-ahm-core-required.php)): **Elementor, PRO Elements, Kadence Security, WP Activity Log, Rank Math, UpdraftPlus** (plus AHM Core itself).

When any are missing/inactive, an admin notice offers a one-click **Install & activate all**. Elementor, WP Activity Log, Rank Math, and UpdraftPlus install from wordpress.org; **PRO Elements** and **Kadence Security** are not on the repo and must be bundled in [`bundled/`](bundled/README.md) before packaging.

## SEO Manager role

Activation creates an **SEO Manager** role: every Administrator capability **except**:

- **User management** — no access to the Users area at all (`create/edit/delete/promote/remove/list_users` removed).
- **Removing required plugins** — cannot deactivate or delete any required plugin (or AHM Core). Enforced by hiding the Deactivate/Delete links and a hard server-side guard.
- **The connector** — cannot reach the AHM Core connect/disconnect screen (gated on `edit_users`).

The role is removed on uninstall.

## Build the installable zip

From this folder:

```bash
./build-zip.sh
```

This writes `ahm-core.zip` to `web/public/downloads/ahm-core.zip`, which is what the Manager's **Download Plugin** link serves.
