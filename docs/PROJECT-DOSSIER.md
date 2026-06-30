# AHM Web Manager — Full Project Dossier

> Self-contained context briefing for an AI agent or teammate. Covers the platform's purpose, architecture, every feature/module, the data model, the API surface, integrations, the decisions/conventions in force, the work completed in the most recent build session, open/planned work, and the current repo state. **Use this to avoid rebuilding things that already exist and to understand why the code is shaped the way it is.**

Last compiled: 2026-06-26. Source of truth is the code (`api/modules/*`, `web/app/dashboard/*`, `api/db/schema.js`); regenerate when in doubt.

---

## 1. What it is

**AHM Web Manager** is an internal web-operations platform for Allied Health Media. It manages client websites end to end: projects, tasks/kanban, a cross-client issue board, an automated website-health scanner (SEO/performance/design/security), a secure WordPress connector, credential storage, users/auth, notifications, notes, activity logs, and Claude-powered AI assists.

**Two services (monorepo):**
- `api/` — Express + MySQL 8 + Redis (background scan worker, real-time, queues).
- `web/` — Next.js 16 / React 19 dashboard (HeroUI + Tailwind, React Hook Form + Zod, Socket.IO client).
- `wordpress/ahm-core/` — a real WordPress plugin (the connector agent).
- `apache/` — vhosts; `docker-compose.yml` — local MySQL + Redis.

**Access model:** invite-only; three roles — `superadmin`, `developer` (write), `spectator` (read). JWT access (15 min) + refresh in httpOnly cookie. All API routes under `/api/v1/*`.

---

## 2. Tech stack & integrations

- **Backend deps:** express, mysql2, redis, socket.io, jsonwebtoken, bcryptjs, helmet, cors, nodemailer, multer, xlsx, cheerio, **playwright** (scanner), morgan, dotenv.
- **Frontend deps:** next, react, @heroui/react, tailwind, react-hook-form, zod, axios, socket.io-client, lucide-react, intl-tel-input, geist.
- **External integrations already wired:** Anthropic **Claude** (Messages API, structured output), **Google PageSpeed** (Lighthouse), **Google OAuth** (email sending) + SMTP, **Discord** (notifications), **WordPress** (custom connector plugin).
- **Infra patterns:** Redis-backed scan queue + nonce/replay store + pub/sub; Socket.IO real-time; AES-256-GCM encryption at rest for secrets; idempotent SQL migrations.

---

## 3. Feature inventory (by module)

Legend: ✅ built & wired · 🟡 partial · ⬜ placeholder.

| Domain | Status | Capabilities |
|---|---|---|
| **Auth & sessions** | ✅ | login, JWT + refresh rotation, forgot/reset password, logout, logout-all, session list + per-session revoke, invite-only registration |
| **Users & invites** | ✅ | user directory + CRUD (superadmin), invite create/resend/revoke, role & status (`active`/`invited`/`disabled`) |
| **Profile** | ✅ | name, intl phone, Discord ID, DOB, gender, avatar, password change via email OTP |
| **Projects** | ✅ | CRUD, multiple websites per project, priority/status/assignee, bulk import (CSV/Google Sheet/file) with preview+mapping |
| **Tasks (kanban)** | ✅ | board grouped by assignee, statuses Backlog→To Do→In Progress→Review→Blocked→Done, priority, checklists, attachments, drag move/reorder, My Tasks view, **assignee picker = real developers + superadmins**, **Organize with AI** |
| **Issue board** | ✅ | issue = task template applied to **All or Selected clients** → creates a **real task per client**, linked back; edit syncs title/desc + merges checklist into tasks; mark-fixed → task Done; two-step **Organize-with-AI** wizard |
| **Website health** | ✅ | configurable scans (Lighthouse / Technical SEO / Design QA / WordPress checklists / Security), sitemap-driven Playwright crawl + screenshots, per-site profile, findings + resolution, history, JSON report export, real-time progress, cancel/retry |
| **WordPress connector** | ✅ | `ahm-core` plugin paired via 8-digit code → HMAC-SHA256 signed requests (timestamp+nonce+replay), AES-GCM secrets, snapshot of core/plugins/users/security, hourly heartbeat, manual refresh, revoke |
| **Website users (credentials)** | ✅ | encrypted credential vault per project/website/external, reveal, copy-package, env tagging, bulk import |
| **Notes** | ✅ | personal notes CRUD with color labels |
| **Notifications** | ✅ | in-app (unread count, mark read, real-time) + email + Discord; per-user settings; scheduled jobs (daily summary, pre-shift, weekly digest) + manual test triggers |
| **Activity / audit logs** | ✅ | user activity logs + website activity logs (filterable), dashboard recent-activity card, "Website Logs" page |
| **AI / Claude** | ✅ | direct Anthropic client, structured JSON output, DB-stored prompts editable in Settings (`task_organizer`, `website_technical_seo`, `website_design_content_qa`, `website_lighthouse_review`) |
| **Settings** | ✅ | workspace settings, email connector (Google OAuth/SMTP + test), AI prompt editor |
| **Tools** | 🟡 | utilities page (e.g. Images→WebP) — UI present, individual tool logic varies |
| **Operations dashboard** | ✅ | KPIs, Needs-Attention, My Work, Project Delivery, Issue Queue, Website Health, Notes, Recent Activity — all wired to real APIs |

**Dashboard pages:** dashboard, tasks, my-tasks, projects, issue-boards, website-health, website-users, website-logs, users, my-notes, my-profile, settings, tools. **Auth pages:** login, forgot-password, reset-password, invite/[token].

---

## 4. Data model (MySQL tables)

`users`, `user_sessions`, `user_invites`, `password_resets`, `profile_password_otps`, `system_bootstrap`, `workspace_settings`, `projects`, `project_websites`, `tasks`, `issues`, `issue_applications`, `notes`, `notifications`, `notification_settings`, `notification_delivery_attempts`, `activity_logs`, `website_activity_logs`, `website_credentials`, `website_health_scans`, `website_health_scan_pages`, `website_health_findings`, `website_health_profiles`, `wordpress_connections`, `wordpress_pairing_codes`, `email_connectors`, `ai_prompt_settings`.

---

## 5. API surface (per module, under `/api/v1`)

- **auth:** login, refresh, logout, logout-all, register, forgot-password, reset-password, me, activity, sessions (GET + DELETE :id)
- **users:** GET / · GET :id · invites (GET/POST) · invites/:id/resend · DELETE invites/:id · PATCH/DELETE :id
- **invites (public):** GET :token · POST :token/accept
- **profile:** GET / · PATCH / · POST avatar · POST password · POST password/otp
- **projects:** GET / · GET options · GET/PATCH/DELETE :id · PATCH :id/priority · POST / · POST import · POST import/preview
- **tasks:** GET / · GET /my · GET /assignees · GET/PATCH/DELETE :id · PATCH :id/status · PATCH /move · POST /
- **issues:** GET / · GET options · GET :id · POST / · PATCH :id · PATCH :id/status · DELETE :id · POST :id/applications · (PATCH/DELETE :id/applications/:appId)
- **website-health:** GET / · GET capabilities · GET checklists(/:key) · POST scans · GET scans/:id · GET scans/:id/pages · POST scans/:id/cancel · POST scans/:id/retry · GET scans/:id/report · PATCH findings/:id · GET websites/:id · GET websites/:id/history · GET/PATCH websites/:id/profile
- **connectors/wordpress:** POST pair · POST heartbeat · GET :websiteId · POST :websiteId/pairing-code · POST :websiteId/refresh · DELETE :websiteId
- **website-users:** GET / · GET options · POST / · PATCH/DELETE :id · POST :id/reveal · POST :id/copy-package · POST import · POST import/preview
- **notes:** GET / · POST / · PATCH/DELETE :id
- **notifications:** GET / · GET unread-count · PATCH :id/read · GET/PATCH settings · POST / · POST test · POST discord/test · POST email/test · POST jobs/{daily-summary,pre-shift,weekly-digest}/run
- **activity-logs:** GET users(+options) · GET/POST websites(+options)
- **settings:** GET/PATCH workspace · GET/PATCH email-connector · POST email-connector/google/{connect,disconnect} · POST email-connector/test · GET/PATCH ai-prompts/:key
- **ai:** POST tasks/organize

**Real-time events (Socket.IO):** `realtime.connected`, `notification.created`, `notification.read`, `health.scan.{started,progress,page.completed,completed,failed}`.

---

## 6. Decisions & conventions in force

- **Task assignees** are restricted to **developers + superadmins** (spectators excluded). Board columns are derived from the live user list, not hardcoded.
- **Issue board model:** an issue is a reusable **task template**. Applying it creates real board tasks (one per client). Editing the issue propagates title/description and **merges** the checklist (preserving per-task completion). Deleting an issue **soft-deletes** its generated tasks. "Mark fixed" sets the linked task to **Done**; progress is derived from task status.
- **Website-health scans are configurable:** the five checks are individually selectable and **prerequisite-gated** — Lighthouse needs a PageSpeed key, Technical SEO/Design QA need the Claude key, **Website-checklists + Security are hard-gated on a paired WordPress connector**. Sitemap URL is validated to the site's domain and **saved to the profile**; the last check selection is also remembered.
- **Lighthouse approach:** keep Google PageSpeed for real metrics, add a **Claude summary** that interprets them (chosen over local Lighthouse or Claude-only estimation).
- **AI:** the task/issue **organizer runs on `claude-haiku-4-5`** (low-latency JSON extraction; overridable per-prompt in Settings). Organizer `projectId` is **optional** (issues organize client-agnostically). Prompts live in `ai_prompt_settings` and are editable in Settings.
- **"Don't reimplement SEO":** lean on (a) Claude judging page evidence against the markdown checklists, (b) Lighthouse's existing audits, and (c) small focused tools (`robots-parser`, Google Safe Browsing API) — **no third-party SEO framework** (Unlighthouse/generic `seo-analyzer` rejected).
- **Verification standard:** `cd web && npx tsc --noEmit` and `cd api && node --check` must pass. Nothing has been verified against a live DB/stack yet.

---

## 7. Work completed in the latest build session

1. **Tasks — real assignees.** Added backend `GET /tasks/assignees` (`listAssignees` → active developers + superadmins) + controller/route; frontend `listAssignees` client + `TaskAssignee` type; made board columns dynamic (removed hardcoded `TEAM`, added `buildAssigneeColumns`), added `assigneeUserId` to the `Task` type; added an assignee picker to the Create and Detail task modals; wired through `TasksView` and `MyTasksBoard`.
2. **Task cards — replaced the `3/59` checklist counter** on kanban cards with a **"N tasks in project"** badge (threaded board→column→card). Checklist progress remains inside the task detail modal.
3. **Issue board → real tasks.** Schema: `issues.checklist` + `issues.priority`, `issue_applications.task_id`. Service reworked so create/apply inserts real tasks per client, edits propagate + merge checklist, mark-fixed drives task status, remove/delete soft-delete tasks, `fixed` derived from task status. Frontend: **unified `issue-modal.tsx`** (create + edit) replacing the two old modals, themed with brand colors, client scope picker (All/Selected).
4. **Website-health configurable scans (large feature).** Schema: profile `sitemap_url`/`default_checks`, scan `selected_checks`/`sitemap_url`, seeded `website_lighthouse_review` prompt. `createScan` accepts checks + sitemap (domain-validated, persisted to profile), prerequisite-gated; added `GET /capabilities`; `list()` returns per-row profile + connector. Worker honors `selected_checks` + explicit sitemap, splits WordPress vs security, runs Claude Lighthouse review. `review.service` gates by selected checks + added `reviewLighthouse`. `browser-scanner` accepts an explicit sitemap seed. Frontend: unified scan modal (per-row **Run Scan** prefilled/locked, sitemap field + validation, five gated checkboxes), capabilities fetch.
5. **Organizer speed + reuse.** Defaulted the organizer model to **Haiku 4.5**; made `projectId` optional; added **Organize with AI** to the issue board, then turned New-Issue into a **two-step wizard** (organize → details) mirroring Add Task.
6. **SEO checklist research & additions.** Compared Rank Math's analyzer; added `seo.www-canonical`, `seo.links-ratio`, `seo.content-freshness` to `technical-seo.md` (v1.1.0) and Google Safe Browsing + fingerprinting to `security.md` (v1.1.0). Mapped which checklist items Lighthouse covers vs. which need Claude (judgment) vs. deterministic cross-page/network checks vs. an external API.
7. **Operations dashboard — removed dummy data.** Replaced static `sampleProjects`/`healthByProject`/`seedCredentials` with real `listWebsiteHealth()` + `listWebsiteCredentials()` (guarded so a spectator's 403 doesn't blank the page); KPIs, Needs-Attention, Project-Delivery health column, and the Website-Health table now use live scan summaries + credential password-age.
8. **Docs:** created `docs/FEATURE-INVENTORY.md` (capability map) and this dossier.
9. **Git:** hardened `.gitignore` (real `.env*` excluded, `.example` kept), folded the nested `web/.git` into the monorepo, made the **initial commit `dbe1d18`** (327 files, verified secret-free).

---

## 8. Open / planned work

- **Website-health SEO check workflow (planned, not implemented).** A four-engine model with one owner per check + a dedup pass:
  - **Lighthouse** owns performance/CWV, mobile usability, image-format, crawlability, robots-txt validity → *Phase 1: extract the individual SEO/best-practices audits the response already contains and emit them as findings.*
  - **Deterministic per-page** owns presence/structural facts (+ new `seo.links-ratio`).
  - **Claude** owns judgment (content depth, og/structured-data relevance, breadcrumbs, content-freshness, url-quality, link descriptiveness).
  - **Deterministic cross-page** (new worker pass) owns `seo.sitemap-membership`, `seo.duplicate-content`, `seo.www-canonical`.
  - **External API** owns `security.safe-browsing` (Google Safe Browsing) → *Phase 2, needs `SAFE_BROWSING_API_KEY`.*
- Tools page utilities (Images→WebP etc.) — confirm which are functional before building asset tools.
- End-to-end verification of all the above against a live stack with real API keys.

---

## 9. Current state & risks

- **Git:** initial commit `dbe1d18` exists locally on `main`; **not yet pushed**. Remote was set to `https://github.com/joelahm/webdev-manager.git` but the push 403'd because the Mac's keychain is authenticated as a different account (`joelaposaga`) that isn't a collaborator on `joelahm`. Resolution pending (push under `joelaposaga`, add collaborator, or use a token).
- **Secrets:** real `.env`/`.env.db`/`.env.phpmyadmin` files exist locally but are now git-ignored and were **never committed or pushed** — no exposure, no rotation needed.
- **Verification:** all session work passed `tsc --noEmit` and `node --check`, but **nothing has been run against a live MySQL/Redis stack** or with real `ANTHROPIC_API_KEY` / `PAGESPEED_API_KEY`. Treat scan/AI behavior as code-correct but not yet runtime-verified.

---

## 10. How to use this dossier
- **Avoiding redundancy:** if a capability is ✅ above, it exists — extend or reuse it; don't rebuild.
- **For build/no-build decisions:** check §3 (features) and §5 (endpoints) first; §6 explains *why* things are shaped as they are; §8 lists what's intentionally still open.
- **For deeper truth:** read the code at the paths named in each section.
