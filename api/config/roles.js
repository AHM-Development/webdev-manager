var ROLES = Object.freeze({
  SUPERADMIN: 'superadmin',
  DEVELOPER: 'developer',
  STAFF: 'staff',
});

var ALL_ROLES = Object.freeze([
  ROLES.SUPERADMIN,
  ROLES.DEVELOPER,
  ROLES.STAFF,
]);

// Full write tier — projects, tasks CRUD, issues, website health, credentials,
// activity logs, AI. Staff is deliberately excluded (it gets scoped write only).
var WRITE_ROLES = Object.freeze([ROLES.SUPERADMIN, ROLES.DEVELOPER]);

// Structural / admin actions: Client Logs templates & stage add/reorder/remove.
var MANAGER_ROLES = Object.freeze([ROLES.SUPERADMIN]);

// Scoped write for Staff: add/update tasks and update Client Logs (edit stages,
// stage tasks, meetings). Developers & superadmins are included as a superset.
var STAFF_WRITE_ROLES = Object.freeze([ROLES.SUPERADMIN, ROLES.DEVELOPER, ROLES.STAFF]);

// Staff job titles — a per-user designation, NOT a permission role. They label
// what kind of Staff member someone is; permissions come solely from the role.
var STAFF_TITLES = Object.freeze({
  CLIENT_SUCCESS_MANAGER: 'client_success_manager',
  DESIGNER: 'designer',
  SEO: 'seo',
  OPERATIONS: 'operations',
});

var STAFF_TITLE_VALUES = Object.freeze([
  STAFF_TITLES.CLIENT_SUCCESS_MANAGER,
  STAFF_TITLES.DESIGNER,
  STAFF_TITLES.SEO,
  STAFF_TITLES.OPERATIONS,
]);

module.exports = {
  ROLES: ROLES,
  ALL_ROLES: ALL_ROLES,
  WRITE_ROLES: WRITE_ROLES,
  MANAGER_ROLES: MANAGER_ROLES,
  STAFF_WRITE_ROLES: STAFF_WRITE_ROLES,
  STAFF_TITLES: STAFF_TITLES,
  STAFF_TITLE_VALUES: STAFF_TITLE_VALUES,
};
