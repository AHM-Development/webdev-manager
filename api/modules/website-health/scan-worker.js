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
var health = require('./website-health.service');

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

function wordpressFindings(snapshot, essentialPlugins) {
  if (!snapshot) return [];
  var output = [];
  var plugins = snapshot.plugins || [];
  if (snapshot.wordpress && snapshot.wordpress.latestVersion && snapshot.wordpress.version !== snapshot.wordpress.latestVersion) {
    output.push({ category: 'wordpress', checkId: 'wordpress.core-update', severity: 'critical', viewport: 'all', title: 'WordPress core needs an update', detail: 'Installed ' + snapshot.wordpress.version + '; latest ' + snapshot.wordpress.latestVersion + '.', evidence: snapshot.wordpress.version, recommendation: 'Back up, verify compatibility, and update WordPress core.', confidence: 'high' });
  }
  plugins.filter(function(plugin) { return plugin.updateAvailable; }).forEach(function(plugin) {
    output.push({ category: 'wordpress', checkId: 'wordpress.plugin-update', severity: 'warning', viewport: 'all', title: plugin.name + ' needs an update', detail: 'Installed ' + plugin.version + '; latest ' + plugin.latestVersion + '.', evidence: plugin.file || plugin.name, recommendation: 'Review compatibility, back up, and update the plugin.', confidence: 'high' });
  });
  (essentialPlugins || []).forEach(function(name) {
    if (!plugins.some(function(plugin) { return plugin.name.toLowerCase() === String(name).toLowerCase() && plugin.active; })) output.push({ category: 'wordpress', checkId: 'wordpress.essential-plugin', severity: 'critical', viewport: 'all', title: 'Essential plugin missing or inactive', detail: name + ' is required by the website profile.', evidence: name, recommendation: 'Install or activate the approved plugin, or update the website profile.', confidence: 'high' });
  });
  (snapshot.users || []).forEach(function(user) {
    if (!user.passwordUpdatedAt) {
      output.push({ category: 'wordpress', checkId: 'wordpress.password-age-unknown', severity: 'warning', viewport: 'all', title: 'Password age is not yet known', detail: 'AHM Core has not observed a password update for ' + user.name + '.', evidence: user.email, recommendation: 'Ask the user to rotate their password so AHM Core can begin tracking its age.', confidence: 'high' });
      return;
    }
    var ageDays = (Date.now() - new Date(user.passwordUpdatedAt).getTime()) / 86400000;
    if (Number.isFinite(ageDays) && ageDays > 90) output.push({ category: 'wordpress', checkId: 'wordpress.password-age', severity: 'warning', viewport: 'all', title: 'WordPress password is older than 90 days', detail: user.name + "'s password was last updated " + Math.floor(ageDays) + ' days ago.', evidence: user.email, recommendation: 'Require a password rotation and review whether this account still needs access.', confidence: 'high' });
  });
  var wpSecurity = snapshot.security || {};
  if (!wpSecurity.ssl) output.push({ category: 'security', checkId: 'wordpress.ssl', severity: 'critical', viewport: 'all', title: 'WordPress does not report HTTPS', detail: 'AHM Core reports that is_ssl() is false.', evidence: snapshot.siteUrl, recommendation: 'Correct proxy HTTPS detection and enforce HTTPS.', confidence: 'high' });
  if (wpSecurity.debug || wpSecurity.debugDisplay) output.push({ category: 'security', checkId: 'wordpress.debug', severity: 'critical', viewport: 'all', title: 'WordPress debugging is exposed', detail: 'WP_DEBUG or WP_DEBUG_DISPLAY is enabled.', evidence: JSON.stringify({ debug: wpSecurity.debug, debugDisplay: wpSecurity.debugDisplay }), recommendation: 'Disable debug display in production and route errors to protected logs.', confidence: 'high' });
  if (!wpSecurity.fileEditDisabled) output.push({ category: 'security', checkId: 'wordpress.file-editor', severity: 'warning', viewport: 'all', title: 'WordPress file editor is enabled', detail: 'DISALLOW_FILE_EDIT is not enabled.', evidence: 'DISALLOW_FILE_EDIT', recommendation: 'Disable dashboard theme and plugin file editing in production.', confidence: 'high' });
  if (wpSecurity.xmlrpcEnabled) output.push({ category: 'security', checkId: 'wordpress.xmlrpc', severity: 'warning', viewport: 'all', title: 'XML-RPC is enabled', detail: 'WordPress reports XML-RPC access is enabled.', evidence: snapshot.siteUrl + 'xmlrpc.php', recommendation: 'Disable XML-RPC unless a confirmed integration requires it.', confidence: 'high' });
  return output;
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
    var maxPages = Math.min(env.websiteHealth.maxPages, Number(website.max_pages || env.websiteHealth.maxPages));
    var checks = health.parseJson(scan.selected_checks, null) || ['lighthouse', 'technical_seo', 'design_qa', 'website_checklists', 'security'];
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
      // Claude interprets the real Lighthouse metrics into prioritised findings.
      var lighthouseFindings = [];
      if (runLighthouse && pageSpeed.status !== 'not_run') {
        var lhReview = await review.reviewLighthouse(evidence, pageSpeed);
        lighthouseFindings = lhReview.findings;
      }
      var pageFindings = reviewed.findings.concat(lighthouseFindings);
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
    // WordPress + security checks only run when selected and the connector is paired.
    var wantWordpress = checks.indexOf('website_checklists') !== -1;
    var wantSecurity = checks.indexOf('security') !== -1;
    var wpSnapshot = null;
    if (wantWordpress || wantSecurity) {
      await update(scanId, 'wordpress', 90);
      wpSnapshot = await connector.refreshSnapshot(website.id);
      var wpFindings = wordpressFindings(wpSnapshot, essentialPlugins).filter(function(item) {
        if (item.category === 'wordpress') return wantWordpress;
        if (item.category === 'security') return wantSecurity;
        return false;
      });
      await insertFindings(scanId, null, wpFindings);
      allFindings.push.apply(allFindings, wpFindings);
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
    };
    var partial = legacyPages.some(function(page) { return page.speedMobile.performance === 0; }) || allFindings.some(function(item) { return item.checkId === 'page.load'; });
    await db.query(
      `UPDATE website_health_scans SET status = :status, stage = 'completed', progress = 100,
       summary = :summary, site_result = :result, completed_at = UTC_TIMESTAMP() WHERE id = :id`,
      { id: scanId, status: partial ? 'partial' : 'completed', summary: JSON.stringify(scanSummary), result: JSON.stringify(audit) }
    );
    await emit(events.HEALTH_SCAN_COMPLETED, scanId, { websiteId: String(website.id), status: partial ? 'partial' : 'completed', progress: 100, summary: scanSummary });
  } catch (err) {
    await db.query("UPDATE website_health_scans SET status = 'failed', stage = 'failed', error_message = :error, completed_at = UTC_TIMESTAMP() WHERE id = :id AND status <> 'cancelled'", { id: scanId, error: String(err.message || err).slice(0, 4000) });
    await emit(events.HEALTH_SCAN_FAILED, scanId, { websiteId: String(website.id), error: err.message || 'Scan failed.' });
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
