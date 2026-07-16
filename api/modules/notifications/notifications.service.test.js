'use strict';

// Tests for the notification dispatch pipeline (in-app + email fan-out). No live
// DB or mailer: db pool, mailer, bus, and activity log are replaced in
// require.cache before the service loads.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../../db/pool.js');
const mailPath = path.resolve(__dirname, '../auth/mail.service.js');
const busPath = path.resolve(__dirname, './notification-bus.js');
const activityPath = path.resolve(__dirname, '../auth/activity.service.js');

let channel = 'email';
let notificationRow = null; // overrides the row returned by "SELECT * FROM notifications WHERE id"
const mailCalls = [];
const seenCalls = []; // { sql, params }

let queryHandler = async (sql, params) => {
  seenCalls.push({ sql, params });
  if (/FROM notification_settings/.test(sql)) {
    return [{ task_assignments_channel: channel, in_app_realtime_enabled: 1 }];
  }
  if (/SELECT \* FROM notifications WHERE id/.test(sql)) {
    return [notificationRow || {
      id: 'n1', user_id: 7, audience_type: 'user', audience_value: null,
      type: 't', title: 'x', message: 'm', action_url: null, metadata: null,
      read_at: null, created_at: '2026-01-01',
    }];
  }
  if (/^\s*UPDATE notifications/.test(sql)) return { affectedRows: 3 };
  if (/FROM users/.test(sql)) return [{ id: 7, name: 'U', email: 'u@x.co' }];
  return [];
};

function inject(filename, exports) {
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
inject(dbPath, { query: async (sql, params) => queryHandler(sql, params) });
inject(mailPath, {
  sendNotificationEmail: async (user, notification) => {
    mailCalls.push({ user, notification });
    return { delivered: true };
  },
});
inject(busPath, { emitNotification: () => true });
inject(activityPath, { logActivity: async () => {} });

const service = require('./notifications.service');

const input = { userId: 7, audienceType: 'user', type: 't', title: 'x', message: 'm' };
const actor = { id: 1, name: 'Actor', email: 'a@x.co' };

test('dispatch: email channel creates the notification and emails the recipient', async () => {
  channel = 'email';
  mailCalls.length = 0;
  const notification = await service.dispatch(service.CATEGORY.TASK_ASSIGNMENT, input, actor, {});
  assert.ok(notification);
  assert.equal(mailCalls.length, 1);
  assert.equal(mailCalls[0].user.email, 'u@x.co');
});

test('dispatch: off channel still notifies in-app but sends no email', async () => {
  channel = 'off';
  mailCalls.length = 0;
  const notification = await service.dispatch(service.CATEGORY.TASK_ASSIGNMENT, input, actor, {});
  assert.ok(notification);
  assert.equal(mailCalls.length, 0);
});

test('dispatch: both channel emails as well', async () => {
  channel = 'both';
  mailCalls.length = 0;
  await service.dispatch(service.CATEGORY.TASK_ASSIGNMENT, input, actor, {});
  assert.equal(mailCalls.length, 1);
});

test('dispatch: best-effort — a DB failure never throws into the caller', async () => {
  const original = queryHandler;
  queryHandler = async () => { throw new Error('db down'); };
  const result = await service.dispatch(service.CATEGORY.TASK_ASSIGNMENT, input, actor, {});
  assert.equal(result, null);
  queryHandler = original;
});

test('CATEGORY covers the wired notification types', () => {
  for (const key of ['TASK_ASSIGNMENT', 'REVIEW', 'CLIENT_LOGS', 'ISSUES', 'SECURITY', 'HEALTH']) {
    assert.equal(typeof service.CATEGORY[key], 'string');
  }
});

test('dispatch: a role-audience notification resolves recipients by role', async () => {
  channel = 'email';
  mailCalls.length = 0;
  seenCalls.length = 0;
  notificationRow = {
    id: 'n2', user_id: null, audience_type: 'role', audience_value: 'developer',
    type: 't', title: 'x', message: 'm', action_url: null, metadata: null,
    read_at: null, created_at: '2026-01-01',
  };
  await service.dispatch(
    service.CATEGORY.TASK_ASSIGNMENT,
    { audienceType: 'role', audienceValue: 'developer', type: 't', title: 'x', message: 'm' },
    actor,
    {}
  );
  notificationRow = null;
  const roleQuery = seenCalls.find((c) => /FROM users WHERE role = :role/.test(c.sql));
  assert.ok(roleQuery, 'recipients resolved via role query');
  assert.equal(roleQuery.params.role, 'developer');
});

test('markAllRead scopes the update to the user and reports the count', async () => {
  seenCalls.length = 0;
  const result = await service.markAllRead({ id: 7, role: 'developer' });
  assert.deepEqual(result, { updated: 3 });
  const update = seenCalls.find((c) => /^\s*UPDATE notifications/.test(c.sql));
  assert.ok(update);
  assert.match(update.sql, /read_at IS NULL/);
  assert.match(update.sql, /audience_type = 'workspace'/);
  assert.equal(update.params.userId, 7);
  assert.equal(update.params.role, 'developer');
});
