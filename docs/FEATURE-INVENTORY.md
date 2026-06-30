# AHM Web Manager — Feature Inventory & Capability Map

> **Purpose:** a single source of truth for what this platform **already does**, so other teams can decide *build vs. don't-build* and avoid duplicating work. If a capability is listed here as ✅, it exists — coordinate/extend rather than rebuild.

**Status legend:** ✅ Built & wired · 🟡 Partial / UI present, logic incomplete · ⬜ Placeholder / planned

**Architecture:** two services — `api/` (Express + MySQL + Redis) and `web/` (Next.js 16 / React 19). Auth is invite-only with 3 roles: `superadmin`, `developer`, `spectator`. Real-time via Socket.IO. All API routes are under `/api/v1/*`.

---

## 1. Auth, Sessions & Access Control ✅
- Email/password login, JWT access (15 min) + refresh token in httpOnly cookie, refresh rotation.
- Forgot/reset password, logout, **logout-all**, active **session list + per-session revoke**.
- **Invite-only registration** (no public signup); invite accept via tokenized link.
- Role-based gating everywhere: `superadmin` / `developer` (write) / `spectator` (read).
- **Don't rebuild:** auth, sessions, password reset, role guards, invite flow.

## 2. Users, Invites & Profiles ✅
- User directory + CRUD (superadmin), invite create/resend/revoke, role & status (`active`/`invited`/`disabled`).
- Self-service profile: name, phone (intl), Discord ID, DOB, gender, **avatar**, password change via **email OTP**.
- **Don't rebuild:** user management, invitations, profile/self-service, password policy.

## 3. Projects ✅
- Project CRUD, per-project **websites** (multiple), priority & status, assignee.
- **Bulk import** from CSV / Google Sheet / file upload (with preview + mapping).
- **Don't rebuild:** project registry, multi-website-per-project model, importer.

## 4. Tasks (Kanban) ✅
- Board grouped **by assignee**; statuses Backlog→To Do→In Progress→Review→Blocked→Done; priority; **checklists**; attachments (file/link/source).
- Drag-and-drop **move/reorder**, per-task status change, **My Tasks** view.
- **Assignee picker = real users, restricted to developers + superadmins** (spectators excluded).
- **AI "Organize with AI"**: paste notes → Claude drafts title/description/checklist/priority (Haiku 4.5 for low latency).
- **Don't rebuild:** task tracking, kanban, checklists, AI task drafting, assignee model.

## 5. Issue Board ✅
- An **issue is a task template**: author once (title, description, checklist, priority) and **apply to All or Selected clients** → creates a **real task on each client's board**, linked back.
- Editing the issue **syncs** title/description into linked tasks and **merges** the checklist (keeps progress); "Mark fixed" drives the task to Done; progress shown as fixed/total.
- Same two-step **Organize-with-AI** wizard as Add Task (client-agnostic).
- **Don't rebuild:** cross-client rollout of a work item, issue→task linkage.

## 6. Website Health Scanner ✅
- **Configurable scans** — pick any of: **Lighthouse, Technical SEO, Design QA, Website (WordPress) checklists, Security**; each gated on its prerequisites (PageSpeed key / AI key / paired connector).
- **Sitemap-driven crawl** (Playwright, multi-viewport screenshots); explicit **sitemap URL** saved per site + domain-validated; per-website **profile** (approved identity, essential plugins, max pages).
- Engines: **Lighthouse via Google PageSpeed**; **Claude** for technical-SEO + design/content QA against versioned **markdown checklists** (`api/checklists/`); deterministic header/security checks; **Claude summary of Lighthouse metrics**.
- Findings store with severity/resolution; scan **history**, **report export (JSON)**, **real-time progress** (Socket.IO), Redis-backed scan worker, cancel/retry.
- **Don't rebuild:** site auditing, Lighthouse/SEO/design/security scanning, crawl infra, findings model.
- 🟡 In planning (see `docs` plan): surface granular Lighthouse audits, cross-page checks (sitemap-membership, duplicate-content, www-canonical), Google Safe Browsing.

## 7. WordPress Connector (AHM Core plugin) ✅
- Real WordPress plugin (`wordpress/ahm-core/`) paired via **8-digit code → HMAC-SHA256 signed requests** (timestamp + nonce + replay protection); secrets **AES-256-GCM encrypted at rest**.
- Pulls a **snapshot**: WP core/version, plugins (+ updates), theme, PHP, **users (+ password age)**, security flags (SSL, debug, file-edit, XML-RPC); **hourly heartbeat**; manual refresh; revoke.
- **Don't rebuild:** any WordPress site integration, secure agent-to-API channel, WP inventory.

## 8. Website Users / Credentials Vault ✅
- Encrypted credential store per project/website/external site; **reveal**, **copy-package**, environment tagging; **bulk import** (CSV/sheet/file).
- **Don't rebuild:** credential management / secret storage UI.

## 9. Notes ✅
- Personal notes CRUD with color labels ("My Notes").

## 10. Notifications ✅
- In-app notifications (unread count, mark read, real-time) **+ email + Discord** channels; per-user **settings**.
- **Scheduled jobs**: daily summary, pre-shift, weekly digest (+ manual test triggers).
- **Don't rebuild:** notification fan-out, multi-channel delivery, digest scheduling.

## 11. Activity / Audit Logs ✅
- **User activity logs** and **website activity logs** (filterable, with options endpoints); audit trail across modules. Surfaced as "Website Logs" + a dashboard recent-activity card.

## 12. AI / Claude integration ✅
- Direct Anthropic Messages API client (`api/modules/ai/`), **structured-output** (json_schema) drafting.
- **Configurable prompts** stored in DB + editable in **Settings** (`task_organizer`, `website_technical_seo`, `website_design_content_qa`, `website_lighthouse_review`).
- Used by: task/issue organizer, website-health reviews.
- **Don't rebuild:** Claude wiring, prompt management — extend the prompt registry instead.

## 13. Settings ✅
- Workspace settings; **Email connector** (Google OAuth or SMTP, test send); **AI prompt** editor.

## 14. Tools 🟡
- Tools page with utilities (e.g. **Images→WebP**, file converters) — UI present; individual tool logic varies. Confirm before building any asset/file utility.

## 15. Platform / Infra (already in place) ✅
- MySQL 8 schema (26 tables) with idempotent migrations; **Redis** (scan queue + nonce/replay + pub/sub); **Socket.IO** real-time; Docker Compose (MySQL+Redis); Apache vhosts; JWT + bcrypt; AES-256-GCM encryption.
- **Integrations already wired:** Anthropic Claude, Google PageSpeed, Google OAuth (email), Discord (notifications), WordPress (connector plugin).

---

## How another team should use this
1. Find the capability you're about to build in the list.
2. ✅ → **don't rebuild**; reuse the module/endpoints or request an extension.
3. 🟡 / ⬜ → coordinate — partial work exists; align before starting.
4. Not listed at all → likely net-new; safe to build (but confirm against the API route list below).

_Source of truth is the code; regenerate this inventory from `api/modules/*`, `web/app/dashboard/*`, and `api/db/schema.js` when in doubt._
