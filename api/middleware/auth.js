var jwt = require('jsonwebtoken');
var env = require('../config/env');
var db = require('../db/pool');

async function requireAuth(req, res, next) {
  try {
    var header = req.headers.authorization || '';
    var match = header.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication is required.' },
      });
    }

    var payload = jwt.verify(match[1], env.auth.jwtSecret, {
      issuer: env.auth.jwtIssuer,
      audience: env.auth.jwtAudience,
    });
    var rows = await db.query(
      `SELECT u.id, u.email, u.name, u.first_name, u.last_name,
              u.phone_e164, u.phone_country, u.discord_id, u.discord_verified_at,
              u.date_of_birth, u.gender, u.avatar_url, u.invited_at,
              u.invite_accepted_at, u.role, u.status, u.deleted_at, u.password_updated_at,
              u.last_login_at, u.created_at,
              s.id AS session_id, s.revoked_at AS session_revoked_at,
              s.expires_at AS session_expires_at
       FROM users u
       JOIN user_sessions s ON s.id = :sessionId AND s.user_id = u.id
       WHERE u.id = :id
       LIMIT 1`,
      { id: payload.sub, sessionId: payload.sid }
    );
    var user = rows[0];

    if (
      !user ||
      user.status !== 'active' ||
      user.deleted_at ||
      user.session_revoked_at ||
      new Date(user.session_expires_at) <= new Date()
    ) {
      return res.status(401).json({
        error: { code: 'AUTH_INVALID', message: 'Invalid, expired, or revoked session.' },
      });
    }

    req.user = user;
    req.auth = {
      sessionId: payload.sid,
      tokenId: payload.jti,
    };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: { code: 'TOKEN_EXPIRED', message: 'Access token expired.' },
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: { code: 'TOKEN_INVALID', message: 'Invalid access token.' },
      });
    }

    return next(err);
  }
}

function requireRoles(roles) {
  return function(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication is required.' },
      });
    }

    if (roles.indexOf(req.user.role) === -1) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this resource.' },
      });
    }

    return next();
  };
}

module.exports = {
  requireAuth: requireAuth,
  requireRoles: requireRoles,
};
