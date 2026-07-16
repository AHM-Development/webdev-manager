var express = require('express');
var controller = require('./auth.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');

var router = express.Router();

router.post('/login', limits.authRateLimit, controller.login);
router.post('/refresh', limits.authRateLimit, controller.refresh);
router.post('/reset-password', limits.authRateLimit, controller.resetPassword);
router.post('/register', limits.authRateLimit, function(req, res) {
  res.status(404).json({
    error: {
      code: 'REGISTRATION_INVITE_ONLY',
      message: 'Registration is available by invitation only.',
    },
  });
});

router.use(auth.requireAuth);
router.use(auth.requireRoles(require('../../config/roles').ALL_ROLES));
router.use(limits.apiUserRateLimit);

router.get('/me', controller.me);
router.post('/logout', controller.logout);
router.post('/logout-all', controller.logoutAll);
router.get('/sessions', controller.sessions);
router.delete('/sessions/:sessionId', controller.revokeSession);
router.get('/activity', controller.activity);

module.exports = router;
