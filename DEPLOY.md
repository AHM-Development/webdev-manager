# Deploying AHM Web Manager (two servers: API + Web)

The API and the web app run on **two separate servers**. Each has its own
nginx terminating HTTPS for its subdomain and reverse-proxying to a local Node
process managed by PM2.

```
Web server                              API server (htz01)
  app: webdevmanager.allied-health.co     api: webdevmanagerapi.allied-health.co
  nginx → 127.0.0.1:3000 (Next.js)        nginx → 127.0.0.1:5000 (Express)
  PM2 process: webdevmanager                              → MySQL 8 + Redis (localhost)
  user: webdevmanager                     PM2 process: webdevmanagerapi
  repo: <web clone>/web                   user: webdevmanagerapi
                                          repo: /home/webdevmanagerapi/webdev-manager/api
```

> ⚠️ **The PM2 process names are `webdevmanagerapi` (API) and `webdevmanager`
> (web).** They were started manually with `pm2 start npm --name … -- start`,
> **not** from `ecosystem.config.js` (which would name them `ahm-api`/`ahm-web`).
> Always target the real names — `pm2 restart ahm-api` is a silent no-op here.

> ⚠️ **A `git pull` alone changes nothing** — the running Node process keeps the
> old code until you **restart** it. Redeploys MUST end with `pm2 restart`.

---

## Redeploy — the common case

Because the two apps live on different servers, deploy each on its own box. Do
whichever side(s) your change touches (API-only, web-only, or both).

### API server (`webdevmanagerapi@htz01`)

```bash
cd /home/webdevmanagerapi/webdev-manager
git status                       # confirm: on 'main', clean tree
git pull origin main
cd api && npm install --omit=dev && cd ..
pm2 restart webdevmanagerapi     # REQUIRED — reloads the new code; runs ensureSchema on boot
pm2 save
pm2 logs webdevmanagerapi --lines 40   # confirm a clean boot (no schema errors); Ctrl-C to exit
```

Verify the API is serving current code (expect **HTTP 401 AUTH_REQUIRED**, not
`Cannot GET`):

```bash
curl -i http://127.0.0.1:5000/api/v1/qa-criteria
```

### Web server (`webdevmanager`)

`NEXT_PUBLIC_API_URL` is baked into the browser bundle at **build** time, so a
web change requires a rebuild, then a restart:

```bash
cd <web clone>/webdev-manager            # e.g. /home/webdevmanager/webdev-manager
git pull origin main
cd web && npm install && npm run build && cd ..
pm2 restart webdevmanager
pm2 save
```

> `ensureSchema()` runs on every API boot and is idempotent — it creates any new
> tables/columns and re-seeds versioned defaults (e.g. QA criteria). So a schema
> change ships simply by restarting the API; no manual migration step.

---

## First-time setup

### 1. Prerequisites

**API server** (Ubuntu):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs mysql-server redis-server nginx certbot python3-certbot-nginx
sudo npm i -g pm2
sudo mysql_secure_installation
```

```sql
CREATE DATABASE ahm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ahm'@'localhost' IDENTIFIED BY '<strong-password>';
GRANT ALL PRIVILEGES ON ahm.* TO 'ahm'@'localhost';
FLUSH PRIVILEGES;
```

**Web server** (Ubuntu): Node + nginx + certbot only (no MySQL/Redis).

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx
sudo npm i -g pm2
```

### 2. DNS

- `webdevmanager.allied-health.co`     → **web** server IP
- `webdevmanagerapi.allied-health.co`  → **API** server IP

### 3. Code + env

Clone the repo on **each** server (the web server only needs `web/`, the API
server only needs `api/`, but cloning the whole repo is simplest).

**`api/.env`** (API server):

```ini
NODE_ENV=production                                   # enforces strong secrets on boot
PORT=5000
CLIENT_URL=https://webdevmanager.allied-health.co     # CORS origin — must match the web app exactly
PUBLIC_API_URL=https://webdevmanagerapi.allied-health.co   # origin only, NO /api/v1 (used for pairing + QA push URLs)
JWT_SECRET=<long random string>
DB_HOST=127.0.0.1
DB_NAME=ahm
DB_USER=ahm
DB_PASSWORD=<strong-password>
REDIS_URL=redis://127.0.0.1:6379
REFRESH_COOKIE_SECURE=true
REFRESH_COOKIE_SAME_SITE=lax                          # see "Cookies" note below
# SMTP_*, VIKTOR_* (VIKTOR_REDIRECT_URIS!), TIMEZONE, etc.
```

**`web/.env.production`** (web server) — set **before** `npm run build`:

```ini
NEXT_PUBLIC_API_URL=https://webdevmanagerapi.allied-health.co/api/v1
```

### 4. Install, build, start

**API server:**

```bash
cd /home/webdevmanagerapi/webdev-manager/api
npm install --omit=dev
pm2 start npm --name webdevmanagerapi -- start   # runs `node ./bin/www` on PORT 5000
pm2 save
pm2 startup                                      # run the command it prints (survives reboots)
npm run bootstrap:superadmin                     # create the first admin (first deploy only)
```

**Web server:**

```bash
cd <web clone>/webdev-manager/web
npm install && npm run build
pm2 start npm --name webdevmanager -- start      # `next start` on PORT 3000
pm2 save
pm2 startup
```

> The API creates/migrates all tables on first boot (`ensureSchema`). **Back up
> the DB first if it already has data.**

### 5. nginx + HTTPS (per server)

On each server, create an nginx site that proxies its subdomain to the local
port, then issue a cert:

```bash
# API server: proxy webdevmanagerapi.allied-health.co → 127.0.0.1:5000
# Web server: proxy webdevmanager.allied-health.co    → 127.0.0.1:3000
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <that server's subdomain>
```

`deploy/nginx-ahm.conf` is a reference config (originally single-box); split it
so each server has only its own `server` block.

### 6. Cookies

The refresh token is an httpOnly cookie set by the **API** subdomain. Because
`webdevmanager.` and `webdevmanagerapi.` share the registrable domain
(`allied-health.co`), they're *same-site*, so `SameSite=lax` + `Secure` works.
If the two are ever moved to **different registrable domains**, set
`REFRESH_COOKIE_SAME_SITE=none` (keep `REFRESH_COOKIE_SECURE=true`) or logins
won't persist.

---

## Ops cheatsheet

```bash
# API server
pm2 status
pm2 logs webdevmanagerapi --lines 50     # watch boot for schema errors
pm2 restart webdevmanagerapi             # reload code / env
curl -i http://127.0.0.1:5000/api/v1/qa-criteria   # 401 = healthy; "Cannot GET" = stale/route missing

# Web server
pm2 logs webdevmanager --lines 50
pm2 restart webdevmanager
```

**Only ever run ONE process per app.** If `pm2 list` shows a duplicate
`webdevmanagerapi` (e.g. one `errored`/crash-looping from the wrong cwd),
delete it: `pm2 delete <id> && pm2 save`. A duplicate started from the home dir
crash-loops with `ENOENT … package.json` and just spams the logs.

## Firewall

Per server, allow only `80`, `443`, and SSH. Keep the app ports (`3000` on web,
`5000` on API) and MySQL/Redis bound to `127.0.0.1` — nginx proxies locally;
don't expose them.
