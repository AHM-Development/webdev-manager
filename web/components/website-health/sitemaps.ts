export type SitemapPage = { id: string; name: string; path: string };

/**
 * A sitemap source for one website/domain.
 * - `sitemapUrl` is what gets fetched to discover the pages.
 * - `pages` is the parsed result (mocked here; in production, fetch sitemapUrl,
 *   parse the <loc> entries, and build this list).
 */
export type SitemapSource = {
  sitemapUrl: string;
  pages: SitemapPage[];
};

export type ProjectWebsite = {
  id: string;
  name: string;
  url: string;
  sitemapUrl?: string;
};

export type WebsiteSitemap = ProjectWebsite & SitemapSource;

export type ProjectWebsiteSitemaps = {
  websites: WebsiteSitemap[];
};

const HOME: SitemapPage = { id: "home", name: "Home", path: "/" };

const ACME_PAGES: SitemapPage[] = [
  HOME,
  { id: "about", name: "About", path: "/about" },
  { id: "services", name: "Services", path: "/services" },
  { id: "treatments", name: "Treatments", path: "/treatments" },
  { id: "contact", name: "Contact", path: "/contact" },
  { id: "blog", name: "Blog", path: "/blog" },
];

const CITYVET_PAGES: SitemapPage[] = [
  HOME,
  { id: "about", name: "About", path: "/about" },
  { id: "services", name: "Services", path: "/services" },
  { id: "vets", name: "Our Vets", path: "/vets" },
  { id: "contact", name: "Contact", path: "/contact" },
  { id: "emergency", name: "Emergency", path: "/emergency" },
];

/**
 * 👉 ADD WEBSITE/DOMAIN SCAN TARGETS HERE — one project can have many.
 * Staging is intentionally not a first-class environment here because staging
 * can be unpublished after launch. Add each active website/domain by name.
 */
export const websitesByProject: Record<string, ProjectWebsiteSitemaps> = {
  p1: {
    websites: [
      {
        id: "main",
        name: "Main Website",
        url: "https://acmedental.com",
      sitemapUrl: "https://acmedental.com/sitemap.xml",
      pages: ACME_PAGES,
    },
      {
        id: "patient-portal",
        name: "Patient Portal",
        url: "https://patients.acmedental.com",
        sitemapUrl: "https://patients.acmedental.com/sitemap.xml",
        pages: [HOME, { id: "login", name: "Login", path: "/login" }],
      },
    ],
  },
  p2: {
    websites: [
      {
        id: "one-pager",
        name: "One Pager",
        url: "https://brightsmiles.io",
        sitemapUrl: "https://brightsmiles.io/sitemap.xml",
      pages: [HOME],
    },
    ],
  },
  p4: {
    websites: [
      {
        id: "main",
        name: "Main Website",
        url: "https://urbanphysio.co.uk",
      sitemapUrl: "https://urbanphysio.co.uk/sitemap.xml",
      pages: [HOME],
    },
    ],
  },
  p6: {
    websites: [
      {
        id: "main",
        name: "Main Website",
        url: "https://peakfit.studio",
      sitemapUrl: "https://peakfit.studio/sitemap.xml",
      pages: [HOME],
    },
      {
        id: "classes",
        name: "Class Schedule",
        url: "https://classes.peakfit.studio",
        sitemapUrl: "https://classes.peakfit.studio/sitemap.xml",
        pages: [
          HOME,
          { id: "classes", name: "Classes", path: "/classes" },
          { id: "pricing", name: "Pricing", path: "/pricing" },
        ],
      },
    ],
  },
  p7: {
    websites: [
      {
        id: "main",
        name: "Main Website",
        url: "https://cityvet.com",
        sitemapUrl: "https://cityvet.com/sitemap.xml",
      pages: CITYVET_PAGES,
    },
    ],
  },
};

/** Pages used when a client has a site URL but no explicit sitemap configured yet. */
export const DEFAULT_SITEMAP: SitemapPage[] = [
  HOME,
  { id: "about", name: "About", path: "/about" },
  { id: "services", name: "Services", path: "/services" },
  { id: "contact", name: "Contact", path: "/contact" },
];

/** Derive a best-guess sitemap URL from a site URL (fallback only). */
export function deriveSitemapUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, "")}/sitemap.xml`;
}
