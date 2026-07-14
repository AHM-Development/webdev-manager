var express = require('express');
var controller = require('./website-health.controller');
var auth = require('../../middleware/auth');
var roles = require('../../config/roles');
var limits = require('../../middleware/rate-limit');

var router = express.Router();
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
router.get('/websites/:websiteId', controller.latest);
router.get('/websites/:websiteId/history', controller.history);
router.get('/websites/:websiteId/profile', controller.getProfile);
router.patch('/websites/:websiteId/profile', auth.requireRoles(roles.WRITE_ROLES), controller.updateProfile);
router.post('/websites/:websiteId/forms/test', auth.requireRoles(roles.WRITE_ROLES), controller.sendFormTest);

module.exports = router;
