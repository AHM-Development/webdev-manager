var PROJECT_TYPES = ['One Pager', 'Full Web Dev'];
var PROJECT_STATUSES = ['Live', 'Staging', 'In Progress', 'Site Handed Over', 'Churned'];
var PROJECT_PRIORITIES = ['High', 'Medium', 'Low'];
var DOMAIN_MANAGEMENT_OPTIONS = ['Client Domain', 'Cloudflare'];
var SERVER_LOCATION_OPTIONS = ['Client', 'Hetzner', 'AWS'];

function normalizeOption(value, options, fallback) {
  var normalized = String(value || '').trim().toLowerCase();
  return options.find(function(option) {
    return option.toLowerCase() === normalized;
  }) || fallback;
}

module.exports = {
  PROJECT_TYPES: PROJECT_TYPES,
  PROJECT_STATUSES: PROJECT_STATUSES,
  PROJECT_PRIORITIES: PROJECT_PRIORITIES,
  DOMAIN_MANAGEMENT_OPTIONS: DOMAIN_MANAGEMENT_OPTIONS,
  SERVER_LOCATION_OPTIONS: SERVER_LOCATION_OPTIONS,
  normalizeOption: normalizeOption,
};
