var express = require('express');
var controller = require('./activity-logs.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');

var router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.WRITE_ROLES));
router.use(limits.apiUserRateLimit);

router.get('/users', controller.listUserActivity);
router.get('/users/options', controller.userOptions);
router.get('/websites', controller.listWebsiteActivity);
router.get('/websites/options', controller.websiteOptions);
router.post('/websites', controller.createWebsiteActivity);

module.exports = router;
