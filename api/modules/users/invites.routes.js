var express = require('express');
var controller = require('./users.controller');
var limits = require('../../middleware/rate-limit');

var router = express.Router();

router.use(limits.authRateLimit);
router.get('/:token', controller.getInvite);
router.post('/:token/accept', controller.acceptInvite);

module.exports = router;
