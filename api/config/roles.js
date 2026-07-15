var ROLES = Object.freeze({
  SUPERADMIN: 'superadmin',
  WEB_DEV_MANAGER: 'web_dev_manager',
  DEVELOPER: 'developer',
  DESIGNER: 'designer',
  CLIENT_SUCCESS_MANAGER: 'client_success_manager',
  SPECTATOR: 'spectator',
});

var ALL_ROLES = Object.freeze([
  ROLES.SUPERADMIN,
  ROLES.WEB_DEV_MANAGER,
  ROLES.DEVELOPER,
  ROLES.DESIGNER,
  ROLES.CLIENT_SUCCESS_MANAGER,
  ROLES.SPECTATOR,
]);

// Global write scope for existing features. Managers join developers/superadmins;
// designers & CSMs get scoped access through Client Logs role groups instead.
var WRITE_ROLES = Object.freeze([ROLES.SUPERADMIN, ROLES.WEB_DEV_MANAGER, ROLES.DEVELOPER]);

// Client Logs role groups.
var MANAGER_ROLES = Object.freeze([ROLES.SUPERADMIN, ROLES.WEB_DEV_MANAGER]);
var STAFF_ROLES = Object.freeze([
  ROLES.SUPERADMIN,
  ROLES.WEB_DEV_MANAGER,
  ROLES.DEVELOPER,
  ROLES.DESIGNER,
  ROLES.CLIENT_SUCCESS_MANAGER,
]);

module.exports = {
  ROLES: ROLES,
  ALL_ROLES: ALL_ROLES,
  WRITE_ROLES: WRITE_ROLES,
  MANAGER_ROLES: MANAGER_ROLES,
  STAFF_ROLES: STAFF_ROLES,
};
