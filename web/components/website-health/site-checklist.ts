import type { ChecklistItem } from "./seo-checklist";

/** Site-wide health checks (apply to the whole website, not a single page). */
export const SITE_CHECKLIST: ChecklistItem[] = [
  {
    id: "https-ssl",
    title: "HTTPS / SSL",
    criteria: [
      "Whole site loads over https://",
      "All http:// URLs 301-redirect to https://",
      "No mixed-content warnings",
      "SSL certificate valid and not expiring soon",
    ],
  },
  {
    id: "sitemap",
    title: "XML Sitemap",
    criteria: [
      "sitemap.xml (or sitemap_index.xml) is accessible",
      "Auto-generated and kept up to date",
      "Submitted to Google Search Console",
      "Excludes noindex pages, 404s, and redirects",
    ],
  },
  {
    id: "robots-txt",
    title: "Robots.txt",
    criteria: [
      "Accessible at domain.com/robots.txt",
      "Does not block CSS, JS, or images",
      "Blocks /wp-admin/ (except admin-ajax)",
      "Includes a Sitemap: directive",
      "Never Disallow: / on a live site",
    ],
  },
  {
    id: "domain-canonical",
    title: "Domain Canonicalization",
    criteria: [
      "www and non-www resolve to one canonical host via 301",
      "http and https resolve to one canonical version",
      "No duplicate home page at /index.php or /home",
    ],
  },
  {
    id: "mobile-friendly",
    title: "Mobile Friendly",
    criteria: [
      "Passes Google's mobile-friendly test",
      "No horizontal scroll at 375px",
      "Touch targets at least 44×44px",
      "Body text at least 16px on mobile",
    ],
  },
  {
    id: "analytics",
    title: "Analytics & Search Console",
    criteria: [
      "GA4 installed and firing",
      "Google Search Console verified",
      "Conversion / event tracking configured",
    ],
  },
  {
    id: "site-schema",
    title: "Site-wide Schema",
    criteria: [
      "Organization / LocalBusiness schema present",
      "Name, address, phone, hours, geo coordinates",
      "Validated at search.google.com/test/rich-results",
    ],
  },
  {
    id: "error-pages",
    title: "404 & Broken Links",
    criteria: [
      "Custom 404 page configured",
      "No soft-404s (200 status on missing pages)",
      "No broken internal or outbound links",
    ],
  },
  {
    id: "backups-caching",
    title: "Backups & Caching",
    criteria: [
      "Automated off-site backups scheduled",
      "Page caching enabled",
      "CDN serving static assets",
    ],
  },
];
