'use strict';

var service = require('./agent.service');
var oauth = require('./agent.oauth');

function context(req) {
  return {
    ip: req.context && req.context.ip,
    userAgent: req.context && req.context.userAgent,
    grantId: req.agent && req.agent.grantId,
  };
}

// ---- OAuth ----
async function authorize(req, res, next) {
  try {
    res.json(await oauth.authorize(req.user, req.body || {}));
  } catch (err) { next(err); }
}
async function token(req, res, next) {
  try {
    res.json(await oauth.token(req.body || {}));
  } catch (err) { next(err); }
}
async function revokeToken(req, res, next) {
  try {
    res.json(await oauth.revoke(req.body || {}));
  } catch (err) { next(err); }
}

// ---- Agent surface (requireAgent) ----
async function actions(req, res, next) {
  try {
    res.json({ actions: service.listActions() });
  } catch (err) { next(err); }
}
async function read(req, res, next) {
  try {
    var body = req.body || {};
    res.json({ result: await service.read(req.user, body.actionKey, body.args || {}, context(req)) });
  } catch (err) { next(err); }
}
async function propose(req, res, next) {
  try {
    var body = req.body || {};
    res.json(await service.propose(req.user, body.actionKey, body.args || {}, context(req)));
  } catch (err) { next(err); }
}
async function confirm(req, res, next) {
  try {
    var body = req.body || {};
    res.json(await service.confirm(req.user, body.proposalId, context(req)));
  } catch (err) { next(err); }
}
async function revokeOwnGrant(req, res, next) {
  try {
    res.json(await service.revokeGrant(req.agent.grantId, req.user));
  } catch (err) { next(err); }
}

// ---- User-facing grant management (requireAuth) ----
async function listGrants(req, res, next) {
  try {
    res.json({ grants: await service.listGrants(req.user) });
  } catch (err) { next(err); }
}
async function userRevokeGrant(req, res, next) {
  try {
    res.json(await service.revokeGrant(req.params.grantId, req.user));
  } catch (err) { next(err); }
}

module.exports = {
  authorize: authorize,
  token: token,
  revokeToken: revokeToken,
  actions: actions,
  read: read,
  propose: propose,
  confirm: confirm,
  revokeOwnGrant: revokeOwnGrant,
  listGrants: listGrants,
  userRevokeGrant: userRevokeGrant,
};
