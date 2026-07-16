'use strict';

// Tests for the admin-triggered "send reset link" flow. authService is mocked
// so this exercises only the lookup/guard logic in users.service.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../../db/pool.js');
const activityPath = path.resolve(__dirname, '../auth/activity.service.js');
const authPath = path.resolve(__dirname, '../auth/auth.service.js');

let userRow = null;
const activityCalls = [];
const issueCalls = [];

function inject(filename, exports) {
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
inject(dbPath, { query: async () => (userRow ? [userRow] : []) });
inject(activityPath, { logActivity: async (entry) => { activityCalls.push(entry); } });
inject(authPath, { issueResetLink: async (user) => { issueCalls.push(user); return { delivered: true }; } });

const service = require('./users.service');

const actor = { id: 1, role: 'superadmin' };
const ctx = { ip: '127.0.0.1', userAgent: 'test' };

function reset() { activityCalls.length = 0; issueCalls.length = 0; }

test('sendResetLink 404s when the target user does not exist', async () => {
  reset();
  userRow = null;
  await assert.rejects(service.sendResetLink(99, actor, ctx), (err) => err.status === 404 && err.code === 'USER_NOT_FOUND');
  assert.equal(issueCalls.length, 0, 'must not mint a link for a missing user');
});

test('sendResetLink rejects a non-active user', async () => {
  reset();
  userRow = { id: 5, email: 'u@x.co', name: 'U', status: 'invited' };
  await assert.rejects(service.sendResetLink(5, actor, ctx), (err) => err.status === 400 && err.code === 'USER_NOT_ACTIVE');
  assert.equal(issueCalls.length, 0);
});

test('sendResetLink issues a link for an active user and audit-logs it', async () => {
  reset();
  userRow = { id: 5, email: 'u@x.co', name: 'U', status: 'active' };
  const result = await service.sendResetLink(5, actor, ctx);
  assert.deepEqual(result, { delivered: true });
  assert.equal(issueCalls.length, 1);
  assert.equal(issueCalls[0].id, 5);
  assert.equal(activityCalls.length, 1);
  assert.equal(activityCalls[0].eventType, 'users.reset_link_sent');
  assert.equal(activityCalls[0].userId, actor.id);
  assert.equal(activityCalls[0].metadata.targetUserId, '5');
});
