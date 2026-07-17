'use strict';

// Locks the role model after the Web-Dev-Manager removal + Staff addition.

const test = require('node:test');
const assert = require('node:assert');
const roles = require('./roles');

test('the role set is exactly superadmin/developer/staff', () => {
  assert.deepEqual(
    [...roles.ALL_ROLES].sort(),
    ['developer', 'staff', 'superadmin']
  );
  assert.equal(roles.ROLES.WEB_DEV_MANAGER, undefined, 'web_dev_manager is gone');
  assert.equal(roles.ROLES.SPECTATOR, undefined, 'spectator is gone (folded into staff)');
});

test('WRITE_ROLES is the full-write tier (no staff)', () => {
  assert.deepEqual([...roles.WRITE_ROLES].sort(), ['developer', 'superadmin']);
  assert.equal(roles.WRITE_ROLES.includes('staff'), false);
});

test('STAFF_WRITE_ROLES adds staff on top of the write tier', () => {
  assert.deepEqual([...roles.STAFF_WRITE_ROLES].sort(), ['developer', 'staff', 'superadmin']);
});

test('MANAGER_ROLES is superadmin-only after the WDM removal', () => {
  assert.deepEqual([...roles.MANAGER_ROLES], ['superadmin']);
});

test('staff titles are the four designations (not permission roles)', () => {
  assert.deepEqual(
    [...roles.STAFF_TITLE_VALUES].sort(),
    ['client_success_manager', 'designer', 'operations', 'seo']
  );
  // A title must never be a role.
  roles.STAFF_TITLE_VALUES.forEach((title) => {
    assert.equal(roles.ALL_ROLES.includes(title), false, title + ' should not be a role');
  });
});
