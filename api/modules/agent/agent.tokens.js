'use strict';

// Delegation tokens for Viktor. Access tokens are short-lived JWTs carrying the
// acting user (sub), the grant (gid), and an `agent` claim + a dedicated audience
// so a normal user token can never be replayed on the agent surface (and vice
// versa). Refresh tokens are opaque and stored only as a SHA-256 hash.

var jwt = require('jsonwebtoken');
var env = require('../../config/env');
var security = require('../../lib/security');

function mintAccessToken(user, grantId, scope) {
  return jwt.sign(
    {
      sub: String(user.id),
      gid: String(grantId),
      agent: env.agent.clientId,
      scope: scope || 'agent:read agent:write',
    },
    env.auth.jwtSecret,
    {
      expiresIn: env.agent.accessTtlSeconds,
      issuer: env.auth.jwtIssuer,
      audience: env.agent.tokenAudience,
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.auth.jwtSecret, {
    issuer: env.auth.jwtIssuer,
    audience: env.agent.tokenAudience,
  });
}

function newRefreshToken() {
  return security.randomToken(48);
}

function hashRefreshToken(token) {
  return security.sha256(token);
}

module.exports = {
  mintAccessToken: mintAccessToken,
  verifyAccessToken: verifyAccessToken,
  newRefreshToken: newRefreshToken,
  hashRefreshToken: hashRefreshToken,
};
