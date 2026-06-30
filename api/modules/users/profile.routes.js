var express = require('express');
var controller = require('./users.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');

var router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.ALL_ROLES));
router.use(limits.apiUserRateLimit);

router.get('/', controller.getProfile);
router.patch('/', controller.updateProfile);
router.post('/avatar', controller.updateAvatar);
router.post('/password/otp', controller.sendPasswordOtp);
router.post('/password', controller.changePassword);

module.exports = router;
