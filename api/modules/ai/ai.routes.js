var express = require('express');
var controller = require('./ai.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');

var router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.WRITE_ROLES));
router.use(limits.apiUserRateLimit);

router.post('/tasks/organize', controller.organizeTask);

module.exports = router;
