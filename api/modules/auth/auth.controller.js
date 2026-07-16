var service = require('./auth.service');
var security = require('../../lib/security');

function context(req) {
  return {
    ip: req.context && req.context.ip,
    userAgent: req.context && req.context.userAgent,
    sessionId: req.auth && req.auth.sessionId,
  };
}

function refreshCookieOptions() {
  var env = require('../../config/env');
  return {
    httpOnly: true,
    secure: env.auth.refreshCookieSecure,
    sameSite: env.auth.refreshCookieSameSite,
    domain: env.auth.refreshCookieDomain,
    path: '/api/v1/auth',
    maxAge: env.auth.refreshTtlSeconds * 1000,
  };
}

function sendTokens(res, result, status) {
  var env = require('../../config/env');
  res.cookie(env.auth.refreshCookieName, result.tokens.refreshToken, refreshCookieOptions());
  res.status(status || 200).json({
    user: result.user,
    accessToken: result.tokens.accessToken,
    accessTokenExpiresIn: result.tokens.accessTokenExpiresIn,
    sessionId: result.tokens.sessionId,
  });
}

async function login(req, res, next) {
  try {
    var result = await service.login(req.body || {}, context(req));
    sendTokens(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    var env = require('../../config/env');
    var input = Object.assign({}, req.body || {}, {
      refreshToken: req.cookies[env.auth.refreshCookieName],
    });
    var result = await service.refresh(input, context(req));
    sendTokens(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    var env = require('../../config/env');
    var input = Object.assign({}, req.body || {}, {
      refreshToken: req.cookies[env.auth.refreshCookieName],
    });
    await service.logout(req.user, input, context(req));
    res.clearCookie(env.auth.refreshCookieName, refreshCookieOptions());
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}


async function resetPassword(req, res, next) {
  try {
    await service.resetPassword(req.body || {}, context(req));
    var env = require('../../config/env');
    res.clearCookie(env.auth.refreshCookieName, refreshCookieOptions());
    res.json({ message: 'Password has been reset. Please sign in again.' });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ user: security.publicUser(req.user) });
}

async function sessions(req, res, next) {
  try {
    var rows = await service.listSessions(req.user.id);
    res.json({
      sessions: rows.map(function(row) {
        return {
          id: row.id,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          lastSeenAt: row.last_seen_at,
          expiresAt: row.expires_at,
          revokedAt: row.revoked_at,
          revokeReason: row.revoke_reason,
          createdAt: row.created_at,
          current: req.auth && req.auth.sessionId === row.id,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

async function revokeSession(req, res, next) {
  try {
    await service.revokeUserSession(
      req.user.id,
      req.params.sessionId,
      'user_revoked',
      context(req)
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function logoutAll(req, res, next) {
  try {
    await service.revokeAllSessions(req.user.id, 'logout_all');
    await require('./activity.service').logActivity({
      userId: req.user.id,
      eventType: 'auth.logout_all',
      ip: context(req).ip,
      userAgent: context(req).userAgent,
      metadata: {},
    });
    var env = require('../../config/env');
    res.clearCookie(env.auth.refreshCookieName, refreshCookieOptions());
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function activity(req, res, next) {
  try {
    var rows = await service.listActivity(req.user.id, req.query.limit);
    res.json({
      activity: rows.map(function(row) {
        return {
          id: String(row.id),
          eventType: row.event_type,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          metadata: row.metadata,
          createdAt: row.created_at,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login: login,
  refresh: refresh,
  logout: logout,
  resetPassword: resetPassword,
  me: me,
  sessions: sessions,
  revokeSession: revokeSession,
  logoutAll: logoutAll,
  activity: activity,
};
