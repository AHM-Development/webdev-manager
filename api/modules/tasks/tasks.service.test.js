'use strict';

// Tests for the task-request approval flow. db pool, activity log, and the
// notifications dispatcher are replaced in require.cache before the service loads.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../../db/pool.js');
const activityPath = path.resolve(__dirname, '../auth/activity.service.js');
const notificationsPath = path.resolve(__dirname, '../notifications/notifications.service.js');

let taskRow = null; // row returned by getTask's SELECT
let requestorRow = null; // row returned by resolveRequestor's SELECT
const calls = [];
const dispatched = [];

function inject(filename, exports) {
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
inject(dbPath, {
  query: async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM tasks t\b/.test(sql) || /FROM tasks WHERE/.test(sql)) return taskRow ? [taskRow] : [];
    if (/COALESCE\(MAX\(sort_order\)/.test(sql)) return [{ next_order: 100 }];
    if (/INSERT INTO tasks/.test(sql)) return { insertId: 7 };
    if (/FROM projects/.test(sql)) return [{ id: params.projectId || 3 }]; // assertProject
    if (/email = :v OR name = :v/.test(sql)) return requestorRow ? [requestorRow] : []; // resolveRequestor
    if (/FROM users/.test(sql)) return []; // resolveAssignee lookups
    if (/^\s*SELECT/i.test(sql)) return [];
    return {};
  },
});
inject(activityPath, { logActivity: async () => {} });
inject(notificationsPath, {
  CATEGORY: { TASK_ASSIGNMENT: 'task_assignments' },
  dispatch: async (cat, input) => { dispatched.push({ cat, input }); return {}; },
});

const service = require('./tasks.service');

const staff = { id: 5, name: 'Sam Staff', email: 's@x.co', role: 'staff' };
const dev = { id: 2, name: 'Dev', email: 'd@x.co', role: 'developer' };
const ctx = {};

function reset() { calls.length = 0; dispatched.length = 0; taskRow = null; requestorRow = null; }
function baseTask(overrides) {
  return Object.assign({
    id: 7, project_id: 3, title: 'T', description: '', checklist: null, attachments: null,
    status: 'Backlog', priority: 'Medium', assignee_user_id: null, assignee_name: 'Unassigned',
    request_status: 'approved', requested_by: null, sort_order: 100,
    created_at: '2026-07-17', updated_at: '2026-07-17',
  }, overrides || {});
}

test('a staff-created task goes straight to the board (no approval)', async () => {
  reset();
  taskRow = baseTask();
  await service.createTask({ projectId: '3', title: 'Please build X' }, staff, ctx);
  const insert = calls.find((c) => /INSERT INTO tasks/.test(c.sql));
  assert.equal(insert.params.requestStatus, 'approved');
  assert.equal(insert.params.requestedBy, null);
  assert.ok(!dispatched.some((d) => d.input.type === 'task_request_submitted'));
});

test('a developer-created task is approved with no requester', async () => {
  reset();
  taskRow = baseTask();
  await service.createTask({ projectId: '3', title: 'Direct task' }, dev, ctx);
  const insert = calls.find((c) => /INSERT INTO tasks/.test(c.sql));
  assert.equal(insert.params.requestStatus, 'approved');
  assert.equal(insert.params.requestedBy, null);
});

test('staff cannot edit board tasks', async () => {
  reset();
  taskRow = baseTask({ requested_by: 5 });
  await assert.rejects(
    service.updateTask('7', { projectId: '3', title: 'x' }, staff, ctx),
    (err) => err.status === 403 && err.code === 'FORBIDDEN'
  );
});

test('createTask records an on-behalf requestor by id (attribution only, still approved)', async () => {
  reset();
  taskRow = baseTask({ requested_by: 9 });
  await service.createTask({ projectId: '3', title: 'Fix form', requestedByUserId: 9 }, dev, ctx);
  const insert = calls.find((c) => /INSERT INTO tasks/.test(c.sql));
  assert.equal(insert.params.requestStatus, 'approved');
  assert.equal(insert.params.requestedBy, 9);
  assert.ok(!dispatched.some((d) => d.input.type === 'task_request_submitted'));
});

test('createTask resolves a requestor by email/name to the owning user', async () => {
  reset();
  requestorRow = { id: 42 };
  taskRow = baseTask({ requested_by: 42 });
  await service.createTask({ projectId: '3', title: 'Fix form', requestor: 'jane@x.co' }, dev, ctx);
  const insert = calls.find((c) => /INSERT INTO tasks/.test(c.sql));
  assert.equal(insert.params.requestedBy, 42);
});

test('createTask rejects an unknown requestor', async () => {
  reset();
  requestorRow = null; // resolveRequestor finds no user
  await assert.rejects(
    service.createTask({ projectId: '3', title: 'Fix form', requestor: 'ghost@x.co' }, dev, ctx),
    (err) => err.code === 'REQUESTOR_UNKNOWN'
  );
});
