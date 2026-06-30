var express = require('express');
var controller = require('./settings.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');

var router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRoles([roles.ROLES.SUPERADMIN]));
router.use(limits.apiUserRateLimit);

router.get('/workspace', controller.getWorkspace);
router.patch('/workspace', controller.updateWorkspace);

router.get('/email-connector', controller.getEmailConnector);
router.patch('/email-connector', controller.updateEmailConnector);
router.post('/email-connector/google/connect', controller.connectGoogle);
router.post('/email-connector/google/disconnect', controller.disconnectGoogle);
router.post('/email-connector/test', controller.testEmailConnector);

router.get('/ai-prompts/:promptKey', controller.getAiPrompt);
router.patch('/ai-prompts/:promptKey', controller.updateAiPrompt);

module.exports = router;
