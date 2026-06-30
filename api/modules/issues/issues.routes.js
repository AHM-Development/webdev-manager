var express = require('express');
var controller = require('./issues.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');

var router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.ALL_ROLES));
router.use(limits.apiUserRateLimit);

router.get('/', controller.list);
router.get('/options', controller.options);
router.post('/', auth.requireRoles(roles.WRITE_ROLES), controller.create);
router.get('/:issueId', controller.get);
router.patch('/:issueId', auth.requireRoles(roles.WRITE_ROLES), controller.update);
router.patch('/:issueId/status', auth.requireRoles(roles.WRITE_ROLES), controller.updateStatus);
router.delete('/:issueId', auth.requireRoles(roles.WRITE_ROLES), controller.remove);
router.post('/:issueId/applications', auth.requireRoles(roles.WRITE_ROLES), controller.addApplications);
router.patch(
  '/:issueId/applications/:applicationId',
  auth.requireRoles(roles.WRITE_ROLES),
  controller.updateApplication
);
router.delete(
  '/:issueId/applications/:applicationId',
  auth.requireRoles(roles.WRITE_ROLES),
  controller.removeApplication
);

module.exports = router;
