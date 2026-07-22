var express = require('express');
var controller = require('./tasks.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');
var uploads = require('../../lib/uploads');

var router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.ALL_ROLES));
router.use(limits.apiUserRateLimit);

// Upload a task attachment (image or document). Anyone who can create/edit a
// task may attach — STAFF_WRITE mirrors the create/update guard.
router.post(
  '/uploads',
  auth.requireRoles(roles.STAFF_WRITE_ROLES),
  uploads.uploadTaskFile.single('file'),
  controller.uploadAttachment
);

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
// Task comments (threaded, with @mentions). Any authenticated task viewer may
// read and post; deletion is restricted to the author or a Super Admin.
router.get('/:taskId/comments', controller.listComments);
router.post('/:taskId/comments', controller.createComment);
router.delete('/:taskId/comments/:commentId', controller.deleteComment);

module.exports = router;
