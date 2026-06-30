var express = require('express');
var controller = require('./users.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');

var router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRoles([roles.ROLES.SUPERADMIN]));
router.use(limits.apiUserRateLimit);

router.get('/', controller.listUsers);
router.get('/invites', controller.listInvites);
router.post('/invites', controller.createInvite);
router.post('/invites/:inviteId/resend', controller.resendInvite);
router.delete('/invites/:inviteId', controller.revokeInvite);
router.get('/:userId', controller.getUser);
router.patch('/:userId', controller.updateUser);
router.delete('/:userId', controller.deleteUser);

module.exports = router;
