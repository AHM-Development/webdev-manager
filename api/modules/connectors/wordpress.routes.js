var express = require('express');
var controller = require('./wordpress.controller');
var auth = require('../../middleware/auth');
var roles = require('../../config/roles');
var limits = require('../../middleware/rate-limit');

var router = express.Router();

router.post('/pair', limits.authRateLimit, controller.pair);
router.post('/heartbeat', limits.apiIpRateLimit, controller.heartbeat);
router.use(auth.requireAuth);
router.use(limits.apiUserRateLimit);
router.get('/:websiteId', auth.requireRoles(roles.ALL_ROLES), controller.get);
router.post('/:websiteId/pairing-code', auth.requireRoles(roles.WRITE_ROLES), controller.pairingCode);
router.post('/:websiteId/refresh', auth.requireRoles(roles.WRITE_ROLES), controller.refresh);
router.delete('/:websiteId', auth.requireRoles([roles.ROLES.SUPERADMIN]), controller.revoke);

module.exports = router;
