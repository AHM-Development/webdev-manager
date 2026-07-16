'use strict';

// Tests for the durable per-form verification records. Only the db pool is
// mocked; SQL is routed by a light pattern match so we can assert on inputs.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../../db/pool.js');

let websiteExists = true;
let storedRow = null; // row returned by the post-write SELECT
const calls = []; // { sql, params }

function inject(filename, exports) {
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
inject(dbPath, {
  query: async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM project_websites/.test(sql)) return websiteExists ? [{ id: params.websiteId }] : [];
    if (/FROM website_form_verifications WHERE website_id = :websiteId AND form_key/.test(sql)) {
      return storedRow ? [storedRow] : [];
    }
    if (/FROM website_form_verifications WHERE website_id = :websiteId$/.test(sql.trim())) {
      return storedRow ? [storedRow] : [];
    }
    if (/FROM website_design_verifications WHERE website_id = :websiteId AND page_key/.test(sql)) {
      return storedRow ? [storedRow] : [];
    }
    if (/FROM website_design_verifications WHERE website_id = :websiteId$/.test(sql.trim())) {
      return storedRow ? [storedRow] : [];
    }
    if (/^\s*SELECT/i.test(sql)) return [];
    return {};
  },
});

const service = require('./website-health.service');

const user = { id: 7, name: 'Dev' };
function reset() { calls.length = 0; websiteExists = true; storedRow = null; }
function lastInsert() { return calls.find((c) => /INSERT INTO website_form_verifications/.test(c.sql)); }

test('saveFormVerification 404s for an unknown website', async () => {
  reset();
  websiteExists = false;
  await assert.rejects(
    service.saveFormVerification('nope', 'form-1', { status: 'passed' }, user),
    (err) => err.status === 404 && err.code === 'WEBSITE_NOT_FOUND'
  );
});

test('saveFormVerification rejects an invalid status', async () => {
  reset();
  await assert.rejects(
    service.saveFormVerification('w1', 'form-1', { status: 'maybe' }, user),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});

test('saveFormVerification requires a form key', async () => {
  reset();
  await assert.rejects(
    service.saveFormVerification('w1', '', { status: 'passed' }, user),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});

test('saveFormVerification caps screenshots at 12 and upserts', async () => {
  reset();
  const screenshots = Array.from({ length: 20 }, (_, i) => ({ id: String(i), url: `/u/${i}.png` }));
  storedRow = { form_key: 'form-1', status: 'passed', note: 'ok', screenshots: JSON.stringify(screenshots.slice(0, 12)), form_signature: 'sig', tested_by_name: 'Dev', tested_at: '2026-07-16T00:00:00Z' };
  const result = await service.saveFormVerification('w1', 'form-1', { status: 'passed', note: 'ok', screenshots, formSignature: 'sig' }, user);
  const insert = lastInsert();
  assert.ok(insert, 'runs an upsert insert');
  assert.equal(JSON.parse(insert.params.screenshots).length, 12, 'screenshots capped at 12');
  assert.match(insert.sql, /ON DUPLICATE KEY UPDATE/);
  assert.equal(result.status, 'passed');
  assert.equal(result.screenshots.length, 12);
});

test('listFormVerifications maps rows through mapVerification', async () => {
  reset();
  storedRow = { form_key: 'form-1', status: 'failed', note: '', screenshots: null, form_signature: null, tested_by_name: 'Dev', tested_at: '2026-07-16T00:00:00Z' };
  const list = await service.listFormVerifications('w1');
  assert.equal(list.length, 1);
  assert.equal(list[0].formKey, 'form-1');
  assert.equal(list[0].status, 'failed');
  assert.deepEqual(list[0].screenshots, []);
});

test('deleteFormVerification issues a scoped DELETE', async () => {
  reset();
  const result = await service.deleteFormVerification('w1', 'form-1');
  assert.deepEqual(result, { deleted: true });
  const del = calls.find((c) => /DELETE FROM website_form_verifications/.test(c.sql));
  assert.ok(del);
  assert.equal(del.params.websiteId, 'w1');
  assert.equal(del.params.formKey, 'form-1');
});

// ---- Design QA sign-off (mirrors forms verification) ----
function lastDesignInsert() { return calls.find((c) => /INSERT INTO website_design_verifications/.test(c.sql)); }

test('saveDesignVerification 404s for an unknown website', async () => {
  reset();
  websiteExists = false;
  await assert.rejects(
    service.saveDesignVerification('nope', '/about', { status: 'approved' }, user),
    (err) => err.status === 404 && err.code === 'WEBSITE_NOT_FOUND'
  );
});

test('saveDesignVerification rejects a status outside approved/rejected', async () => {
  reset();
  await assert.rejects(
    service.saveDesignVerification('w1', '/about', { status: 'passed' }, user),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});

test('saveDesignVerification requires a page key', async () => {
  reset();
  await assert.rejects(
    service.saveDesignVerification('w1', '', { status: 'approved' }, user),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});

test('saveDesignVerification caps screenshots at 12 and upserts', async () => {
  reset();
  const screenshots = Array.from({ length: 20 }, (_, i) => ({ id: String(i), url: `/u/${i}.png` }));
  storedRow = { page_key: '/about', status: 'approved', note: 'looks good', screenshots: JSON.stringify(screenshots.slice(0, 12)), design_signature: 'sig', tested_by_name: 'Dev', tested_at: '2026-07-16T00:00:00Z' };
  const result = await service.saveDesignVerification('w1', '/about', { status: 'approved', note: 'looks good', screenshots, designSignature: 'sig' }, user);
  const insert = lastDesignInsert();
  assert.ok(insert, 'runs an upsert insert');
  assert.equal(JSON.parse(insert.params.screenshots).length, 12, 'screenshots capped at 12');
  assert.match(insert.sql, /ON DUPLICATE KEY UPDATE/);
  assert.equal(result.status, 'approved');
  assert.equal(result.pageKey, '/about');
  assert.equal(result.screenshots.length, 12);
});

test('listDesignVerifications maps rows through mapDesignVerification', async () => {
  reset();
  storedRow = { page_key: '/home', status: 'rejected', note: '', screenshots: null, design_signature: null, tested_by_name: 'Dev', tested_at: '2026-07-16T00:00:00Z' };
  const list = await service.listDesignVerifications('w1');
  assert.equal(list.length, 1);
  assert.equal(list[0].pageKey, '/home');
  assert.equal(list[0].status, 'rejected');
  assert.deepEqual(list[0].screenshots, []);
});

test('deleteDesignVerification issues a scoped DELETE', async () => {
  reset();
  const result = await service.deleteDesignVerification('w1', '/about');
  assert.deepEqual(result, { deleted: true });
  const del = calls.find((c) => /DELETE FROM website_design_verifications/.test(c.sql));
  assert.ok(del);
  assert.equal(del.params.websiteId, 'w1');
  assert.equal(del.params.pageKey, '/about');
});
