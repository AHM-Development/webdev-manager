var db = require('../../db/pool');

var PAGE_SIZE_DEFAULT = 8;
var PAGE_SIZE_MAX = 100;

function safeLimit(value) {
  return Math.min(Math.max(Number(value) || PAGE_SIZE_DEFAULT, 1), PAGE_SIZE_MAX);
}

function safePage(value) {
  return Math.max(Number(value) || 1, 1);
}

function dateFilter(field, filters, where, params) {
  if (filters.from) {
    where.push(field + ' >= :fromDate');
    params.fromDate = String(filters.from) + ' 00:00:00';
  }
  if (filters.to) {
    where.push(field + ' <= :toDate');
    params.toDate = String(filters.to) + ' 23:59:59';
  }
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return {};
  }
}

function mapUserLog(row) {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    name: row.user_name || row.name || 'System',
    email: row.user_email || row.email || null,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    action: row.action || row.event_type,
    eventType: row.event_type,
    description: row.description,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    severity: row.severity,
    metadata: parseJson(row.metadata),
    createdAt: row.created_at,
  };
}

function mapWebsiteLog(row) {
  return {
    id: String(row.id),
    projectId: row.project_id ? String(row.project_id) : null,
    projectName: row.project_name,
    websiteId: row.website_id ? String(row.website_id) : null,
    websiteName: row.website_name,
    websiteUrl: row.website_url,
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    name: row.actor_name || 'System',
    email: row.actor_email,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    action: row.action,
    description: row.description,
    severity: row.severity,
    source: row.source,
    metadata: parseJson(row.metadata),
    createdAt: row.created_at,
  };
}

async function listUserActivity(filters) {
  var page = safePage(filters.page);
  var pageSize = safeLimit(filters.pageSize);
  var offset = (page - 1) * pageSize;
  var where = ['1 = 1'];
  var params = {};

  if (filters.userId && filters.userId !== 'all') {
    where.push('al.user_id = :userId');
    params.userId = filters.userId;
  }
  if (filters.eventType && filters.eventType !== 'all') {
    where.push('al.event_type = :eventType');
    params.eventType = filters.eventType;
  }
  dateFilter('al.created_at', filters, where, params);

  var countRows = await db.query(
    'SELECT COUNT(*) AS count FROM activity_logs al WHERE ' + where.join(' AND '),
    params
  );
  var rows = await db.query(
    `SELECT al.*, u.name, u.email
     FROM activity_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE ` + where.join(' AND ') + `
     ORDER BY al.created_at DESC
     LIMIT ` + pageSize + ' OFFSET ' + offset,
    params
  );

  return {
    rows: rows.map(mapUserLog),
    page: page,
    pageSize: pageSize,
    total: Number(countRows[0].count || 0),
  };
}

async function listWebsiteActivity(filters) {
  var page = safePage(filters.page);
  var pageSize = safeLimit(filters.pageSize);
  var offset = (page - 1) * pageSize;
  var where = ['1 = 1'];
  var params = {};

  if (filters.projectId && filters.projectId !== 'all') {
    where.push('wal.project_id = :projectId');
    params.projectId = filters.projectId;
  }
  if (filters.websiteId && filters.websiteId !== 'all') {
    where.push('wal.website_id = :websiteId');
    params.websiteId = filters.websiteId;
  }
  if (filters.action && filters.action !== 'all') {
    where.push('wal.action = :action');
    params.action = filters.action;
  }
  dateFilter('wal.created_at', filters, where, params);

  var countRows = await db.query(
    'SELECT COUNT(*) AS count FROM website_activity_logs wal WHERE ' + where.join(' AND '),
    params
  );
  var rows = await db.query(
    `SELECT wal.*
     FROM website_activity_logs wal
     WHERE ` + where.join(' AND ') + `
     ORDER BY wal.created_at DESC
     LIMIT ` + pageSize + ' OFFSET ' + offset,
    params
  );

  return {
    rows: rows.map(mapWebsiteLog),
    page: page,
    pageSize: pageSize,
    total: Number(countRows[0].count || 0),
  };
}

async function userOptions() {
  var users = await db.query(
    `SELECT DISTINCT COALESCE(al.user_id, u.id) AS id,
            COALESCE(al.user_name, u.name, 'System') AS name
     FROM activity_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ORDER BY name ASC`
  );
  var events = await db.query(
    `SELECT DISTINCT event_type
     FROM activity_logs
     ORDER BY event_type ASC`
  );
  return {
    users: users
      .filter(function(row) { return row.id; })
      .map(function(row) {
        return { id: String(row.id), name: row.name };
      }),
    eventTypes: events.map(function(row) {
      return row.event_type;
    }),
  };
}

async function websiteOptions() {
  var projects = await db.query(
    `SELECT DISTINCT COALESCE(wal.project_id, p.id) AS id,
            COALESCE(wal.project_name, p.client_name) AS name
     FROM website_activity_logs wal
     LEFT JOIN projects p ON p.id = wal.project_id
     WHERE COALESCE(wal.project_id, p.id) IS NOT NULL
     ORDER BY name ASC`
  );
  var websites = await db.query(
    `SELECT DISTINCT COALESCE(wal.website_id, pw.id) AS id,
            COALESCE(wal.website_name, pw.name) AS name,
            COALESCE(wal.website_url, pw.url) AS url
     FROM website_activity_logs wal
     LEFT JOIN project_websites pw ON pw.id = wal.website_id
     WHERE COALESCE(wal.website_id, pw.id) IS NOT NULL
     ORDER BY name ASC`
  );
  var actions = await db.query(
    `SELECT DISTINCT action
     FROM website_activity_logs
     ORDER BY action ASC`
  );
  return {
    projects: projects.map(function(row) {
      return { id: String(row.id), name: row.name };
    }),
    websites: websites.map(function(row) {
      return { id: String(row.id), name: row.name, url: row.url };
    }),
    actions: actions.map(function(row) {
      return row.action;
    }),
  };
}

async function logWebsiteActivity(input) {
  await db.query(
    `INSERT INTO website_activity_logs
      (project_id, project_name, website_id, website_name, website_url,
       actor_user_id, actor_name, actor_email, ip_address, user_agent,
       action, description, severity, source, metadata)
     VALUES
      (:projectId, :projectName, :websiteId, :websiteName, :websiteUrl,
       :actorUserId, :actorName, :actorEmail, :ip, :userAgent,
       :action, :description, :severity, :source, :metadata)`,
    {
      projectId: input.projectId || null,
      projectName: input.projectName || null,
      websiteId: input.websiteId || null,
      websiteName: input.websiteName || null,
      websiteUrl: input.websiteUrl || null,
      actorUserId: input.actorUserId || (input.user && input.user.id) || null,
      actorName: input.actorName || (input.user && input.user.name) || null,
      actorEmail: input.actorEmail || (input.user && input.user.email) || null,
      ip: input.ip || null,
      userAgent: input.userAgent || null,
      action: input.action,
      description: input.description || null,
      severity: input.severity || 'info',
      source: input.source || 'user',
      metadata: JSON.stringify(input.metadata || {}),
    }
  );
}

module.exports = {
  listUserActivity: listUserActivity,
  listWebsiteActivity: listWebsiteActivity,
  userOptions: userOptions,
  websiteOptions: websiteOptions,
  logWebsiteActivity: logWebsiteActivity,
};
