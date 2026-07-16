'use strict';

// Tests for the password-reset flow hardening. No live DB/mailer: db pool,
// activity log, mailer, and bcrypt are replaced in require.cache before load.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../../db/pool.js');
const activityPath = path.resolve(__dirname, './activity.service.js');
const mailPath = path.resolve(__dirname, './mail.service.js');
const bcryptPath = require.resolve('bcryptjs');

let resetRow = null; // what the "find token" SELECT returns
const seenSql = [];
let queryHandler = async (sql) => {
  seenSql.push(sql);
  if (/FROM password_resets/.test(sql)) return resetRow ? [resetRow] : [];
  // Other SELECTs (e.g. revokeAllSessions loading sessions) expect a rows array.
  if (/^\s*SELECT/i.test(sql)) return [];
  return {};
};

const mailCalls = [];

function inject(filename, exports) {
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
inject(dbPath, { query: async (sql, params) => queryHandler(sql, params) });
inject(activityPath, { logActivity: async () => {} });
inject(mailPath, { sendPasswordResetEmail: async (user, url) => { mailCalls.push({ user, url }); return { delivered: true }; } });
inject(bcryptPath, { hash: async () => 'hashed-password', compare: async () => true });

const service = require('./auth.service');

const STRONG = 'Str0ng!Password1';
const ctx = { ip: '127.0.0.1', userAgent: 'test' };
const future = () => new Date(Date.now() + 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

function reset() { seenSql.length = 0; mailCalls.length = 0; }

// ---------- resetPassword ----------
test('resetPassword rejects a password that fails the policy', async () => {
  reset();
  resetRow = { id: 1, user_id: 5, expires_at: future(), used_at: null, email: 'u@x.co' };
  await assert.rejects(service.resetPassword({ token: 'tok', password: 'weak' }, ctx), (err) => err.code === 'VALIDATION_ERROR');
});

test('resetPassword gives the SAME generic error for missing / used / expired tokens (no enumeration)', async () => {
  const messages = [];
  for (const row of [null, { id: 1, user_id: 5, used_at: future(), expires_at: future(), email: 'u@x.co' }, { id: 1, user_id: 5, used_at: null, expires_at: past(), email: 'u@x.co' }]) {
    reset();
    resetRow = row;
    await assert.rejects(
      service.resetPassword({ token: 'tok', password: STRONG }, ctx),
      (err) => { messages.push(err.message + '|' + err.code); return err.code === 'RESET_TOKEN_INVALID'; }
    );
  }
  // All three cases must be indistinguishable.
  assert.equal(new Set(messages).size, 1, 'reset errors must be identical across cases');
});

test('resetPassword on a valid token sets the hash, consumes the token, and revokes sessions', async () => {
  reset();
  resetRow = { id: 9, user_id: 5, expires_at: future(), used_at: null, email: 'u@x.co' };
  await service.resetPassword({ token: 'tok', password: STRONG }, ctx);
  assert.ok(seenSql.some((s) => /UPDATE users/.test(s) && /password_hash/.test(s)), 'updates the password hash');
  assert.ok(seenSql.some((s) => /UPDATE password_resets/.test(s) && /used_at/.test(s)), 'consumes the token');
  assert.ok(seenSql.some((s) => /user_sessions/.test(s) && /revoked_at/.test(s)), 'revokes sessions');
});

// ---------- issueResetLink ----------
test('issueResetLink invalidates prior tokens, stores a new one, and emails a reset link', async () => {
  reset();
  const result = await service.issueResetLink({ id: 5, email: 'u@x.co', name: 'U' }, ctx);
  assert.deepEqual(result, { delivered: true });
  assert.ok(seenSql.some((s) => /UPDATE password_resets/.test(s) && /used_at/.test(s)), 'invalidates prior tokens');
  assert.ok(seenSql.some((s) => /INSERT INTO password_resets/.test(s)), 'stores the new token');
  assert.equal(mailCalls.length, 1);
  assert.match(mailCalls[0].url, /\/reset-password\?token=/);
});
