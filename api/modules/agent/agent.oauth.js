'use strict';

// Minimal OAuth2 (authorization-code + PKCE + refresh) for the Viktor client.
// authorize() is called by a logged-in user from the consent page and returns a
// single-use code (stored in Redis). token() exchanges the code for a delegation
// access token + refresh token (a durable, revocable grant), or refreshes.

var crypto = require('crypto');
var db = require('../../db/pool');
var env = require('../../config/env');
var security = require('../../lib/security');
var tokens = require('./agent.tokens');
var redisStore = require('../../lib/redis');
var notifications = require('../notifications/notifications.service');

function fail(status, code, message) {
  var err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

function assertClient(clientId) {
  if (!clientId || clientId !== env.agent.clientId) fail(401, 'INVALID_CLIENT', 'Unknown client.');
}

function redirectAllowed(uri) {
  return env.agent.redirectUris.indexOf(uri) !== -1;
}

function codeKey(code) {
  return 'agent:oauth:code:' + security.sha256(code);
}

function timingEqual(a, b) {
  var x = Buffer.from(String(a));
  var y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function verifyPkce(verifier, challenge) {
  if (!challenge) return true; // PKCE not requested at authorize time
  if (!verifier) return false;
  var hashed = crypto.createHash('sha256').update(String(verifier)).digest('base64url');
  return timingEqual(hashed, challenge);
}

// Called by a logged-in user (requireAuth) from the "Authorize Viktor" screen.
async function authorize(user, input) {
  var clientId = String(input.clientId || input.client_id || '');
  var redirectUri = String(input.redirectUri || input.redirect_uri || '');
  var scope = String(input.scope || 'agent:read agent:write');
  var codeChallenge = input.codeChallenge || input.code_challenge || null;
  var method = input.codeChallengeMethod || input.code_challenge_method || (codeChallenge ? 'S256' : null);

  assertClient(clientId);
  if (!redirectAllowed(redirectUri)) fail(400, 'INVALID_REDIRECT_URI', 'This redirect_uri is not allowlisted.');
  if (codeChallenge && method !== 'S256') fail(400, 'INVALID_PKCE', 'Only the S256 PKCE method is supported.');

  var code = security.randomToken(32);
  var redis = await redisStore.getRedis();
  await redis.set(
    codeKey(code),
    JSON.stringify({
      userId: String(user.id),
      clientId: clientId,
      redirectUri: redirectUri,
      scope: scope,
      codeChallenge: codeChallenge || null,
    }),
    { EX: env.agent.authCodeTtlSeconds }
  );

  return { code: code, redirectUri: redirectUri, state: input.state || null };
}

async function token(input) {
  var grantType = String(input.grantType || input.grant_type || '');
  if (grantType === 'authorization_code') return exchangeCode(input);
  if (grantType === 'refresh_token') return refresh(input);
  return fail(400, 'UNSUPPORTED_GRANT_TYPE', 'grant_type must be authorization_code or refresh_token.');
}

async function exchangeCode(input) {
  var clientId = String(input.clientId || input.client_id || '');
  assertClient(clientId);
  var code = String(input.code || '');
  var redirectUri = String(input.redirectUri || input.redirect_uri || '');
  var verifier = input.codeVerifier || input.code_verifier || null;
  if (!code) fail(400, 'INVALID_GRANT', 'Missing authorization code.');

  var redis = await redisStore.getRedis();
  var raw = await redis.get(codeKey(code));
  if (!raw) fail(400, 'INVALID_GRANT', 'Authorization code is invalid or expired.');
  await redis.del(codeKey(code)); // single-use
  var data = JSON.parse(raw);
  if (data.clientId !== clientId) fail(400, 'INVALID_GRANT', 'Client mismatch.');
  if (data.redirectUri !== redirectUri) fail(400, 'INVALID_GRANT', 'redirect_uri mismatch.');

  var secretOk = !!env.agent.clientSecret &&
    String(input.clientSecret || input.client_secret || '') === env.agent.clientSecret;
  if (!verifyPkce(verifier, data.codeChallenge)) fail(400, 'INVALID_GRANT', 'PKCE verification failed.');
  // Require at least one form of client authentication.
  if (!data.codeChallenge && !secretOk) fail(401, 'INVALID_CLIENT', 'Client authentication required (PKCE or client secret).');

  return issueGrant(data.userId, data.scope);
}

async function issueGrant(userId, scope) {
  var users = await db.query(
    'SELECT id, email, name, role, status, deleted_at FROM users WHERE id = :id LIMIT 1',
    { id: userId }
  );
  var user = users[0];
  if (!user || user.status !== 'active' || user.deleted_at) fail(401, 'INVALID_GRANT', 'User is not active.');

  var grantId = security.uuid();
  var refreshToken = tokens.newRefreshToken();
  await db.query(
    `INSERT INTO agent_grants (id, user_id, agent, scope, refresh_token_hash)
     VALUES (:id, :userId, :agent, :scope, :hash)`,
    { id: grantId, userId: user.id, agent: env.agent.clientId, scope: scope, hash: tokens.hashRefreshToken(refreshToken) }
  );

  notifications.dispatch(notifications.CATEGORY.SECURITY, {
    userId: user.id, audienceType: 'user', type: 'agent_connected',
    title: 'Viktor was connected to your account',
    message: 'An AI assistant can now act on your behalf. You can revoke this anytime from your profile.',
    actionUrl: '/dashboard/my-profile', metadata: { grantId: grantId },
  }, user, null).catch(function() {});

  return {
    accessToken: tokens.mintAccessToken(user, grantId, scope),
    refreshToken: refreshToken,
    tokenType: 'Bearer',
    expiresIn: env.agent.accessTtlSeconds,
    scope: scope,
    grantId: grantId,
  };
}

async function refresh(input) {
  var clientId = String(input.clientId || input.client_id || '');
  assertClient(clientId);
  var refreshToken = String(input.refreshToken || input.refresh_token || '');
  if (!refreshToken) fail(400, 'INVALID_GRANT', 'Missing refresh token.');
  var secretOk = String(input.clientSecret || input.client_secret || '') === env.agent.clientSecret;
  if (env.agent.clientSecret && !secretOk) fail(401, 'INVALID_CLIENT', 'Client authentication required.');

  var rows = await db.query(
    `SELECT g.id, g.scope, g.revoked_at,
            u.id AS user_id, u.email, u.name, u.role, u.status, u.deleted_at
       FROM agent_grants g JOIN users u ON u.id = g.user_id
      WHERE g.refresh_token_hash = :hash LIMIT 1`,
    { hash: tokens.hashRefreshToken(refreshToken) }
  );
  var row = rows[0];
  if (!row || row.revoked_at || row.status !== 'active' || row.deleted_at) {
    fail(401, 'INVALID_GRANT', 'Grant was revoked or the user is inactive.');
  }

  return {
    accessToken: tokens.mintAccessToken(
      { id: row.user_id, email: row.email, name: row.name, role: row.role },
      row.id,
      row.scope
    ),
    tokenType: 'Bearer',
    expiresIn: env.agent.accessTtlSeconds,
    scope: row.scope,
  };
}

async function revoke(input) {
  var refreshToken = String(input.refreshToken || input.refresh_token || '');
  if (!refreshToken) return { revoked: true };
  await db.query(
    'UPDATE agent_grants SET revoked_at = UTC_TIMESTAMP() WHERE refresh_token_hash = :hash AND revoked_at IS NULL',
    { hash: tokens.hashRefreshToken(refreshToken) }
  );
  return { revoked: true };
}

module.exports = { authorize: authorize, token: token, revoke: revoke };
