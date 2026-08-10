var db = require('../../db/pool');
var env = require('../../config/env');
var security = require('../../lib/security');
var qaCrypto = require('../website-users/crypto');
var activity = require('../auth/activity.service');
var checklists = require('./checklist.service');
var urlSecurity = require('./url-security');

var ALL_CHECKS = ['lighthouse', 'technical_seo', 'design_qa', 'website_checklists', 'forms'];

// Recommended baseline plugins used when a website profile hasn't set its own
// list. Names are matched case-insensitively as substrings, so slight version
// naming differences (e.g. "UpdraftPlus - Backup/Restore") still match.
var DEFAULT_ESSENTIAL_PLUGINS = ['Elementor', 'PRO Elements', 'WP Rocket', 'UpdraftPlus', 'Kadence Security Basic', 'WP Activity', 'WP Mail SMTP', 'Rank Math SEO', 'Rank Math SEO PRO', 'AHM Core'];

// Default content-staleness threshold (days) when a profile hasn't set one.
var DEFAULT_CONTENT_STALENESS_DAYS = 90;

function fail(status, code, message) { var err = new Error(message); err.status = status; err.code = code; throw err; }
function parseJson(value, fallback) { if (value == null) return fallback; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch (err) { return fallback; } }
function contextValue(context, key) { return context && context[key] ? context[key] : null; }

function capabilities() {
  return { lighthouse: !!env.websiteHealth.pageSpeedApiKey, ai: !!env.ai.anthropicApiKey };
}

/** Returns whether a check's prerequisites are met for a website row. */
function checkAvailable(check, website) {
  var caps = capabilities();
  if (check === 'lighthouse') return caps.lighthouse;
  if (check === 'technical_seo' || check === 'design_qa') return caps.ai;
  if (check === 'website_checklists' || check === 'forms') return website.connector_status === 'connected';
  return false;
}

/** Resolves the requested checks against what is actually runnable. */
function resolveChecks(requested, website) {
  var base = Array.isArray(requested) && requested.length
    ? ALL_CHECKS.filter(function(check) { return requested.indexOf(check) !== -1; })
    : ALL_CHECKS.slice();
  return base.filter(function(check) { return checkAvailable(check, website); });
}

function mapScan(row) {
  if (!row) return null;
  return {
    id: row.id,
    websiteId: String(row.website_id),
    status: row.status,
    stage: row.stage,
    progress: Number(row.progress),
    checklistVersions: parseJson(row.checklist_versions, {}),
    selectedChecks: parseJson(row.selected_checks, null),
    sitemapUrl: row.sitemap_url || null,
    summary: parseJson(row.summary, null),
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function websiteRow(websiteId) {
  var rows = await db.query(
    `SELECT pw.*, p.client_name, p.figma_link,
       hp.approved_identity, hp.essential_plugins, hp.form_test_policy, hp.max_pages,
       hp.figma_comparison_enabled, hp.sitemap_url, hp.default_checks, hp.content_staleness_days,
       wc.status AS connector_status, wc.plugin_version, wc.last_heartbeat_at
     FROM project_websites pw
     JOIN projects p ON p.id = pw.project_id AND p.deleted_at IS NULL
     LEFT JOIN website_health_profiles hp ON hp.website_id = pw.id
     LEFT JOIN wordpress_connections wc ON wc.website_id = pw.id
     WHERE pw.id = :websiteId LIMIT 1`,
    { websiteId: websiteId }
  );
  if (!rows[0]) fail(404, 'WEBSITE_NOT_FOUND', 'Website not found.');
  return rows[0];
}

async function list(input) {
  var page = Math.max(1, Number(input.page) || 1);
  var pageSize = Math.min(100, Math.max(1, Number(input.pageSize) || 20));
  var q = String(input.q || '').trim();
  var scanStatus = String(input.scanStatus || 'all');
  var offset = (page - 1) * pageSize;
  var params = { q: '%' + q + '%' };
  var conditions = [];
  if (q) conditions.push('(p.client_name LIKE :q OR pw.name LIKE :q OR pw.url LIKE :q)');
  // "Scanned" = has at least one completed/partial scan; "unscanned" = none.
  var scannedExists = "EXISTS (SELECT 1 FROM website_health_scans hs WHERE hs.website_id = pw.id AND hs.status IN ('completed', 'partial'))";
  if (scanStatus === 'scanned') conditions.push(scannedExists);
  else if (scanStatus === 'unscanned') conditions.push('NOT ' + scannedExists);
  var where = conditions.length ? 'AND ' + conditions.join(' AND ') : '';
  var rows = await db.query(
    `SELECT pw.id AS website_id, pw.name AS website_name, pw.url AS website_url,
       p.id AS project_id, p.client_name,
       wc.status AS connector_status, wc.last_heartbeat_at,
       hp.sitemap_url, hp.default_checks,
       s.id AS scan_id, s.status AS scan_status, s.stage, s.progress, s.summary,
       s.created_at AS scan_created_at, s.completed_at AS scan_completed_at
     FROM project_websites pw
     JOIN projects p ON p.id = pw.project_id AND p.deleted_at IS NULL
     LEFT JOIN wordpress_connections wc ON wc.website_id = pw.id
     LEFT JOIN website_health_profiles hp ON hp.website_id = pw.id
     LEFT JOIN website_health_scans s ON s.id = (
       SELECT hs.id FROM website_health_scans hs
       WHERE hs.website_id = pw.id
       ORDER BY hs.created_at DESC LIMIT 1
     )
     WHERE 1=1 ${where}
     ORDER BY p.client_name ASC, pw.sort_order ASC
     LIMIT ${pageSize} OFFSET ${offset}`, params
  );
  var counts = await db.query(
    `SELECT COUNT(*) AS total FROM project_websites pw
     JOIN projects p ON p.id = pw.project_id AND p.deleted_at IS NULL
    WHERE 1=1 ${where}`, params
  );
  var aggregateRows = await db.query(
    `SELECT s.summary
     FROM project_websites pw
     JOIN projects p ON p.id = pw.project_id AND p.deleted_at IS NULL
     LEFT JOIN website_health_scans s ON s.id = (
       SELECT hs.id FROM website_health_scans hs
       WHERE hs.website_id = pw.id AND hs.status IN ('completed', 'partial')
       ORDER BY hs.completed_at DESC LIMIT 1
     )
     WHERE 1=1 ${where}`, params
  );
  var aggregateSummaries = aggregateRows.map(function(row) { return parseJson(row.summary, null); }).filter(Boolean);
  function aggregateTotal(key) {
    return aggregateSummaries.reduce(function(total, item) { return total + Number(item[key] || 0); }, 0);
  }
  return {
    websites: rows.map(function(row) {
      return {
        id: String(row.website_id),
        projectId: String(row.project_id),
        projectName: row.client_name,
        name: row.website_name,
        url: row.website_url,
        connector: { status: row.connector_status || 'disconnected', lastHeartbeatAt: row.last_heartbeat_at },
        profile: {
          sitemapUrl: row.sitemap_url || null,
          defaultChecks: parseJson(row.default_checks, null),
        },
        latestScan: row.scan_id ? {
          id: row.scan_id, status: row.scan_status, stage: row.stage, progress: Number(row.progress),
          summary: parseJson(row.summary, null), createdAt: row.scan_created_at, completedAt: row.scan_completed_at,
        } : null,
      };
    }),
    overview: {
      websites: Number(counts[0].total),
      scannedWebsites: aggregateSummaries.length,
      averageHealth: aggregateSummaries.length ? Math.round(aggregateTotal('overall') / aggregateSummaries.length) : null,
      pages: aggregateTotal('pages'),
      forms: aggregateTotal('forms'),
      criticalIssues: aggregateTotal('criticalIssues'),
    },
    pagination: { page: page, pageSize: pageSize, total: Number(counts[0].total), totalPages: Math.max(1, Math.ceil(Number(counts[0].total) / pageSize)) },
  };
}

async function getLatest(websiteId) {
  var website = await websiteRow(websiteId);
  var rows = await db.query(
    `SELECT * FROM website_health_scans
     WHERE website_id = :websiteId AND status IN ('completed', 'partial')
     ORDER BY completed_at DESC LIMIT 1`, { websiteId: websiteId }
  );
  var scan = rows[0];
  return {
    project: { id: String(website.project_id), clientName: website.client_name, figmaLink: website.figma_link || null },
    website: { id: String(website.id), name: website.name, url: website.url },
    profile: {
      approvedIdentity: parseJson(website.approved_identity, {}),
      essentialPlugins: parseJson(website.essential_plugins, []),
      formTestPolicy: parseJson(website.form_test_policy, { mode: 'detect_only', allowedForms: [] }),
      maxPages: Number(website.max_pages || 25),
      figmaComparisonEnabled: !!website.figma_comparison_enabled,
      sitemapUrl: website.sitemap_url || null,
      defaultChecks: parseJson(website.default_checks, null),
      contentStalenessDays: website.content_staleness_days != null ? Number(website.content_staleness_days) : null,
    },
    connector: { status: website.connector_status || 'disconnected', pluginVersion: website.plugin_version || null, lastHeartbeatAt: website.last_heartbeat_at || null },
    scan: scan ? mapScan(scan) : null,
    audit: scan ? parseJson(scan.site_result, null) : null,
  };
}

async function history(websiteId, limit) {
  await websiteRow(websiteId);
  var historyLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  var rows = await db.query(`SELECT * FROM website_health_scans WHERE website_id = :websiteId ORDER BY created_at DESC LIMIT ${historyLimit}`, { websiteId: websiteId });
  return rows.map(mapScan);
}

async function resolveSitemapUrl(sitemapUrl, website) {
  var value = String(sitemapUrl || '').trim();
  // A sitemap is required. Fall back to the one saved on the website's profile
  // so re-scans and retries (which may not resend it) still work.
  if (!value) value = String(website.sitemap_url || '').trim();
  if (!value) {
    fail(400, 'SITEMAP_REQUIRED', 'A sitemap URL is required. Add it in the scan dialog first.');
  }
  await urlSecurity.assertSafeUrl(value);
  if (!urlSecurity.sameRegistrableHost(value, website.url)) {
    fail(400, 'SITEMAP_DOMAIN_MISMATCH', 'The sitemap URL must be on the same domain as the website.');
  }
  return value;
}

/** Remembers the sitemap URL + check selection on the website's profile. */
async function saveScanDefaults(websiteId, sitemapUrl, checks) {
  await db.query(
    `INSERT INTO website_health_profiles (website_id, sitemap_url, default_checks)
     VALUES (:websiteId, :sitemapUrl, :checks)
     ON DUPLICATE KEY UPDATE sitemap_url = VALUES(sitemap_url), default_checks = VALUES(default_checks)`,
    { websiteId: websiteId, sitemapUrl: sitemapUrl, checks: JSON.stringify(checks) }
  );
}

async function createScan(websiteId, input, user, context) {
  var website = await websiteRow(websiteId);
  var active = await db.query("SELECT id FROM website_health_scans WHERE website_id = :websiteId AND status IN ('queued', 'running') LIMIT 1", { websiteId: websiteId });
  if (active[0]) fail(409, 'SCAN_ALREADY_RUNNING', 'A scan is already queued or running for this website.');

  var checks = resolveChecks(input && input.checks, website);
  if (!checks.length) fail(400, 'NO_CHECKS_AVAILABLE', 'None of the selected checks can run. Configure the required keys or connect WordPress first.');
  var sitemapUrl = await resolveSitemapUrl(input && input.sitemapUrl, website);

  var id = security.uuid();
  await db.query(
    `INSERT INTO website_health_scans (id, website_id, checklist_versions, selected_checks, sitemap_url, requested_by)
     VALUES (:id, :websiteId, :versions, :checks, :sitemapUrl, :userId)`,
    { id: id, websiteId: websiteId, versions: JSON.stringify(checklists.versions()), checks: JSON.stringify(checks), sitemapUrl: sitemapUrl, userId: user.id }
  );
  // Remember the choices so the next scan for this website pre-fills them.
  await saveScanDefaults(websiteId, sitemapUrl, checks);
  await activity.logActivity({ userId: user.id, eventType: 'website_health.scan_queued', ip: contextValue(context, 'ip'), userAgent: contextValue(context, 'userAgent'), metadata: { scanId: id, websiteId: String(websiteId), checks: checks } });
  return mapScan((await db.query('SELECT * FROM website_health_scans WHERE id = :id', { id: id }))[0]);
}

async function getScan(scanId) {
  var rows = await db.query('SELECT * FROM website_health_scans WHERE id = :id LIMIT 1', { id: scanId });
  if (!rows[0]) fail(404, 'SCAN_NOT_FOUND', 'Scan not found.');
  return mapScan(rows[0]);
}

// Clears a website's scan history (pages + findings cascade), returning it to
// an "unscanned" state. Super-admin only (enforced at the route).
async function resetWebsite(websiteId) {
  await websiteRow(websiteId); // 404s if the website doesn't exist
  var result = await db.query(
    'DELETE FROM website_health_scans WHERE website_id = :websiteId',
    { websiteId: websiteId }
  );
  return { ok: true, deletedScans: result.affectedRows || 0 };
}

// ---- Website QA (AI findings against the editable QA criteria) ----
var QA_RESULT_STATUSES = ['pass', 'fail', 'warning', 'na'];

/** The QA criteria grouped exactly like Settings, each item annotated with the
 *  latest finding pushed for this website (null status = not checked yet). */
async function getQaResults(websiteId) {
  await websiteRow(websiteId);
  var groups = await db.query('SELECT id, name FROM qa_criteria_groups ORDER BY sort_order ASC, id ASC');
  var items = await db.query('SELECT id, group_id, text FROM qa_criteria_items ORDER BY sort_order ASC, id ASC');
  var results = await db.query(
    'SELECT criterion_id, status, note, detail, checks, fix, updated_at FROM website_qa_results WHERE website_id = :websiteId',
    { websiteId: websiteId }
  );
  var byCriterion = {};
  results.forEach(function(row) {
    byCriterion[String(row.criterion_id)] = {
      status: row.status,
      note: row.note || '',
      detail: row.detail || '',
      checks: row.checks || '',
      fix: row.fix || '',
      checkedAt: row.updated_at,
    };
  });
  var summary = { pass: 0, fail: 0, warning: 0, na: 0, notChecked: 0, total: items.length };
  var itemsByGroup = {};
  items.forEach(function(item) {
    var key = String(item.group_id);
    if (!itemsByGroup[key]) itemsByGroup[key] = [];
    var res = byCriterion[String(item.id)] || null;
    if (res) summary[res.status] += 1; else summary.notChecked += 1;
    itemsByGroup[key].push({
      id: String(item.id),
      text: item.text,
      status: res ? res.status : null,
      note: res ? res.note : '',
      detail: res ? res.detail : '',
      checks: res ? res.checks : '',
      fix: res ? res.fix : '',
      checkedAt: res ? res.checkedAt : null,
    });
  });
  return {
    groups: groups.map(function(group) {
      return { id: String(group.id), name: group.name, items: itemsByGroup[String(group.id)] || [] };
    }),
    summary: summary,
  };
}

/** Upsert a batch of findings (called by the AI/co-worker with a token). */
async function submitQaResults(websiteId, input, user) {
  await websiteRow(websiteId);
  var results = input && input.results;
  if (!Array.isArray(results)) fail(400, 'VALIDATION_ERROR', 'A "results" array is required.');
  for (var i = 0; i < results.length; i += 1) {
    var row = results[i] || {};
    var criterionId = row.criterionId != null ? String(row.criterionId) : '';
    var status = String(row.status || '').toLowerCase();
    if (!/^\d+$/.test(criterionId) || QA_RESULT_STATUSES.indexOf(status) === -1) {
      fail(400, 'VALIDATION_ERROR', 'Each result needs a numeric criterionId and status of pass|fail|warning|na.');
    }
    var exists = await db.query('SELECT id FROM qa_criteria_items WHERE id = :id LIMIT 1', { id: criterionId });
    if (!exists[0]) continue; // criterion no longer exists — skip
    var clip = function(value) {
      var text = String(value == null ? '' : value).slice(0, 4000);
      return text || null;
    };
    await db.query(
      `INSERT INTO website_qa_results (website_id, criterion_id, status, note, detail, checks, fix, submitted_by)
         VALUES (:websiteId, :criterionId, :status, :note, :detail, :checks, :fix, :userId)
       ON DUPLICATE KEY UPDATE status = :status, note = :note, detail = :detail,
         checks = :checks, fix = :fix, submitted_by = :userId`,
      {
        websiteId: websiteId,
        criterionId: criterionId,
        status: status,
        note: clip(row.note),
        detail: clip(row.detail),
        checks: clip(row.checks),
        fix: clip(row.fix),
        userId: user ? user.id : null,
      }
    );
  }
  return getQaResults(websiteId);
}

async function resetQaResults(websiteId) {
  await websiteRow(websiteId);
  await db.query('DELETE FROM website_qa_results WHERE website_id = :websiteId', { websiteId: websiteId });
  return getQaResults(websiteId);
}

// ---- Website QA push token + copyable runner prompt ----
var QA_PUSH_PREFIX = 'qapush_';

function qaApiBase() {
  return String(env.websiteHealth.publicApiUrl || '').replace(/\/+$/, '') + '/api/v1';
}

function qaPushEndpoint() {
  return qaApiBase() + '/website-health/qa-results';
}

// Assemble the full, self-contained prompt an operator copies into Claude: the
// configured QA instructions, the site under test, the current criteria (with
// their numeric ids) grouped, and the exact push request carrying this site's
// token. Regenerated from live criteria each time, so it never goes stale.
async function buildQaRunnerPrompt(site, token) {
  var groups = await db.query('SELECT id, name FROM qa_criteria_groups ORDER BY sort_order ASC, id ASC');
  var items = await db.query('SELECT id, group_id, text FROM qa_criteria_items ORDER BY sort_order ASC, id ASC');
  var settingsRows = await db.query('SELECT ai_prompt FROM qa_criteria_settings WHERE id = 1');
  var intro = (settingsRows[0] && settingsRows[0].ai_prompt && String(settingsRows[0].ai_prompt).trim())
    || 'You are running a website QA review. Review the live website against the criteria below and judge each one.';
  // Substitute template placeholders so nothing dangles in the copied prompt.
  // (The criteria are inlined below and results go to the push endpoint at the
  // end, so the token here is this site's push token.)
  intro = intro
    .replace(/\{\{\s*websiteUrl\s*\}\}/g, site.url || '')
    .replace(/\{\{\s*apiUrl\s*\}\}/g, qaApiBase() + '/qa-criteria')
    .replace(/\{\{\s*token\s*\}\}/g, token);

  var byGroup = {};
  items.forEach(function(item) {
    (byGroup[String(item.group_id)] = byGroup[String(item.group_id)] || []).push(item);
  });

  var lines = [];
  lines.push(intro.trim());
  lines.push('');
  lines.push('SITE UNDER TEST');
  lines.push('- Client: ' + (site.client_name || 'Unknown'));
  lines.push('- Website: ' + (site.name || '') + ' (' + (site.url || '') + ')');
  lines.push('');
  lines.push('For every criterion decide a status of pass | fail | warning | na. For any');
  lines.push('fail or warning, include a short `detail` (what is wrong) and a `fix` (how to');
  lines.push('resolve it). Omit `detail`/`fix` for pass and na.');
  lines.push('');
  lines.push('CRITERIA (use the numeric id in [brackets]):');
  groups.forEach(function(group) {
    var groupItems = byGroup[String(group.id)] || [];
    if (!groupItems.length) return;
    lines.push('');
    lines.push(group.name);
    groupItems.forEach(function(item) {
      lines.push('  [' + item.id + '] ' + item.text);
    });
  });
  lines.push('');
  lines.push('When finished, push ALL results in a single request:');
  lines.push('');
  lines.push('curl -X POST ' + qaPushEndpoint() + ' \\');
  lines.push('  -H "Authorization: Bearer ' + token + '" \\');
  lines.push('  -H "Content-Type: application/json" \\');
  lines.push('  -d \'{"results":[');
  lines.push('        {"criterionId":"<id>","status":"pass"},');
  lines.push('        {"criterionId":"<id>","status":"fail","detail":"…","fix":"…"}');
  lines.push('      ]}\'');
  lines.push('');
  lines.push('Rules: send each criterion id at most once; status must be pass|fail|warning|na;');
  lines.push('detail+fix are required for fail/warning and ignored for pass/na. The token');
  lines.push('already targets this exact website — do not add a client or website id.');
  return lines.join('\n');
}

async function getQaRunner(websiteId) {
  var site = await websiteRow(websiteId);
  var token = site.qa_push_token_enc ? qaCrypto.decrypt(site.qa_push_token_enc) : '';
  var hasToken = !!token;
  return {
    hasToken: hasToken,
    token: hasToken ? token : null,
    createdAt: site.qa_push_token_created_at || null,
    endpoint: qaPushEndpoint(),
    prompt: hasToken ? await buildQaRunnerPrompt(site, token) : null,
  };
}

async function regenerateQaPushToken(websiteId) {
  await websiteRow(websiteId);
  var token = QA_PUSH_PREFIX + security.randomToken(30);
  await db.query(
    `UPDATE project_websites
        SET qa_push_token_enc = :enc, qa_push_token_hash = :hash, qa_push_token_created_at = UTC_TIMESTAMP()
      WHERE id = :websiteId`,
    { enc: qaCrypto.encrypt(token), hash: security.sha256(token), websiteId: websiteId }
  );
  return getQaRunner(websiteId);
}

async function revokeQaPushToken(websiteId) {
  await websiteRow(websiteId);
  await db.query(
    `UPDATE project_websites
        SET qa_push_token_enc = NULL, qa_push_token_hash = NULL, qa_push_token_created_at = NULL
      WHERE id = :websiteId`,
    { websiteId: websiteId }
  );
  return { hasToken: false, token: null, createdAt: null, endpoint: qaPushEndpoint(), prompt: null };
}

// Resolve the website a QA push token belongs to (used by the public,
// token-authenticated push route). Never leaks which part failed.
async function resolveWebsiteIdByPushToken(token) {
  var value = String(token || '');
  if (value.indexOf(QA_PUSH_PREFIX) !== 0) fail(401, 'QA_TOKEN_INVALID', 'Invalid QA push token.');
  var rows = await db.query(
    'SELECT id FROM project_websites WHERE qa_push_token_hash = :hash LIMIT 1',
    { hash: security.sha256(value) }
  );
  if (!rows[0]) fail(401, 'QA_TOKEN_INVALID', 'Invalid QA push token.');
  return String(rows[0].id);
}

async function cancel(scanId, user, context) {
  var scan = await getScan(scanId);
  if (!['queued', 'running'].includes(scan.status)) fail(409, 'SCAN_NOT_ACTIVE', 'Only active scans can be cancelled.');
  await db.query("UPDATE website_health_scans SET status = 'cancelled', stage = 'cancelled', completed_at = UTC_TIMESTAMP() WHERE id = :id", { id: scanId });
  await activity.logActivity({ userId: user.id, eventType: 'website_health.scan_cancelled', ip: contextValue(context, 'ip'), userAgent: contextValue(context, 'userAgent'), metadata: { scanId: scanId } });
  return getScan(scanId);
}

async function retry(scanId, user, context) {
  var scan = await getScan(scanId);
  if (!['failed', 'cancelled', 'partial'].includes(scan.status)) fail(409, 'SCAN_NOT_RETRYABLE', 'This scan cannot be retried.');
  return createScan(scan.websiteId, { checks: scan.selectedChecks, sitemapUrl: scan.sitemapUrl }, user, context);
}

async function pages(scanId) {
  await getScan(scanId);
  var rows = await db.query('SELECT * FROM website_health_scan_pages WHERE scan_id = :scanId ORDER BY created_at ASC', { scanId: scanId });
  return rows.map(function(row) {
    return { id: row.id, scanId: row.scan_id, url: row.page_url, name: row.page_name, path: row.path, httpStatus: row.http_status, lighthouse: parseJson(row.lighthouse, null), seo: parseJson(row.seo_result, null), design: parseJson(row.design_result, null), forms: parseJson(row.forms_result, []), evidence: parseJson(row.evidence, null) };
  });
}

async function updateFinding(findingId, input, user) {
  var status = ['open', 'addressed', 'ignored'].includes(input.status) ? input.status : null;
  if (!status) fail(400, 'FINDING_STATUS_INVALID', 'Finding status is invalid.');
  var result = await db.query(
    `UPDATE website_health_findings SET resolution_status = :status, resolution_note = :note,
       resolved_by = :userId, resolved_at = CASE WHEN :status = 'open' THEN NULL ELSE UTC_TIMESTAMP() END
     WHERE id = :id`,
    { id: findingId, status: status, note: String(input.note || '').trim() || null, userId: status === 'open' ? null : user.id }
  );
  if (!result.affectedRows) fail(404, 'FINDING_NOT_FOUND', 'Finding not found.');
  return { id: findingId, status: status, note: String(input.note || '').trim() || null };
}

async function getProfile(websiteId) {
  var details = await getLatest(websiteId);
  return details.profile;
}

async function updateProfile(websiteId, input) {
  await websiteRow(websiteId);
  var maxPages = Math.min(100, Math.max(1, Number(input.maxPages) || 25));
  var stalenessDays = input.contentStalenessDays == null || input.contentStalenessDays === ''
    ? null
    : Math.min(3650, Math.max(1, Number(input.contentStalenessDays) || DEFAULT_CONTENT_STALENESS_DAYS));
  await db.query(
    `INSERT INTO website_health_profiles
       (website_id, approved_identity, essential_plugins, form_test_policy, max_pages, figma_comparison_enabled, content_staleness_days)
     VALUES (:websiteId, :identity, :plugins, :forms, :maxPages, 0, :staleness)
     ON DUPLICATE KEY UPDATE approved_identity = VALUES(approved_identity), essential_plugins = VALUES(essential_plugins),
       form_test_policy = VALUES(form_test_policy), max_pages = VALUES(max_pages), figma_comparison_enabled = 0,
       content_staleness_days = VALUES(content_staleness_days)`,
    { websiteId: websiteId, identity: JSON.stringify(input.approvedIdentity || {}), plugins: JSON.stringify(input.essentialPlugins || []), forms: JSON.stringify(input.formTestPolicy || { mode: 'detect_only', allowedForms: [] }), maxPages: maxPages, staleness: stalenessDays }
  );
  return getProfile(websiteId);
}

async function report(scanId) {
  var scanRows = await db.query('SELECT * FROM website_health_scans WHERE id = :id LIMIT 1', { id: scanId });
  if (!scanRows[0]) fail(404, 'SCAN_NOT_FOUND', 'Scan not found.');
  var scan = scanRows[0];
  return { generatedAt: new Date().toISOString(), scan: mapScan(scan), audit: parseJson(scan.site_result, null), pages: await pages(scanId) };
}

// ---------- manual forms test verification (evidence-backed sign-off) ----------
function mapVerification(row) {
  return {
    formKey: row.form_key,
    status: row.status,
    note: row.note || '',
    screenshots: parseJson(row.screenshots, []),
    formSignature: row.form_signature || null,
    testedByName: row.tested_by_name || null,
    testedAt: row.tested_at,
  };
}

async function listFormVerifications(websiteId) {
  await websiteRow(websiteId);
  var rows = await db.query(
    'SELECT * FROM website_form_verifications WHERE website_id = :websiteId',
    { websiteId: websiteId }
  );
  return rows.map(mapVerification);
}

async function saveFormVerification(websiteId, formKey, input, user) {
  await websiteRow(websiteId);
  var key = String(formKey || '').slice(0, 191);
  if (!key) fail(400, 'VALIDATION_ERROR', 'A form key is required.');
  var status = ['passed', 'failed'].indexOf(input.status) !== -1 ? input.status : null;
  if (!status) fail(400, 'VALIDATION_ERROR', 'Status must be "passed" or "failed".');
  var screenshots = Array.isArray(input.screenshots) ? input.screenshots.slice(0, 12) : [];

  await db.query(
    `INSERT INTO website_form_verifications
       (website_id, form_key, status, note, screenshots, form_signature, tested_by, tested_by_name, tested_at)
     VALUES
       (:websiteId, :formKey, :status, :note, :screenshots, :signature, :userId, :userName, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       status = VALUES(status), note = VALUES(note), screenshots = VALUES(screenshots),
       form_signature = VALUES(form_signature), tested_by = VALUES(tested_by),
       tested_by_name = VALUES(tested_by_name), tested_at = UTC_TIMESTAMP()`,
    {
      websiteId: websiteId,
      formKey: key,
      status: status,
      note: input.note != null ? String(input.note).slice(0, 2000) : null,
      screenshots: JSON.stringify(screenshots),
      signature: input.formSignature ? String(input.formSignature).slice(0, 64) : null,
      userId: user.id,
      userName: user.name,
    }
  );

  var rows = await db.query(
    'SELECT * FROM website_form_verifications WHERE website_id = :websiteId AND form_key = :formKey LIMIT 1',
    { websiteId: websiteId, formKey: key }
  );
  return mapVerification(rows[0]);
}

async function deleteFormVerification(websiteId, formKey) {
  await db.query(
    'DELETE FROM website_form_verifications WHERE website_id = :websiteId AND form_key = :formKey',
    { websiteId: websiteId, formKey: String(formKey || '') }
  );
  return { deleted: true };
}

// ---------- manual Design QA sign-off (per page, evidence-backed) ----------
function mapDesignVerification(row) {
  return {
    pageKey: row.page_key,
    status: row.status,
    note: row.note || '',
    screenshots: parseJson(row.screenshots, []),
    designSignature: row.design_signature || null,
    testedByName: row.tested_by_name || null,
    testedAt: row.tested_at,
  };
}

async function listDesignVerifications(websiteId) {
  await websiteRow(websiteId);
  var rows = await db.query(
    'SELECT * FROM website_design_verifications WHERE website_id = :websiteId',
    { websiteId: websiteId }
  );
  return rows.map(mapDesignVerification);
}

async function saveDesignVerification(websiteId, pageKey, input, user) {
  await websiteRow(websiteId);
  var key = String(pageKey || '').slice(0, 191);
  if (!key) fail(400, 'VALIDATION_ERROR', 'A page key is required.');
  var status = ['approved', 'rejected'].indexOf(input.status) !== -1 ? input.status : null;
  if (!status) fail(400, 'VALIDATION_ERROR', 'Status must be "approved" or "rejected".');
  var screenshots = Array.isArray(input.screenshots) ? input.screenshots.slice(0, 12) : [];

  await db.query(
    `INSERT INTO website_design_verifications
       (website_id, page_key, status, note, screenshots, design_signature, tested_by, tested_by_name, tested_at)
     VALUES
       (:websiteId, :pageKey, :status, :note, :screenshots, :signature, :userId, :userName, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       status = VALUES(status), note = VALUES(note), screenshots = VALUES(screenshots),
       design_signature = VALUES(design_signature), tested_by = VALUES(tested_by),
       tested_by_name = VALUES(tested_by_name), tested_at = UTC_TIMESTAMP()`,
    {
      websiteId: websiteId,
      pageKey: key,
      status: status,
      note: input.note != null ? String(input.note).slice(0, 2000) : null,
      screenshots: JSON.stringify(screenshots),
      signature: input.designSignature ? String(input.designSignature).slice(0, 64) : null,
      userId: user.id,
      userName: user.name,
    }
  );

  var rows = await db.query(
    'SELECT * FROM website_design_verifications WHERE website_id = :websiteId AND page_key = :pageKey LIMIT 1',
    { websiteId: websiteId, pageKey: key }
  );
  return mapDesignVerification(rows[0]);
}

async function deleteDesignVerification(websiteId, pageKey) {
  await db.query(
    'DELETE FROM website_design_verifications WHERE website_id = :websiteId AND page_key = :pageKey',
    { websiteId: websiteId, pageKey: String(pageKey || '') }
  );
  return { deleted: true };
}

module.exports = { list: list, getLatest: getLatest, history: history, createScan: createScan, getScan: getScan, cancel: cancel, retry: retry, pages: pages, updateFinding: updateFinding, getProfile: getProfile, updateProfile: updateProfile, report: report, websiteRow: websiteRow, resetWebsite: resetWebsite, getQaResults: getQaResults, submitQaResults: submitQaResults, resetQaResults: resetQaResults, getQaRunner: getQaRunner, regenerateQaPushToken: regenerateQaPushToken, revokeQaPushToken: revokeQaPushToken, resolveWebsiteIdByPushToken: resolveWebsiteIdByPushToken, parseJson: parseJson, capabilities: capabilities, listFormVerifications: listFormVerifications, saveFormVerification: saveFormVerification, deleteFormVerification: deleteFormVerification, listDesignVerifications: listDesignVerifications, saveDesignVerification: saveDesignVerification, deleteDesignVerification: deleteDesignVerification, DEFAULT_ESSENTIAL_PLUGINS: DEFAULT_ESSENTIAL_PLUGINS, DEFAULT_CONTENT_STALENESS_DAYS: DEFAULT_CONTENT_STALENESS_DAYS };
