var fs = require('fs');
var path = require('path');

var db = require('../../db/pool');
var env = require('../../config/env');
var claude = require('../ai/claude.service');
var checklists = require('./checklist.service');
var technicalSeo = require('./technical-seo.service');
var designQa = require('./design-qa.service');

var PLACEHOLDER_REGEX = /lorem ipsum|dolor sit amet|dummy (?:text|content)|\bTODO\b|your (?:company|clinic|business|name|text|tagline|content) here|sample (?:text|address|content)|insert (?:text|tagline|content|your) |text goes here|placeholder text|coming soon/i;

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
  // Design/layout findings now live in design-qa.service.js (Design QA step).
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
    // Transport/header security comes from the crawl and does NOT need the
    // connector, so it runs with any crawl-based analysis check — not just the
    // connector-gated "Website checklists". ('security' kept for legacy scans.)
    if (item.category === 'security') {
      return checks.indexOf('website_checklists') !== -1
        || checks.indexOf('technical_seo') !== -1
        || checks.indexOf('design_qa') !== -1
        || checks.indexOf('security') !== -1;
    }
    if (item.category === 'forms') return checks.indexOf('forms') !== -1;
    if (item.category === 'design' || item.category === 'content') {
      return checks.indexOf('design_qa') !== -1;
    }
    return false;
  });
}

function placeholderRegexFindings(page) {
  var match = String((page.core || {}).bodyText || '').match(PLACEHOLDER_REGEX);
  if (!match) return [];
  return [finding('technical_seo', 'seo.placeholder-content', 'critical', 'Placeholder content detected', 'The page contains template or unfinished copy.', match[0], 'Replace it with approved final content.')];
}

/** Claude reads the page's visible text for placeholder / dummy / unfinished
 *  content. Falls back to a regex when the AI key/prompt is unavailable, so
 *  Technical SEO still runs without AI. */
async function reviewPlaceholderText(page) {
  if (!env.ai.anthropicApiKey) return { findings: placeholderRegexFindings(page), status: 'fallback' };
  var setting = await prompt('website_placeholder_content');
  if (!setting || !setting.system_prompt || !setting.user_prompt_template) {
    return { findings: placeholderRegexFindings(page), status: 'fallback' };
  }
  try {
    var result = await claude.generateStructured({
      system: setting.system_prompt,
      prompt: render(setting.user_prompt_template, { evidence: compactEvidence(page) }),
      schema: findingSchema,
      images: [],
      model: setting.model || env.ai.anthropicModel,
      temperature: Number(setting.temperature),
      maxTokens: Number(setting.max_tokens),
    });
    return { findings: normalizeAiFindings('technical_seo', result), status: 'completed' };
  } catch (err) {
    return { findings: placeholderRegexFindings(page), status: 'fallback', error: err.message };
  }
}

async function review(page, identity, checks) {
  var selected = Array.isArray(checks) ? checks : ['technical_seo', 'design_qa', 'website_checklists', 'forms'];
  var fixed = filterDeterministic(deterministic(page), selected);
  var wantSeo = selected.indexOf('technical_seo') !== -1;
  var wantDesign = selected.indexOf('design_qa') !== -1;

  // Technical SEO = deterministic on-page/image checks + a Claude (or regex)
  // placeholder-text check. Independent of Lighthouse.
  var seoFindings = wantSeo ? technicalSeo.technicalSeoFindings(page) : [];
  var placeholder = wantSeo ? await reviewPlaceholderText(page) : { findings: [], status: 'skipped' };

  // Design QA = deterministic layout/responsiveness/consistency + a Claude
  // visual pass on the screenshots. Visual only (no content findings).
  var designDeterministic = wantDesign ? designQa.designFindings(page) : [];
  var designContent = wantDesign
    ? await aiReview('website_design_content_qa', 'designContent', 'design', page, identity, true)
    : { findings: [], status: 'skipped' };

  return {
    deterministicFindings: fixed,
    technicalSeo: { status: wantSeo ? 'completed' : 'skipped', placeholderStatus: placeholder.status },
    designContent: designContent,
    findings: fixed.concat(seoFindings, placeholder.findings, designDeterministic, designContent.findings),
  };
}

module.exports = { review: review, deterministic: deterministic };
