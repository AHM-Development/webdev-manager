'use strict';

// Tests for the newer Website Health surface: the reset-scan-history action,
// the Website QA results the external AI pushes, and the scan-status filter.
// Only the db pool is mocked; SQL is routed by a light pattern match.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../../db/pool.js');

let websiteExists = true;
let qaGroups = [];
let qaItems = [];
let qaResults = [];
let knownCriteria = []; // ids that pass the "criterion still exists" check
let deletedScans = 0;
const calls = [];

function inject(filename, exports) {
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
inject(dbPath, {
  query: async (sql, params) => {
    calls.push({ sql, params });
    // websiteRow (404 gate) — distinctive trailing "WHERE pw.id = :websiteId LIMIT 1"
    if (/WHERE pw\.id = :websiteId LIMIT 1/.test(sql)) {
      return websiteExists ? [{ id: params.websiteId, client_name: 'Acme', name: 'Site', url: 'https://x' }] : [];
    }
    if (/FROM qa_criteria_groups/.test(sql)) return qaGroups;
    if (/FROM qa_criteria_items ORDER BY/.test(sql)) return qaItems;
    if (/FROM website_qa_results WHERE website_id/.test(sql)) return qaResults;
    if (/SELECT id FROM qa_criteria_items WHERE id = :id/.test(sql)) {
      return knownCriteria.indexOf(String(params.id)) !== -1 ? [{ id: params.id }] : [];
    }
    if (/INSERT INTO website_qa_results/.test(sql)) return {};
    if (/DELETE FROM website_qa_results/.test(sql)) return { affectedRows: 3 };
    if (/DELETE FROM website_health_scans/.test(sql)) return { affectedRows: deletedScans };
    // list() queries
    if (/SELECT COUNT\(\*\) AS total FROM project_websites/.test(sql)) return [{ total: 0 }];
    if (/^\s*SELECT/i.test(sql)) return [];
    return {};
  },
});

const service = require('./website-health.service');

function reset() {
  calls.length = 0;
  websiteExists = true;
  qaGroups = [];
  qaItems = [];
  qaResults = [];
  knownCriteria = [];
  deletedScans = 0;
}

// ---- resetWebsite ----
test('resetWebsite deletes the website scans and reports the count', async () => {
  reset();
  deletedScans = 5;
  const result = await service.resetWebsite('42');
  assert.equal(result.ok, true);
  assert.equal(result.deletedScans, 5);
  assert.ok(calls.some((c) => /DELETE FROM website_health_scans WHERE website_id = :websiteId/.test(c.sql)));
});

test('resetWebsite 404s for an unknown website', async () => {
  reset();
  websiteExists = false;
  await assert.rejects(
    service.resetWebsite('nope'),
    (err) => err.status === 404
  );
});

// ---- getQaResults ----
test('getQaResults groups items and computes the summary', async () => {
  reset();
  qaGroups = [{ id: 1, name: 'Group A' }];
  qaItems = [
    { id: 10, group_id: 1, text: 'Criterion one' },
    { id: 11, group_id: 1, text: 'Criterion two' },
  ];
  qaResults = [{ criterion_id: 10, status: 'fail', note: '', detail: 'why', checks: '', fix: 'do x', updated_at: 'now' }];

  const out = await service.getQaResults('42');
  assert.equal(out.groups.length, 1);
  assert.equal(out.groups[0].items.length, 2);
  const [first, second] = out.groups[0].items;
  assert.equal(first.status, 'fail');
  assert.equal(first.detail, 'why');
  assert.equal(first.fix, 'do x');
  assert.equal(second.status, null); // not checked
  assert.deepEqual(out.summary, { pass: 0, fail: 1, warning: 0, na: 0, notChecked: 1, total: 2 });
});

test('getQaResults 404s for an unknown website', async () => {
  reset();
  websiteExists = false;
  await assert.rejects(service.getQaResults('nope'), (err) => err.status === 404);
});

// ---- submitQaResults ----
test('submitQaResults upserts a valid finding with all fields', async () => {
  reset();
  knownCriteria = ['10'];
  await service.submitQaResults('42', {
    results: [{ criterionId: '10', status: 'fail', detail: 'Two H1s', checks: 'DOM scan', fix: 'Use one H1' }],
  }, { id: 7 });
  const insert = calls.find((c) => /INSERT INTO website_qa_results/.test(c.sql));
  assert.ok(insert, 'inserted a result');
  assert.equal(insert.params.status, 'fail');
  assert.equal(insert.params.detail, 'Two H1s');
  assert.equal(insert.params.checks, 'DOM scan');
  assert.equal(insert.params.fix, 'Use one H1');
  assert.equal(String(insert.params.criterionId), '10');
});

test('submitQaResults rejects an invalid status', async () => {
  reset();
  knownCriteria = ['10'];
  await assert.rejects(
    service.submitQaResults('42', { results: [{ criterionId: '10', status: 'broken' }] }, { id: 7 }),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});

test('submitQaResults rejects a non-numeric criterionId', async () => {
  reset();
  await assert.rejects(
    service.submitQaResults('42', { results: [{ criterionId: 'abc', status: 'pass' }] }, { id: 7 }),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});

test('submitQaResults requires a results array', async () => {
  reset();
  await assert.rejects(
    service.submitQaResults('42', {}, { id: 7 }),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});

test('submitQaResults skips a criterion that no longer exists (no insert)', async () => {
  reset();
  knownCriteria = []; // criterion 999 is unknown
  await service.submitQaResults('42', { results: [{ criterionId: '999', status: 'pass' }] }, { id: 7 });
  assert.ok(!calls.some((c) => /INSERT INTO website_qa_results/.test(c.sql)), 'nothing inserted');
});

test('submitQaResults 404s for an unknown website', async () => {
  reset();
  websiteExists = false;
  await assert.rejects(
    service.submitQaResults('nope', { results: [] }, { id: 7 }),
    (err) => err.status === 404
  );
});

// ---- resetQaResults ----
test('resetQaResults clears the website findings', async () => {
  reset();
  await service.resetQaResults('42');
  assert.ok(calls.some((c) => /DELETE FROM website_qa_results WHERE website_id = :websiteId/.test(c.sql)));
});

// ---- list scan-status filter ----
test('list with scanStatus=scanned filters to websites that have a completed scan', async () => {
  reset();
  await service.list({ scanStatus: 'scanned' });
  const filtered = calls.find(
    (c) => /FROM project_websites/.test(c.sql) &&
      /EXISTS \(SELECT 1 FROM website_health_scans/.test(c.sql) &&
      !/NOT EXISTS/.test(c.sql)
  );
  assert.ok(filtered, 'rows query includes the scanned EXISTS clause');
});

test('list with scanStatus=unscanned filters to websites with no completed scan', async () => {
  reset();
  await service.list({ scanStatus: 'unscanned' });
  const filtered = calls.find(
    (c) => /FROM project_websites/.test(c.sql) && /NOT EXISTS \(SELECT 1 FROM website_health_scans/.test(c.sql)
  );
  assert.ok(filtered, 'rows query includes the NOT EXISTS clause');
});
