var express = require('express');
var controller = require('./client-logs.controller');
var auth = require('../../middleware/auth');
var roles = require('../../config/roles');
var limits = require('../../middleware/rate-limit');

var router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.ALL_ROLES));
router.use(limits.apiUserRateLimit);

// Base templates: readable by all staff, but only Administrators (super-admins)
// create/edit/organise/delete the reusable "base lists".
var SUPERADMIN = [roles.ROLES.SUPERADMIN];
router.get('/templates', controller.listTemplates);
router.get('/templates/:templateId', controller.getTemplate);
router.post('/templates', auth.requireRoles(SUPERADMIN), controller.createTemplate);
router.patch('/templates/:templateId', auth.requireRoles(SUPERADMIN), controller.updateTemplate);
router.delete('/templates/:templateId', auth.requireRoles(SUPERADMIN), controller.deleteTemplate);
router.post('/templates/:templateId/stages', auth.requireRoles(SUPERADMIN), controller.addTemplateStage);
router.patch('/templates/:templateId/stages/:stageId', auth.requireRoles(SUPERADMIN), controller.updateTemplateStage);
router.post('/templates/:templateId/reorder', auth.requireRoles(SUPERADMIN), controller.reorderTemplateStages);
router.delete('/templates/:templateId/stages/:stageId', auth.requireRoles(SUPERADMIN), controller.removeTemplateStage);

// Client Logs overview (one summarized row per client, searchable + paginated).
router.get('/overview', controller.overview);

// Assignable staff users (owners / reviewers / assignees).
router.get('/assignable-users', controller.assignableUsers);

// Website stage timelines.
router.get('/projects/:projectId/stages', controller.listStages);
router.post('/projects/:projectId/apply-template', auth.requireRoles(roles.MANAGER_ROLES), controller.applyTemplate);
router.get('/projects/:projectId/launch-readiness', controller.launchReadiness);
router.delete('/projects/:projectId/client-logs', auth.requireRoles([roles.ROLES.SUPERADMIN]), controller.clearClientLogs);
router.get('/stages/:stageId', controller.getStage);
router.patch('/stages/:stageId', auth.requireRoles(roles.WRITE_ROLES), controller.updateStage);
// Per-client stage management (add / remove / reorder) — Managers & Admins.
router.post('/projects/:projectId/stages', auth.requireRoles(roles.MANAGER_ROLES), controller.addStage);
router.post('/projects/:projectId/stages/reorder', auth.requireRoles(roles.MANAGER_ROLES), controller.reorderStages);
router.delete('/stages/:stageId', auth.requireRoles(roles.MANAGER_ROLES), controller.removeStage);
router.post('/stages/:stageId/tasks', auth.requireRoles(roles.WRITE_ROLES), controller.createStageTask);
router.post('/stages/:stageId/tasks/link', auth.requireRoles(roles.WRITE_ROLES), controller.linkStageTask);
router.delete('/stages/:stageId/tasks/:taskId', auth.requireRoles(roles.WRITE_ROLES), controller.unlinkStageTask);

// Meetings & AI-imported actions (the import endpoint is the n8n surface).
router.post('/meetings/import', auth.requireRoles(roles.WRITE_ROLES), controller.importMeeting);
router.get('/projects/:projectId/meetings', controller.listMeetings);
router.post('/meeting-actions/:actionId/confirm', auth.requireRoles(roles.WRITE_ROLES), controller.confirmMeetingAction);
router.post('/meeting-actions/:actionId/reject', auth.requireRoles(roles.WRITE_ROLES), controller.rejectMeetingAction);

module.exports = router;
