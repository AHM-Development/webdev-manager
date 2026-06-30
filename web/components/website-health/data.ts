import { projects } from "@/components/projects/data";

import { SEO_CHECKLIST } from "./seo-checklist";
import { SITE_CHECKLIST } from "./site-checklist";
import {
  DEFAULT_SITEMAP,
  deriveSitemapUrl,
  websitesByProject,
  type ProjectWebsite,
  type SitemapPage,
  type SitemapSource,
} from "./sitemaps";

export type CheckStatus = "pass" | "warn" | "fail";

export type PageSpeed = {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  lcp: number;
  cls: number;
  inp: number;
  fcp: number;
  speedIndex: number;
  totalBlockingTime: number;
  transferSizeKb: number;
  consoleErrors: number;
  renderBlockingResources: number;
};

export type ImageIssue =
  | "not-webp"
  | "missing-alt"
  | "missing-dimensions"
  | "too-large";

export const imageIssueLabel: Record<ImageIssue, string> = {
  "not-webp": "Convert to WebP",
  "missing-alt": "Add alt text",
  "missing-dimensions": "Set width/height",
  "too-large": "Compress",
};

export type PageImage = { src: string; sizeKb: number; issues: ImageIssue[] };

export type DesignViewport = "mobile" | "tablet" | "desktop";

export type DesignIssue = {
  id: string;
  viewport: DesignViewport;
  severity: CheckStatus;
  title: string;
  detail: string;
  screenshot: string;
};

export type DesignQa = {
  mobile: CheckStatus;
  tablet: CheckStatus;
  desktop: CheckStatus;
  figmaMatch: number | null;
  aiSummary: string;
  issues: DesignIssue[];
};

export type PageForm = {
  id: string;
  pageId: string;
  pageName: string;
  pagePath: string;
  name: string;
  type: "Contact" | "Booking" | "Newsletter" | "Quote" | "Login";
  selector: string;
  fields: string[];
  requiredFields: string[];
  recaptcha: "v2 checkbox" | "v2 invisible" | "v3" | "missing";
  submitStatus: "passed" | "failed" | "skipped";
  endpoint: string;
  lastTestedAt: string;
  resultMessage: string;
  consoleErrors: number;
  networkErrors: number;
};

export type PageAudit = {
  id: string;
  name: string;
  path: string;
  speedMobile: PageSpeed;
  speedDesktop: PageSpeed;
  images: PageImage[];
  seoChecks: Record<string, CheckStatus>;
  seoNotes: Record<string, string>;
  technicalSeoScore: number;
  brokenInternalLinks: number;
  brokenExternalLinks: number;
  missingAltImages: number;
  schemaTypes: string[];
  designQa: DesignQa;
  forms: PageForm[];
};

export type ScanFinding = {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
};

export type WordPressPlugin = {
  name: string;
  installedVersion: string;
  latestVersion: string;
  updated: boolean;
  lastUpdatedAt: string;
};

export type WordPressUser = {
  name: string;
  role: string;
  email: string;
  lastLoginAt: string;
  passwordUpdatedAt: string;
};

export type SiteAudit = {
  websiteId: string;
  websiteName: string;
  websiteUrl: string;
  sitemapUrl: string;
  lastActivityAt: string;
  lastUpdatedAt: string;
  wordpressVersion: string;
  wordpressLatestVersion: string;
  themeName: string;
  themeVersion: string;
  phpVersion: string;
  sslExpiresAt: string;
  connectorStatus: "connected" | "warning" | "disconnected";
  pages: PageAudit[];
  qaFindings: ScanFinding[];
  plugins: WordPressPlugin[];
  users: WordPressUser[];
  siteChecks: Record<string, CheckStatus>;
  siteNotes: Record<string, string>;
};

export type ProjectHealth = {
  websites: SiteAudit[];
};

export type HealthSummary = {
  overall: number;
  performance: number;
  accessibility: number;
  bestPractices: number;
  technicalSeoScore: number;
  designScore: number;
  forms: { total: number; working: number; missingCaptcha: number; failed: number };
  wordpress: { outdatedPlugins: number; stalePasswords: number; coreUpdated: boolean };
  security: CheckStatus;
  criticalIssues: number;
  seo: { pass: number; warn: number; fail: number; total: number };
  imagesNeedingAttention: number;
};

/* ----------------------------- deterministic RNG ----------------------------- */
// Seeded so the server and client generate identical data (no hydration drift).

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function status(rng: Rng, quality: number): CheckStatus {
  const r = rng();
  if (r < quality) return "pass";
  if (r < quality + (1 - quality) * 0.6) return "warn";
  return "fail";
}

const NOTE_MAP: Record<string, { warn?: string; fail?: string }> = {
  "title-tag": {
    warn: "Title is 72 characters — trim to under 60.",
    fail: "Missing or duplicated across pages.",
  },
  "meta-description": {
    warn: "Description is ~185 characters — trim to ~155.",
    fail: "No meta description set.",
  },
  headings: {
    warn: "Two H1 tags found — there should be exactly one.",
    fail: "No H1 detected on the page.",
  },
  images: {
    warn: "Some images are missing alt text.",
    fail: "Large non-WebP images are hurting load time.",
  },
  canonical: {
    warn: "Canonical points to a non-www variant — verify.",
    fail: "Canonical tag is missing.",
  },
  schema: {
    warn: "Schema present but has validation warnings.",
    fail: "No structured data detected.",
  },
  "internal-linking": {
    warn: "Fewer than 2 internal links point to this page.",
  },
  "page-speed": {
    warn: "LCP is above 2.5s on mobile.",
    fail: "Core Web Vitals are failing on mobile.",
  },
  "robots-meta": { warn: "Page is set to noindex — confirm this is intentional." },
  "https-ssl": { fail: "Mixed-content resources loaded over http://." },
  sitemap: { warn: "Sitemap not yet submitted to Search Console." },
  "robots-txt": { warn: "Robots.txt is blocking /wp-content/ assets." },
  analytics: { fail: "GA4 tag not detected." },
  "backups-caching": { warn: "No CDN detected in front of static assets." },
};

function noteFor(id: string, title: string, s: CheckStatus): string {
  if (s === "pass") return "";
  const mapped = NOTE_MAP[id]?.[s];
  if (mapped) return mapped;
  return s === "fail"
    ? `${title} is failing — fix required.`
    : `${title} needs attention — review the criteria below.`;
}

/* ------------------------------- generators -------------------------------- */

const IMAGE_NAMES = [
  "hero-banner.jpg",
  "team-photo.jpg",
  "service-1.jpg",
  "gallery-2.png",
  "thumb-3.jpg",
  "map.webp",
  "logo.webp",
];

const ALL_ISSUES: ImageIssue[] = [
  "not-webp",
  "missing-alt",
  "missing-dimensions",
  "too-large",
];

const WP_VERSIONS = ["6.6.1", "6.6.2", "6.7.0", "6.7.1"];
const WP_LATEST_VERSION = "6.7.1";
const PLUGIN_NAMES = [
  "Elementor",
  "Rank Math SEO",
  "WP Rocket",
  "Wordfence Security",
  "Advanced Custom Fields",
  "UpdraftPlus",
  "Gravity Forms",
];
const USER_ROLES = ["Administrator", "Editor", "SEO Manager", "Developer"];
const USER_NAMES = [
  ["Sarah Chen", "sarah@agency.com"],
  ["Mike Ross", "mike@agency.com"],
  ["Aisha Khan", "aisha@agency.com"],
  ["Client Admin", "admin@client-site.com"],
];
const THEME_NAMES = ["Hello Elementor", "Astra Child", "GeneratePress Child", "Kadence Child"];
const SCHEMA_TYPES = ["WebPage", "Organization", "LocalBusiness", "BreadcrumbList", "FAQPage", "Service"];

function daysAgo(days: number, hour = 9): string {
  const d = new Date(Date.UTC(2026, 5, 15 - days, hour, 0, 0));
  return d.toISOString();
}

function versionBump(version: string, amount: number): string {
  const parts = version.split(".").map(Number);
  parts[2] = Math.max(0, parts[2] + amount);
  return parts.join(".");
}

function buildPlugins(rng: Rng): WordPressPlugin[] {
  return PLUGIN_NAMES.map((name, index) => {
    const updated = rng() > 0.28;
    const latestVersion = `${3 + (index % 4)}.${10 + index}.${Math.floor(rng() * 8)}`;
    return {
      name,
      installedVersion: updated ? latestVersion : versionBump(latestVersion, -1),
      latestVersion,
      updated,
      lastUpdatedAt: daysAgo(2 + Math.floor(rng() * 80), 10 + (index % 6)),
    };
  });
}

function buildUsers(rng: Rng): WordPressUser[] {
  return USER_NAMES.map(([name, email], index) => ({
    name,
    email,
    role: USER_ROLES[index % USER_ROLES.length],
    lastLoginAt: daysAgo(1 + Math.floor(rng() * 28), 8 + index),
    passwordUpdatedAt: daysAgo(12 + Math.floor(rng() * 150), 11 + index),
  }));
}

function buildQaFindings(rng: Rng, quality: number): ScanFinding[] {
  const defs = [
    ["forms", "Forms submit successfully", "Contact and lead forms return a success state."],
    ["navigation", "Navigation links resolve", "Primary nav, footer links, and CTAs do not return 404s."],
    ["responsive", "Responsive layout", "Key templates render cleanly on mobile, tablet, and desktop."],
    ["security", "Admin exposure", "Login/admin URLs and directory indexing are reviewed."],
    ["backups", "Backup freshness", "Latest off-site backup is recent and restorable."],
  ] as const;

  return defs.map(([id, title, detail]) => ({
    id,
    title,
    status: status(rng, quality),
    detail,
  }));
}

function buildDesignQa(rng: Rng, quality: number, pageName: string): DesignQa {
  const issues: DesignIssue[] = [];
  const defs = [
    ["mobile", "Hero text overlaps CTA", "The main heading wraps over the primary action at 375px.", "mobile-home-overlap.png"],
    ["tablet", "Two-column card spacing", "Service cards lose equal height between 768px and 900px.", "tablet-card-spacing.png"],
    ["desktop", "Figma spacing mismatch", "Hero image is 24px lower than the approved desktop frame.", "desktop-figma-offset.png"],
    ["mobile", "Horizontal overflow", "A pricing table creates 42px horizontal scroll on mobile.", "mobile-overflow.png"],
  ] as const;

  defs.forEach(([viewport, title, detail, screenshot], index) => {
    if (rng() > quality + 0.16) {
      issues.push({
        id: `${viewport}-${index}`,
        viewport,
        severity: rng() > 0.72 ? "fail" : "warn",
        title,
        detail,
        screenshot,
      });
    }
  });

  function viewportStatus(viewport: DesignViewport): CheckStatus {
    const matching = issues.filter((issue) => issue.viewport === viewport);
    if (matching.some((issue) => issue.severity === "fail")) return "fail";
    if (matching.length) return "warn";
    return "pass";
  }

  return {
    mobile: viewportStatus("mobile"),
    tablet: viewportStatus("tablet"),
    desktop: viewportStatus("desktop"),
    figmaMatch: Math.round(72 + quality * 24 - issues.length * 4 + rng() * 5),
    aiSummary: issues.length
      ? `${pageName} mostly follows the approved design, but responsive spacing and visual alignment need review on affected breakpoints.`
      : `${pageName} matches the approved layout closely across mobile, tablet, and desktop breakpoints.`,
    issues,
  };
}

function buildForms(rng: Rng, quality: number, page: SitemapPage): PageForm[] {
  const lower = `${page.name} ${page.path}`.toLowerCase();
  const shouldHaveForm =
    lower.includes("contact") ||
    lower.includes("booking") ||
    lower.includes("appointment") ||
    lower.includes("quote") ||
    lower.includes("home") ||
    rng() > 0.72;

  if (!shouldHaveForm) return [];

  const type: PageForm["type"] = lower.includes("booking") || lower.includes("appointment")
    ? "Booking"
    : lower.includes("quote")
      ? "Quote"
      : lower.includes("newsletter")
        ? "Newsletter"
        : lower.includes("login")
          ? "Login"
          : "Contact";
  const submitHealthy = rng() < quality + 0.1;
  const hasCaptcha = type === "Login" ? true : rng() < quality + 0.18;
  const fields =
    type === "Newsletter"
      ? ["email"]
      : type === "Booking"
        ? ["first_name", "last_name", "email", "phone", "service", "preferred_date", "message"]
        : ["name", "email", "phone", "message"];

  return [
    {
      id: `${page.id}-form-1`,
      pageId: page.id,
      pageName: page.name,
      pagePath: page.path,
      name: `${type} form`,
      type,
      selector: `form[data-form="${page.id}-${type.toLowerCase()}"]`,
      fields,
      requiredFields: fields.filter((field) => field !== "phone" && field !== "message"),
      recaptcha: hasCaptcha ? (rng() > 0.5 ? "v3" : "v2 invisible") : "missing",
      submitStatus: submitHealthy ? "passed" : "failed",
      endpoint:
        type === "Booking"
          ? "/wp-json/booking/v1/submit"
          : "/wp-json/contact-form-7/v1/contact-forms/123/feedback",
      lastTestedAt: daysAgo(1 + Math.floor(rng() * 4), 10 + Math.floor(rng() * 6)),
      resultMessage: submitHealthy
        ? "Submission returned success message and no network errors."
        : "Submission failed or did not show a success confirmation.",
      consoleErrors: submitHealthy ? 0 : 1 + Math.floor(rng() * 2),
      networkErrors: submitHealthy ? 0 : Math.floor(rng() * 2),
    },
  ];
}

function buildPage(rng: Rng, quality: number, def: SitemapPage): PageAudit {
  const perfM = Math.round(40 + rng() * 58);
  const perfD = Math.min(100, perfM + 12 + Math.round(rng() * 18));
  const a11y = Math.round(82 + rng() * 18);
  const bp = Math.round(82 + rng() * 18);
  const seo = Math.round(84 + rng() * 16);

  const lcpM = Math.round((1.6 + rng() * 3) * 10) / 10;
  const clsM = Math.round(rng() * 22) / 100;
  const inpM = Math.round(80 + rng() * 320);
  const transferSize = 780 + Math.round(rng() * 2800);

  const imageCount = 1 + Math.floor(rng() * 3);
  const images: PageImage[] = Array.from({ length: imageCount }, (_, i) => {
    const broken = rng() > quality;
    const issues = broken
      ? ALL_ISSUES.filter(() => rng() > 0.5)
      : [];
    return {
      src: IMAGE_NAMES[(hashString(def.id) + i) % IMAGE_NAMES.length],
      sizeKb: 40 + Math.round(rng() * 780),
      issues: issues.length === 0 && broken ? ["not-webp"] : issues,
    };
  });

  const seoChecks: Record<string, CheckStatus> = {};
  const seoNotes: Record<string, string> = {};
  for (const item of SEO_CHECKLIST) {
    const s = status(rng, quality);
    seoChecks[item.id] = s;
    const note = noteFor(item.id, item.title, s);
    if (note) seoNotes[item.id] = note;
  }

  return {
    ...def,
    speedMobile: {
      performance: perfM,
      accessibility: a11y,
      bestPractices: bp,
      seo,
      lcp: lcpM,
      cls: clsM,
      inp: inpM,
      fcp: Math.round((0.9 + rng() * 2.8) * 10) / 10,
      speedIndex: Math.round((2.2 + rng() * 4.5) * 10) / 10,
      totalBlockingTime: Math.round(80 + rng() * 620),
      transferSizeKb: transferSize,
      consoleErrors: rng() > quality ? Math.floor(rng() * 4) : 0,
      renderBlockingResources: rng() > quality ? 1 + Math.floor(rng() * 5) : Math.floor(rng() * 2),
    },
    speedDesktop: {
      performance: perfD,
      accessibility: a11y,
      bestPractices: Math.min(100, bp + 4),
      seo,
      lcp: Math.round(Math.max(0.6, lcpM - 1.4) * 10) / 10,
      cls: Math.round((clsM / 2) * 100) / 100,
      inp: Math.round(inpM / 2),
      fcp: Math.round((0.6 + rng() * 1.4) * 10) / 10,
      speedIndex: Math.round((1.4 + rng() * 2.3) * 10) / 10,
      totalBlockingTime: Math.round(20 + rng() * 220),
      transferSizeKb: transferSize,
      consoleErrors: rng() > quality + 0.1 ? Math.floor(rng() * 3) : 0,
      renderBlockingResources: rng() > quality + 0.08 ? 1 + Math.floor(rng() * 3) : 0,
    },
    images,
    seoChecks,
    seoNotes,
    technicalSeoScore: Math.round(
      (Object.values(seoChecks).filter((item) => item === "pass").length /
        Object.values(seoChecks).length) *
        100
    ),
    brokenInternalLinks: rng() > quality ? Math.floor(rng() * 6) : 0,
    brokenExternalLinks: rng() > quality + 0.05 ? Math.floor(rng() * 4) : 0,
    missingAltImages: images.filter((image) => image.issues.includes("missing-alt")).length,
    schemaTypes: SCHEMA_TYPES.filter(() => rng() > 0.52).slice(0, 4),
    designQa: buildDesignQa(rng, quality, def.name),
    forms: buildForms(rng, quality, def),
  };
}

function buildSiteAudit(
  seedKey: string,
  quality: number,
  website: ProjectWebsite,
  source: SitemapSource
): SiteAudit {
  const rng = mulberry32(hashString(seedKey));
  const pages = source.pages.map((def) => buildPage(rng, quality, def));
  const wpIndex = Math.floor(rng() * WP_VERSIONS.length);

  const siteChecks: Record<string, CheckStatus> = {};
  const siteNotes: Record<string, string> = {};
  for (const item of SITE_CHECKLIST) {
    const s = status(rng, quality);
    siteChecks[item.id] = s;
    const note = noteFor(item.id, item.title, s);
    if (note) siteNotes[item.id] = note;
  }

  return {
    websiteId: website.id,
    websiteName: website.name,
    websiteUrl: website.url,
    sitemapUrl: source.sitemapUrl,
    lastActivityAt: daysAgo(1 + Math.floor(rng() * 12), 9 + Math.floor(rng() * 7)),
    lastUpdatedAt: daysAgo(1 + Math.floor(rng() * 20), 8 + Math.floor(rng() * 8)),
    wordpressVersion: WP_VERSIONS[wpIndex],
    wordpressLatestVersion: WP_LATEST_VERSION,
    themeName: THEME_NAMES[Math.floor(rng() * THEME_NAMES.length)],
    themeVersion: `${1 + Math.floor(rng() * 3)}.${Math.floor(rng() * 9)}.${Math.floor(rng() * 9)}`,
    phpVersion: rng() > 0.35 ? "8.2" : "8.1",
    sslExpiresAt: daysAgo(-20 - Math.floor(rng() * 160), 8),
    connectorStatus: rng() > 0.16 ? "connected" : "warning",
    pages,
    qaFindings: buildQaFindings(rng, quality),
    plugins: buildPlugins(rng),
    users: buildUsers(rng),
    siteChecks,
    siteNotes,
  };
}

/* --------------------------- per-project assembly --------------------------- */

export const healthByProject: Record<string, ProjectHealth> = {};

for (const p of projects) {
  // Quality varies by project so some sites look healthier than others.
  const quality = 0.55 + (hashString(p.id) % 35) / 100; // 0.55–0.89
  const configured = websitesByProject[p.id]?.websites ?? [];
  const fallbackWebsites: ProjectWebsite[] = [
    ...(p.liveLink
      ? [{ id: "main", name: "Main Website", url: p.liveLink }]
      : []),
    ...(p.stagingLink
      ? [{ id: "staging", name: "Staging Website", url: p.stagingLink }]
      : []),
  ];
  const websites = configured.length > 0 ? configured : fallbackWebsites;

  healthByProject[p.id] = {
    websites: websites.map((website, index) => {
      const configuredSource = configured.find((item) => item.id === website.id);
      const source: SitemapSource = {
        sitemapUrl:
          configuredSource?.sitemapUrl ??
          website.sitemapUrl ??
          deriveSitemapUrl(website.url),
        pages: configuredSource?.pages ?? DEFAULT_SITEMAP,
      };
      return buildSiteAudit(
        `${p.id}:${website.id}`,
        Math.max(0.35, quality - index * 0.08),
        website,
        source
      );
    }),
  };
}

export function primaryAudit(health: ProjectHealth): SiteAudit | undefined {
  return health.websites[0];
}

export function summarize(audit: SiteAudit): HealthSummary {
  const pageCount = Math.max(1, audit.pages.length);
  const perf = Math.round(
    audit.pages.reduce((s, p) => s + p.speedMobile.performance, 0) /
      pageCount
  );
  const accessibility = Math.round(
    audit.pages.reduce((s, p) => s + p.speedMobile.accessibility, 0) /
      pageCount
  );
  const bestPractices = Math.round(
    audit.pages.reduce((s, p) => s + p.speedMobile.bestPractices, 0) /
      pageCount
  );
  const technicalSeoScore = Math.round(
    audit.pages.reduce((s, p) => s + p.technicalSeoScore, 0) /
      pageCount
  );

  const seo = { pass: 0, warn: 0, fail: 0, total: 0 };
  let passTotal = 0;
  let total = 0;
  for (const page of audit.pages) {
    for (const item of SEO_CHECKLIST) {
      const st = page.seoChecks[item.id];
      if (st === "pass" || st === "warn" || st === "fail") {
        seo[st]++;
        seo.total++;
        total++;
        if (st === "pass") passTotal++;
      }
    }
  }
  for (const item of SITE_CHECKLIST) {
    const st = audit.siteChecks[item.id];
    if (st === "pass" || st === "warn" || st === "fail") {
      total++;
      if (st === "pass") passTotal++;
    }
  }

  const imagesNeedingAttention = audit.pages.reduce(
    (s, p) => s + p.images.filter((i) => i.issues.length > 0).length,
    0
  );
  const allForms = audit.pages.flatMap((page) => page.forms);
  const failedForms = allForms.filter((form) => form.submitStatus === "failed").length;
  const missingCaptcha = allForms.filter((form) => form.recaptcha === "missing").length;
  const designIssues = audit.pages.flatMap((page) => page.designQa.issues);
  const designFails = designIssues.filter((issue) => issue.severity === "fail").length;
  const designScore = Math.round(
    audit.pages.reduce((sum, page) => sum + (page.designQa.figmaMatch ?? 0), 0) /
      pageCount
  );
  const outdatedPlugins = audit.plugins.filter((plugin) => !plugin.updated).length;
  const stalePasswords = audit.users.filter((user) => {
    if (!user.passwordUpdatedAt) return false;
    const ageMs = Date.now() - new Date(user.passwordUpdatedAt).getTime();
    return Number.isFinite(ageMs) && ageMs / 86_400_000 > 90;
  }).length;
  const securityStatuses = ["https-ssl", "robots-txt", "backups-caching"].map(
    (id) => audit.siteChecks[id]
  );
  const security: CheckStatus = securityStatuses.includes("fail")
    ? "fail"
    : securityStatuses.includes("warn")
      ? "warn"
      : "pass";
  const criticalIssues =
    seo.fail +
    failedForms +
    missingCaptcha +
    designFails +
    (audit.wordpressVersion === audit.wordpressLatestVersion ? 0 : 1) +
    (security === "fail" ? 1 : 0);

  const checklistScore = total ? (passTotal / total) * 100 : 100;
  const overall = Math.round(0.4 * perf + 0.6 * checklistScore);

  return {
    overall,
    performance: perf,
    accessibility,
    bestPractices,
    technicalSeoScore,
    designScore,
    forms: {
      total: allForms.length,
      working: allForms.filter((form) => form.submitStatus === "passed").length,
      missingCaptcha,
      failed: failedForms,
    },
    wordpress: {
      outdatedPlugins,
      stalePasswords,
      coreUpdated: audit.wordpressVersion === audit.wordpressLatestVersion,
    },
    security,
    criticalIssues,
    seo,
    imagesNeedingAttention,
  };
}
