// Site-level Technical SEO checks — run once per scan, independent of
// Lighthouse and the connector. Uses the SSRF-safe fetch + the crawl's links.
var cheerio = require('cheerio');

var env = require('../../config/env');
var urlSecurity = require('./url-security');

var BROKEN_LINK_CAP = 150;
var LINK_CONCURRENCY = 5;

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

function timeoutSignal() {
  return AbortSignal.timeout(env.websiteHealth.pageTimeoutMs || 20000);
}

async function fetchSafe(url, method) {
  try {
    var response = await urlSecurity.safeFetch(url, {
      method: method || 'GET',
      headers: { 'user-agent': 'AHM-Website-Health/1.0' },
      signal: timeoutSignal(),
    });
    return { ok: response.ok, status: response.status, response: response };
  } catch (err) {
    return { ok: false, status: null, error: err && err.message ? err.message : 'request failed' };
  }
}

/** True when robots.txt disallows the whole site for all user-agents. */
function robotsBlocksEverything(text) {
  var appliesToAll = false;
  var blocked = false;
  String(text || '').split(/\r?\n/).forEach(function(rawLine) {
    var line = rawLine.replace(/#.*/, '').trim();
    if (!line) return;
    var agent = line.match(/^user-agent:\s*(.+)$/i);
    if (agent) { appliesToAll = agent[1].trim() === '*'; return; }
    var disallow = line.match(/^disallow:\s*(.*)$/i);
    if (disallow && appliesToAll && disallow[1].trim() === '/') blocked = true;
  });
  return blocked;
}

function collectLinks(pages) {
  var seen = new Map();
  (pages || []).forEach(function(page) {
    var links = (page.core && page.core.links) || [];
    links.forEach(function(link) {
      var href = String(link.href || '');
      if (!/^https?:\/\//i.test(href)) return;
      var clean = href.split('#')[0];
      if (clean && !seen.has(clean)) seen.set(clean, page.url);
    });
  });
  return Array.from(seen.entries()).map(function(entry) { return { url: entry[0], source: entry[1] }; });
}

async function mapLimit(items, limit, worker) {
  var results = [];
  var index = 0;
  async function run() {
    while (index < items.length) {
      var current = index++;
      results[current] = await worker(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function checkLink(item) {
  var result = await fetchSafe(item.url, 'HEAD');
  // Some servers reject HEAD — retry with GET before declaring it broken.
  if (result.status === 405 || result.status === 501 || (!result.ok && result.status == null)) {
    result = await fetchSafe(item.url, 'GET');
  }
  var broken = result.status == null || result.status >= 400;
  return broken ? { url: item.url, source: item.source, status: result.status, error: result.error } : null;
}

function duplicates(pages, field) {
  var groups = new Map();
  (pages || []).forEach(function(page) {
    var value = String((page.core || {})[field] || '').trim().toLowerCase();
    if (!value) return;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(page.url);
  });
  var dupes = [];
  groups.forEach(function(urls, value) {
    if (urls.length > 1) dupes.push({ value: value, urls: urls });
  });
  return dupes;
}

/** Runs the four site-level checks + duplicate title/description detection.
 *  Returns `technical_seo` findings. */
async function siteChecks(options) {
  var websiteUrl = options.websiteUrl;
  var sitemapUrl = options.sitemapUrl;
  var pages = options.pages || [];
  var out = [];

  // Homepage reachable
  var home = await fetchSafe(websiteUrl, 'GET');
  if (!home.ok) {
    out.push(finding('seo.homepage-reachable', 'critical', 'Homepage is not reachable',
      home.status ? 'The homepage returned HTTP ' + home.status + '.' : 'The homepage request failed: ' + (home.error || 'unknown') + '.',
      websiteUrl, 'Ensure the homepage responds with a 200 status.'));
  }

  // robots.txt
  var origin;
  try { origin = new URL(websiteUrl).origin; } catch (err) { origin = null; }
  if (origin) {
    var robots = await fetchSafe(origin + '/robots.txt', 'GET');
    if (!robots.ok) {
      out.push(finding('seo.robots-txt', 'warning', 'robots.txt not found',
        'No reachable robots.txt was found' + (robots.status ? ' (HTTP ' + robots.status + ')' : '') + '.',
        origin + '/robots.txt', 'Publish a robots.txt to guide crawlers.'));
    } else {
      var robotsText = await robots.response.text();
      if (robotsBlocksEverything(robotsText)) {
        out.push(finding('seo.robots-txt', 'critical', 'robots.txt blocks the whole site',
          'A "Disallow: /" rule for all user-agents blocks crawling.', robotsText.slice(0, 300),
          'Remove the site-wide Disallow if the site should be indexed.'));
      }
    }
  }

  // Sitemap reachable + valid
  if (sitemapUrl) {
    var sitemap = await fetchSafe(sitemapUrl, 'GET');
    if (!sitemap.ok) {
      out.push(finding('seo.sitemap', 'warning', 'Sitemap is not reachable',
        'The sitemap URL did not load' + (sitemap.status ? ' (HTTP ' + sitemap.status + ')' : '') + '.',
        sitemapUrl, 'Publish a valid XML sitemap at this URL.'));
    } else {
      var xml = await sitemap.response.text();
      var count = 0;
      try { count = cheerio.load(xml, { xmlMode: true })('loc').length; } catch (err) { count = 0; }
      if (!count) {
        out.push(finding('seo.sitemap', 'warning', 'Sitemap has no URLs',
          'The sitemap returned no <loc> entries or is not valid XML.', sitemapUrl,
          'Ensure the sitemap is valid XML listing the site URLs.'));
      }
    }
  }

  // Broken links (internal + external, unique, capped, throttled)
  var links = collectLinks(pages);
  var truncated = links.length > BROKEN_LINK_CAP;
  var checked = links.slice(0, BROKEN_LINK_CAP);
  var broken = (await mapLimit(checked, LINK_CONCURRENCY, checkLink)).filter(Boolean);
  if (broken.length) {
    var anyInternal = broken.some(function(item) { return urlSecurity.sameRegistrableHost(item.url, websiteUrl); });
    out.push(finding('seo.broken-links', anyInternal ? 'critical' : 'warning',
      broken.length + ' broken link' + (broken.length === 1 ? '' : 's') + ' found',
      'Links returning 4xx/5xx or failing to connect' + (truncated ? ' (checked the first ' + BROKEN_LINK_CAP + ' unique links)' : '') + '.',
      broken.slice(0, 15).map(function(item) { return (item.status || 'ERR') + '  ' + item.url + '  (on ' + item.source + ')'; }).join('\n'),
      'Fix or remove the dead links.'));
  }

  // Duplicate titles / descriptions across the scan
  var dupTitles = duplicates(pages, 'title');
  if (dupTitles.length) {
    out.push(finding('seo.duplicate-title', 'warning', 'Duplicate page titles',
      dupTitles.length + ' title(s) are shared by multiple pages.',
      dupTitles.slice(0, 5).map(function(group) { return '"' + group.value.slice(0, 60) + '" → ' + group.urls.join(', '); }).join('\n'),
      'Give each page a unique, descriptive title.'));
  }
  var dupDescriptions = duplicates(pages, 'description');
  if (dupDescriptions.length) {
    out.push(finding('seo.duplicate-description', 'warning', 'Duplicate meta descriptions',
      dupDescriptions.length + ' description(s) are shared by multiple pages.',
      dupDescriptions.slice(0, 5).map(function(group) { return group.urls.join(', '); }).join('\n'),
      'Write a unique meta description per page.'));
  }

  return out;
}

module.exports = { siteChecks: siteChecks };
