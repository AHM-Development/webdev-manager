var db = require('../../db/pool');
var env = require('../../config/env');
var security = require('../../lib/security');
var activity = require('../auth/activity.service');
var checklists = require('./checklist.service');
var urlSecurity = require('./url-security');

var ALL_CHECKS = ['lighthouse', 'technical_seo', 'design_qa', 'website_checklists', 'security'];

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
  if (check === 'website_checklists' || check === 'security') return website.connector_status === 'connected';
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
       hp.figma_comparison_enabled, hp.sitemap_url, hp.default_checks,
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
  var offset = (page - 1) * pageSize;
  var params = { q: '%' + q + '%' };
  var where = q ? 'AND (p.client_name LIKE :q OR pw.name LIKE :q OR pw.url LIKE :q)' : '';
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
  if (!value) return null;
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
  await db.query(
    `INSERT INTO website_health_profiles
       (website_id, approved_identity, essential_plugins, form_test_policy, max_pages, figma_comparison_enabled)
     VALUES (:websiteId, :identity, :plugins, :forms, :maxPages, 0)
     ON DUPLICATE KEY UPDATE approved_identity = VALUES(approved_identity), essential_plugins = VALUES(essential_plugins),
       form_test_policy = VALUES(form_test_policy), max_pages = VALUES(max_pages), figma_comparison_enabled = 0`,
    { websiteId: websiteId, identity: JSON.stringify(input.approvedIdentity || {}), plugins: JSON.stringify(input.essentialPlugins || []), forms: JSON.stringify(input.formTestPolicy || { mode: 'detect_only', allowedForms: [] }), maxPages: maxPages }
  );
  return getProfile(websiteId);
}

async function report(scanId) {
  var scanRows = await db.query('SELECT * FROM website_health_scans WHERE id = :id LIMIT 1', { id: scanId });
  if (!scanRows[0]) fail(404, 'SCAN_NOT_FOUND', 'Scan not found.');
  var scan = scanRows[0];
  return { generatedAt: new Date().toISOString(), scan: mapScan(scan), audit: parseJson(scan.site_result, null), pages: await pages(scanId) };
}

module.exports = { list: list, getLatest: getLatest, history: history, createScan: createScan, getScan: getScan, cancel: cancel, retry: retry, pages: pages, updateFinding: updateFinding, getProfile: getProfile, updateProfile: updateProfile, report: report, websiteRow: websiteRow, parseJson: parseJson, capabilities: capabilities };
