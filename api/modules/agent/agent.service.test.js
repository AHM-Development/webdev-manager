'use strict';

// Tests for the Viktor agent gateway. Runs on `node --test` with no live DB:
// the service's db pool, action registry, and activity-log dependencies are
// replaced in require.cache before the service is loaded.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const dbPath = path.resolve(__dirname, '../../db/pool.js');
const actionsPath = path.resolve(__dirname, './agent.actions.js');
const activityPath = path.resolve(__dirname, '../activity-logs/activity-logs.service.js');

let queryHandler = async () => [];
const dbMock = { query: async (sql, params) => queryHandler(sql, params) };

let ranWith = null;
const actionsMock = {
  _map: {
    'test.read': { access: 'read', roles: ['superadmin', 'developer'], run: async (u, a) => { ranWith = a; return { ok: true, echo: a }; } },
    'test.write': { access: 'write', roles: ['superadmin'], run: async (u, a) => { ranWith = a; return { wrote: true, echo: a }; }, describe: (a) => 'Write ' + (a.id || '') },
  },
  get(key) { return Object.prototype.hasOwnProperty.call(this._map, key) ? this._map[key] : null; },
  list() { return Object.keys(this._map).map((k) => ({ key: k, access: this._map[k].access, roles: this._map[k].roles })); },
};

const activityCalls = [];
const activityMock = { logWebsiteActivity: async (input) => { activityCalls.push(input); } };

function inject(filename, exports) {
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
inject(dbPath, dbMock);
inject(actionsPath, actionsMock);
inject(activityPath, activityMock);

const service = require('./agent.service');
const tokens = require('./agent.tokens');
const env = require('../../config/env');

const admin = { id: 5, name: 'Admin', email: 'a@x.co', role: 'superadmin' };
const dev = { id: 6, name: 'Dev', email: 'd@x.co', role: 'developer' };

// ---------- delegation tokens ----------
test('tokens: access token round-trips with agent + gid claims', () => {
  const token = tokens.mintAccessToken(admin, 'grant-1', 'agent:read agent:write');
  const payload = tokens.verifyAccessToken(token);
  assert.equal(payload.sub, '5');
  assert.equal(payload.gid, 'grant-1');
  assert.equal(payload.agent, env.agent.clientId);
});

test('tokens: a normal user-audience token is rejected on the agent surface', () => {
  const userToken = jwt.sign({ sub: '5' }, env.auth.jwtSecret, {
    issuer: env.auth.jwtIssuer,
    audience: env.auth.jwtAudience, // the *user* audience, not the agent one
    expiresIn: 60,
  });
  assert.throws(() => tokens.verifyAccessToken(userToken));
});

// ---------- read ----------
test('read: forbidden role is rejected', async () => {
  await assert.rejects(
    service.read({ id: 9, role: 'spectator' }, 'test.read', {}),
    (err) => err.code === 'AGENT_FORBIDDEN'
  );
});

test('read: a write action cannot be run as a read', async () => {
  await assert.rejects(service.read(admin, 'test.write', {}), (err) => err.code === 'AGENT_NOT_READ');
});

test('read: unknown action is denied', async () => {
  await assert.rejects(service.read(admin, 'nope.delete', {}), (err) => err.code === 'AGENT_ACTION_UNKNOWN');
});

test('read: allowed action runs and returns the result', async () => {
  const out = await service.read(dev, 'test.read', { q: 1 });
  assert.deepEqual(out, { ok: true, echo: { q: 1 } });
});

// ---------- propose ----------
test('propose: a write action stores a pending proposal', async () => {
  let inserted = null;
  queryHandler = async (sql, params) => { if (/INSERT INTO agent_proposals/.test(sql)) inserted = params; return []; };
  const res = await service.propose(admin, 'test.write', { id: 'abc' });
  assert.ok(res.proposalId);
  assert.equal(res.actionKey, 'test.write');
  assert.match(res.summary, /Write abc/);
  assert.equal(inserted.userId, 5);
  assert.equal(inserted.actionKey, 'test.write');
});

test('propose: a read action cannot be proposed', async () => {
  await assert.rejects(service.propose(admin, 'test.read', {}), (err) => err.code === 'AGENT_NOT_WRITE');
});

// ---------- confirm ----------
function pendingProposal(overrides) {
  return Object.assign({
    id: 'p1', user_id: 5, action_key: 'test.write', args: JSON.stringify({ id: 'z' }),
    status: 'pending', expires_at: new Date(Date.now() + 60000).toISOString(),
  }, overrides);
}

test('confirm: the requester-approves guarantee — a different user is rejected', async () => {
  queryHandler = async (sql) => (/FROM agent_proposals/.test(sql) ? [pendingProposal()] : []);
  await assert.rejects(
    service.confirm({ id: 999, role: 'superadmin' }, 'p1'),
    (err) => err.code === 'AGENT_PROPOSAL_MISMATCH'
  );
});

test('confirm: an expired proposal is rejected and marked expired', async () => {
  const seen = [];
  queryHandler = async (sql) => {
    seen.push(sql);
    if (/FROM agent_proposals/.test(sql)) return [pendingProposal({ expires_at: new Date(Date.now() - 1000).toISOString() })];
    return [];
  };
  await assert.rejects(service.confirm(admin, 'p1'), (err) => err.code === 'AGENT_PROPOSAL_EXPIRED');
  assert.ok(seen.some((s) => /status = 'expired'/.test(s)));
});

test('confirm: happy path executes, marks executed, and audits as ai_agent', async () => {
  activityCalls.length = 0;
  ranWith = null;
  const seen = [];
  queryHandler = async (sql) => {
    seen.push(sql);
    if (/FROM agent_proposals/.test(sql)) return [pendingProposal()];
    return [];
  };
  const out = await service.confirm(admin, 'p1');
  assert.equal(out.executed, true);
  assert.deepEqual(ranWith, { id: 'z' }); // action ran with the stored args
  assert.ok(seen.some((s) => /status = 'executed'/.test(s)));
  assert.equal(activityCalls.length, 1);
  assert.equal(activityCalls[0].source, 'ai_agent');
  assert.equal(activityCalls[0].action, 'agent.test.write');
});

test('confirm: an already-used proposal is rejected', async () => {
  queryHandler = async (sql) => (/FROM agent_proposals/.test(sql) ? [pendingProposal({ status: 'executed' })] : []);
  await assert.rejects(service.confirm(admin, 'p1'), (err) => err.code === 'AGENT_PROPOSAL_USED');
});

// ---------- registry invariants (real registry, no DB needed) ----------
test('registry: no destructive actions and every entry is well-formed', () => {
  // Load the real registry directly (bypass the mock) to assert the hard-cap.
  delete require.cache[actionsPath];
  const real = require(path.resolve(__dirname, './agent.actions.js'));
  const keys = Object.keys(real.ACTIONS);
  assert.ok(keys.length > 20);
  for (const key of keys) {
    assert.doesNotMatch(key, /delete|remove|clear|destroy/i, `destructive key leaked: ${key}`);
    const entry = real.ACTIONS[key];
    assert.ok(['read', 'write'].includes(entry.access), `bad access on ${key}`);
    assert.ok(Array.isArray(entry.roles) && entry.roles.length, `missing roles on ${key}`);
    assert.equal(typeof entry.run, 'function', `missing run on ${key}`);
  }
  // restore the mock for any later tests
  inject(actionsPath, actionsMock);
});
