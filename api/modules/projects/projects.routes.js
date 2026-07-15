var express = require('express');
var multer = require('multer');
var controller = require('./projects.controller');
var auth = require('../../middleware/auth');
var roles = require('../../config/roles');

var router = express.Router();
var upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.ALL_ROLES));
router.use(require('../../middleware/rate-limit').apiUserRateLimit);

router.get('/', controller.list);
router.get('/options', controller.options);
router.post('/import/preview', auth.requireRoles(roles.WRITE_ROLES), upload.single('file'), controller.previewImport);
router.post('/import', auth.requireRoles(roles.WRITE_ROLES), upload.single('file'), controller.importProjects);
router.post('/', auth.requireRoles(roles.WRITE_ROLES), controller.create);
router.get('/:projectId', controller.get);
router.patch('/:projectId', auth.requireRoles(roles.WRITE_ROLES), controller.update);
router.patch('/:projectId/priority', auth.requireRoles(roles.WRITE_ROLES), controller.updatePriority);
router.patch('/:projectId/status', auth.requireRoles(roles.WRITE_ROLES), controller.updateStatus);
router.delete('/:projectId', auth.requireRoles([roles.ROLES.SUPERADMIN]), controller.remove);

module.exports = router;
