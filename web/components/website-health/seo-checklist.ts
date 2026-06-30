export type ChecklistItem = {
  id: string;
  title: string;
  criteria: string[];
};

/** The on-page SEO checklist shown for every page. Static guidance; per-page status lives in data.ts. */
export const SEO_CHECKLIST: ChecklistItem[] = [
  {
    id: "title-tag",
    title: "Title Tag",
    criteria: [
      "Unique per page — never duplicate across the site",
      "50–60 characters — gets cut off in search results beyond that",
      "Primary keyword near the front",
      "Format: Primary Keyword — Brand Name",
      "Set via Rank Math or Yoast in the page editor",
    ],
  },
  {
    id: "meta-description",
    title: "Meta Description",
    criteria: [
      "150–160 characters",
      "Includes the primary keyword naturally",
      "Written as a call to action — it's the ad copy in search results",
      "Unique per page — duplicates hurt rankings",
      "Not a ranking factor but directly affects click-through rate",
    ],
  },
  {
    id: "headings",
    title: "Heading Structure (H1 → H6)",
    criteria: [
      "Exactly one H1 per page — matches or is close to the title tag",
      "H2s for main sections, H3s for subsections — never skip levels",
      "Keywords in headings naturally — not stuffed",
      "In Elementor: set heading widget type to the correct HTML tag, not just visual size",
    ],
  },
  {
    id: "url",
    title: "URL / Permalink",
    criteria: [
      "Short and descriptive — domain.com/services/web-design not /?p=123",
      "Lowercase, hyphens only — no underscores, no spaces",
      "Primary keyword included",
      "Set in WordPress permalink settings and per-page slug field",
      "Never change a live URL without a 301 redirect",
    ],
  },
  {
    id: "images",
    title: "Images",
    criteria: [
      "Every <img> tag needs a descriptive alt attribute",
      "Alt text describes the image — include keyword where it fits naturally",
      "Descriptive file names before upload — web-design-dubai.webp not IMG_4521.jpg",
      "Images compressed and in WebP format — critical for PageSpeed",
      "Width and height attributes set to prevent Cumulative Layout Shift (CLS)",
    ],
  },
  {
    id: "og-tags",
    title: "Open Graph (OG) Tags",
    criteria: [
      "og:title — can differ from the SEO title",
      "og:description — can differ from the meta description",
      "og:image — minimum 1200×630px, under 1MB",
      "og:url — canonical URL of the page",
      "Rank Math fills these automatically if configured",
    ],
  },
  {
    id: "twitter-cards",
    title: "Twitter Card Tags",
    criteria: [
      "twitter:card — use summary_large_image",
      "twitter:title, twitter:description, twitter:image",
      "Rank Math handles these alongside OG tags",
    ],
  },
  {
    id: "canonical",
    title: "Canonical Tag",
    criteria: [
      '<link rel="canonical" href="https://domain.com/page/"> in <head>',
      "Prevents duplicate content issues (e.g. ?utm_source= URL variants)",
      "WordPress and Rank Math add this automatically — verify the target URL",
      "Especially important on paginated pages and pages with query strings",
    ],
  },
  {
    id: "schema",
    title: "Schema Markup (Structured Data)",
    criteria: [
      "LocalBusiness — for any local business site (name, address, phone, hours, geo)",
      "WebPage / WebSite — on homepage",
      "Article / BlogPosting — on blog posts",
      "Service — on service pages",
      "FAQPage — for FAQ sections (adds expandable results in Google)",
      "BreadcrumbList — for breadcrumb navigation",
      "Validate at search.google.com/test/rich-results",
    ],
  },
  {
    id: "internal-linking",
    title: "Internal Linking",
    criteria: [
      "Every page should have 2–3 internal links pointing to it from other pages",
      'Use descriptive anchor text — not "click here"',
      "Link to related services, blog posts, or pages logically",
      "Elementor text widgets need manual internal links — check every page",
    ],
  },
  {
    id: "robots-meta",
    title: "Robots Meta Tag",
    criteria: [
      'Default: <meta name="robots" content="index, follow">',
      "Pages you don't want indexed: noindex, nofollow — thank-you, login, admin",
      "In Rank Math: Advanced tab → Robots Meta per page",
      "Never accidentally set the whole site to noindex (Settings → Reading)",
    ],
  },
  {
    id: "sitemap",
    title: "Sitemap",
    criteria: [
      "sitemap.xml accessible at domain.com/sitemap.xml or sitemap_index.xml",
      "Rank Math auto-generates and updates it",
      "Submitted to Google Search Console",
      "Excludes: noindex pages, 404s, redirected URLs",
    ],
  },
  {
    id: "robots-txt",
    title: "Robots.txt",
    criteria: [
      "Accessible at domain.com/robots.txt",
      "Should not block CSS, JS, or images — Google needs these to render",
      "Should block: /wp-admin/, /wp-includes/ (except wp-includes/js/)",
      "Include a Sitemap: directive pointing to your sitemap URL",
      "Never use Disallow: / on a live site — blocks all crawling",
    ],
  },
  {
    id: "page-speed",
    title: "Page Speed (Core Web Vitals)",
    criteria: [
      "LCP (Largest Contentful Paint) — under 2.5s",
      "CLS (Cumulative Layout Shift) — under 0.1",
      "INP (Interaction to Next Paint) — under 200ms",
      "Lazy load images, cache, serve WebP, minimise render-blocking JS",
    ],
  },
  {
    id: "https-ssl",
    title: "HTTPS + SSL",
    criteria: [
      "Every page must load on https:// — Google uses this as a ranking signal",
      "All http:// URLs redirect to https:// via 301",
      "No mixed content warnings (HTTP resources on an HTTPS page)",
      "SSL certificate valid and not expiring",
    ],
  },
  {
    id: "mobile",
    title: "Mobile Responsiveness",
    criteria: [
      "Renders correctly at 375px, 768px, and 1280px viewports",
      "In Elementor: check responsive mode for every section",
      "Touch targets (buttons, links) minimum 44×44px",
      "Font sizes minimum 16px on mobile",
      "No horizontal scroll on any mobile breakpoint",
    ],
  },
  {
    id: "breadcrumbs",
    title: "Breadcrumbs",
    criteria: [
      "Shows hierarchy: Home → Services → Web Design",
      "Helps Google understand site structure",
      "Rank Math adds BreadcrumbList schema when breadcrumbs are enabled",
      "In Elementor: add the [rank_math_breadcrumb] shortcode to the template",
    ],
  },
];
