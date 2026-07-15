var express = require('express');
var router = express.Router();
var authRoutes = require('../modules/auth/auth.routes');
var projectRoutes = require('../modules/projects/projects.routes');
var userRoutes = require('../modules/users/users.routes');
var inviteRoutes = require('../modules/users/invites.routes');
var profileRoutes = require('../modules/users/profile.routes');
var usersController = require('../modules/users/users.controller');
var settingsRoutes = require('../modules/settings/settings.routes');
var notificationRoutes = require('../modules/notifications/notifications.routes');
var activityLogRoutes = require('../modules/activity-logs/activity-logs.routes');
var websiteUserRoutes = require('../modules/website-users/website-users.routes');
var issueRoutes = require('../modules/issues/issues.routes');
var aiRoutes = require('../modules/ai/ai.routes');
var taskRoutes = require('../modules/tasks/tasks.routes');
var noteRoutes = require('../modules/notes/notes.routes');
var websiteHealthRoutes = require('../modules/website-health/website-health.routes');
var wordpressConnectorRoutes = require('../modules/connectors/wordpress.routes');
var clientLogRoutes = require('../modules/client-logs/client-logs.routes');
var agentRoutes = require('../modules/agent/agent.routes');
var auth = require('../middleware/auth');
var limits = require('../middleware/rate-limit');
var roles = require('../config/roles');

/* GET /api/v1/health — liveness check for compose / load balancers. */
router.get('/health', function(req, res) {
  res.json({
    status: 'ok',
    service: 'api',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

router.use('/auth', authRoutes);
router.use('/invites', inviteRoutes);
router.use('/projects', limits.apiIpRateLimit, projectRoutes);
router.use('/users', limits.apiIpRateLimit, userRoutes);
router.use('/profile', limits.apiIpRateLimit, profileRoutes);
router.use('/settings', limits.apiIpRateLimit, settingsRoutes);
router.use('/notifications', limits.apiIpRateLimit, notificationRoutes);
router.use('/activity-logs', limits.apiIpRateLimit, activityLogRoutes);
router.use('/website-users', limits.apiIpRateLimit, websiteUserRoutes);
router.use('/issues', limits.apiIpRateLimit, issueRoutes);
router.use('/ai', limits.apiIpRateLimit, aiRoutes);
router.use('/tasks', limits.apiIpRateLimit, taskRoutes);
router.use('/notes', limits.apiIpRateLimit, noteRoutes);
router.use('/website-health', limits.apiIpRateLimit, websiteHealthRoutes);
router.use('/connectors/wordpress', wordpressConnectorRoutes);
router.use('/client-logs', limits.apiIpRateLimit, clientLogRoutes);
// Viktor agent surface manages its own auth (delegation token / OAuth client).
router.use('/agent', limits.apiIpRateLimit, agentRoutes);

router.post(
  '/integrations/discord/test-user',
  limits.authRateLimit,
  usersController.testDiscord
);

// All routes registered below this line require a valid access token.
router.use(limits.apiIpRateLimit);
router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.ALL_ROLES));
router.use(limits.apiUserRateLimit);

router.get('/secure-health', function(req, res) {
  res.json({
    status: 'ok',
    user: {
      id: String(req.user.id),
      role: req.user.role
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
