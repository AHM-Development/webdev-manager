var express = require('express');
var controller = require('./notifications.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');

var router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.ALL_ROLES));
router.use(limits.apiUserRateLimit);

router.get('/', controller.list);
router.get('/unread-count', controller.unreadCount);
router.patch('/:notificationId/read', controller.markRead);

router.get('/settings', auth.requireRoles([roles.ROLES.SUPERADMIN]), controller.getSettings);
router.patch('/settings', auth.requireRoles([roles.ROLES.SUPERADMIN]), controller.updateSettings);
router.post('/test', auth.requireRoles([roles.ROLES.SUPERADMIN]), controller.test);
router.post('/discord/test', auth.requireRoles([roles.ROLES.SUPERADMIN]), controller.testDiscord);
router.post('/email/test', auth.requireRoles([roles.ROLES.SUPERADMIN]), controller.testEmail);
router.post('/jobs/daily-summary/run', auth.requireRoles([roles.ROLES.SUPERADMIN]), controller.runDailySummary);
router.post('/jobs/pre-shift/run', auth.requireRoles([roles.ROLES.SUPERADMIN]), controller.runPreShift);
router.post('/jobs/weekly-digest/run', auth.requireRoles([roles.ROLES.SUPERADMIN]), controller.runWeeklyDigest);
router.post('/', auth.requireRoles(roles.WRITE_ROLES), controller.create);

module.exports = router;
