var bcrypt = require('bcryptjs');
var jwt = require('jsonwebtoken');

var env = require('../../config/env');
var db = require('../../db/pool');
var redisStore = require('../../lib/redis');
var security = require('../../lib/security');
var mail = require('./mail.service');
var activity = require('./activity.service');
var roles = require('../../config/roles');

var ROLES = roles.ALL_ROLES;

function assertEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function assertPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function refreshRedisKey(sessionId, refreshHash) {
  return 'auth:refresh:' + sessionId + ':' + refreshHash;
}

function rotatedRefreshKey(refreshHash) {
  return 'auth:refresh-rotated:' + refreshHash;
}

function sessionPayload(user, sessionId) {
  return {
    sub: String(user.id),
    sid: sessionId,
    role: user.role,
    email: user.email,
    jti: security.uuid(),
  };
}

function signAccessToken(user, sessionId) {
  return jwt.sign(sessionPayload(user, sessionId), env.auth.jwtSecret, {
    expiresIn: env.auth.jwtExpiresIn,
    issuer: env.auth.jwtIssuer,
    audience: env.auth.jwtAudience,
  });
}

async function storeRefreshToken(sessionId, refreshHash, userId) {
  var redis = await redisStore.getRedis();
  await redis.set(
    refreshRedisKey(sessionId, refreshHash),
    JSON.stringify({ userId: String(userId), sessionId: sessionId }),
    { EX: env.auth.refreshTtlSeconds }
  );
}

async function deleteRefreshToken(sessionId, refreshHash) {
  var redis = await redisStore.getRedis();
  await redis.del(refreshRedisKey(sessionId, refreshHash));
}

async function markRefreshTokenRotated(sessionId, refreshHash) {
  var redis = await redisStore.getRedis();
  await redis.set(rotatedRefreshKey(refreshHash), sessionId, {
    EX: env.auth.refreshTtlSeconds,
  });
}

async function revokeSession(sessionId, reason) {
  var rows = await db.query(
    `SELECT id, refresh_token_hash
     FROM user_sessions
     WHERE id = :sessionId
     LIMIT 1`,
    { sessionId: sessionId }
  );

  if (rows[0]) {
    await deleteRefreshToken(rows[0].id, rows[0].refresh_token_hash);
  }

  await db.query(
    `UPDATE user_sessions
     SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP()),
         revoke_reason = COALESCE(revoke_reason, :reason)
     WHERE id = :sessionId`,
    { sessionId: sessionId, reason: reason || 'revoked' }
  );
}

async function revokeUserSession(userId, sessionId, reason, context) {
  var rows = await db.query(
    `SELECT id
     FROM user_sessions
     WHERE id = :sessionId AND user_id = :userId
     LIMIT 1`,
    { sessionId: sessionId, userId: userId }
  );

  if (!rows[0]) {
    var notFound = new Error('Session not found.');
    notFound.status = 404;
    notFound.code = 'SESSION_NOT_FOUND';
    throw notFound;
  }

  await revokeSession(sessionId, reason);
  await activity.logActivity({
    userId: userId,
    eventType: 'auth.session_revoked',
    ip: context && context.ip,
    userAgent: context && context.userAgent,
    metadata: { sessionId: sessionId },
  });
}

async function revokeAllSessions(userId, reason) {
  var rows = await db.query(
    `SELECT id, refresh_token_hash
     FROM user_sessions
     WHERE user_id = :userId AND revoked_at IS NULL`,
    { userId: userId }
  );

  await Promise.all(
    rows.map(function(row) {
      return deleteRefreshToken(row.id, row.refresh_token_hash);
    })
  );

  await db.query(
    `UPDATE user_sessions
     SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP()),
         revoke_reason = :reason
     WHERE user_id = :userId AND revoked_at IS NULL`,
    { userId: userId, reason: reason || 'logout_all' }
  );
}

async function issueSession(user, context) {
  var refreshToken = security.randomToken(48);
  var refreshHash = security.sha256(refreshToken);
  var sessionId = security.uuid();
  var now = new Date();
  var expiresAt = security.addSeconds(now, env.auth.refreshTtlSeconds);

  await db.query(
    `INSERT INTO user_sessions
      (id, user_id, refresh_token_hash, ip_address, user_agent, last_seen_at, expires_at)
     VALUES
      (:id, :userId, :refreshHash, :ip, :userAgent, UTC_TIMESTAMP(), :expiresAt)`,
    {
      id: sessionId,
      userId: user.id,
      refreshHash: refreshHash,
      ip: context.ip,
      userAgent: context.userAgent,
      expiresAt: security.mysqlDate(expiresAt),
    }
  );

  await storeRefreshToken(sessionId, refreshHash, user.id);

  return {
    accessToken: signAccessToken(user, sessionId),
    accessTokenExpiresIn: env.auth.jwtTtlSeconds,
    refreshToken: refreshToken,
    refreshTokenExpiresIn: env.auth.refreshTtlSeconds,
    sessionId: sessionId,
  };
}

async function login(input, context) {
  var email = normalizeEmail(input.email);
  var password = input.password;
  var rows = await db.query(
    `SELECT id, email, password_hash, name, role, status, password_updated_at, last_login_at, created_at
     FROM users WHERE email = :email LIMIT 1`,
    { email: email }
  );
  var user = rows[0];
  var valid = user ? await bcrypt.compare(String(password || ''), user.password_hash) : false;

  if (!user || !valid || user.status !== 'active') {
    await activity.logActivity({
      userId: user && user.id,
      eventType: 'auth.login_failed',
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { email: email },
    });

    var authError = new Error('Invalid email or password.');
    authError.status = 401;
    authError.code = 'INVALID_CREDENTIALS';
    throw authError;
  }

  await db.query(
    'UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = :id',
    { id: user.id }
  );
  var freshRows = await db.query(
    `SELECT id, email, name, role, status, password_updated_at, last_login_at, created_at
     FROM users WHERE id = :id LIMIT 1`,
    { id: user.id }
  );
  var freshUser = freshRows[0];
  var tokens = await issueSession(freshUser, context);

  await activity.logActivity({
    userId: freshUser.id,
    eventType: 'auth.login',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { sessionId: tokens.sessionId },
  });

  return { user: security.publicUser(freshUser), tokens: tokens };
}

async function refresh(input, context) {
  var token = String(input.refreshToken || '');
  var refreshHash = security.sha256(token);
  var rows = await db.query(
    `SELECT s.id, s.user_id, s.refresh_token_hash, s.expires_at, s.revoked_at,
            u.email, u.name, u.role, u.status, u.password_updated_at, u.last_login_at, u.created_at
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.refresh_token_hash = :refreshHash
     LIMIT 1`,
    { refreshHash: refreshHash }
  );

  var session = rows[0];
  if (!session) {
    var redisForReuseCheck = await redisStore.getRedis();
    var reusedSessionId = await redisForReuseCheck.get(rotatedRefreshKey(refreshHash));
    if (reusedSessionId) {
      await revokeSession(reusedSessionId, 'refresh_reuse_detected');
      await activity.logActivity({
        eventType: 'auth.refresh_reuse_detected',
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { sessionId: reusedSessionId },
      });

      var reuse = new Error('Refresh token reuse detected.');
      reuse.status = 401;
      reuse.code = 'REFRESH_REUSE_DETECTED';
      throw reuse;
    }

    var missing = new Error('Invalid refresh token.');
    missing.status = 401;
    missing.code = 'REFRESH_INVALID';
    throw missing;
  }

  var redis = await redisStore.getRedis();
  var redisKey = refreshRedisKey(session.id, refreshHash);
  var exists = await redis.exists(redisKey);

  if (!exists) {
    await revokeSession(session.id, 'refresh_reuse_detected');
    await activity.logActivity({
      userId: session.user_id,
      eventType: 'auth.refresh_reuse_detected',
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { sessionId: session.id },
    });

    var reuse = new Error('Refresh token reuse detected.');
    reuse.status = 401;
    reuse.code = 'REFRESH_REUSE_DETECTED';
    throw reuse;
  }

  if (session.revoked_at || session.status !== 'active' || new Date(session.expires_at) <= new Date()) {
    await revokeSession(session.id, 'refresh_expired_or_revoked');
    var expired = new Error('Refresh session expired or revoked.');
    expired.status = 401;
    expired.code = 'REFRESH_EXPIRED';
    throw expired;
  }

  var nextRefreshToken = security.randomToken(48);
  var nextRefreshHash = security.sha256(nextRefreshToken);
  await deleteRefreshToken(session.id, refreshHash);
  await markRefreshTokenRotated(session.id, refreshHash);
  await storeRefreshToken(session.id, nextRefreshHash, session.user_id);
  await db.query(
    `UPDATE user_sessions
     SET refresh_token_hash = :nextRefreshHash,
         last_seen_at = UTC_TIMESTAMP(),
         ip_address = :ip,
         user_agent = :userAgent
     WHERE id = :sessionId`,
    {
      nextRefreshHash: nextRefreshHash,
      ip: context.ip,
      userAgent: context.userAgent,
      sessionId: session.id,
    }
  );

  var user = {
    id: session.user_id,
    email: session.email,
    name: session.name,
    role: session.role,
    status: session.status,
    password_updated_at: session.password_updated_at,
    last_login_at: session.last_login_at,
    created_at: session.created_at,
  };

  await activity.logActivity({
    userId: user.id,
    eventType: 'auth.refresh',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { sessionId: session.id },
  });

  return {
    user: security.publicUser(user),
    tokens: {
      accessToken: signAccessToken(user, session.id),
      accessTokenExpiresIn: env.auth.jwtTtlSeconds,
      refreshToken: nextRefreshToken,
      refreshTokenExpiresIn: env.auth.refreshTtlSeconds,
      sessionId: session.id,
    },
  };
}

async function logout(user, input, context) {
  var refreshToken = input && input.refreshToken;
  var sessionId = input && input.sessionId;

  if (refreshToken) {
    var refreshHash = security.sha256(refreshToken);
    var rows = await db.query(
      'SELECT id FROM user_sessions WHERE refresh_token_hash = :refreshHash LIMIT 1',
      { refreshHash: refreshHash }
    );
    if (rows[0]) sessionId = rows[0].id;
  }

  if (!sessionId && context.sessionId) sessionId = context.sessionId;
  if (sessionId) await revokeSession(sessionId, 'logout');

  await activity.logActivity({
    userId: user && user.id,
    eventType: 'auth.logout',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { sessionId: sessionId || null },
  });
}

async function forgotPassword(input, context) {
  var email = normalizeEmail(input.email);
  var rows = await db.query(
    `SELECT id, email, name
     FROM users
     WHERE email = :email AND status = 'active'
     LIMIT 1`,
    { email: email }
  );
  var user = rows[0];

  if (!user) {
    await activity.logActivity({
      eventType: 'auth.password_reset_requested_unknown',
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { email: email },
    });
    return { delivered: false };
  }

  var resetToken = security.randomToken(48);
  var tokenHash = security.sha256(resetToken);
  var expiresAt = new Date(Date.now() + env.auth.resetTokenTtlMinutes * 60 * 1000);

  await db.query(
    `UPDATE password_resets
     SET used_at = UTC_TIMESTAMP()
     WHERE user_id = :userId AND used_at IS NULL`,
    { userId: user.id }
  );
  await db.query(
    `INSERT INTO password_resets
      (user_id, token_hash, expires_at, requested_ip, requested_user_agent)
     VALUES
      (:userId, :tokenHash, :expiresAt, :ip, :userAgent)`,
    {
      userId: user.id,
      tokenHash: tokenHash,
      expiresAt: security.mysqlDate(expiresAt),
      ip: context.ip,
      userAgent: context.userAgent,
    }
  );

  var resetUrl =
    env.clientUrl.replace(/\/$/, '') +
    '/reset-password?token=' +
    encodeURIComponent(resetToken);
  var delivery = await mail.sendPasswordResetEmail(user, resetUrl);

  await activity.logActivity({
    userId: user.id,
    eventType: 'auth.password_reset_requested',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { delivered: delivery.delivered },
  });

  return { delivered: delivery.delivered };
}

async function resetPassword(input, context) {
  var token = String(input.token || '');
  var password = input.password;
  if (!assertPassword(password)) {
    var passwordError = new Error('Password does not meet the security requirements.');
    passwordError.status = 400;
    passwordError.code = 'VALIDATION_ERROR';
    throw passwordError;
  }

  var tokenHash = security.sha256(token);
  var rows = await db.query(
    `SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at, u.email
     FROM password_resets pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.token_hash = :tokenHash
     LIMIT 1`,
    { tokenHash: tokenHash }
  );
  var reset = rows[0];

  if (!reset || reset.used_at || new Date(reset.expires_at) <= new Date()) {
    var tokenError = new Error('Reset token is invalid or expired.');
    tokenError.status = 400;
    tokenError.code = 'RESET_TOKEN_INVALID';
    throw tokenError;
  }

  var passwordHash = await bcrypt.hash(password, env.auth.bcryptRounds);
  await db.query(
    `UPDATE users
     SET password_hash = :passwordHash,
         password_updated_at = UTC_TIMESTAMP()
     WHERE id = :userId`,
    { passwordHash: passwordHash, userId: reset.user_id }
  );
  await db.query(
    'UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE id = :id',
    { id: reset.id }
  );
  await revokeAllSessions(reset.user_id, 'password_reset');

  await activity.logActivity({
    userId: reset.user_id,
    eventType: 'auth.password_reset_completed',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {},
  });
}

async function listSessions(userId) {
  return db.query(
    `SELECT id, ip_address, user_agent, last_seen_at, expires_at, revoked_at, revoke_reason, created_at
     FROM user_sessions
     WHERE user_id = :userId
     ORDER BY created_at DESC`,
    { userId: userId }
  );
}

async function listActivity(userId, limit) {
  var safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  return db.query(
    `SELECT id, event_type, ip_address, user_agent, metadata, created_at
     FROM activity_logs
     WHERE user_id = :userId
     ORDER BY created_at DESC
     LIMIT ` + safeLimit,
    { userId: userId }
  );
}

module.exports = {
  ROLES: ROLES,
  login: login,
  refresh: refresh,
  logout: logout,
  forgotPassword: forgotPassword,
  resetPassword: resetPassword,
  listSessions: listSessions,
  listActivity: listActivity,
  revokeSession: revokeSession,
  revokeUserSession: revokeUserSession,
  revokeAllSessions: revokeAllSessions,
};
