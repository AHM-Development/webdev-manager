"use client";

import { Chip } from "@heroui/react";

type CheckStatus = "pass" | "warning" | "fail" | "na";

type Check = {
  title: string;
  status: CheckStatus;
  description?: string;
  fix?: string;
};

type CheckGroup = { name: string; items: Check[] };

const STATUS_META: Record<
  CheckStatus,
  { label: string; color: "success" | "warning" | "danger" | "default" }
> = {
  pass: { label: "Pass", color: "success" },
  warning: { label: "Warning", color: "warning" },
  fail: { label: "Fail", color: "danger" },
  na: { label: "N/A", color: "default" },
};

// --- Sample data (preview only; real values come from the AHM Core plugin) ---
const SAMPLE_STATS: { label: string; value: string; hint?: string }[] = [
  { label: "WordPress version", value: "6.5.2", hint: "Latest 6.6 available" },
  { label: "Active theme", value: "Astra 4.1.5" },
  { label: "PHP version", value: "8.1.27" },
  { label: "Published posts", value: "42" },
  { label: "Published pages", value: "12" },
  { label: "Last blog post", value: "12 Jun 2026", hint: "49 days ago" },
  { label: "Last content update", value: "28 Jul 2026", hint: "3 days ago" },
];

const SAMPLE_USERS: { name: string; role: string; email: string; lastLogin: string }[] = [
  { name: "Dr. Sarah Chen", role: "Administrator", email: "sarah@acmehealth.co.uk", lastLogin: "30 Jul 2026" },
  { name: "admin", role: "Administrator", email: "admin@acmehealth.co.uk", lastLogin: "11 Mar 2026" },
  { name: "Mark Editor", role: "Editor", email: "mark@acmehealth.co.uk", lastLogin: "27 Jul 2026" },
];

const SAMPLE_GROUPS: CheckGroup[] = [
  {
    name: "Core & Environment",
    items: [
      { title: "WordPress core is up to date", status: "warning", description: "Running 6.5.2; the latest release is 6.6.", fix: "Back up the site, then update WordPress core from Dashboard → Updates." },
      { title: "PHP version supported (≥ 8.1)", status: "pass" },
      { title: "Active theme is up to date", status: "pass" },
      { title: "Child theme in use", status: "fail", description: "The 'Astra' theme is active directly — no child theme detected.", fix: "Create and activate an Astra child theme so customisations survive theme updates." },
      { title: "\"Discourage search engines\" is OFF (indexable)", status: "pass" },
    ],
  },
  {
    name: "Plugins",
    items: [
      { title: "All plugins up to date", status: "warning", description: "2 of 14 plugins have pending updates: Elementor, WPForms.", fix: "Review the changelogs, back up, then update the outdated plugins." },
      { title: "All required/approved plugins present & active", status: "fail", description: "Required plugin 'UpdraftPlus' is not installed.", fix: "Install and activate the approved backup plugin for this site." },
      { title: "No inactive plugins left installed", status: "warning", description: "3 inactive plugins installed: Hello Dolly, Akismet, Classic Editor.", fix: "Delete plugins that aren't in use to reduce the attack surface." },
      { title: "No known-vulnerable plugins", status: "pass" },
      { title: "No conflicting duplicates (caching / SEO)", status: "pass" },
      { title: "Essential categories covered (security, caching, SEO, backup, SMTP, forms)", status: "warning", description: "No caching plugin detected.", fix: "Install a caching plugin (e.g. WP Rocket or LiteSpeed Cache)." },
    ],
  },
  {
    name: "Content",
    items: [
      { title: "At least one published blog post", status: "pass" },
      { title: "Last blog post within 30 days", status: "fail", description: "The most recent post was published 49 days ago (12 Jun 2026).", fix: "Publish fresh blog content to keep the site active for visitors and search engines." },
      { title: "Content updated within 90 days", status: "pass" },
      { title: "No placeholder / \"Hello world\" / sample content published", status: "pass" },
    ],
  },
  {
    name: "Users & Access",
    items: [
      { title: "Administrator count within a sane limit", status: "pass" },
      { title: "No default \"admin\" username", status: "fail", description: "A user with the username 'admin' exists.", fix: "Create a new admin with a unique username, reassign content, then delete 'admin'." },
      { title: "No admin passwords older than 90 days", status: "warning", description: "1 administrator's password was last changed 142 days ago.", fix: "Ask the user to rotate their password." },
      { title: "Every user has a real name/email (no test accounts)", status: "pass" },
    ],
  },
  {
    name: "Maintenance & Services",
    items: [
      { title: "Scheduled backups configured (ideally offsite)", status: "fail", description: "No scheduled backup was detected.", fix: "Configure daily/weekly backups with offsite storage (e.g. UpdraftPlus)." },
      { title: "SMTP configured (not the default PHP mailer)", status: "warning", description: "The site is using the default PHP mailer.", fix: "Configure an authenticated SMTP mailer and send a test email." },
      { title: "WP-Cron healthy", status: "pass" },
    ],
  },
  {
    name: "Security & Technical",
    items: [
      { title: "SSL/HTTPS valid", status: "pass" },
      { title: "Dashboard file editing disabled (DISALLOW_FILE_EDIT)", status: "warning", description: "DISALLOW_FILE_EDIT is not set.", fix: "Add define('DISALLOW_FILE_EDIT', true); to wp-config.php." },
      { title: "XML-RPC disabled", status: "pass" },
      { title: "WP_DEBUG off in production", status: "pass" },
      { title: "Basic security headers present", status: "warning", description: "Missing X-Frame-Options and Content-Security-Policy headers.", fix: "Add standard security headers at the server or via a security plugin." },
      { title: "Login protection / limit-login-attempts active", status: "fail", description: "No login-attempt limiting was detected.", fix: "Install a login-protection plugin (e.g. Limit Login Attempts Reloaded)." },
    ],
  },
];

function CheckRow({ item }: { item: Check }) {
  const meta = STATUS_META[item.status];
  const showDetails = item.status !== "pass" && (item.description || item.fix);
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-sm text-slate-700">{item.title}</span>
        <Chip size="sm" variant="soft" color={meta.color} className="shrink-0">
          {meta.label}
        </Chip>
      </div>
      {showDetails && (
        <div className="mt-1.5 space-y-1 border-l-2 border-slate-200 pl-3 text-sm">
          {item.description && <p className="text-slate-600">{item.description}</p>}
          {item.fix && (
            <p className="text-slate-600">
              <span className="font-semibold text-slate-700">Possible fix: </span>
              {item.fix}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function WebsiteChecklistTab() {
  const total = SAMPLE_GROUPS.reduce((sum, group) => sum + group.items.length, 0);
  const counts = { pass: 0, warning: 0, fail: 0, na: 0 };
  SAMPLE_GROUPS.forEach((group) =>
    group.items.forEach((item) => {
      counts[item.status] += 1;
    })
  );

  return (
    <div className="space-y-6">
      <Chip size="sm" variant="soft" color="warning">
        Preview — sample data (populates from the AHM Core plugin once connected)
      </Chip>

      {/* Site stats */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Site stats</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SAMPLE_STATS.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-slate-200 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {stat.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{stat.value}</p>
              {stat.hint && <p className="mt-0.5 text-xs text-slate-400">{stat.hint}</p>}
            </div>
          ))}
        </div>

        {/* Users */}
        <div className="mt-3 rounded-lg border border-slate-200">
          <p className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Users ({SAMPLE_USERS.length})
          </p>
          <ul className="divide-y divide-slate-100">
            {SAMPLE_USERS.map((user) => (
              <li key={user.email} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-800">{user.name}</span>
                  <span className="ml-2 text-xs text-slate-400">{user.email}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                  <Chip size="sm" variant="soft" color="default">{user.role}</Chip>
                  <span>Last login {user.lastLogin}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Checks */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Health checks</h3>
          <Chip size="sm" variant="soft" color="success">{counts.pass} pass</Chip>
          <Chip size="sm" variant="soft" color="warning">{counts.warning} warning</Chip>
          <Chip size="sm" variant="soft" color="danger">{counts.fail} fail</Chip>
          <span className="text-xs text-slate-400">of {total} checks</span>
        </div>

        {SAMPLE_GROUPS.map((group) => (
          <div key={group.name}>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">{group.name}</h4>
              <span className="text-xs text-slate-400">
                {group.items.filter((item) => item.status === "pass").length}/{group.items.length}
              </span>
            </div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {group.items.map((item) => (
                <CheckRow key={item.title} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
