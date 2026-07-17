# Deploying AHM Web Manager (VPS + nginx + PM2)

Backend (Express API) and frontend (Next.js) run as two Node processes on
`127.0.0.1`; nginx terminates HTTPS and routes by subdomain:

```
app.example.com  →  127.0.0.1:3000   (Next.js)
api.example.com  →  127.0.0.1:5000   (Express API)  → MySQL 8 + Redis (localhost)
```

## 1. Prerequisites (Ubuntu)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs mysql-server redis-server nginx
sudo npm i -g pm2
sudo apt install -y certbot python3-certbot-nginx
sudo mysql_secure_installation
```

Create the database and user that match `api/.env`:

```sql
CREATE DATABASE ahm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ahm'@'localhost' IDENTIFIED BY '<strong-password>';
GRANT ALL PRIVILEGES ON ahm.* TO 'ahm'@'localhost';
FLUSH PRIVILEGES;
```

## 2. DNS

Point two `A` records at the VPS IP: `app.example.com` and `api.example.com`.

## 3. Get the code + env

```bash
git clone <repo> /var/www/webdev-manager && cd /var/www/webdev-manager
```

**`api/.env`** (production):

```ini
NODE_ENV=production            # enforces strong secrets on boot
PORT=5000
CLIENT_URL=https://app.example.com      # CORS origin — must match exactly
JWT_SECRET=<long random string>
DB_HOST=127.0.0.1
DB_NAME=ahm
DB_USER=ahm
DB_PASSWORD=<strong-password>
REDIS_URL=redis://127.0.0.1:6379
REFRESH_COOKIE_SECURE=true
REFRESH_COOKIE_SAME_SITE=lax            # see "Cookies" note below
# SMTP_*, VIKTOR_* (VIKTOR_REDIRECT_URIS!), TIMEZONE, etc.
```

**`web/.env.production`** — `NEXT_PUBLIC_API_URL` is baked into the browser
bundle at build time, so it must be set **before** `npm run build`:

```ini
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1
```

## 4. Install, build, run

```bash
# API
cd api && npm ci --omit=dev && cd ..
# Web (build needs the .env.production above)
cd web && npm ci && npm run build && cd ..

# Start both with PM2 (from the repo root)
pm2 start ecosystem.config.js
pm2 save
pm2 startup      # run the command it prints, so it survives reboots
```

The API creates/migrates all tables on first boot (`ensureSchema`). **Back up
the DB first if it already has data.** Then create the first admin:

```bash
cd api && npm run bootstrap:superadmin
```

## 5. nginx + HTTPS

```bash
sudo cp deploy/nginx-ahm.conf /etc/nginx/sites-available/ahm
sudo ln -s /etc/nginx/sites-available/ahm /etc/nginx/sites-enabled/ahm
# edit the file to your real subdomains first
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.example.com -d api.example.com
```

Certbot adds the 443 blocks and HTTP→HTTPS redirects automatically.

## 6. Cookies (the one gotcha)

The refresh token is an httpOnly cookie set by the **API** domain. Because
`app.` and `api.` share the registrable domain, they're *same-site*, so
`SameSite=lax` + `Secure` works as configured. If you ever split the two onto
**different registrable domains**, set `REFRESH_COOKIE_SAME_SITE=none` (keep
`REFRESH_COOKIE_SECURE=true`) or logins won't persist.

## 7. Redeploy (after a `git pull`)

```bash
cd /var/www/webdev-manager && git pull
cd api && npm ci --omit=dev && cd ..
cd web && npm ci && npm run build && cd ..
pm2 reload ecosystem.config.js
```

## Ops cheatsheet

```bash
pm2 status                 # both processes
pm2 logs ahm-api           # API logs (watch first boot for schema errors)
pm2 logs ahm-web           # web logs
pm2 reload ahm-api         # zero-downtime restart after an env change
```

## Firewall

Allow only `80`, `443`, and SSH. Keep `3000`, `5000`, MySQL, and Redis bound to
`127.0.0.1` — the PM2 processes already listen locally; don't expose them.
