'use strict';

// The agent gateway. Reads run immediately; writes are stored as proposals and
// only executed on confirm. Two ceilings are enforced on every action: the
// user's role (action.roles) AND the allowlist (unknown key => denied). The
// "requester approves" guarantee is server-side: confirm requires the proposal
// to belong to the same user as the delegation token executing it.

var db = require('../../db/pool');
var env = require('../../config/env');
var security = require('../../lib/security');
var actions = require('./agent.actions');
var websiteActivity = require('../activity-logs/activity-logs.service');

function fail(status, code, message) {
  var err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

function requireAction(actionKey) {
  var action = actions.get(actionKey);
  if (!action) fail(404, 'AGENT_ACTION_UNKNOWN', 'Unknown or forbidden action: ' + actionKey);
  return action;
}

function assertRole(user, action) {
  if (action.roles.indexOf(user.role) === -1) {
    fail(403, 'AGENT_FORBIDDEN', 'Your role does not permit this action.');
  }
}

async function read(user, actionKey, args, ctx) {
  var action = requireAction(actionKey);
  if (action.access !== 'read') fail(400, 'AGENT_NOT_READ', 'That action changes data — use propose/confirm.');
  assertRole(user, action);
  return action.run(user, args || {}, ctx || {});
}

async function propose(user, actionKey, args, ctx) {
  var action = requireAction(actionKey);
  if (action.access !== 'write') fail(400, 'AGENT_NOT_WRITE', 'That action is read-only — call read.');
  assertRole(user, action);

  var id = security.uuid();
  var argsJson = JSON.stringify(args || {});
  var hash = security.sha256(actionKey + '|' + argsJson + '|' + user.id);
  var summary = action.describe ? String(action.describe(args || {})) : actionKey;
  var ttl = env.agent.proposalTtlSeconds;

  await db.query(
    `INSERT INTO agent_proposals
       (id, user_id, grant_id, agent, action_key, args, summary, status, proposal_hash, expires_at)
     VALUES
       (:id, :userId, :grantId, :agent, :actionKey, :args, :summary, 'pending', :hash,
        DATE_ADD(UTC_TIMESTAMP(), INTERVAL :ttl SECOND))`,
    {
      id: id,
      userId: user.id,
      grantId: (ctx && ctx.grantId) || null,
      agent: env.agent.clientId,
      actionKey: actionKey,
      args: argsJson,
      summary: summary.slice(0, 500),
      hash: hash,
      ttl: ttl,
    }
  );

  return { proposalId: id, actionKey: actionKey, summary: summary, expiresInSeconds: ttl };
}

async function confirm(user, proposalId, ctx) {
  var rows = await db.query('SELECT * FROM agent_proposals WHERE id = :id LIMIT 1', { id: proposalId });
  var proposal = rows[0];
  if (!proposal) fail(404, 'AGENT_PROPOSAL_NOT_FOUND', 'Proposal not found.');

  // The requester-approves guarantee: only the user the proposal was made for
  // (i.e. whose delegation token this is) may confirm it.
  if (String(proposal.user_id) !== String(user.id)) {
    fail(403, 'AGENT_PROPOSAL_MISMATCH', 'This proposal belongs to a different user.');
  }
  if (proposal.status !== 'pending') {
    fail(409, 'AGENT_PROPOSAL_USED', 'This proposal was already ' + proposal.status + '.');
  }
  if (new Date(proposal.expires_at) <= new Date()) {
    await db.query("UPDATE agent_proposals SET status = 'expired' WHERE id = :id", { id: proposalId });
    fail(410, 'AGENT_PROPOSAL_EXPIRED', 'Proposal expired — please ask again.');
  }

  var action = requireAction(proposal.action_key);
  if (action.access !== 'write') fail(400, 'AGENT_NOT_WRITE', 'Not a write action.');
  assertRole(user, action); // re-check at execute time — role may have changed

  var args = proposal.args
    ? (typeof proposal.args === 'object' ? proposal.args : JSON.parse(proposal.args))
    : {};

  var result = await action.run(user, args, ctx || {});

  await db.query(
    "UPDATE agent_proposals SET status = 'executed', executed_at = UTC_TIMESTAMP(), result = :result WHERE id = :id",
    { result: JSON.stringify(compactResult(result)), id: proposalId }
  );
  await auditExecution(user, ctx, proposal.action_key, proposalId, args);

  return { executed: true, proposalId: proposalId, actionKey: proposal.action_key, result: result };
}

function compactResult(result) {
  try {
    var json = JSON.stringify(result);
    if (json && json.length > 4000) return { note: 'result omitted (large)' };
    return result === undefined ? null : result;
  } catch (err) {
    return { note: 'result not serialisable' };
  }
}

async function auditExecution(user, ctx, actionKey, proposalId, args) {
  try {
    await websiteActivity.logWebsiteActivity({
      projectId: (args && args.projectId) || null,
      user: { id: user.id, name: user.name, email: user.email },
      ip: ctx && ctx.ip,
      userAgent: ctx && ctx.userAgent,
      action: 'agent.' + actionKey,
      description: 'Viktor executed ' + actionKey + ' on behalf of ' + (user.name || user.email),
      severity: 'info',
      source: 'ai_agent',
      metadata: { proposalId: proposalId, actionKey: actionKey },
    });
  } catch (err) {
    // Audit is best-effort; never break the executed action.
  }
}

/** Kill switch — revoke a delegation grant (from the agent or the owning user). */
async function revokeGrant(grantId, user) {
  await db.query(
    'UPDATE agent_grants SET revoked_at = UTC_TIMESTAMP() WHERE id = :id AND user_id = :userId AND revoked_at IS NULL',
    { id: grantId, userId: user.id }
  );
  return { revoked: true };
}

async function listGrants(user) {
  var rows = await db.query(
    `SELECT id, agent, scope, created_at, last_used_at, revoked_at
       FROM agent_grants WHERE user_id = :userId ORDER BY created_at DESC`,
    { userId: user.id }
  );
  return rows.map(function(row) {
    return {
      id: row.id,
      agent: row.agent,
      scope: row.scope,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
    };
  });
}

module.exports = {
  read: read,
  propose: propose,
  confirm: confirm,
  revokeGrant: revokeGrant,
  listGrants: listGrants,
  listActions: actions.list,
};
