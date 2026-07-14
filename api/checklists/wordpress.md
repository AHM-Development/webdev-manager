# AHM WordPress Checklist

Version: 1.1.0

This is the reference for the **Website checklists** scan step. Each line notes the deterministic check that backs it. Checks run against the AHM Core connector snapshot (plus per-page crawl data for transport security). Passwords and password hashes are never collected.

## Maintenance
- WordPress core is on the latest available version. — `wordpress.core-update`
- Installed plugins are up to date. — `wordpress.plugin-update`
- Profile essential plugins are installed and active. — `wordpress.essential-plugin`
- Inactive/abandoned plugins are removed. — `wordpress.inactive-plugin`
- Only one plugin per category (caching, SEO, security, backup) is active. — `wordpress.plugin-conflict`

## Users
- Administrator accounts follow least privilege (recommended max 3). — `wordpress.admin-count`
- Passwords are rotated within 90 days (age recorded from AHM Core events). — `wordpress.password-age`, `wordpress.password-age-unknown`

## Operational services
- Automatic backups are scheduled (UpdraftPlus interval configured). — `services.backups`
- Transactional email uses an authenticated SMTP mailer (WP Mail SMTP). — `services.smtp`
- An image optimizer is active. — `wordpress.image-optimization`
- WordPress cron runs scheduled tasks (or a server cron replaces it). — `wordpress.wp-cron`

## Content activity
- A blog post has been published within the per-site staleness threshold (default 90 days). — `content.blog-stale`
- Content has been updated within the threshold. — `content.stale`
- The site has published posts. — `content.no-posts`

## Security (surfaced under Website checklists)
- HTTPS is reported by WordPress. — `wordpress.ssl`
- Debug display is disabled in production. — `wordpress.debug`
- Dashboard file editing is disabled. — `wordpress.file-editor`
- XML-RPC is disabled unless required. — `wordpress.xmlrpc`
- Transport/header security: mixed content, HSTS, CSP, X-Content-Type-Options, Referrer-Policy, frame protection. — `security.*`
  These come from the crawl and do **not** require the connector, so they run with any crawl-based check (Technical SEO, Design QA, or Website checklists) — including on unpaired sites.

## Not yet implemented (needs further AHM Core work)
- Caching *enabled/configured* verification beyond WP Rocket being active (relies on `wordpress.essential-plugin` presence today).
- Security-monitoring *configuration* beyond the security plugin being active (relies on `wordpress.essential-plugin` presence today).
- SMTP mailer / Google OAuth *authorized* state (backlogged until the AHM Core build wraps).
- AHM Core heartbeat/capabilities surfaced as findings (connection status is shown in the UI).
