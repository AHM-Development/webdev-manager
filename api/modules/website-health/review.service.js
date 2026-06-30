var fs = require('fs');
var path = require('path');

var db = require('../../db/pool');
var env = require('../../config/env');
var claude = require('../ai/claude.service');
var checklists = require('./checklist.service');

var findingSchema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../checklists/finding.schema.json'), 'utf8'));

function finding(category, checkId, severity, title, detail, evidence, recommendation, viewport) {
  return {
    category: category,
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

function deterministic(page) {
  var output = [];
  var core = page.core || {};
  var headers = page.headers || {};
  if (page.error) output.push(finding('security', 'page.load', 'critical', 'Page could not be loaded', page.error, page.requestedUrl, 'Check DNS, TLS, redirects, and server availability.'));
  if (page.httpStatus && page.httpStatus >= 400) output.push(finding('technical_seo', 'seo.http-status', 'critical', 'Page returns an error status', 'The final response was HTTP ' + page.httpStatus + '.', page.url, 'Restore the page or remove it from navigation and sitemap.'));
  if (!core.title) output.push(finding('technical_seo', 'seo.title', 'critical', 'Missing title tag', 'No document title was captured.', '<title>', 'Add one unique descriptive title.'));
  else if (core.title.length < 30 || core.title.length > 60) output.push(finding('technical_seo', 'seo.title', 'warning', 'Title length needs review', 'The title is ' + core.title.length + ' characters.', core.title, 'Keep the title concise and descriptive, normally 30-60 characters.'));
  if (!core.description) output.push(finding('technical_seo', 'seo.meta-description', 'warning', 'Missing meta description', 'No meta description was captured.', 'meta[name="description"]', 'Add a unique relevant description.'));
  if (!core.h1 || core.h1.length !== 1) output.push(finding('technical_seo', 'seo.h1', core.h1 && core.h1.length > 1 ? 'warning' : 'critical', 'Invalid H1 count', 'Expected exactly one H1 and found ' + ((core.h1 && core.h1.length) || 0) + '.', JSON.stringify(core.h1 || []), 'Use one descriptive H1.'));
  if (!core.canonical) output.push(finding('technical_seo', 'seo.canonical', 'warning', 'Missing canonical URL', 'No canonical link was captured.', 'link[rel="canonical"]', 'Add one absolute canonical URL.'));
  if (!core.language) output.push(finding('technical_seo', 'seo.language', 'warning', 'Missing page language', 'The html element has no lang attribute.', '<html>', 'Set the correct language code.'));
  var brokenImages = (core.images || []).filter(function(image) { return image.complete && !image.width; });
  if (brokenImages.length) output.push(finding('design', 'design.broken-media', 'critical', 'Broken images detected', brokenImages.length + ' image resources did not render.', brokenImages.slice(0, 10).map(function(image) { return image.src; }).join('\n'), 'Correct or replace the image URLs.'));
  Object.keys(page.layouts || {}).forEach(function(viewport) {
    var layout = page.layouts[viewport];
    if (layout.horizontalOverflow) output.push(finding('design', 'design.horizontal-overflow', 'critical', 'Horizontal overflow detected', 'The document is wider than the viewport.', layout.documentWidth + 'px document in ' + layout.viewport.width + 'px viewport', 'Identify and constrain the overflowing element.', viewport));
    if ((layout.clippedElements || []).length) output.push(finding('design', 'design.clipping', 'warning', 'Potential clipped content', layout.clippedElements.length + ' visible elements have overflowing content.', JSON.stringify(layout.clippedElements.slice(0, 8)), 'Review fixed dimensions, overflow rules, and responsive text sizing.', viewport));
  });
  if ((page.consoleErrors || []).length) output.push(finding('design', 'design.console-errors', 'warning', 'Browser console errors detected', page.consoleErrors.length + ' console errors occurred.', page.consoleErrors.slice(0, 8).join('\n'), 'Resolve the underlying JavaScript or resource errors.'));
  if (String(page.url || '').startsWith('https://')) {
    if (!headers['strict-transport-security']) output.push(finding('security', 'security.hsts', 'warning', 'HSTS header is missing', 'The HTTPS response did not include Strict-Transport-Security.', page.url, 'Enable HSTS after confirming that all site resources support HTTPS.'));
    var mixed = (core.images || []).map(function(item) { return item.src; })
      .concat((core.links || []).map(function(item) { return item.href; }))
      .filter(function(url) { return /^http:\/\//i.test(url); });
    if (mixed.length) output.push(finding('security', 'security.mixed-content', 'critical', 'HTTP resources found on an HTTPS page', mixed.length + ' insecure resource or navigation URLs were captured.', mixed.slice(0, 10).join('\n'), 'Replace HTTP URLs with HTTPS or relative URLs.'));
  }
  if (!headers['content-security-policy']) output.push(finding('security', 'security.csp', 'warning', 'Content Security Policy is missing', 'No Content-Security-Policy response header was captured.', page.url, 'Deploy a tested Content Security Policy appropriate for the website.'));
  if (!headers['x-content-type-options']) output.push(finding('security', 'security.content-type-options', 'warning', 'MIME sniffing protection is missing', 'No X-Content-Type-Options response header was captured.', page.url, 'Set X-Content-Type-Options to nosniff.'));
  if (!headers['referrer-policy']) output.push(finding('security', 'security.referrer-policy', 'warning', 'Referrer Policy is missing', 'No Referrer-Policy response header was captured.', page.url, 'Set a privacy-appropriate Referrer-Policy.'));
  if (!headers['content-security-policy'] && !headers['x-frame-options']) output.push(finding('security', 'security.frame-protection', 'warning', 'Frame protection is missing', 'Neither CSP frame-ancestors nor X-Frame-Options was captured.', page.url, 'Add frame-ancestors in CSP or an appropriate X-Frame-Options header.'));
  var placeholder = String(core.bodyText || '').match(/lorem ipsum|dummy (?:text|content)|\bTODO\b|your (?:company|clinic|name) here|sample (?:text|address)/i);
  if (placeholder) output.push(finding('content', 'content.placeholder', 'critical', 'Placeholder content detected', 'The page contains template or unfinished content.', placeholder[0], 'Replace it with approved final content.'));
  (core.forms || []).forEach(function(form) {
    var unnamed = form.fields.filter(function(field) { return !field.label; });
    if (unnamed.length) output.push(finding('forms', 'forms.accessible-labels', 'warning', 'Form fields are missing labels', unnamed.length + ' fields have no captured accessible label.', JSON.stringify(unnamed), 'Add visible labels or accurate accessible names.'));
    if (!form.captcha) output.push(finding('forms', 'forms.spam-protection', 'warning', 'Form has no detected CAPTCHA', 'No supported CAPTCHA or Turnstile field was detected.', form.action, 'Confirm that an equivalent server-side anti-spam control is active.'));
  });
  return output;
}

async function prompt(key) {
  var rows = await db.query('SELECT * FROM ai_prompt_settings WHERE prompt_key = :key AND enabled = 1 LIMIT 1', { key: key });
  return rows[0] || null;
}

function render(template, values) {
  var text = String(template || '');
  Object.keys(values).forEach(function(key) {
    text = text.replace(new RegExp('\\{\\{\\s*' + key + '\\s*\\}\\}', 'g'), values[key]);
  });
  return text;
}

function normalizeAiFindings(category, result) {
  return (result && Array.isArray(result.findings) ? result.findings : []).map(function(item) {
    return {
      category: category,
      checkId: String(item.checkId || 'ai.review'),
      severity: ['info', 'warning', 'critical'].includes(item.severity) ? item.severity : 'warning',
      viewport: ['mobile', 'tablet', 'desktop', 'all'].includes(item.viewport) ? item.viewport : 'all',
      title: String(item.title || 'Review finding').slice(0, 255),
      detail: String(item.detail || ''),
      evidence: String(item.evidence || ''),
      recommendation: String(item.recommendation || ''),
      confidence: ['low', 'medium', 'high'].includes(item.confidence) ? item.confidence : 'medium',
    };
  }).filter(function(item) { return item.detail && item.evidence; });
}

function compactEvidence(page) {
  var evidence = JSON.parse(JSON.stringify(page));
  if (evidence.core) {
    evidence.core.bodyText = String(evidence.core.bodyText || '').slice(0, 12000);
    evidence.core.links = (evidence.core.links || []).slice(0, 100);
    evidence.core.images = (evidence.core.images || []).slice(0, 100);
  }
  delete evidence.internalLinks;
  return JSON.stringify(evidence, null, 2).slice(0, env.ai.maxInputChars);
}

function screenshotImages(page) {
  return Object.values(page.layouts || {}).map(function(layout) {
    if (!layout.screenshot) return null;
    var file = path.resolve(__dirname, '../../public', layout.screenshot.replace(/^\//, ''));
    if (!fs.existsSync(file)) return null;
    return { mediaType: 'image/png', data: fs.readFileSync(file).toString('base64') };
  }).filter(Boolean);
}

async function aiReview(key, checklistKey, category, page, identity, includeImages) {
  if (!env.ai.anthropicApiKey) return { findings: [], status: 'not_configured' };
  var setting = await prompt(key);
  if (!setting || !setting.system_prompt || !setting.user_prompt_template) return { findings: [], status: 'not_configured' };
  var checklist = checklists.read(checklistKey);
  try {
    var result = await claude.generateStructured({
      system: setting.system_prompt,
      prompt: render(setting.user_prompt_template, {
        checklist: checklist.content,
        identity: JSON.stringify(identity || {}, null, 2),
        evidence: compactEvidence(page),
      }),
      schema: findingSchema,
      images: includeImages ? screenshotImages(page) : [],
      model: setting.model || env.ai.anthropicModel,
      temperature: Number(setting.temperature),
      maxTokens: Number(setting.max_tokens),
    });
    return { findings: normalizeAiFindings(category, result), status: 'completed' };
  } catch (err) {
    return { findings: [], status: 'failed', error: err.message };
  }
}

/** Keeps only the deterministic findings whose category was selected for this
 *  scan. A page-load failure is always kept since it explains everything else. */
function filterDeterministic(findings, checks) {
  return findings.filter(function(item) {
    if (item.checkId === 'page.load') return true;
    if (item.category === 'technical_seo') return checks.indexOf('technical_seo') !== -1;
    if (item.category === 'security') return checks.indexOf('security') !== -1;
    if (item.category === 'design' || item.category === 'content' || item.category === 'forms') {
      return checks.indexOf('design_qa') !== -1;
    }
    return false;
  });
}

async function review(page, identity, checks) {
  var selected = Array.isArray(checks) ? checks : ['technical_seo', 'design_qa', 'security'];
  var fixed = filterDeterministic(deterministic(page), selected);
  var wantSeo = selected.indexOf('technical_seo') !== -1;
  var wantDesign = selected.indexOf('design_qa') !== -1;
  var results = await Promise.all([
    wantSeo ? aiReview('website_technical_seo', 'technicalSeo', 'technical_seo', page, identity, false) : Promise.resolve({ findings: [], status: 'skipped' }),
    wantDesign ? aiReview('website_design_content_qa', 'designContent', 'design', page, identity, true) : Promise.resolve({ findings: [], status: 'skipped' }),
  ]);
  return {
    deterministicFindings: fixed,
    technicalSeo: results[0],
    designContent: results[1],
    findings: fixed.concat(results[0].findings, results[1].findings),
  };
}

function lighthouseMetrics(lighthouseResult) {
  var result = lighthouseResult || {};
  function side(strategy) {
    var data = result[strategy];
    if (!data) return null;
    return { scores: data.scores || null, metrics: data.metrics || null, warnings: (data.warnings || []).slice(0, 10) };
  }
  return JSON.stringify({ status: result.status || 'unknown', mobile: side('mobile'), desktop: side('desktop'), errors: result.errors || [] }, null, 2);
}

/** Claude interprets the real Lighthouse metrics into prioritised findings. */
async function reviewLighthouse(page, lighthouseResult) {
  if (!env.ai.anthropicApiKey) return { findings: [], status: 'not_configured' };
  if (!lighthouseResult || lighthouseResult.status === 'not_run') return { findings: [], status: 'skipped' };
  var setting = await prompt('website_lighthouse_review');
  if (!setting || !setting.system_prompt || !setting.user_prompt_template) return { findings: [], status: 'not_configured' };
  try {
    var result = await claude.generateStructured({
      system: setting.system_prompt,
      prompt: render(setting.user_prompt_template, {
        metrics: lighthouseMetrics(lighthouseResult),
        evidence: compactEvidence(page),
      }),
      schema: findingSchema,
      images: [],
      model: setting.model || env.ai.anthropicModel,
      temperature: Number(setting.temperature),
      maxTokens: Number(setting.max_tokens),
    });
    return { findings: normalizeAiFindings('lighthouse', result), status: 'completed' };
  } catch (err) {
    return { findings: [], status: 'failed', error: err.message };
  }
}

module.exports = { review: review, reviewLighthouse: reviewLighthouse, deterministic: deterministic };
