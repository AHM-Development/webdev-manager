var express = require('express');
var multer = require('multer');
var controller = require('./website-users.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');

var router = express.Router();
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.WRITE_ROLES));
router.use(limits.apiUserRateLimit);

router.get('/', controller.list);
router.get('/options', controller.options);
router.post('/import/preview', upload.single('file'), controller.previewImport);
router.post('/import', upload.single('file'), controller.importCredentials);
router.post('/', controller.create);
router.patch('/:credentialId', controller.update);
router.delete('/:credentialId', auth.requireRoles([roles.ROLES.SUPERADMIN]), controller.remove);
router.post('/:credentialId/reveal', controller.reveal);
router.post('/:credentialId/copy-package', controller.copyPackage);

module.exports = router;
