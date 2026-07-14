# AHM Design QA Checklist (visual)

Version: 2.0.0

Review each page at mobile, tablet, and desktop using the screenshots together with the DOM/CSS measurements supplied as evidence (overflow, overlap, clipped boxes, off-viewport elements, tap-target sizes, small text, and the design-token census). This is a **visual** review — layout, responsiveness, and design consistency only. **Do not review content correctness** (grammar, identity, copy) here; that is handled elsewhere. Do not report subjective preferences as defects, and do not contradict the deterministic measurements.

## Layout & distortion

- `design.horizontal-overflow`: No unintended horizontal scrolling or content outside the viewport.
- `design.overlap`: Text, controls, headers, dialogs, and media do not overlap incoherently.
- `design.clipping`: Text and interactive controls are not clipped, truncated, or hidden unintentionally.
- `design.off-viewport`: No elements spill past the viewport edge.
- `design.broken-media`: Images, videos, icons, fonts, and embeds render successfully.
- `design.empty-sections`: No unexplained blank bands, collapsed containers, or missing blocks.

## Responsiveness (mobile & tablet)

- `design.responsive-order`: Reading order and section order stay logical at every viewport.
- `design.navigation`: Navigation stays visible and usable (collapses to a working menu) without wrapping/collision.
- `design.tap-targets`: Interactive targets are large enough and adequately spaced on touch viewports.
- `design.text-too-small`: Body text remains legible on mobile.
- `design.reflow`: Multi-column layouts stack sensibly; nothing requires horizontal scrolling.

## Design consistency

- `design.font-scale`: Font sizes follow a consistent type scale.
- `design.font-family`: Font families match the established system; flag fallback fonts caused by load failure.
- `design.line-height`: Text is readable without collisions or excessive spacing.
- `design.spacing`: Repeated components/sections use consistent alignment, gaps, and padding.
- `design.radius-consistency`: Corner radii are consistent across similar components.
- `design.button-consistency`: Equivalent actions share styling, sizing, radius, and icon treatment.
- `design.color-consistency`: Colors come from a coherent palette; flag near-duplicate or off-system colors.
- `design.color-contrast`: Text and controls have adequate contrast; identify the affected element.

## Automated evidence

Treat browser-reported overflow, overlap, clipped / off-viewport boxes, tap-target sizes, small-text measurements, failed resources, broken image dimensions, font-load failures, and the design-token census as high-confidence evidence. Claude may add visual context but must not contradict it.

## Finding contract

Return `checkId`, `severity` (`info`|`warning`|`critical`), `viewport` (`mobile`|`tablet`|`desktop`|`all`), `title`, `detail`, `evidence`, `recommendation`, `confidence`. Report only visual/layout/consistency issues — no content, grammar, or identity findings.
