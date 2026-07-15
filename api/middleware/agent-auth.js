'use strict';

// requireAgent — authenticates a Viktor delegation token and loads the acting
// user. Mirrors middleware/auth.js requireAuth, but demands an `agent` claim and
// a live, non-revoked grant. Sets req.user (the person Viktor acts for) and
// req.agent (grant + scope). Used only in front of the /agent surface.

var tokens = require('../modules/agent/agent.tokens');
var db = require('../db/pool');

async function requireAgent(req, res, next) {
  try {
    var header = req.headers.authorization || '';
    var match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({
        error: { code: 'AGENT_AUTH_REQUIRED', message: 'Agent access token is required.' },
      });
    }

    var payload;
    try {
      payload = tokens.verifyAccessToken(match[1]);
    } catch (err) {
      var code = err.name === 'TokenExpiredError' ? 'AGENT_TOKEN_EXPIRED' : 'AGENT_TOKEN_INVALID';
      return res.status(401).json({ error: { code: code, message: 'Invalid or expired agent token.' } });
    }

    if (!payload.agent || !payload.gid) {
      return res.status(401).json({
        error: { code: 'AGENT_TOKEN_INVALID', message: 'Not an agent delegation token.' },
      });
    }

    var rows = await db.query(
      `SELECT u.id, u.email, u.name, u.first_name, u.last_name, u.role, u.status, u.deleted_at,
              g.id AS grant_id, g.scope AS grant_scope, g.revoked_at AS grant_revoked_at
       FROM agent_grants g
       JOIN users u ON u.id = g.user_id
       WHERE g.id = :gid AND u.id = :uid
       LIMIT 1`,
      { gid: payload.gid, uid: payload.sub }
    );
    var row = rows[0];

    if (!row || row.status !== 'active' || row.deleted_at || row.grant_revoked_at) {
      return res.status(401).json({
        error: { code: 'AGENT_GRANT_INVALID', message: 'This authorization was revoked or the account is inactive.' },
      });
    }

    req.user = row;
    req.agent = { clientId: payload.agent, grantId: row.grant_id, scope: row.grant_scope };

    // Best-effort activity stamp; never blocks the request.
    db.query('UPDATE agent_grants SET last_used_at = UTC_TIMESTAMP() WHERE id = :gid', { gid: row.grant_id })
      .catch(function() {});

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAgent: requireAgent };
