'use strict';

var express = require('express');
var controller = require('./qa-criteria.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');
var uploads = require('../../lib/uploads');

var router = express.Router();

router.use(auth.requireAuth);
router.use(limits.apiUserRateLimit);

// Read is open to any authenticated user (this is the criteria API); all edits
// are Super Admin only.
router.get('/', auth.requireRoles(roles.ALL_ROLES), controller.getAll);

var admin = auth.requireRoles(roles.MANAGER_ROLES);
router.post('/groups', admin, controller.createGroup);
router.patch('/groups/:groupId', admin, controller.renameGroup);
router.delete('/groups/:groupId', admin, controller.deleteGroup);
router.post('/groups/:groupId/items', admin, controller.addItem);
router.patch('/items/:itemId', admin, controller.updateItem);
router.delete('/items/:itemId', admin, controller.deleteItem);
router.put('/prompt', admin, controller.savePrompt);
router.post('/template', admin, uploads.uploadQaTemplate.single('file'), controller.uploadTemplate);

module.exports = router;
