'use strict';

var express = require('express');
var router = express.Router();
var auth = require('../../middleware/auth');
var agentAuth = require('../../middleware/agent-auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');
var controller = require('./agent.controller');

// ---- OAuth: connect Viktor to a user ----
// authorize() is driven by a logged-in human from the consent page; token/revoke
// are called by the Viktor client itself (authenticated by PKCE or client secret).
router.post(
  '/oauth/authorize',
  auth.requireAuth,
  auth.requireRoles(roles.ALL_ROLES),
  limits.apiUserRateLimit,
  controller.authorize
);
router.post('/oauth/token', limits.authRateLimit, controller.token);
router.post('/oauth/revoke', limits.authRateLimit, controller.revokeToken);

// ---- Agent surface: requires a delegation access token ----
router.get('/actions', agentAuth.requireAgent, controller.actions);
router.post('/read', agentAuth.requireAgent, limits.apiUserRateLimit, controller.read);
router.post('/propose', agentAuth.requireAgent, limits.apiUserRateLimit, controller.propose);
router.post('/confirm', agentAuth.requireAgent, limits.apiUserRateLimit, controller.confirm);
router.post('/grant/revoke', agentAuth.requireAgent, controller.revokeOwnGrant);

// ---- User-facing grant management (Connected apps / kill switch) ----
router.get('/grants', auth.requireAuth, auth.requireRoles(roles.ALL_ROLES), controller.listGrants);
router.delete('/grants/:grantId', auth.requireAuth, auth.requireRoles(roles.ALL_ROLES), controller.userRevokeGrant);

module.exports = router;
