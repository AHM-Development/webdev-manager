var fs = require('fs');
var path = require('path');
var cheerio = require('cheerio');
var { chromium } = require('playwright');

var env = require('../../config/env');
var security = require('./url-security');

var VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 1000 },
};

function sameOrigin(left, right) {
  try { return new URL(left).origin === new URL(right).origin; } catch (err) { return false; }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function sitemapLocations(url) {
  var response = await security.safeFetch(url, {
    headers: { 'user-agent': 'AHM-Website-Health/1.0' },
    signal: AbortSignal.timeout(env.websiteHealth.pageTimeoutMs),
  });
  if (!response.ok) return [];
  var text = await response.text();
  var $ = cheerio.load(text, { xmlMode: true });
  return $('loc').map(function() { return $(this).text().trim(); }).get();
}

async function discoverPages(siteUrl, limit, sitemapUrl) {
  var root = new URL(siteUrl);
  // An explicitly provided sitemap is authoritative and tried first.
  var candidates = (sitemapUrl ? [String(sitemapUrl)] : []).concat([
    new URL('/sitemap_index.xml', root).toString(),
    new URL('/sitemap.xml', root).toString(),
  ]);
  var pages = [];
  for (var i = 0; i < candidates.length && !pages.length; i += 1) {
    try {
      var locations = await sitemapLocations(candidates[i]);
      var nested = locations.filter(function(item) { return /\.xml(?:\?|$)/i.test(item); }).slice(0, 12);
      if (nested.length && locations.every(function(item) { return /\.xml(?:\?|$)/i.test(item); })) {
        for (var n = 0; n < nested.length && pages.length < limit; n += 1) {
          try { pages.push.apply(pages, await sitemapLocations(nested[n])); } catch (err) {}
        }
      } else {
        pages = locations;
      }
    } catch (err) {}
  }
  pages = unique(pages).filter(function(item) { return sameOrigin(item, siteUrl); });
  return (pages.length ? pages : [siteUrl]).slice(0, limit);
}

function screenshotDirectory(scanId) {
  var directory = path.resolve(__dirname, '../../public/health-scans', scanId);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function slug(value) {
  return String(value).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'page';
}

async function scanPage(browser, scanId, pageUrl, pageIndex) {
  await security.assertSafeUrl(pageUrl);
  var context = await browser.newContext({
    ignoreHTTPSErrors: false,
    userAgent: 'AHM-Website-Health/1.0',
  });
  var checkedHosts = new Map();
  await context.route('**/*', async function(route) {
    var requestUrl = route.request().url();
    if (!/^https?:/i.test(requestUrl)) return route.continue();
    var host;
    try { host = new URL(requestUrl).hostname; } catch (err) { return route.abort(); }
    if (!checkedHosts.has(host)) {
      checkedHosts.set(host, security.assertSafeUrl(requestUrl).then(function() { return true; }).catch(function() { return false; }));
    }
    return (await checkedHosts.get(host)) ? route.continue() : route.abort('blockedbyclient');
  });

  var page = await context.newPage();
  var consoleErrors = [];
  var networkErrors = [];
  page.on('console', function(message) {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
  });
  page.on('requestfailed', function(request) {
    networkErrors.push({ url: request.url(), error: request.failure() && request.failure().errorText });
  });
  // Capture per-image transfer size + content-type for the SEO image checks
  // (independent of Lighthouse). Header-based only — no body reads.
  var imageResponses = new Map();
  page.on('response', function(resp) {
    try {
      if (resp.request().resourceType() !== 'image') return;
      var responseHeaders = resp.headers() || {};
      var length = Number(responseHeaders['content-length']);
      imageResponses.set(resp.url(), {
        bytes: Number.isFinite(length) && length > 0 ? length : null,
        contentType: responseHeaders['content-type'] || null,
      });
    } catch (err) { /* ignore per-response errors */ }
  });

  var response = await page.goto(pageUrl, {
    waitUntil: 'networkidle',
    timeout: env.websiteHealth.pageTimeoutMs,
  });
  var finalUrl = page.url();
  await security.assertSafeUrl(finalUrl);
  var headers = response ? await response.allHeaders() : {};
  var httpStatus = response ? response.status() : null;
  var core = await page.evaluate(function() {
    function attr(selector, name) {
      var element = document.querySelector(selector);
      return element ? element.getAttribute(name) || '' : '';
    }
    function text(selector) {
      var element = document.querySelector(selector);
      return element ? (element.textContent || '').trim() : '';
    }
    var images = Array.from(document.images).slice(0, 250).map(function(image) {
      return {
        src: image.currentSrc || image.src,
        alt: image.getAttribute('alt'),
        width: image.naturalWidth,
        height: image.naturalHeight,
        declaredWidth: image.getAttribute('width'),
        declaredHeight: image.getAttribute('height'),
        complete: image.complete,
        renderedWidth: Math.round(image.getBoundingClientRect().width),
      };
    });
    var links = Array.from(document.querySelectorAll('a[href]')).slice(0, 500).map(function(link) {
      return { href: link.href, text: (link.textContent || '').trim().slice(0, 160), target: link.target, rel: link.rel };
    });
    var forms = Array.from(document.forms).map(function(form, index) {
      var fields = Array.from(form.elements).filter(function(field) { return field.name || field.id; }).map(function(field) {
        return {
          name: field.name || field.id,
          type: field.type || field.tagName.toLowerCase(),
          required: !!field.required,
          label: field.labels && field.labels[0] ? (field.labels[0].textContent || '').trim() : field.getAttribute('aria-label') || '',
        };
      });
      return {
        index: index,
        id: form.id || null,
        action: form.action || location.href,
        method: (form.method || 'get').toUpperCase(),
        fields: fields,
        captcha: !!form.querySelector('[class*="captcha"], [id*="captcha"], [name="cf-turnstile-response"], [name="h-captcha-response"], [name="g-recaptcha-response"]'),
      };
    });
    var schemas = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(function(node) {
      try { return JSON.parse(node.textContent || '{}'); } catch (err) { return { parseError: true, source: (node.textContent || '').slice(0, 500) }; }
    });
    return {
      title: document.title,
      description: attr('meta[name="description"]', 'content'),
      canonical: attr('link[rel="canonical"]', 'href'),
      robots: attr('meta[name="robots"]', 'content'),
      language: document.documentElement.lang,
      h1: Array.from(document.querySelectorAll('h1')).map(function(node) { return (node.textContent || '').trim(); }),
      headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(0, 200).map(function(node) { return { level: Number(node.tagName.slice(1)), text: (node.textContent || '').trim() }; }),
      openGraph: { title: attr('meta[property="og:title"]', 'content'), description: attr('meta[property="og:description"]', 'content'), image: attr('meta[property="og:image"]', 'content'), url: attr('meta[property="og:url"]', 'content'), type: attr('meta[property="og:type"]', 'content') },
      twitter: { card: attr('meta[name="twitter:card"]', 'content'), title: attr('meta[name="twitter:title"]', 'content'), description: attr('meta[name="twitter:description"]', 'content'), image: attr('meta[name="twitter:image"]', 'content') },
      bodyText: text('body').replace(/\s+/g, ' ').slice(0, 20000),
      images: images,
      links: links,
      forms: forms,
      schemas: schemas,
    };
  });

  var layouts = {};
  var directory = screenshotDirectory(scanId);
  for (var viewportName of Object.keys(VIEWPORTS)) {
    var viewport = VIEWPORTS[viewportName];
    await page.setViewportSize(viewport);
    await page.waitForTimeout(350);
    var layout = await page.evaluate(function() {
      var vw = innerWidth;
      var interactive = { A: 1, BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1 };
      var textTags = { P: 1, SPAN: 1, LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, A: 1 };
      var candidates = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,button,input,select,textarea,img,span,li')).slice(0, 700);
      var clipped = [];
      var fonts = {};
      var offViewport = [];
      var smallText = [];
      var tinyTapTargets = [];
      var boxes = [];
      function shortText(element) {
        return (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 80);
      }
      candidates.forEach(function(element) {
        var rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        var style = getComputedStyle(element);
        fonts[style.fontFamily || 'unknown'] = (fonts[style.fontFamily || 'unknown'] || 0) + 1;
        if (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2) {
          clipped.push({ tag: element.tagName, text: shortText(element) });
        }
        if (rect.right > vw + 3) {
          offViewport.push({ tag: element.tagName, text: shortText(element), overflowPx: Math.round(rect.right - vw) });
        }
        var fontSize = parseFloat(style.fontSize) || 0;
        if (textTags[element.tagName] && (element.textContent || '').trim() && fontSize > 0 && fontSize < 12) {
          smallText.push({ tag: element.tagName, size: Math.round(fontSize), text: shortText(element) });
        }
        if (interactive[element.tagName] && Math.min(rect.width, rect.height) < 40) {
          tinyTapTargets.push({ tag: element.tagName, size: Math.round(Math.min(rect.width, rect.height)), text: shortText(element) });
        }
        if (interactive[element.tagName] || textTags[element.tagName]) {
          boxes.push({ el: element, rect: rect });
        }
      });
      var overlaps = [];
      var pool = boxes.slice(0, 200);
      for (var i = 0; i < pool.length && overlaps.length < 15; i += 1) {
        for (var j = i + 1; j < pool.length && overlaps.length < 15; j += 1) {
          var a = pool[i], b = pool[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          var ix = Math.max(0, Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left));
          var iy = Math.max(0, Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top));
          var overlapArea = ix * iy;
          var minArea = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
          if (overlapArea > 0 && minArea > 0 && overlapArea / minArea > 0.35) {
            overlaps.push({ a: shortText(a.el) || a.el.tagName, b: shortText(b.el) || b.el.tagName });
          }
        }
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
        clippedElements: clipped.slice(0, 30),
        fontFamilies: fonts,
        brokenImages: Array.from(document.images).filter(function(image) { return image.complete && image.naturalWidth === 0; }).map(function(image) { return image.src; }).slice(0, 30),
        overlaps: overlaps,
        offViewport: offViewport.slice(0, 20),
        smallText: smallText.slice(0, 20),
        tinyTapTargets: tinyTapTargets.slice(0, 20),
      };
    });
    var fileName = String(pageIndex + 1) + '-' + slug(new URL(finalUrl).pathname) + '-' + viewportName + '.png';
    await page.screenshot({ path: path.join(directory, fileName), fullPage: true });
    layout.screenshot = '/health-scans/' + scanId + '/' + fileName;
    layouts[viewportName] = layout;
  }

  (core.images || []).forEach(function(image) {
    var meta = imageResponses.get(image.src);
    if (meta) {
      image.bytes = meta.bytes;
      image.contentType = meta.contentType;
    }
  });

  // Page-level design-token census (runs once, at the final/desktop viewport)
  // for the deterministic design-consistency checks.
  var designTokens = await page.evaluate(function() {
    var fontSizes = {}, fontFamilies = {}, textColors = {}, backgroundColors = {}, borderRadii = {};
    function bump(map, key) { if (key) map[key] = (map[key] || 0) + 1; }
    Array.from(document.querySelectorAll('*')).slice(0, 3000).forEach(function(element) {
      var rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      var style = getComputedStyle(element);
      var hasText = false;
      for (var n = 0; n < element.childNodes.length; n += 1) {
        if (element.childNodes[n].nodeType === 3 && element.childNodes[n].textContent.trim()) { hasText = true; break; }
      }
      if (hasText) {
        bump(fontSizes, Math.round(parseFloat(style.fontSize) || 0) + 'px');
        bump(fontFamilies, String(style.fontFamily || '').split(',')[0].replace(/["']/g, '').trim());
        bump(textColors, style.color);
      }
      if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
        bump(backgroundColors, style.backgroundColor);
      }
      if (style.borderRadius && style.borderRadius !== '0px') bump(borderRadii, style.borderRadius);
    });
    var buttons = Array.from(document.querySelectorAll('button, .btn, [role="button"], a.button')).slice(0, 40).map(function(button) {
      var style = getComputedStyle(button);
      return { padding: style.padding, borderRadius: style.borderRadius, fontSize: style.fontSize, background: style.backgroundColor };
    });
    return { fontSizes: fontSizes, fontFamilies: fontFamilies, textColors: textColors, backgroundColors: backgroundColors, borderRadii: borderRadii, buttons: buttons };
  });

  await context.close();
  return {
    url: finalUrl,
    requestedUrl: pageUrl,
    name: core.h1[0] || core.title || new URL(finalUrl).pathname || 'Home',
    path: new URL(finalUrl).pathname || '/',
    httpStatus: httpStatus,
    headers: headers,
    core: core,
    layouts: layouts,
    designTokens: designTokens,
    consoleErrors: unique(consoleErrors).slice(0, 50),
    networkErrors: networkErrors.slice(0, 50),
    internalLinks: unique(core.links.filter(function(link) { return sameOrigin(link.href, finalUrl); }).map(function(link) { return link.href.split('#')[0]; })),
  };
}

async function scanWebsite(scanId, siteUrl, maxPages, onPage, sitemapUrl) {
  var browser = await chromium.launch({ headless: true });
  try {
    var queue = await discoverPages(siteUrl, maxPages, sitemapUrl);
    var results = [];
    var seen = new Set();
    while (queue.length && results.length < maxPages) {
      var pageUrl = queue.shift();
      if (seen.has(pageUrl)) continue;
      seen.add(pageUrl);
      try {
        var result = await scanPage(browser, scanId, pageUrl, results.length);
        results.push(result);
        result.internalLinks.forEach(function(link) {
          if (!seen.has(link) && queue.length + results.length < maxPages * 3) queue.push(link);
        });
        if (onPage) await onPage(result, results.length, maxPages);
      } catch (err) {
        results.push({ url: pageUrl, requestedUrl: pageUrl, name: pageUrl, path: new URL(pageUrl).pathname, httpStatus: null, error: err.message, core: {}, layouts: {}, consoleErrors: [], networkErrors: [], internalLinks: [] });
        if (onPage) await onPage(results[results.length - 1], results.length, maxPages);
      }
    }
    return results;
  } finally {
    await browser.close();
  }
}

module.exports = { discoverPages: discoverPages, scanWebsite: scanWebsite };
