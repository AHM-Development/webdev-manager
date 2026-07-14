// Deterministic Design QA — layout distortion, mobile/tablet responsiveness,
// and design consistency. Measured from the crawl (no Lighthouse/connector).

var MAX_FONT_SIZES = 8;
var MAX_FONT_FAMILIES = 3;
var MAX_RADII = 5;
var MAX_TEXT_COLORS = 12;

function finding(checkId, severity, title, detail, evidence, recommendation, viewport) {
  return {
    category: 'design',
    checkId: checkId,
    severity: severity,
    viewport: viewport || 'all',
    title: title,
    detail: detail,
    evidence: evidence || '',
    recommendation: recommendation || '',
    confidence: 'high',
  };
}

function distinctCount(map) {
  return Object.keys(map || {}).length;
}

function topKeys(map, limit) {
  return Object.keys(map || {})
    .sort(function(a, b) { return (map[b] || 0) - (map[a] || 0); })
    .slice(0, limit);
}

function designFindings(page) {
  var out = [];
  var core = page.core || {};
  var layouts = page.layouts || {};
  var tokens = page.designTokens || {};

  // Broken media + console errors (page-level)
  var brokenImages = (core.images || []).filter(function(image) { return image.complete && !image.width; });
  if (brokenImages.length) {
    out.push(finding('design.broken-media', 'critical', 'Broken images detected', brokenImages.length + ' image resources did not render.', brokenImages.slice(0, 10).map(function(image) { return image.src; }).join('\n'), 'Correct or replace the image URLs.'));
  }
  if ((page.consoleErrors || []).length) {
    out.push(finding('design.console-errors', 'warning', 'Browser console errors detected', page.consoleErrors.length + ' console errors occurred.', page.consoleErrors.slice(0, 8).join('\n'), 'Resolve the underlying JavaScript or resource errors.'));
  }

  // Per-viewport layout + responsiveness
  Object.keys(layouts).forEach(function(viewport) {
    var layout = layouts[viewport] || {};
    var vw = (layout.viewport && layout.viewport.width) || '?';
    if (layout.horizontalOverflow) {
      out.push(finding('design.horizontal-overflow', 'critical', 'Horizontal overflow', 'The document is wider than the viewport.', layout.documentWidth + 'px document in ' + vw + 'px viewport', 'Identify and constrain the overflowing element.', viewport));
    }
    if ((layout.offViewport || []).length) {
      out.push(finding('design.off-viewport', 'warning', 'Content spills outside the viewport', layout.offViewport.length + ' elements extend past the right edge.', layout.offViewport.slice(0, 8).map(function(item) { return item.tag + ' +' + item.overflowPx + 'px "' + item.text + '"'; }).join('\n'), 'Fix widths/margins so content fits the viewport.', viewport));
    }
    if ((layout.overlaps || []).length) {
      out.push(finding('design.overlap', 'warning', 'Overlapping elements', layout.overlaps.length + ' element pairs visually overlap.', layout.overlaps.slice(0, 8).map(function(item) { return '"' + item.a + '" overlaps "' + item.b + '"'; }).join('\n'), 'Adjust positioning/spacing so elements do not collide.', viewport));
    }
    if ((layout.clippedElements || []).length) {
      out.push(finding('design.clipping', 'warning', 'Clipped content', layout.clippedElements.length + ' elements have overflowing or clipped content.', JSON.stringify(layout.clippedElements.slice(0, 8)), 'Review fixed dimensions, overflow rules, and responsive text sizing.', viewport));
    }
    if ((viewport === 'mobile' || viewport === 'tablet') && (layout.tinyTapTargets || []).length) {
      out.push(finding('design.tap-targets', 'warning', 'Tap targets too small', layout.tinyTapTargets.length + ' interactive elements are under 40px on ' + viewport + '.', layout.tinyTapTargets.slice(0, 8).map(function(item) { return item.tag + ' ' + item.size + 'px "' + item.text + '"'; }).join('\n'), 'Make tap targets at least 40-48px with adequate spacing.', viewport));
    }
    if (viewport === 'mobile' && (layout.smallText || []).length) {
      out.push(finding('design.text-too-small', 'warning', 'Text too small on mobile', layout.smallText.length + ' text elements render below 12px on mobile.', layout.smallText.slice(0, 8).map(function(item) { return item.tag + ' ' + item.size + 'px "' + item.text + '"'; }).join('\n'), 'Use a minimum body font size around 14-16px on mobile.', viewport));
    }
  });

  // Design consistency (page-level, from the token census)
  var fontSizes = tokens.fontSizes || {};
  if (distinctCount(fontSizes) > MAX_FONT_SIZES) {
    out.push(finding('design.font-scale', 'warning', 'Inconsistent font-size scale', distinctCount(fontSizes) + ' distinct font sizes are in use (a type scale is usually 5-8).', topKeys(fontSizes, 20).join(', '), 'Consolidate text to a defined type scale.'));
  }
  var families = tokens.fontFamilies || {};
  if (distinctCount(families) > MAX_FONT_FAMILIES) {
    out.push(finding('design.font-family', 'warning', 'Too many font families', distinctCount(families) + ' font families are in use.', Object.keys(families).slice(0, 10).join(', '), 'Limit to the brand font families (usually 1-3).'));
  }
  var radii = tokens.borderRadii || {};
  if (distinctCount(radii) > MAX_RADII) {
    out.push(finding('design.radius-consistency', 'warning', 'Inconsistent border radii', distinctCount(radii) + ' distinct border-radius values are in use.', topKeys(radii, 12).join(', '), 'Standardise corner radii to a small set of tokens.'));
  }
  var textColors = tokens.textColors || {};
  if (distinctCount(textColors) > MAX_TEXT_COLORS) {
    out.push(finding('design.color-consistency', 'warning', 'Many distinct text colors', distinctCount(textColors) + ' distinct text colors are in use.', topKeys(textColors, 15).join(', '), 'Consolidate to a defined color palette.'));
  }
  var buttons = tokens.buttons || [];
  if (buttons.length > 1) {
    var radiiSet = {}, padSet = {}, sizeSet = {};
    buttons.forEach(function(button) { radiiSet[button.borderRadius] = 1; padSet[button.padding] = 1; sizeSet[button.fontSize] = 1; });
    var variances = [];
    if (Object.keys(radiiSet).length > 3) variances.push(Object.keys(radiiSet).length + ' radii');
    if (Object.keys(padSet).length > 4) variances.push(Object.keys(padSet).length + ' paddings');
    if (Object.keys(sizeSet).length > 4) variances.push(Object.keys(sizeSet).length + ' font sizes');
    if (variances.length) {
      out.push(finding('design.button-consistency', 'warning', 'Inconsistent button styling', 'Buttons vary widely (' + variances.join(', ') + ').', JSON.stringify(buttons.slice(0, 8)), 'Standardise button padding, radius, and font size.'));
    }
  }

  return out;
}

module.exports = { designFindings: designFindings };
