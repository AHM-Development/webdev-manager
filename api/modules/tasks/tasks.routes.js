var express = require('express');
var controller = require('./tasks.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');

var router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.ALL_ROLES));
router.use(limits.apiUserRateLimit);

router.get('/', controller.list);
router.get('/my', controller.mine);
router.get('/assignees', controller.assignees);
router.post('/', auth.requireRoles(roles.STAFF_WRITE_ROLES), controller.create);
router.patch('/move', auth.requireRoles(roles.WRITE_ROLES), controller.move);
router.get('/:taskId', controller.get);
router.patch('/:taskId', auth.requireRoles(roles.STAFF_WRITE_ROLES), controller.update);
router.patch('/:taskId/status', auth.requireRoles(roles.STAFF_WRITE_ROLES), controller.updateStatus);
// Staff may withdraw their own pending request; the service enforces the scope.
router.delete('/:taskId', auth.requireRoles(roles.STAFF_WRITE_ROLES), controller.remove);
// Approve / reject a task request — Super Admin & Developer only.
router.post('/:taskId/approve', auth.requireRoles(roles.WRITE_ROLES), controller.approve);
router.post('/:taskId/reject', auth.requireRoles(roles.WRITE_ROLES), controller.reject);

module.exports = router;
