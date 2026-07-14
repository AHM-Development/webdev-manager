// Deterministic "basic SEO a developer can do" checks — on-page items + image
// detection. Runs purely from the crawl evidence (no Lighthouse, no connector).

var LEGACY_IMAGE_EXT = /\.(jpe?g|png|gif|bmp|tiff?)(?:$|\?)/i;
var MODERN_TYPE = /(webp|avif)/i;
var NON_DESCRIPTIVE_LINK = ['click here', 'read more', 'here', 'link', 'learn more', 'more', 'this'];
var WEIGHT_WARN = 250 * 1024;
var WEIGHT_FAIL = 600 * 1024;
var MAX_INTRINSIC_WIDTH = 1920;

function finding(checkId, severity, title, detail, evidence, recommendation) {
  return {
    category: 'technical_seo',
    checkId: checkId,
    severity: severity,
    viewport: 'all',
    title: title,
    detail: detail,
    evidence: evidence || '',
    recommendation: recommendation || '',
    confidence: 'high',
  };
}

function kb(bytes) {
  return Math.round(bytes / 1024) + ' KB';
}

function headingOrderIssue(headings) {
  var previous = 0;
  var issue = null;
  (headings || []).forEach(function(heading) {
    var level = Number(heading.level) || 0;
    if (previous && level > previous + 1 && !issue) {
      issue = 'Heading jumps from H' + previous + ' to H' + level + ' ("' + String(heading.text || '').slice(0, 40) + '").';
    }
    if (level) previous = level;
  });
  return issue;
}

function isLegacyImage(image) {
  var type = String(image.contentType || '');
  if (type) return !MODERN_TYPE.test(type);
  return LEGACY_IMAGE_EXT.test(String(image.src || ''));
}

function technicalSeoFindings(page) {
  var out = [];
  var core = page.core || {};
  var headers = page.headers || {};

  if (page.httpStatus && page.httpStatus >= 400) {
    out.push(finding('seo.http-status', 'critical', 'Page returns an error status', 'The final response was HTTP ' + page.httpStatus + '.', page.url, 'Restore the page or remove it from navigation and the sitemap.'));
  }

  // Title
  if (!core.title) {
    out.push(finding('seo.title', 'critical', 'Missing title tag', 'No document title was captured.', '<title>', 'Add one unique, descriptive title.'));
  } else if (core.title.length < 30 || core.title.length > 60) {
    out.push(finding('seo.title', 'warning', 'Title length needs review', 'The title is ' + core.title.length + ' characters.', core.title, 'Keep the title around 30-60 characters.'));
  }

  // Meta description
  if (!core.description) {
    out.push(finding('seo.meta-description', 'warning', 'Missing meta description', 'No meta description was captured.', 'meta[name="description"]', 'Add a unique, relevant description.'));
  } else if (core.description.length < 120 || core.description.length > 160) {
    out.push(finding('seo.meta-description', 'warning', 'Meta description length needs review', 'The description is ' + core.description.length + ' characters.', core.description, 'Keep the description around 120-160 characters.'));
  }

  // H1
  var h1Count = (core.h1 && core.h1.length) || 0;
  if (h1Count !== 1) {
    out.push(finding('seo.h1', h1Count > 1 ? 'warning' : 'critical', 'Invalid H1 count', 'Expected exactly one H1 and found ' + h1Count + '.', JSON.stringify(core.h1 || []), 'Use one descriptive H1 per page.'));
  }

  // Heading order
  var orderIssue = headingOrderIssue(core.headings);
  if (orderIssue) {
    out.push(finding('seo.heading-order', 'warning', 'Heading levels skip a level', orderIssue, JSON.stringify((core.headings || []).slice(0, 12)), 'Use headings in order (H1 → H2 → H3) without skipping levels.'));
  }

  // Canonical
  if (!core.canonical) {
    out.push(finding('seo.canonical', 'warning', 'Missing canonical URL', 'No canonical link was captured.', 'link[rel="canonical"]', 'Add one absolute canonical URL.'));
  } else if (!/^https?:\/\//i.test(core.canonical)) {
    out.push(finding('seo.canonical', 'warning', 'Canonical URL is not absolute', 'The canonical link is not an absolute URL.', core.canonical, 'Use an absolute https:// canonical URL.'));
  } else if (core.canonical.split('#')[0].replace(/\/$/, '') !== String(page.url || '').split('#')[0].replace(/\/$/, '')) {
    out.push(finding('seo.canonical', 'info', 'Canonical points to another URL', 'The canonical URL differs from this page URL (may be intentional).', core.canonical, 'Confirm the canonical target is correct.'));
  }

  // Noindex / meta robots
  var robots = String(core.robots || '').toLowerCase();
  var xRobots = String(headers['x-robots-tag'] || '').toLowerCase();
  if (/noindex/.test(robots) || /noindex/.test(xRobots)) {
    out.push(finding('seo.noindex', 'warning', 'Page is set to noindex', 'A robots directive blocks this page from being indexed.', robots || xRobots, 'Remove noindex if this page should appear in search.'));
  }

  // Language
  if (!core.language) {
    out.push(finding('seo.language', 'warning', 'Missing page language', 'The html element has no lang attribute.', '<html>', 'Set the correct lang attribute.'));
  }

  // Open Graph basics
  var og = core.openGraph || {};
  var missingOg = [];
  if (!og.title) missingOg.push('og:title');
  if (!og.description) missingOg.push('og:description');
  if (!og.image) missingOg.push('og:image');
  if (missingOg.length) {
    out.push(finding('seo.open-graph', 'warning', 'Open Graph tags missing', missingOg.join(', ') + ' not found.', missingOg.join(', '), 'Add Open Graph title, description, and image for social sharing.'));
  }

  // Descriptive link text
  var vagueLinks = (core.links || []).filter(function(link) {
    var text = String(link.text || '').trim().toLowerCase();
    return !text || NON_DESCRIPTIVE_LINK.indexOf(text) !== -1;
  });
  if (vagueLinks.length) {
    out.push(finding('seo.link-text', 'warning', 'Non-descriptive link text', vagueLinks.length + ' links use empty or generic text like "click here".', vagueLinks.slice(0, 8).map(function(link) { return (link.text || '(empty)') + ' → ' + link.href; }).join('\n'), 'Use link text that describes the destination.'));
  }

  // Structured data
  if (!(core.schemas || []).length) {
    out.push(finding('seo.structured-data', 'info', 'No structured data found', 'No parseable JSON-LD was captured on the page.', 'script[type="application/ld+json"]', 'Add relevant schema.org JSON-LD where appropriate.'));
  }

  // Images
  var images = core.images || [];
  out.push(finding('seo.image-count', 'info', images.length + ' image' + (images.length === 1 ? '' : 's') + ' on the page', 'Total <img> elements captured (max 250).', '', ''));

  var missingAlt = images.filter(function(image) { return image.alt === null; });
  if (missingAlt.length) {
    out.push(finding('seo.image-alt', 'warning', 'Images missing alt text', missingAlt.length + ' of ' + images.length + ' images have no alt attribute.', missingAlt.slice(0, 8).map(function(image) { return image.src; }).join('\n'), 'Add descriptive alt text to content images; use empty alt for decorative ones.'));
  }

  var legacy = images.filter(isLegacyImage);
  if (legacy.length) {
    out.push(finding('seo.image-format', 'warning', 'Images not using a modern format', legacy.length + ' of ' + images.length + ' images are JPEG/PNG/GIF rather than WebP/AVIF.', legacy.slice(0, 8).map(function(image) { return image.src; }).join('\n'), 'Serve WebP or AVIF for faster loads.'));
  }

  var oversized = images.filter(function(image) {
    var intrinsic = Number(image.width) || 0;
    var rendered = Number(image.renderedWidth) || 0;
    return intrinsic > MAX_INTRINSIC_WIDTH || (rendered > 0 && intrinsic > rendered * 2);
  });
  if (oversized.length) {
    out.push(finding('seo.image-oversized', 'warning', 'Oversized images', oversized.length + ' images are far larger than displayed (intrinsic > 2× rendered, or wider than ' + MAX_INTRINSIC_WIDTH + 'px).', oversized.slice(0, 8).map(function(image) { return image.src + ' (' + (image.width || '?') + 'px intrinsic / ' + (image.renderedWidth || '?') + 'px shown)'; }).join('\n'), 'Serve appropriately sized images (responsive srcset).'));
  }

  var heavy = images.filter(function(image) { return image.bytes && image.bytes > WEIGHT_WARN; });
  if (heavy.length) {
    var veryHeavy = heavy.filter(function(image) { return image.bytes > WEIGHT_FAIL; });
    out.push(finding('seo.image-weight', veryHeavy.length ? 'critical' : 'warning', 'Heavy image files', heavy.length + ' images exceed 250 KB' + (veryHeavy.length ? ' (' + veryHeavy.length + ' over 600 KB)' : '') + '.', heavy.slice(0, 8).map(function(image) { return image.src + ' — ' + kb(image.bytes); }).join('\n'), 'Compress and resize images; convert to WebP/AVIF.'));
  }

  return out;
}

module.exports = { technicalSeoFindings: technicalSeoFindings };
