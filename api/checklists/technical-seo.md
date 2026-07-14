# AHM Technical SEO Checklist

Version: 2.0.0

Scope: **basic SEO a developer can fix**, run **deterministically** from the crawl (no Lighthouse, no connector). Placeholder-text detection is the one AI-assisted check (Claude, with a regex fallback). Each finding carries the exact element/evidence + a recommendation.

## Per-page (deterministic)

- `seo.http-status`: Final response is not a 4xx/5xx error.
- `seo.title`: One title exists; length ~30–60 characters.
- `seo.meta-description`: One description exists; length ~120–160 characters.
- `seo.h1`: Exactly one H1.
- `seo.heading-order`: Heading levels do not skip (H1 → H2 → H3).
- `seo.canonical`: Present, absolute, and self-referential (info when it points elsewhere).
- `seo.noindex`: Page is not unintentionally `noindex` (meta robots or `X-Robots-Tag`).
- `seo.language`: `<html lang>` is set.
- `seo.open-graph`: og:title, og:description, og:image present.
- `seo.link-text`: No empty or generic ("click here", "read more") anchor text.
- `seo.structured-data`: JSON-LD present and parses.

## Images (deterministic, aggregated per page)

- `seo.image-count`: Total images on the page (info).
- `seo.image-alt`: Content images have alt text.
- `seo.image-format`: Flags legacy JPEG/PNG/GIF that should be WebP/AVIF (via response content-type / extension).
- `seo.image-oversized`: Intrinsic width > 2× rendered width, or wider than 1920px.
- `seo.image-weight`: File size > 250 KB (warning) / > 600 KB (critical), from the response content-length.

## Placeholder content (AI, regex fallback)

- `seo.placeholder-content`: Claude reads the visible page text and flags placeholder / dummy / unfinished copy (lorem ipsum, "insert tagline here", filler, half-written sentences). When the AI key is not configured, a regex fallback covers the common phrases. Every finding must quote the offending text.

## Site-level (deterministic, once per scan)

- `seo.homepage-reachable`: The site root responds 2xx.
- `seo.robots-txt`: robots.txt is reachable and does not `Disallow: /` for all agents.
- `seo.sitemap`: The provided sitemap URL is reachable and is valid XML with `<loc>` entries.
- `seo.broken-links`: Internal + external links (unique, capped at 150, throttled) resolve — no 4xx/5xx/connection failures.
- `seo.duplicate-title` / `seo.duplicate-description`: Titles and meta descriptions are unique across scanned pages.

## Finding contract

Return `checkId`, `severity` (`info`|`warning`|`critical`), `title`, `detail`, `evidence`, `recommendation`, `confidence`.
