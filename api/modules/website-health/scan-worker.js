var db = require('../../db/pool');
var env = require('../../config/env');
var redisStore = require('../../lib/redis');
var realtime = require('../../realtime/socket');
var events = require('../../realtime/events');
var security = require('../../lib/security');
var browserScanner = require('./browser-scanner.service');
var lighthouse = require('./lighthouse.service');
var review = require('./review.service');
var connector = require('../connectors/wordpress.service');
var siteChecks = require('./site-checks.service');
var health = require('./website-health.service');
var notifications = require('../notifications/notifications.service');

var QUEUE = 'website-health:scan-queue';
var started = false;

async function emit(eventName, scanId, payload) {
  realtime.emitToWorkspace(eventName, Object.assign({ scanId: scanId }, payload || {}));
}

async function update(scanId, stage, progress) {
  await db.query("UPDATE website_health_scans SET stage = :stage, progress = :progress WHERE id = :id AND status = 'running'", { id: scanId, stage: stage, progress: progress });
  await emit(events.HEALTH_SCAN_PROGRESS, scanId, { stage: stage, progress: progress });
}

async function cancelled(scanId) {
  var rows = await db.query('SELECT status FROM website_health_scans WHERE id = :id', { id: scanId });
  return !rows[0] || rows[0].status === 'cancelled';
}

async function insertFindings(scanId, pageId, findings) {
  for (var item of findings) {
    await db.query(
      `INSERT INTO website_health_findings
       (id, scan_id, page_id, category, check_id, severity, viewport, title, detail, evidence, recommendation, confidence)
       VALUES (:id, :scanId, :pageId, :category, :checkId, :severity, :viewport, :title, :detail, :evidence, :recommendation, :confidence)`,
      {
        id: security.uuid(), scanId: scanId, pageId: pageId, category: item.category,
        checkId: item.checkId, severity: item.severity, viewport: item.viewport || 'all', title: item.title,
        detail: item.detail, evidence: item.evidence || null, recommendation: item.recommendation || null,
        confidence: item.confidence || 'medium',
      }
    );
  }
}

function pageLegacy(pageId, evidence, lighthouseResult, reviewed) {
  var mobile = lighthouseResult.mobile || {};
  var desktop = lighthouseResult.desktop || {};
  var mobileScores = mobile.scores || {};
  var desktopScores = desktop.scores || mobileScores;
  var mobileMetrics = mobile.metrics || {};
  var technical = reviewed.findings.filter(function(item) { return item.category === 'technical_seo'; });
  var design = reviewed.findings.filter(function(item) { return item.category === 'design' || item.category === 'content'; });
  function statusFor(items) { return items.some(function(item) { return item.severity === 'critical'; }) ? 'fail' : items.length ? 'warn' : 'pass'; }
  var forms = ((evidence.core && evidence.core.forms) || []).map(function(form, index) {
    return {
      id: pageId + '-form-' + index, pageId: pageId, pageName: evidence.name, pagePath: evidence.path,
      name: form.id || 'Form ' + (index + 1), type: 'Contact', selector: form.id ? '#' + form.id : 'form:nth-of-type(' + (index + 1) + ')',
      fields: form.fields.map(function(field) { return field.name; }), requiredFields: form.fields.filter(function(field) { return field.required; }).map(function(field) { return field.name; }),
      recaptcha: form.captcha ? 'detected' : 'missing', submitStatus: 'skipped', endpoint: form.action,
      lastTestedAt: new Date().toISOString(), resultMessage: 'Detection only. Submission was not attempted.',
      consoleErrors: evidence.consoleErrors.length, networkErrors: evidence.networkErrors.length,
    };
  });
  return {
    id: pageId, name: evidence.name, path: evidence.path,
    lighthouse: lighthouseResult,
    speedMobile: {
      performance: mobileScores.performance || 0, accessibility: mobileScores.accessibility || 0,
      bestPractices: mobileScores.bestPractices || 0, seo: mobileScores.seo || 0,
      lcp: mobileMetrics.lcpMs ? Number((mobileMetrics.lcpMs / 1000).toFixed(2)) : 0,
      cls: mobileMetrics.cls || 0, inp: 0, fcp: mobileMetrics.fcpMs || 0,
      speedIndex: mobileMetrics.speedIndexMs || 0, totalBlockingTime: mobileMetrics.tbtMs || 0,
      transferSizeKb: 0, consoleErrors: evidence.consoleErrors.length, renderBlockingResources: 0,
    },
    speedDesktop: {
      performance: desktopScores.performance || 0, accessibility: desktopScores.accessibility || 0,
      bestPractices: desktopScores.bestPractices || 0, seo: desktopScores.seo || 0,
      lcp: 0, cls: 0, inp: 0, fcp: 0, speedIndex: 0, totalBlockingTime: 0,
      transferSizeKb: 0, consoleErrors: evidence.consoleErrors.length, renderBlockingResources: 0,
    },
    images: ((evidence.core && evidence.core.images) || []).map(function(image) { return { src: image.src, sizeKb: 0, issues: !image.width ? ['too-large'] : [] }; }),
    seoChecks: technical.reduce(function(output, item) { output[item.checkId] = item.severity === 'critical' ? 'fail' : 'warn'; return output; }, {}),
    seoNotes: technical.reduce(function(output, item) { output[item.checkId] = item.detail; return output; }, {}),
    technicalSeoScore: Math.max(0, 100 - technical.filter(function(item) { return item.severity === 'critical'; }).length * 15 - technical.filter(function(item) { return item.severity === 'warning'; }).length * 5),
    brokenInternalLinks: 0, brokenExternalLinks: 0,
    missingAltImages: ((evidence.core && evidence.core.images) || []).filter(function(image) { return image.alt === null; }).length,
    schemaTypes: ((evidence.core && evidence.core.schemas) || []).map(function(schema) { return schema['@type']; }).filter(Boolean),
    designQa: {
      mobile: statusFor(design.filter(function(item) { return item.viewport === 'mobile' || item.viewport === 'all'; })),
      tablet: statusFor(design.filter(function(item) { return item.viewport === 'tablet' || item.viewport === 'all'; })),
      desktop: statusFor(design.filter(function(item) { return item.viewport === 'desktop' || item.viewport === 'all'; })),
      figmaMatch: null, aiSummary: reviewed.designContent.status === 'completed' ? 'Claude review completed.' : 'AI review not available.',
      issues: design.map(function(item, index) { return { id: pageId + '-design-' + index, viewport: item.viewport === 'all' ? 'desktop' : item.viewport, severity: item.severity === 'critical' ? 'fail' : 'warn', title: item.title, detail: item.detail, screenshot: evidence.layouts[item.viewport] ? evidence.layouts[item.viewport].screenshot : (evidence.layouts.desktop && evidence.layouts.desktop.screenshot) }; }),
    },
    forms: forms,
  };
}

function summary(pages, findings, wp) {
  var scores = pages.map(function(page) { return page.speedMobile.performance; }).filter(function(value) { return value > 0; });
  var performance = scores.length ? Math.round(scores.reduce(function(sum, value) { return sum + value; }, 0) / scores.length) : null;
  var categories = {};
  findings.forEach(function(item) { categories[item.category] = (categories[item.category] || 0) + 1; });
  var critical = findings.filter(function(item) { return item.severity === 'critical'; }).length;
  var warnings = findings.filter(function(item) { return item.severity === 'warning'; }).length;
  var overall = performance == null ? Math.max(0, 100 - critical * 10 - warnings * 3) : Math.round(performance * 0.4 + Math.max(0, 100 - critical * 10 - warnings * 3) * 0.6);
  return { overall: overall, performance: performance, pages: pages.length, forms: pages.reduce(function(sum, page) { return sum + page.forms.length; }, 0), criticalIssues: critical, warningIssues: warnings, technicalSeoIssues: categories.technical_seo || 0, designIssues: (categories.design || 0) + (categories.content || 0), checklistIssues: (categories.wordpress || 0) + (categories.security || 0), security: categories.security ? (findings.some(function(item) { return item.category === 'security' && item.severity === 'critical'; }) ? 'fail' : 'warn') : 'pass', connectorStatus: wp ? 'connected' : 'disconnected' };
}

function daysSince(iso) {
  if (!iso) return null;
  var then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.floor((Date.now() - then) / 86400000);
}

// Recommended max administrator accounts before least-privilege review is advised.
var ADMIN_LIMIT = 3;
// Plugin groups where running more than one active plugin (by brand) conflicts.
var CONFLICT_GROUPS = {
  caching: ['WP Rocket', 'W3 Total Cache', 'WP Super Cache', 'LiteSpeed Cache', 'WP Fastest Cache', 'Autoptimize'],
  SEO: ['Rank Math', 'Yoast SEO', 'All in One SEO', 'SEOPress', 'The SEO Framework'],
  security: ['Wordfence', 'Kadence Security', 'Sucuri', 'iThemes Security', 'Solid Security', 'All In One WP Security'],
  backup: ['UpdraftPlus', 'BackWPup', 'Duplicator', 'BackupBuddy', 'Jetpack VaultPress'],
};
// Any active member means image optimization is in place.
var IMAGE_OPTIMIZERS = ['Imagify', 'ShortPixel', 'Smush', 'EWWW', 'Optimole', 'reSmush', 'TinyPNG', 'Converter for Media'];

function pluginActive(plugins, needle) {
  var n = String(needle).toLowerCase();
  return plugins.some(function(plugin) { return plugin.name.toLowerCase().indexOf(n) !== -1 && plugin.active; });
}

var PLACEHOLDER_EMAIL = /(example\.(?:com|org|net)|@example|admin@|test@|your-?email|change-?me|wordpress@|no-?reply@)/i;

// Deterministic config audit over the connector's form inventory (no email sent).
function formsFindings(inventory, detectedOnPages) {
  var out = [];
  (inventory || []).forEach(function(form) {
    var label = (form.title || 'Untitled form') + ' (' + form.plugin + ')';
    var where = form.locator || form.pageUrl || form.id;
    if (!form.recipients || !form.recipients.length) {
      out.push({ category: 'forms', checkId: 'forms.no-recipient', severity: 'critical', viewport: 'all', title: 'Form has no recipient', detail: label + ' has no recipient (To) address, so submissions may be lost.', evidence: where, recommendation: 'Set a valid recipient address for this form.', confidence: 'high' });
    } else {
      var placeholders = form.recipients.filter(function(email) { return PLACEHOLDER_EMAIL.test(email); });
      if (placeholders.length) out.push({ category: 'forms', checkId: 'forms.placeholder-recipient', severity: 'warning', viewport: 'all', title: 'Form recipient looks like a placeholder', detail: label + ' sends to ' + placeholders.join(', ') + '.', evidence: placeholders.join(', '), recommendation: 'Replace placeholder/default recipients with the real destination inbox.', confidence: 'high' });
    }
    if (!form.fields || !form.fields.length) {
      out.push({ category: 'forms', checkId: 'forms.no-fields', severity: 'warning', viewport: 'all', title: 'Form has no fields', detail: label + ' has no fields configured.', evidence: form.id, recommendation: 'Add the expected fields or remove the empty form.', confidence: 'medium' });
    }
  });
  if ((inventory || []).length && !detectedOnPages) {
    out.push({ category: 'forms', checkId: 'forms.none-rendered', severity: 'info', viewport: 'all', title: 'Configured forms were not detected on scanned pages', detail: inventory.length + ' form(s) are configured but none were found rendering on the crawled pages.', evidence: '', recommendation: 'Confirm the forms are placed on published pages included in the sitemap.', confidence: 'medium' });
  }
  return out;
}

function wordpressFindings(snapshot, essentialPlugins, stalenessDays) {
  if (!snapshot) return [];
  var output = [];
  var plugins = snapshot.plugins || [];
  var threshold = Number(stalenessDays) > 0 ? Number(stalenessDays) : 90;
  if (snapshot.wordpress && snapshot.wordpress.latestVersion && snapshot.wordpress.version !== snapshot.wordpress.latestVersion) {
    output.push({ category: 'wordpress', checkId: 'wordpress.core-update', severity: 'critical', viewport: 'all', title: 'WordPress core needs an update', detail: 'Installed ' + snapshot.wordpress.version + '; latest ' + snapshot.wordpress.latestVersion + '.', evidence: snapshot.wordpress.version, recommendation: 'Back up, verify compatibility, and update WordPress core.', confidence: 'high' });
  }
  plugins.filter(function(plugin) { return plugin.updateAvailable; }).forEach(function(plugin) {
    output.push({ category: 'wordpress', checkId: 'wordpress.plugin-update', severity: 'warning', viewport: 'all', title: plugin.name + ' needs an update', detail: 'Installed ' + plugin.version + '; latest ' + plugin.latestVersion + '.', evidence: plugin.file || plugin.name, recommendation: 'Review compatibility, back up, and update the plugin.', confidence: 'high' });
  });
  (essentialPlugins || []).forEach(function(name) {
    var needle = String(name).toLowerCase();
    if (!plugins.some(function(plugin) { return plugin.name.toLowerCase().indexOf(needle) !== -1 && plugin.active; })) output.push({ category: 'wordpress', checkId: 'wordpress.essential-plugin', severity: 'critical', viewport: 'all', title: 'Essential plugin missing or inactive', detail: name + ' is required by the website profile.', evidence: name, recommendation: 'Install or activate the approved plugin, or update the website profile.', confidence: 'high' });
  });

  // Inactive plugins are dead weight and still carry vulnerabilities.
  var inactivePlugins = plugins.filter(function(plugin) { return !plugin.active; });
  if (inactivePlugins.length) {
    output.push({ category: 'wordpress', checkId: 'wordpress.inactive-plugin', severity: 'warning', viewport: 'all', title: inactivePlugins.length + ' inactive plugin' + (inactivePlugins.length === 1 ? '' : 's') + ' installed', detail: 'Inactive plugins still receive vulnerabilities and add maintenance overhead.', evidence: inactivePlugins.map(function(plugin) { return plugin.name; }).slice(0, 20).join('\n'), recommendation: 'Remove plugins that are not in use.', confidence: 'high' });
  }

  // Conflicting plugins in the same category (counted by distinct brand).
  Object.keys(CONFLICT_GROUPS).forEach(function(category) {
    var matched = CONFLICT_GROUPS[category].filter(function(brand) { return pluginActive(plugins, brand); });
    if (matched.length > 1) {
      output.push({ category: 'wordpress', checkId: 'wordpress.plugin-conflict', severity: 'warning', viewport: 'all', title: 'Multiple ' + category + ' plugins are active', detail: matched.length + ' ' + category + ' plugins are active at once, which can conflict and hurt performance.', evidence: matched.join(', '), recommendation: 'Run a single ' + category + ' plugin and remove the rest.', confidence: 'high' });
    }
  });

  // Backups (UpdraftPlus schedule) and email deliverability (WP Mail SMTP mailer).
  var services = snapshot.services || {};
  if (pluginActive(plugins, 'UpdraftPlus') && !services.backupScheduled) {
    output.push({ category: 'wordpress', checkId: 'services.backups', severity: 'warning', viewport: 'all', title: 'No automatic backup schedule configured', detail: 'UpdraftPlus is active but backups are not scheduled' + (services.backupInterval ? ' (interval: ' + services.backupInterval + ')' : '') + '.', evidence: 'updraft_interval=' + (services.backupInterval || 'manual'), recommendation: 'Configure a scheduled backup (daily/weekly) with offsite storage.', confidence: 'high' });
  }
  if (pluginActive(plugins, 'WP Mail SMTP') && !services.smtpConfigured) {
    output.push({ category: 'wordpress', checkId: 'services.smtp', severity: 'warning', viewport: 'all', title: 'SMTP is not configured', detail: 'WP Mail SMTP is active but still using the default PHP mailer' + (services.smtpMailer ? ' (' + services.smtpMailer + ')' : '') + ', so transactional email may not deliver reliably.', evidence: 'mailer=' + (services.smtpMailer || 'mail'), recommendation: 'Configure an authenticated SMTP mailer and send a test email.', confidence: 'high' });
  }

  // Image optimization: warn when no known optimizer plugin is active.
  if (!IMAGE_OPTIMIZERS.some(function(brand) { return pluginActive(plugins, brand); })) {
    output.push({ category: 'wordpress', checkId: 'wordpress.image-optimization', severity: 'info', viewport: 'all', title: 'No image-optimization plugin detected', detail: 'No recognised image optimizer is active, so images may not be compressed or served in next-gen formats.', evidence: '', recommendation: 'Consider an image optimizer (e.g. Imagify, ShortPixel) to compress and serve WebP/AVIF.', confidence: 'medium' });
  }
  (snapshot.users || []).forEach(function(user) {
    if (!user.passwordUpdatedAt) {
      output.push({ category: 'wordpress', checkId: 'wordpress.password-age-unknown', severity: 'warning', viewport: 'all', title: 'Password age is not yet known', detail: 'AHM Core has not observed a password update for ' + user.name + '.', evidence: user.email, recommendation: 'Ask the user to rotate their password so AHM Core can begin tracking its age.', confidence: 'high' });
      return;
    }
    var ageDays = (Date.now() - new Date(user.passwordUpdatedAt).getTime()) / 86400000;
    if (Number.isFinite(ageDays) && ageDays > 90) output.push({ category: 'wordpress', checkId: 'wordpress.password-age', severity: 'warning', viewport: 'all', title: 'WordPress password is older than 90 days', detail: user.name + "'s password was last updated " + Math.floor(ageDays) + ' days ago.', evidence: user.email, recommendation: 'Require a password rotation and review whether this account still needs access.', confidence: 'high' });
  });
  // Least privilege: too many administrator accounts widens the attack surface.
  var admins = (snapshot.users || []).filter(function(user) { return String(user.role).toLowerCase() === 'administrator'; });
  if (admins.length > ADMIN_LIMIT) {
    output.push({ category: 'wordpress', checkId: 'wordpress.admin-count', severity: 'warning', viewport: 'all', title: admins.length + ' administrator accounts', detail: admins.length + ' users have the administrator role (recommended maximum is ' + ADMIN_LIMIT + ').', evidence: admins.map(function(user) { return user.email || user.name; }).join('\n'), recommendation: 'Review administrator accounts and downgrade or remove those that do not need full access.', confidence: 'high' });
  }

  // Content freshness (blog activity + last content update). Threshold is per-site.
  var content = snapshot.content || {};
  if (content.publishedPosts === 0) {
    output.push({ category: 'wordpress', checkId: 'content.no-posts', severity: 'info', viewport: 'all', title: 'No published blog posts', detail: 'The site has no published posts, so blog activity cannot be assessed.', evidence: 'publishedPosts=0', recommendation: 'Publish blog content if an active blog is expected for this site.', confidence: 'high' });
  } else {
    var blogAge = daysSince(content.lastPostPublishedAt);
    if (blogAge != null && blogAge > threshold) {
      output.push({ category: 'wordpress', checkId: 'content.blog-stale', severity: 'warning', viewport: 'all', title: 'No new blog post in over ' + threshold + ' days', detail: 'The most recent blog post was published ' + blogAge + ' days ago (' + content.lastPostPublishedAt + ').', evidence: content.lastPostPublishedAt, recommendation: 'Publish fresh blog content to keep the site active for visitors and search engines.', confidence: 'high' });
    }
  }
  var modifiedAge = daysSince(content.lastModifiedAt);
  if (modifiedAge != null && modifiedAge > threshold) {
    output.push({ category: 'wordpress', checkId: 'content.stale', severity: 'warning', viewport: 'all', title: 'No content updated in over ' + threshold + ' days', detail: 'The most recently modified content was updated ' + modifiedAge + ' days ago (' + content.lastModifiedAt + ').', evidence: content.lastModifiedAt, recommendation: 'Review and refresh key pages/posts so information stays current.', confidence: 'high' });
  }

  var wpSecurity = snapshot.security || {};
  if (!wpSecurity.ssl) output.push({ category: 'security', checkId: 'wordpress.ssl', severity: 'critical', viewport: 'all', title: 'WordPress does not report HTTPS', detail: 'AHM Core reports that is_ssl() is false.', evidence: snapshot.siteUrl, recommendation: 'Correct proxy HTTPS detection and enforce HTTPS.', confidence: 'high' });
  if (wpSecurity.debug || wpSecurity.debugDisplay) output.push({ category: 'security', checkId: 'wordpress.debug', severity: 'critical', viewport: 'all', title: 'WordPress debugging is exposed', detail: 'WP_DEBUG or WP_DEBUG_DISPLAY is enabled.', evidence: JSON.stringify({ debug: wpSecurity.debug, debugDisplay: wpSecurity.debugDisplay }), recommendation: 'Disable debug display in production and route errors to protected logs.', confidence: 'high' });
  if (!wpSecurity.fileEditDisabled) output.push({ category: 'security', checkId: 'wordpress.file-editor', severity: 'warning', viewport: 'all', title: 'WordPress file editor is enabled', detail: 'DISALLOW_FILE_EDIT is not enabled.', evidence: 'DISALLOW_FILE_EDIT', recommendation: 'Disable dashboard theme and plugin file editing in production.', confidence: 'high' });
  if (wpSecurity.xmlrpcEnabled) output.push({ category: 'security', checkId: 'wordpress.xmlrpc', severity: 'warning', viewport: 'all', title: 'XML-RPC is enabled', detail: 'WordPress reports XML-RPC access is enabled.', evidence: snapshot.siteUrl + 'xmlrpc.php', recommendation: 'Disable XML-RPC unless a confirmed integration requires it.', confidence: 'high' });
  if (wpSecurity.wpCronDisabled) output.push({ category: 'wordpress', checkId: 'wordpress.wp-cron', severity: 'info', viewport: 'all', title: 'WP-Cron is disabled', detail: 'DISABLE_WP_CRON is enabled, so WordPress will not run scheduled tasks on page loads.', evidence: 'DISABLE_WP_CRON', recommendation: 'Confirm a real server cron is calling wp-cron.php so backups, updates, and the AHM heartbeat still run on schedule.', confidence: 'high' });
  return output;
}

// A website label with its client for scan notifications, e.g.
// "Main Website · Acme Health".
function scanHeadline(website) {
  var name = website.name || website.url;
  return website.client_name ? name + ' · ' + website.client_name : name;
}

// Notify about a finished/failed scan. Managers (SA/Dev) always see the outcome
// with full context (client, website, who started it); a staff requester who is
// not already covered by a manager role gets their own copy. `message` may
// contain a {starter} placeholder for the person who started the scan.
async function notifyScanResult(kind, website, scan, title, message) {
  if (!scan.requested_by) return;
  var reqRows = await db.query(
    'SELECT name, role FROM users WHERE id = :id LIMIT 1',
    { id: scan.requested_by }
  );
  var starter = reqRows[0] || { name: 'Someone', role: 'staff' };
  var body = message.replace('{starter}', starter.name || 'Someone');
  var base = {
    type: kind, title: title, message: body,
    actionUrl: '/dashboard/website-health',
    metadata: { scanId: String(scan.id), websiteId: String(website.id), clientName: website.client_name || null },
  };
  ['superadmin', 'developer'].forEach(function(role) {
    notifications.dispatch(
      notifications.CATEGORY.HEALTH,
      Object.assign({ audienceType: 'role', audienceValue: role }, base),
      null, null
    ).catch(function() {});
  });
  if (starter.role === 'staff') {
    notifications.dispatch(
      notifications.CATEGORY.HEALTH,
      Object.assign({ userId: scan.requested_by, audienceType: 'user' }, base),
      null, null
    ).catch(function() {});
  }
}

async function processScan(scanId) {
  var scanRows = await db.query("SELECT * FROM website_health_scans WHERE id = :id AND status = 'queued' LIMIT 1", { id: scanId });
  if (!scanRows[0]) return;
  var scan = scanRows[0];
  var website = await health.websiteRow(scan.website_id);
  await db.query("UPDATE website_health_scans SET status = 'running', stage = 'starting', progress = 1, started_at = UTC_TIMESTAMP() WHERE id = :id", { id: scanId });
  await emit(events.HEALTH_SCAN_STARTED, scanId, { websiteId: String(website.id), stage: 'starting', progress: 1 });
  try {
    var identity = health.parseJson(website.approved_identity, {});
    var essentialPlugins = health.parseJson(website.essential_plugins, []);
    if (!Array.isArray(essentialPlugins) || !essentialPlugins.length) essentialPlugins = health.DEFAULT_ESSENTIAL_PLUGINS;
    var stalenessDays = website.content_staleness_days != null ? Number(website.content_staleness_days) : health.DEFAULT_CONTENT_STALENESS_DAYS;
    var maxPages = Math.min(env.websiteHealth.maxPages, Number(website.max_pages || env.websiteHealth.maxPages));
    var checks = health.parseJson(scan.selected_checks, null) || ['lighthouse', 'technical_seo', 'design_qa', 'website_checklists'];
    var runLighthouse = checks.indexOf('lighthouse') !== -1;
    await update(scanId, 'crawling', 5);
    var browserPages = await browserScanner.scanWebsite(scanId, website.url, maxPages, async function(page, count) {
      await emit(events.HEALTH_SCAN_PROGRESS, scanId, { websiteId: String(website.id), stage: 'crawling', progress: Math.min(35, 5 + Math.round((count / maxPages) * 30)), page: page.url });
    }, scan.sitemap_url || null);
    var legacyPages = [];
    var allFindings = [];
    for (var index = 0; index < browserPages.length; index += 1) {
      if (await cancelled(scanId)) return;
      var evidence = browserPages[index];
      await update(scanId, 'analyzing_page', 35 + Math.round((index / Math.max(1, browserPages.length)) * 50));
      var pageSpeed = (runLighthouse && !evidence.error)
        ? await lighthouse.run(evidence.url)
        : { status: 'not_run', reason: evidence.error || 'Lighthouse was not selected.', mobile: null, desktop: null };
      var reviewed = await review.review(evidence, identity, checks);
      // Lighthouse is display-only (PageSpeed scores/metrics/field data/diagnostics
      // are stored on the page row); it produces no findings.
      var pageFindings = reviewed.findings;
      var pageId = security.uuid();
      var seo = { status: reviewed.technicalSeo.status, findings: reviewed.findings.filter(function(item) { return item.category === 'technical_seo'; }) };
      var design = { status: reviewed.designContent.status, figmaComparison: 'deferred', findings: reviewed.findings.filter(function(item) { return item.category === 'design' || item.category === 'content'; }), layouts: evidence.layouts };
      await db.query(
        `INSERT INTO website_health_scan_pages
         (id, scan_id, page_url, page_name, path, http_status, lighthouse, seo_result, design_result, forms_result, evidence)
         VALUES (:id, :scanId, :url, :name, :path, :status, :lighthouse, :seo, :design, :forms, :evidence)`,
        { id: pageId, scanId: scanId, url: evidence.url, name: evidence.name, path: evidence.path, status: evidence.httpStatus, lighthouse: JSON.stringify(pageSpeed), seo: JSON.stringify(seo), design: JSON.stringify(design), forms: JSON.stringify((evidence.core && evidence.core.forms) || []), evidence: JSON.stringify(evidence) }
      );
      await insertFindings(scanId, pageId, pageFindings);
      allFindings.push.apply(allFindings, pageFindings);
      legacyPages.push(pageLegacy(pageId, evidence, pageSpeed, reviewed));
      await emit(events.HEALTH_SCAN_PAGE_COMPLETED, scanId, { websiteId: String(website.id), pageId: pageId, page: evidence.url, completedPages: index + 1, totalPages: browserPages.length });
    }
    // Site-level Technical SEO checks (homepage, robots.txt, sitemap, broken
    // links, duplicate meta) run once per scan, independent of Lighthouse.
    if (checks.indexOf('technical_seo') !== -1 && browserPages.length && !(await cancelled(scanId))) {
      await update(scanId, 'site_checks', 88);
      var siteFindings = await siteChecks.siteChecks({ websiteUrl: website.url, sitemapUrl: scan.sitemap_url, pages: browserPages });
      await insertFindings(scanId, null, siteFindings);
      allFindings.push.apply(allFindings, siteFindings);
    }
    // Website checklists (WordPress maintenance + security) only run when
    // selected and the connector is paired. 'security' is accepted for
    // backward compatibility with scans queued before the merge.
    var wantChecklists = checks.indexOf('website_checklists') !== -1 || checks.indexOf('security') !== -1;
    var wpSnapshot = null;
    if (wantChecklists) {
      await update(scanId, 'wordpress', 90);
      try {
        wpSnapshot = await connector.refreshSnapshot(website.id);
        var wpFindings = wordpressFindings(wpSnapshot, essentialPlugins, stalenessDays);
        await insertFindings(scanId, null, wpFindings);
        allFindings.push.apply(allFindings, wpFindings);
      } catch (connectorErr) {
        // No paired connector (or it failed): skip the WordPress checks gracefully
        // rather than failing the whole scan, and surface why.
        var checklistSkip = [{ category: 'wordpress', checkId: 'wordpress.not-connected', severity: 'info', viewport: 'all', title: 'Website checklists skipped', detail: 'The WordPress checklist checks need the AHM Core connector, which is not connected for this site.', evidence: String(connectorErr.message || connectorErr).slice(0, 300), recommendation: 'Connect AHM Core to this website to run maintenance/security checklists.', confidence: 'high' }];
        await insertFindings(scanId, null, checklistSkip);
        allFindings.push.apply(allFindings, checklistSkip);
      }
    }
    // Forms audit: enumerate CF7 / WPForms / Elementor forms via the connector
    // (recipients, cc/bcc, fields) and flag configuration problems. Connector-gated.
    var formsInventory = null;
    if (checks.indexOf('forms') !== -1) {
      await update(scanId, 'forms', 95);
      var formFindings;
      try {
        var formsData = await connector.fetchForms(website.id);
        formsInventory = formsData && Array.isArray(formsData.forms) ? formsData.forms : [];
        var detectedForms = browserPages.reduce(function(sum, page) { return sum + ((page.core && page.core.forms) || []).length; }, 0);
        formFindings = formsFindings(formsInventory, detectedForms);
      } catch (connectorErr) {
        formsInventory = [];
        formFindings = [{ category: 'forms', checkId: 'forms.not-connected', severity: 'info', viewport: 'all', title: 'Form config audit skipped', detail: 'Reading form recipients/fields needs the AHM Core connector, which is not connected for this site. Detected forms on the crawled pages are still shown.', evidence: String(connectorErr.message || connectorErr).slice(0, 300), recommendation: 'Connect AHM Core to audit form recipients and delivery config.', confidence: 'high' }];
      }
      await insertFindings(scanId, null, formFindings);
      allFindings.push.apply(allFindings, formFindings);
    }
    var scanSummary = summary(legacyPages, allFindings, wpSnapshot);
    var audit = {
      websiteId: String(website.id), websiteName: website.name, websiteUrl: website.url,
      sitemapUrl: scan.sitemap_url || new URL('/sitemap.xml', website.url).toString(), lastActivityAt: wpSnapshot && wpSnapshot.lastActivityAt || null,
      lastUpdatedAt: new Date().toISOString(), wordpressVersion: wpSnapshot && wpSnapshot.wordpress && wpSnapshot.wordpress.version || 'Unavailable',
      wordpressLatestVersion: wpSnapshot && wpSnapshot.wordpress && wpSnapshot.wordpress.latestVersion || 'Unavailable',
      themeName: wpSnapshot && wpSnapshot.theme && wpSnapshot.theme.name || 'Unavailable', themeVersion: wpSnapshot && wpSnapshot.theme && wpSnapshot.theme.version || '',
      phpVersion: wpSnapshot && wpSnapshot.phpVersion || 'Unavailable', sslExpiresAt: null,
      connectorStatus: wpSnapshot ? 'connected' : 'disconnected', pages: legacyPages,
      qaFindings: allFindings.map(function(item, i) { return { id: 'finding-' + i, title: item.title, status: item.severity === 'critical' ? 'fail' : 'warn', detail: item.detail }; }),
      plugins: (wpSnapshot && wpSnapshot.plugins || []).map(function(plugin) { return { name: plugin.name, installedVersion: plugin.version, latestVersion: plugin.latestVersion || plugin.version, updated: !plugin.updateAvailable, lastUpdatedAt: plugin.lastUpdatedAt || null }; }),
      users: (wpSnapshot && wpSnapshot.users || []).map(function(user) { return { name: user.name, role: user.role, email: user.email, lastLoginAt: user.lastLoginAt, passwordUpdatedAt: user.passwordUpdatedAt }; }),
      siteChecks: {}, siteNotes: {}, summary: scanSummary, findings: allFindings,
      content: wpSnapshot && wpSnapshot.content || null,
      formsInventory: formsInventory,
    };
    var partial = legacyPages.some(function(page) { return page.speedMobile.performance === 0; }) || allFindings.some(function(item) { return item.checkId === 'page.load'; });
    await db.query(
      `UPDATE website_health_scans SET status = :status, stage = 'completed', progress = 100,
       summary = :summary, site_result = :result, completed_at = UTC_TIMESTAMP() WHERE id = :id`,
      { id: scanId, status: partial ? 'partial' : 'completed', summary: JSON.stringify(scanSummary), result: JSON.stringify(audit) }
    );
    await emit(events.HEALTH_SCAN_COMPLETED, scanId, { websiteId: String(website.id), status: partial ? 'partial' : 'completed', progress: 100, summary: scanSummary });
    var critical = (scanSummary && scanSummary.criticalIssues) || 0;
    var score = scanSummary && scanSummary.overall != null ? scanSummary.overall : '—';
    await notifyScanResult(
      'scan_completed', website, scan,
      critical > 0 ? 'Scan finished — ' + critical + ' critical issue(s)' : 'Website scan finished',
      scanHeadline(website) + ' scored ' + score + '/100 · started by {starter}'
    );
  } catch (err) {
    await db.query("UPDATE website_health_scans SET status = 'failed', stage = 'failed', error_message = :error, completed_at = UTC_TIMESTAMP() WHERE id = :id AND status <> 'cancelled'", { id: scanId, error: String(err.message || err).slice(0, 4000) });
    await emit(events.HEALTH_SCAN_FAILED, scanId, { websiteId: String(website.id), error: err.message || 'Scan failed.' });
    await notifyScanResult(
      'scan_failed', website, scan,
      'Website scan failed',
      scanHeadline(website) + ' — ' + String(err.message || err).slice(0, 140) + ' · started by {starter}'
    );
  }
}

async function enqueue(scanId) {
  var redis = await redisStore.getRedis();
  await redis.rPush(QUEUE, scanId);
}

async function recover() {
  var rows = await db.query("SELECT id FROM website_health_scans WHERE status = 'queued' ORDER BY created_at ASC");
  for (var row of rows) await enqueue(row.id);
  await db.query("UPDATE website_health_scans SET status = 'failed', stage = 'failed', error_message = 'API restarted during scan.', completed_at = UTC_TIMESTAMP() WHERE status = 'running'");
}

async function start() {
  if (started) return;
  started = true;
  await recover();
  var redis = await redisStore.getRedis();
  var blocking = redis.duplicate();
  await blocking.connect();
  (async function loop() {
    while (started) {
      try {
        var item = await blocking.brPop(QUEUE, 0);
        if (item && item.element) await processScan(item.element);
      } catch (err) {
        await new Promise(function(resolve) { setTimeout(resolve, 1000); });
      }
    }
  })();
}

module.exports = { enqueue: enqueue, start: start, processScan: processScan };
