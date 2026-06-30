var env = require('../../config/env');

function emptyResult(reason) {
  return { status: 'not_run', reason: reason, mobile: null, desktop: null };
}

function auditValue(audits, key, field) {
  var audit = audits && audits[key];
  return audit && audit[field || 'numericValue'] != null ? audit[field || 'numericValue'] : null;
}

function normalize(body) {
  var result = body.lighthouseResult || {};
  var categories = result.categories || {};
  var audits = result.audits || {};
  function score(key) {
    return categories[key] && categories[key].score != null
      ? Math.round(categories[key].score * 100)
      : null;
  }
  return {
    fetchedAt: result.fetchTime || new Date().toISOString(),
    finalUrl: result.finalUrl || result.requestedUrl || null,
    version: result.lighthouseVersion || null,
    scores: {
      performance: score('performance'),
      accessibility: score('accessibility'),
      bestPractices: score('best-practices'),
      seo: score('seo'),
    },
    metrics: {
      lcpMs: auditValue(audits, 'largest-contentful-paint'),
      cls: auditValue(audits, 'cumulative-layout-shift'),
      tbtMs: auditValue(audits, 'total-blocking-time'),
      fcpMs: auditValue(audits, 'first-contentful-paint'),
      speedIndexMs: auditValue(audits, 'speed-index'),
      interactiveMs: auditValue(audits, 'interactive'),
    },
    warnings: result.runWarnings || [],
    runtimeError: result.runtimeError || null,
  };
}

async function runStrategy(url, strategy) {
  var endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', strategy);
  ['performance', 'accessibility', 'best-practices', 'seo'].forEach(function(category) {
    endpoint.searchParams.append('category', category);
  });
  endpoint.searchParams.set('key', env.websiteHealth.pageSpeedApiKey);
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, env.websiteHealth.pageTimeoutMs * 2);
  try {
    var response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) {
      var text = await response.text();
      throw new Error('PageSpeed ' + strategy + ' failed (' + response.status + '): ' + text.slice(0, 300));
    }
    return normalize(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

async function run(url) {
  if (!env.websiteHealth.pageSpeedApiKey) return emptyResult('PAGESPEED_API_KEY is not configured.');
  var results = await Promise.allSettled([runStrategy(url, 'mobile'), runStrategy(url, 'desktop')]);
  return {
    status: results.every(function(item) { return item.status === 'fulfilled'; }) ? 'completed' : 'partial',
    mobile: results[0].status === 'fulfilled' ? results[0].value : null,
    desktop: results[1].status === 'fulfilled' ? results[1].value : null,
    errors: results.filter(function(item) { return item.status === 'rejected'; }).map(function(item) {
      return item.reason && item.reason.message ? item.reason.message : 'PageSpeed failed.';
    }),
  };
}

module.exports = { run: run };
