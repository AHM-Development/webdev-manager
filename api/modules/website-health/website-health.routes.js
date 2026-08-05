var express = require('express');
var controller = require('./website-health.controller');
var auth = require('../../middleware/auth');
var roles = require('../../config/roles');
var limits = require('../../middleware/rate-limit');
var uploads = require('../../lib/uploads');

var router = express.Router();

// Public, token-authenticated Website QA push (the external Claude runner).
// Defined BEFORE the auth gate below so it authenticates via its own bearer
// token (which identifies the website) rather than a user session.
router.post('/qa-results', limits.apiIpRateLimit, controller.submitQaResultsByToken);

router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.ALL_ROLES));
router.use(limits.apiUserRateLimit);

router.get('/', controller.list);
router.get('/capabilities', controller.capabilities);
router.get('/checklists', controller.checklistList);
router.get('/checklists/:key', controller.checklistGet);
router.post('/scans', auth.requireRoles(roles.WRITE_ROLES), controller.createScan);
router.get('/scans/:scanId', controller.getScan);
router.get('/scans/:scanId/pages', controller.pages);
router.post('/scans/:scanId/cancel', auth.requireRoles(roles.WRITE_ROLES), controller.cancel);
router.post('/scans/:scanId/retry', auth.requireRoles(roles.WRITE_ROLES), controller.retry);
router.get('/scans/:scanId/report', controller.report);
router.patch('/findings/:findingId', auth.requireRoles(roles.WRITE_ROLES), controller.updateFinding);
// Clear a website's scan history — Super Admin only (destructive).
router.post('/websites/:websiteId/reset', auth.requireRoles(roles.MANAGER_ROLES), controller.reset);

// Website QA — the AI pushes findings against the QA criteria; anyone may read.
router.get('/websites/:websiteId/qa-results', controller.getQaResults);
router.post('/websites/:websiteId/qa-results', auth.requireRoles(roles.WRITE_ROLES), controller.submitQaResults);
router.delete('/websites/:websiteId/qa-results', auth.requireRoles(roles.WRITE_ROLES), controller.resetQaResults);

// QA Runner: per-website push token + the copyable prompt (Super-Admin + Developer).
router.get('/websites/:websiteId/qa-runner', auth.requireRoles(roles.WRITE_ROLES), controller.getQaRunner);
router.post('/websites/:websiteId/qa-runner/token', auth.requireRoles(roles.WRITE_ROLES), controller.generateQaToken);
router.delete('/websites/:websiteId/qa-runner/token', auth.requireRoles(roles.WRITE_ROLES), controller.revokeQaToken);

router.get('/websites/:websiteId', controller.latest);
router.get('/websites/:websiteId/history', controller.history);
router.get('/websites/:websiteId/profile', controller.getProfile);
router.patch('/websites/:websiteId/profile', auth.requireRoles(roles.WRITE_ROLES), controller.updateProfile);
router.post('/websites/:websiteId/forms/test', auth.requireRoles(roles.WRITE_ROLES), controller.sendFormTest);

// Manual forms test verification (evidence-backed sign-off).
router.post('/uploads', auth.requireRoles(roles.WRITE_ROLES), uploads.uploadFormEvidence.single('file'), controller.uploadEvidence);
router.get('/websites/:websiteId/form-verifications', controller.listFormVerifications);
router.put('/websites/:websiteId/form-verifications/:formKey', auth.requireRoles(roles.WRITE_ROLES), controller.saveFormVerification);
router.delete('/websites/:websiteId/form-verifications/:formKey', auth.requireRoles(roles.WRITE_ROLES), controller.deleteFormVerification);
// Manual Design QA sign-off (per page, evidence-backed). Reuses the /uploads endpoint for screenshots.
router.get('/websites/:websiteId/design-verifications', controller.listDesignVerifications);
router.put('/websites/:websiteId/design-verifications/:pageKey', auth.requireRoles(roles.WRITE_ROLES), controller.saveDesignVerification);
router.delete('/websites/:websiteId/design-verifications/:pageKey', auth.requireRoles(roles.WRITE_ROLES), controller.deleteDesignVerification);

module.exports = router;
