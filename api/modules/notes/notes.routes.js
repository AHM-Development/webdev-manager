var express = require('express');
var controller = require('./notes.controller');
var auth = require('../../middleware/auth');
var limits = require('../../middleware/rate-limit');
var roles = require('../../config/roles');

var router = express.Router();
router.use(auth.requireAuth);
router.use(auth.requireRoles(roles.ALL_ROLES));
router.use(limits.apiUserRateLimit);

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:noteId', controller.update);
router.delete('/:noteId', controller.remove);

module.exports = router;
