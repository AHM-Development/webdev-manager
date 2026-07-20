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

test('a staff-created task becomes a pending request owned by the staffer', async () => {
  reset();
  taskRow = baseTask({ request_status: 'pending', requested_by: 5 });
  await service.createTask({ projectId: '3', title: 'Please build X' }, staff, ctx);
  const insert = calls.find((c) => /INSERT INTO tasks/.test(c.sql));
  assert.equal(insert.params.requestStatus, 'pending');
  assert.equal(insert.params.requestedBy, 5);
  // managers get notified
  assert.ok(dispatched.some((d) => d.input.type === 'task_request_submitted'));
});

test('a developer-created task is approved immediately (not a request)', async () => {
  reset();
  taskRow = baseTask();
  await service.createTask({ projectId: '3', title: 'Direct task' }, dev, ctx);
  const insert = calls.find((c) => /INSERT INTO tasks/.test(c.sql));
  assert.equal(insert.params.requestStatus, 'approved');
  assert.equal(insert.params.requestedBy, null);
  assert.ok(!dispatched.some((d) => d.input.type === 'task_request_submitted'));
});

test('staff cannot edit a task that is not their own pending request', async () => {
  reset();
  taskRow = baseTask({ request_status: 'approved', requested_by: 5 }); // approved -> locked
  await assert.rejects(
    service.updateTask('7', { projectId: '3', title: 'x' }, staff, ctx),
    (err) => err.status === 403 && err.code === 'FORBIDDEN'
  );
});

test('staff can edit their own still-pending request', async () => {
  reset();
  taskRow = baseTask({ request_status: 'pending', requested_by: 5 });
  const result = await service.updateTask('7', { projectId: '3', title: 'x' }, staff, ctx);
  assert.ok(result);
  assert.ok(calls.some((c) => /UPDATE tasks/.test(c.sql)));
});

test('approveRequest flips a pending request to approved and notifies the requester', async () => {
  reset();
  taskRow = baseTask({ request_status: 'pending', requested_by: 5 });
  await service.approveRequest('7', dev, ctx);
  assert.ok(calls.some((c) => /UPDATE tasks SET request_status = 'approved'/.test(c.sql)));
  assert.ok(dispatched.some((d) => d.input.type === 'task_request_approved' && String(d.input.userId) === '5'));
});

test('approveRequest refuses a task that is not pending', async () => {
  reset();
  taskRow = baseTask({ request_status: 'approved', requested_by: 5 });
  await assert.rejects(
    service.approveRequest('7', dev, ctx),
    (err) => err.code === 'NOT_PENDING'
  );
});

test('listTasks with requests=true scopes staff to their own via requested_by', async () => {
  reset();
  taskRow = baseTask({ request_status: 'pending', requested_by: 5 });
  await service.listTasks({ requests: true }, staff);
  const listCall = calls.find((c) => /FROM tasks t/.test(c.sql) && /requested_by IS NOT NULL/.test(c.sql));
  assert.ok(listCall, 'filters to requests');
  assert.match(listCall.sql, /t\.requested_by = :requesterId/);
  assert.equal(listCall.params.requesterId, 5);
});

test('listTasks with requests=true does NOT self-scope for a developer', async () => {
  reset();
  taskRow = baseTask({ request_status: 'pending', requested_by: 5 });
  await service.listTasks({ requests: true }, dev);
  const listCall = calls.find((c) => /FROM tasks t/.test(c.sql) && /requested_by IS NOT NULL/.test(c.sql));
  assert.doesNotMatch(listCall.sql, /requested_by = :requesterId/);
});

test('createTask on behalf of a requestor (by id) is a pending request owned by them', async () => {
  reset();
  taskRow = baseTask({ request_status: 'pending', requested_by: 9 });
  // Actor is a developer, but the task is raised for requestor id 9.
  await service.createTask({ projectId: '3', title: 'Fix form', requestedByUserId: 9 }, dev, ctx);
  const insert = calls.find((c) => /INSERT INTO tasks/.test(c.sql));
  assert.equal(insert.params.requestStatus, 'pending');
  assert.equal(insert.params.requestedBy, 9);
  assert.ok(dispatched.some((d) => d.input.type === 'task_request_submitted'));
});

test('createTask resolves a requestor by email/name to the owning user', async () => {
  reset();
  requestorRow = { id: 42 };
  taskRow = baseTask({ request_status: 'pending', requested_by: 42 });
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
