'use strict';

// Security response-header checks are site-wide: they must be emitted ONCE per
// scan (via securityHeaders), never per crawled page (via deterministic) — that
// per-page emission was duplicating the same 5 warnings once per page.

const test = require('node:test');
const assert = require('node:assert');
const review = require('./review.service');

const HEADER_IDS = [
  'security.hsts',
  'security.csp',
  'security.content-type-options',
  'security.referrer-policy',
  'security.frame-protection',
];

const bareHttpsPage = {
  url: 'https://example.com/',
  headers: {}, // no hardening headers captured
  core: { images: [], links: [], forms: [] },
};

test('deterministic() no longer emits any site-wide security header findings', () => {
  const ids = review.deterministic(bareHttpsPage).map((f) => f.checkId);
  for (const id of HEADER_IDS) {
    assert.ok(!ids.includes(id), `deterministic must not emit ${id} (it is site-wide, run once)`);
  }
});

test('securityHeaders() emits each missing header exactly once', () => {
  const ids = review.securityHeaders(bareHttpsPage).map((f) => f.checkId);
  for (const id of HEADER_IDS) {
    assert.equal(ids.filter((x) => x === id).length, 1, `${id} appears exactly once`);
  }
});

test('securityHeaders() stays quiet when the headers are present', () => {
  const hardened = {
    url: 'https://example.com/',
    headers: {
      'strict-transport-security': 'max-age=63072000',
      'content-security-policy': "default-src 'self'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'SAMEORIGIN',
    },
  };
  assert.deepEqual(review.securityHeaders(hardened), []);
});
