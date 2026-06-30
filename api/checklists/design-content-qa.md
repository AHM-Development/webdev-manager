# AHM Design and Content QA Checklist

Version: 1.0.0

Review each page at mobile, tablet, and desktop. Use screenshots together with DOM, CSS, console, and network evidence. Do not report subjective preferences as defects.

## Rendering and layout

- `design.horizontal-overflow`: No unintended horizontal scrolling or content outside the viewport.
- `design.overlap`: Text, controls, headers, dialogs, and media do not overlap incoherently.
- `design.clipping`: Text and interactive controls are not clipped, truncated, or hidden unintentionally.
- `design.broken-media`: Images, videos, icons, fonts, and embeds render successfully.
- `design.empty-sections`: No unexplained blank bands, collapsed containers, or missing content blocks.
- `design.responsive-order`: Reading order and section order remain logical at every viewport.
- `design.navigation`: Navigation remains visible, usable, and free of wrapping or collision defects.
- `design.forms`: Labels, inputs, errors, consent text, and submit controls align and remain usable.

## Typography and visual consistency

- `design.font-family`: Font families match the established page system; fallback fonts are flagged when caused by load failure.
- `design.font-scale`: Heading and body hierarchy is consistent and appropriate to its container.
- `design.line-height`: Text remains readable without collisions or excessive spacing.
- `design.button-consistency`: Equivalent actions use consistent styling, sizing, radius, and icon treatment.
- `design.spacing`: Repeated components and sections use consistent alignment, gaps, and padding.
- `design.color-contrast`: Text and controls have adequate visual contrast; evidence should identify the affected element.

## Content correctness

- `content.placeholder`: Detect lorem ipsum, dummy text, TODO markers, template copy, sample addresses, and placeholder contact details.
- `content.identity`: Doctor, clinic, company, person, location, phone, and email references match the approved website profile.
- `content.unrelated-name`: Detect names or organizations belonging to another project or template.
- `content.inconsistency`: Repeated identity, service, price, date, or contact facts do not contradict one another.
- `content.grammar`: Flag clear spelling, grammar, malformed punctuation, duplicated words, and incomplete sentences; avoid style-only rewrites.
- `content.broken-copy`: Detect unresolved merge tags, shortcodes, HTML fragments, encoding errors, and raw JSON.
- `content.relevance`: Headings and body content are relevant to the page purpose and approved business profile.
- `content.legal`: Required privacy, consent, cookie, and regulated-content notices are present when the captured page context makes them applicable.

## Automated evidence

Treat browser-reported failed resources, console errors, broken image dimensions, overflow measurements, clipped bounding boxes, and font-load failures as high-confidence evidence. Claude may add context but must not contradict deterministic evidence.

## Figma comparison

Deferred. Do not calculate or invent a Figma match score until a Figma frame is explicitly mapped to the page and the comparison feature is enabled.

## Finding contract

Return `checkId`, `severity`, `viewport`, `title`, `detail`, `evidence`, `recommendation`, and `confidence`. Severity is `info`, `warning`, or `critical`. Viewport is `mobile`, `tablet`, `desktop`, or `all`.
