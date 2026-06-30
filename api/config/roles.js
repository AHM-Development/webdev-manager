var ROLES = Object.freeze({
  SUPERADMIN: 'superadmin',
  DEVELOPER: 'developer',
  SPECTATOR: 'spectator',
});

var ALL_ROLES = Object.freeze([
  ROLES.SUPERADMIN,
  ROLES.DEVELOPER,
  ROLES.SPECTATOR,
]);

var WRITE_ROLES = Object.freeze([ROLES.SUPERADMIN, ROLES.DEVELOPER]);

module.exports = {
  ROLES: ROLES,
  ALL_ROLES: ALL_ROLES,
  WRITE_ROLES: WRITE_ROLES,
};
