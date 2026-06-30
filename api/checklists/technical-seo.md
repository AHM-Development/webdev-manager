# AHM Technical SEO Checklist

Version: 1.1.0

Apply every check to every discovered, indexable page. Findings require captured evidence. Never infer missing evidence.

## Crawl and indexability

- `seo.http-status`: Final response is 200 for an indexable page; record redirect chains and redirect loops.
- `seo.indexability`: Robots meta and X-Robots-Tag do not unintentionally block indexing or following.
- `seo.robots-txt`: robots.txt is reachable, does not block required assets, and does not block the live site.
- `seo.sitemap-membership`: Canonical indexable pages are present in the XML sitemap; no redirects, errors, or noindex pages are included.
- `seo.canonical`: Exactly one absolute canonical URL exists and resolves to the intended final URL.
- `seo.www-canonical`: One hostname is canonical; the www and non-www variants redirect to it (single 301), and HTTP redirects to HTTPS, without redirect chains or loops.

## Search presentation

- `seo.title`: One unique title exists, describes the page, and is normally 30-60 characters.
- `seo.meta-description`: One relevant description exists, is unique, and is normally 120-160 characters.
- `seo.open-graph`: Required Open Graph title, description, image, URL, and type are present and relevant.
- `seo.twitter-card`: Twitter card type and matching content fields are present.

## Content structure

- `seo.h1`: Exactly one descriptive H1 exists.
- `seo.heading-order`: Heading hierarchy is logical and does not skip levels without reason.
- `seo.language`: The HTML language is declared and matches visible content.
- `seo.content-depth`: Page has meaningful, relevant content rather than placeholders or empty template sections.
- `seo.internal-links`: Important pages have descriptive internal links and no broken internal targets.
- `seo.external-links`: External links resolve and unsafe target=_blank links use noopener.
- `seo.links-ratio`: The page is not dominated by external links relative to internal links, and is not orphaned (has a reasonable number of internal links in and out).
- `seo.content-freshness`: Time-sensitive pages show a recent published or last-modified date; flag stale or missing dates where freshness matters.

## Media and structured data

- `seo.image-alt`: Informative images have useful alt text; decorative images use empty alt text.
- `seo.image-format`: Large images are compressed, appropriately sized, and use modern formats where practical.
- `seo.image-dimensions`: Images declare dimensions or reserve stable aspect-ratio space.
- `seo.structured-data`: JSON-LD parses successfully, uses relevant schema types, and required properties are present.
- `seo.breadcrumbs`: Hierarchical pages expose usable breadcrumbs and BreadcrumbList schema where appropriate.

## Technical quality

- `seo.mobile`: Content is usable at mobile width without horizontal overflow or inaccessible controls.
- `seo.https`: Final page and subresources use HTTPS without mixed content.
- `seo.performance`: Core Web Vitals and Lighthouse diagnostics are reviewed; do not duplicate Lighthouse findings without added SEO impact.
- `seo.duplicate-content`: Duplicate titles, descriptions, canonicals, and substantially duplicated page content are flagged across the scan.
- `seo.url-quality`: URLs are concise, readable, stable, lowercase where applicable, and avoid unnecessary tracking parameters.

## Finding contract

Return `checkId`, `severity`, `title`, `detail`, `evidence`, `recommendation`, and `confidence`. Severity is `info`, `warning`, or `critical`. Confidence is `low`, `medium`, or `high`.
