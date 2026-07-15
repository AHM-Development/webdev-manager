'use strict';

// Tests for the Client Logs service. Runs on Node's built-in test runner
// (`node --test`) with zero extra dependencies. The service's three module
// dependencies (db pool, tasks service, activity-logs service) are replaced in
// require.cache BEFORE the service is loaded, so no live database is needed.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const poolPath = path.resolve(__dirname, '../../db/pool.js');
const tasksPath = path.resolve(__dirname, '../tasks/tasks.service.js');
const activityPath = path.resolve(__dirname, '../activity-logs/activity-logs.service.js');

// Per-test controllable DB. Each test reassigns `queryHandler`.
let queryHandler = async () => [];
const dbMock = {
  query: async (sql, params) => queryHandler(sql, params),
  getPool: async () => ({}),
  getSelectedHost: () => 'test',
};

let activityCalls = [];
const activityMock = { logWebsiteActivity: async (input) => { activityCalls.push(input); } };
const tasksMock = { createTask: async () => ({ id: '99' }) };

function inject(filename, exports) {
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
inject(poolPath, dbMock);
inject(tasksPath, tasksMock);
inject(activityPath, activityMock);

const service = require('./client-logs.service');

function stage(overrides) {
  return Object.assign({
    name: 'Stage',
    status: 'not_started',
    isRequired: true,
    isLaunchBlocker: false,
    isMilestone: false,
    taskStats: { criticalOpen: 0, awaitingReview: 0, overdue: 0 },
  }, overrides);
}

// ---------- computeReadinessFromStages (pure) ----------
test('readiness: empty timeline is fully ready', () => {
  const r = service.computeReadinessFromStages([]);
  assert.equal(r.percentage, 100);
  assert.equal(r.status, 'ready');
  assert.deepEqual(r.blockers, []);
});

test('readiness: an incomplete required stage blocks and drives status not_ready', () => {
  const r = service.computeReadinessFromStages([stage({ name: 'Design', status: 'in_progress' })]);
  assert.equal(r.percentage, 0);
  assert.equal(r.status, 'not_ready');
  assert.equal(r.blockers.length, 1);
  assert.match(r.blockers[0], /Required stage not complete: Design/);
});

test('readiness: all required complete is ready at 100%', () => {
  const r = service.computeReadinessFromStages([
    stage({ status: 'verified' }),
    stage({ status: 'completed' }),
  ]);
  assert.equal(r.percentage, 100);
  assert.equal(r.status, 'ready');
});

test('readiness: open critical tasks add a blocker even when stages are done', () => {
  const r = service.computeReadinessFromStages([
    stage({ status: 'verified', taskStats: { criticalOpen: 2, awaitingReview: 0, overdue: 0 } }),
  ]);
  assert.equal(r.percentage, 100);
  assert.equal(r.status, 'almost_ready'); // done, but a blocker remains
  assert.match(r.blockers.join(' '), /2 critical task\(s\) still open/);
});

test('readiness: a completed "Website Live" stage yields live / post_launch_review', () => {
  const live = service.computeReadinessFromStages([
    stage({ name: 'Website Live', status: 'verified' }),
  ]);
  assert.equal(live.status, 'live');

  const postLaunch = service.computeReadinessFromStages([
    stage({ name: 'Website Live', status: 'verified' }),
    stage({ name: 'Post-Launch Review', status: 'in_progress', isRequired: false }),
  ]);
  assert.equal(postLaunch.status, 'post_launch_review');
});

// ---------- computeStageProgress (pure) ----------
test('progress: a completed or verified stage is 100% regardless of tasks', () => {
  assert.equal(service.computeStageProgress('completed', { total: 4, open: 3 }), 100);
  assert.equal(service.computeStageProgress('verified', { total: 0, open: 0 }), 100);
});

test('progress: derived from the share of tasks done', () => {
  assert.equal(service.computeStageProgress('in_progress', { total: 4, open: 1 }), 75);
  assert.equal(service.computeStageProgress('in_progress', { total: 3, open: 3 }), 0);
});

test('progress: no tasks and not done is 0%', () => {
  assert.equal(service.computeStageProgress('in_progress', { total: 0, open: 0 }), 0);
  assert.equal(service.computeStageProgress('not_started', { total: 0, open: 0 }), 0);
});

// ---------- summarizeClient (pure) ----------
test('summarizeClient: no stages means not_created / no timeline', () => {
  const summary = service.summarizeClient(
    { id: 7, client_name: 'Acme', type: 'Build', status: 'Active' },
    []
  );
  assert.equal(summary.hasTimeline, false);
  assert.equal(summary.status, 'not_created');
  assert.equal(summary.stageCount, 0);
  assert.equal(summary.clientName, 'Acme');
});

test('summarizeClient: a blocked stage surfaces status blocked', () => {
  const summary = service.summarizeClient(
    { id: 7, client_name: 'Acme', type: 'Build', status: 'Active' },
    [stage({ name: 'Dev', status: 'blocked' }), stage({ name: 'QA', status: 'not_started' })]
  );
  assert.equal(summary.hasTimeline, true);
  assert.equal(summary.status, 'blocked');
});

// ---------- DB-backed flows (mocked query router) ----------
test('addStage rejects an empty name', async () => {
  queryHandler = async (sql) => (/FROM projects/.test(sql) ? [{ id: 1, client_name: 'Acme' }] : []);
  await assert.rejects(
    service.addStage(1, { name: '   ' }, { id: 1, name: 'Manager' }),
    /Stage name is required/
  );
});

test('applyTemplate refuses when a timeline already exists', async () => {
  queryHandler = async (sql) => {
    if (/FROM projects/.test(sql)) return [{ id: 1, client_name: 'Acme' }];
    if (/COUNT\(\*\) AS count/.test(sql)) return [{ count: 4 }];
    return [];
  };
  await assert.rejects(
    service.applyTemplate(1, 5, { id: 1, name: 'Manager' }),
    (err) => err.code === 'STAGES_EXIST'
  );
});

test('clearClientLogs wipes the timeline and mirrors an audit event', async () => {
  activityCalls = [];
  const seen = [];
  queryHandler = async (sql) => {
    seen.push(sql);
    if (/FROM projects/.test(sql)) return [{ id: 1, client_name: 'Acme' }];
    return [];
  };
  const result = await service.clearClientLogs(1, { id: 2, name: 'Admin', email: 'a@x.co' });
  assert.deepEqual(result, { cleared: true });
  assert.ok(seen.some((sql) => /DELETE FROM client_log_stages/.test(sql)), 'deletes stages');
  assert.ok(seen.some((sql) => /DELETE FROM meetings/.test(sql)), 'deletes meetings');
  assert.equal(activityCalls.length, 1);
  assert.equal(activityCalls[0].action, 'client_log.timeline_cleared');
  assert.equal(activityCalls[0].severity, 'warning');
});
