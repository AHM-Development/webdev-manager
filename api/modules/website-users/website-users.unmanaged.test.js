'use strict';

// Tests for the "unmanaged WordPress user" rows that listCredentials appends:
// WP users present in a connected site's snapshot but with no matching
// credential yet. Only the db pool is mocked; SQL is routed by pattern.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../../db/pool.js');

let realCredentials = []; // rows for the main credential list query
let sites = []; // wordpress_connections rows (with snapshot)
let coverageRows = []; // {website_id, username} of existing credentials
const calls = [];

function inject(filename, exports) {
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
inject(dbPath, {
  query: async (sql, params) => {
    calls.push({ sql, params });
    if (/SELECT website_id, LOWER\(username\)/.test(sql)) return coverageRows;
    if (/FROM website_credentials wc/.test(sql)) return realCredentials;
    if (/FROM wordpress_connections wpc/.test(sql)) return sites;
    return [];
  },
});

const service = require('./website-users.service');

function reset() {
  calls.length = 0;
  realCredentials = [];
  sites = [];
  coverageRows = [];
}

const SUPERADMIN = { id: 1, role: 'superadmin' };

function siteWithUsers(users) {
  return [{
    website_id: 10,
    website_name: 'Marketing Site',
    website_url: 'https://acme.example',
    project_id: 5,
    client_name: 'Acme',
    snapshot: JSON.stringify({ users: users }),
  }];
}

test('superadmin sees an unmanaged row for a WP user with no matching credential', async () => {
  reset();
  coverageRows = [{ website_id: 10, username: 'alice@acme.example' }];
  sites = siteWithUsers([
    { id: '1', name: 'Alice', email: 'alice@acme.example', role: 'administrator' },
    { id: '2', name: 'Bob', email: 'bob@acme.example', role: 'editor' },
  ]);

  const rows = await service.listCredentials({}, SUPERADMIN);
  const unmanaged = rows.filter((r) => r.unmanaged);
  assert.equal(unmanaged.length, 1, 'only the uncovered WP user is surfaced');
  const bob = unmanaged[0];
  assert.equal(bob.name, 'Bob');
  assert.equal(bob.username, 'bob@acme.example');
  assert.equal(bob.websiteId, '10');
  assert.equal(bob.projectId, '5');
  assert.equal(bob.wpRole, 'editor');
  assert.equal(bob.environment, 'Live');
});

test('email match is case-insensitive when detecting coverage', async () => {
  reset();
  coverageRows = [{ website_id: 10, username: 'alice@acme.example' }];
  sites = siteWithUsers([
    { id: '1', name: 'Alice', email: 'ALICE@ACME.EXAMPLE', role: 'administrator' },
  ]);

  const rows = await service.listCredentials({}, SUPERADMIN);
  assert.equal(rows.filter((r) => r.unmanaged).length, 0, 'covered despite different case');
});

test('non-superadmins never see unmanaged rows', async () => {
  reset();
  sites = siteWithUsers([{ id: '1', name: 'Bob', email: 'bob@acme.example', role: 'editor' }]);

  const rows = await service.listCredentials({}, { id: 2, role: 'developer' });
  assert.equal(rows.filter((r) => r.unmanaged).length, 0);
  // And it shouldn't even query the WP connections for them.
  assert.ok(!calls.some((c) => /FROM wordpress_connections wpc/.test(c.sql)));
});

test('a Staging-only filter hides unmanaged (Live-site) rows', async () => {
  reset();
  sites = siteWithUsers([{ id: '1', name: 'Bob', email: 'bob@acme.example', role: 'editor' }]);

  const rows = await service.listCredentials({ environment: 'Staging' }, SUPERADMIN);
  assert.equal(rows.filter((r) => r.unmanaged).length, 0);
});

test('the search query filters unmanaged rows by name/email/role/site', async () => {
  reset();
  sites = siteWithUsers([
    { id: '1', name: 'Bob', email: 'bob@acme.example', role: 'editor' },
    { id: '2', name: 'Carol', email: 'carol@acme.example', role: 'author' },
  ]);

  const rows = await service.listCredentials({ q: 'carol' }, SUPERADMIN);
  const unmanaged = rows.filter((r) => r.unmanaged);
  assert.equal(unmanaged.length, 1);
  assert.equal(unmanaged[0].name, 'Carol');
});

test('WP users with no email are surfaced (cannot be email-matched)', async () => {
  reset();
  sites = siteWithUsers([{ id: '9', name: 'No Email User', email: '', role: 'subscriber' }]);

  const rows = await service.listCredentials({}, SUPERADMIN);
  const unmanaged = rows.filter((r) => r.unmanaged);
  assert.equal(unmanaged.length, 1);
  assert.equal(unmanaged[0].name, 'No Email User');
  assert.equal(unmanaged[0].username, '');
});
