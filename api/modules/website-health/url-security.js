var dns = require('dns').promises;
var net = require('net');

function requestError(message, code) {
  var err = new Error(message);
  err.status = 400;
  err.code = code || 'SCAN_URL_REJECTED';
  return err;
}

function privateIpv4(ip) {
  var parts = ip.split('.').map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] >= 224
  );
}

function privateIpv6(ip) {
  var value = ip.toLowerCase();
  return (
    value === '::' ||
    value === '::1' ||
    value.indexOf('fc') === 0 ||
    value.indexOf('fd') === 0 ||
    /^fe[89ab]/.test(value) ||
    value.indexOf('::ffff:127.') === 0 ||
    value.indexOf('::ffff:10.') === 0 ||
    value.indexOf('::ffff:192.168.') === 0
  );
}

function isPrivateAddress(address) {
  var family = net.isIP(address);
  return family === 4 ? privateIpv4(address) : family === 6 ? privateIpv6(address) : true;
}

async function assertSafeUrl(value) {
  var url;
  try {
    url = new URL(value);
  } catch (err) {
    throw requestError('The scan target is not a valid URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw requestError('Only HTTP and HTTPS scan targets are allowed.');
  }
  if (url.username || url.password) throw requestError('Scan target credentials are not allowed in URLs.');
  var hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal'
  ) {
    throw requestError('Private network scan targets are not allowed.');
  }
  var addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (err) {
    throw requestError('The scan target hostname could not be resolved.', 'SCAN_DNS_FAILED');
  }
  if (!addresses.length || addresses.some(function(item) { return isPrivateAddress(item.address); })) {
    throw requestError('Private or reserved network scan targets are not allowed.');
  }
  return url;
}

async function safeFetch(value, options) {
  var current = String(value);
  var redirects = 0;
  while (redirects <= 5) {
    await assertSafeUrl(current);
    var response = await fetch(current, Object.assign({}, options || {}, { redirect: 'manual' }));
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    var location = response.headers.get('location');
    if (!location) return response;
    current = new URL(location, current).toString();
    redirects += 1;
  }
  throw requestError('The scan target exceeded the redirect limit.', 'SCAN_REDIRECT_LIMIT');
}

/** True when two URLs share the same host, ignoring a leading "www." so a
 *  sitemap at www.example.com matches a site recorded as example.com. */
function sameRegistrableHost(a, b) {
  function host(value) {
    try {
      return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    } catch (err) {
      return null;
    }
  }
  var left = host(a);
  var right = host(b);
  return !!left && !!right && left === right;
}

module.exports = { assertSafeUrl: assertSafeUrl, safeFetch: safeFetch, sameRegistrableHost: sameRegistrableHost };
