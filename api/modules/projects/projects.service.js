var db = require('../../db/pool');
var activity = require('../auth/activity.service');
var options = require('./project-options');
var parser = require('./import-parser');
var googleSheets = require('./google-sheets.service');

function badRequest(message, code) {
  var err = new Error(message);
  err.status = 400;
  err.code = code || 'VALIDATION_ERROR';
  return err;
}

function notFound() {
  var err = new Error('Project not found.');
  err.status = 404;
  err.code = 'PROJECT_NOT_FOUND';
  return err;
}

function validateUrl(value, field) {
  if (!value) return '';
  try {
    return new URL(String(value).trim()).toString();
  } catch {
    throw badRequest(field + ' must be a valid URL.');
  }
}

// Tolerant URL for bulk import: never throws — prepends https:// to a bare
// domain, and returns '' for anything that still isn't a URL (so the row can
// still import without that link rather than failing the whole batch).
function lenientUrl(value) {
  var raw = String(value || '').trim();
  if (!raw) return '';
  try { return new URL(raw).toString(); } catch (e) { /* try with scheme */ }
  try { return new URL('https://' + raw).toString(); } catch (e) { /* give up */ }
  return '';
}

// `lenient` (bulk import) never rejects a row for a bad/missing URL or a
// website-less project — it salvages what it can so legacy data imports whole.
function normalizePayload(input, lenient) {
  var clientName = String(input.clientName || '').trim();
  if (!clientName) throw badRequest('Client name is required.');

  var websites = Array.isArray(input.websites) ? input.websites : [];
  websites = websites
    .map(function(website, index) {
      var name = String(website.name || '').trim() || 'Website ' + (index + 1);
      var url = lenient ? lenientUrl(website.url) : validateUrl(website.url, 'Website URL');
      if (!url) return null;
      return { name: name, url: url };
    })
    .filter(Boolean);

  if (!websites.length && !lenient) throw badRequest('Add at least one website/domain.');

  return {
    clientName: clientName,
    type: options.normalizeOption(input.type, options.PROJECT_TYPES, 'Full Web Dev'),
    assigneeName: String(input.assigneeName || input.assignee || '').trim() || 'Unassigned',
    status: options.normalizeOption(input.status, options.PROJECT_STATUSES, 'In Progress'),
    priority: options.normalizeOption(input.priority, options.PROJECT_PRIORITIES, 'Medium'),
    figmaLink: (lenient ? lenientUrl(input.figmaLink) : validateUrl(input.figmaLink, 'Figma link')) || null,
    domainManagement: options.normalizeOption(
      input.domainManagement,
      options.DOMAIN_MANAGEMENT_OPTIONS,
      'Cloudflare'
    ),
    serverLocation: options.normalizeOption(
      input.serverLocation,
      options.SERVER_LOCATION_OPTIONS,
      'Hetzner'
    ),
    websites: websites,
  };
}

async function assertRegisteredAssignee(assigneeName) {
  if (assigneeName === 'Unassigned') return;
  var rows = await db.query(
    `SELECT id
     FROM users
     WHERE deleted_at IS NULL
       AND status = 'active'
       AND role IN ('superadmin', 'developer')
       AND name = :assigneeName
     LIMIT 1`,
    { assigneeName: assigneeName }
  );
  if (!rows[0]) {
    throw badRequest('Select an active registered user as the assignee.', 'ASSIGNEE_INVALID');
  }
}

function rowToProject(row) {
  var websites = [];
  if (row.websites_json) {
    try {
      var parsedWebsites = Array.isArray(row.websites_json)
        ? row.websites_json
        : JSON.parse(row.websites_json);
      websites = parsedWebsites.filter(function(website) {
        return website && website.id;
      });
    } catch {
      websites = [];
    }
  }

  return {
    id: String(row.id),
    clientName: row.client_name,
    type: row.type,
    assignee: { name: row.assignee_name },
    status: row.status,
    priority: row.priority,
    liveLink: websites[0] ? websites[0].url : undefined,
    stagingLink: undefined,
    websites: websites.map(function(website) {
      return {
        id: String(website.id),
        name: website.name,
        url: website.url,
      };
    }),
    figmaLink: row.figma_link || undefined,
    domainManagement: row.domain_management,
    serverLocation: row.server_location,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getProjectRows(whereSql, params) {
  return db.query(
    `SELECT
       p.*,
       COALESCE(
         JSON_ARRAYAGG(
           CASE
             WHEN pw.id IS NULL THEN NULL
             ELSE JSON_OBJECT('id', pw.id, 'name', pw.name, 'url', pw.url, 'sortOrder', pw.sort_order)
           END
         ),
         JSON_ARRAY()
       ) AS websites_json
     FROM projects p
     LEFT JOIN project_websites pw ON pw.project_id = p.id
     ` + whereSql + `
     GROUP BY p.id
     ORDER BY FIELD(p.priority, 'High', 'Medium', 'Low'), p.updated_at DESC`,
    params || {}
  );
}

async function listProjects(filters) {
  var clauses = ['p.deleted_at IS NULL'];
  var params = {};

  if (filters.assignee) {
    clauses.push('p.assignee_name = :assignee');
    params.assignee = filters.assignee;
  }
  if (filters.type) {
    clauses.push('p.type = :type');
    params.type = filters.type;
  }
  if (filters.status) {
    clauses.push('p.status = :status');
    params.status = filters.status;
  }
  if (filters.priority) {
    clauses.push('p.priority = :priority');
    params.priority = filters.priority;
  }

  var rows = await getProjectRows('WHERE ' + clauses.join(' AND '), params);
  return rows.map(rowToProject);
}

async function getProject(projectId) {
  var rows = await getProjectRows(
    'WHERE p.deleted_at IS NULL AND p.id = :projectId',
    { projectId: projectId }
  );
  if (!rows[0]) throw notFound();
  return rowToProject(rows[0]);
}

async function replaceWebsites(projectId, websites) {
  await db.query('DELETE FROM project_websites WHERE project_id = :projectId', {
    projectId: projectId,
  });

  for (var index = 0; index < websites.length; index += 1) {
    await db.query(
      `INSERT INTO project_websites (project_id, name, url, sort_order)
       VALUES (:projectId, :name, :url, :sortOrder)`,
      {
        projectId: projectId,
        name: websites[index].name,
        url: websites[index].url,
        sortOrder: index,
      }
    );
  }
}

async function createProject(input, user, context, options) {
  options = options || {};
  var payload = normalizePayload(input, options.lenient);
  // Bulk import keeps the raw assignee name even if that person isn't a user
  // yet; the interactive create form still enforces a registered assignee.
  if (!options.lenient) {
    await assertRegisteredAssignee(payload.assigneeName);
  }
  var result = await db.query(
    `INSERT INTO projects
      (client_name, type, assignee_name, status, priority, figma_link,
       domain_management, server_location, created_by, updated_by)
     VALUES
      (:clientName, :type, :assigneeName, :status, :priority, :figmaLink,
       :domainManagement, :serverLocation, :userId, :userId)`,
    {
      clientName: payload.clientName,
      type: payload.type,
      assigneeName: payload.assigneeName,
      status: payload.status,
      priority: payload.priority,
      figmaLink: payload.figmaLink,
      domainManagement: payload.domainManagement,
      serverLocation: payload.serverLocation,
      userId: user.id,
    }
  );

  await replaceWebsites(result.insertId, payload.websites);
  var project = await getProject(result.insertId);
  await logProjectActivity(user, context, 'projects.create', project);
  return project;
}

async function updateProject(projectId, input, user, context) {
  await getProject(projectId);
  var payload = normalizePayload(input);
  await assertRegisteredAssignee(payload.assigneeName);

  await db.query(
    `UPDATE projects
     SET client_name = :clientName,
         type = :type,
         assignee_name = :assigneeName,
         status = :status,
         priority = :priority,
         figma_link = :figmaLink,
         domain_management = :domainManagement,
         server_location = :serverLocation,
         updated_by = :userId
     WHERE id = :projectId AND deleted_at IS NULL`,
    {
      projectId: projectId,
      clientName: payload.clientName,
      type: payload.type,
      assigneeName: payload.assigneeName,
      status: payload.status,
      priority: payload.priority,
      figmaLink: payload.figmaLink,
      domainManagement: payload.domainManagement,
      serverLocation: payload.serverLocation,
      userId: user.id,
    }
  );

  await replaceWebsites(projectId, payload.websites);
  var project = await getProject(projectId);
  await logProjectActivity(user, context, 'projects.update', project);
  return project;
}

async function updatePriority(projectId, priority, user, context) {
  await getProject(projectId);
  var normalized = options.normalizeOption(priority, options.PROJECT_PRIORITIES, null);
  if (!normalized) throw badRequest('Priority is invalid.');

  await db.query(
    `UPDATE projects
     SET priority = :priority, updated_by = :userId
     WHERE id = :projectId AND deleted_at IS NULL`,
    { projectId: projectId, priority: normalized, userId: user.id }
  );

  var project = await getProject(projectId);
  await logProjectActivity(user, context, 'projects.priority_update', project);
  return project;
}

async function updateStatus(projectId, status, user, context) {
  await getProject(projectId);
  var normalized = options.normalizeOption(status, options.PROJECT_STATUSES, null);
  if (!normalized) throw badRequest('Status is invalid.');

  await db.query(
    `UPDATE projects
     SET status = :status, updated_by = :userId
     WHERE id = :projectId AND deleted_at IS NULL`,
    { projectId: projectId, status: normalized, userId: user.id }
  );

  var project = await getProject(projectId);
  await logProjectActivity(user, context, 'projects.status_update', project);
  return project;
}

async function deleteProject(projectId, user, context) {
  var project = await getProject(projectId);
  await db.query(
    `UPDATE projects
     SET deleted_at = UTC_TIMESTAMP(), updated_by = :userId
     WHERE id = :projectId AND deleted_at IS NULL`,
    { projectId: projectId, userId: user.id }
  );
  await logProjectActivity(user, context, 'projects.delete', project);
}

function cell(row, mapping, key) {
  var header = mapping && mapping[key];
  return header ? String(row[header] || '').trim() : '';
}

function rowsToPayloads(rows, mapping) {
  return rows
    .map(function(row) {
      var clientName = cell(row, mapping, 'clientName');
      var websiteUrl = cell(row, mapping, 'websiteUrl');
      if (!clientName) return null;
      return {
        clientName: clientName,
        type: cell(row, mapping, 'type'),
        assigneeName: cell(row, mapping, 'assignee'),
        status: cell(row, mapping, 'status'),
        priority: cell(row, mapping, 'priority'),
        websites: websiteUrl
          ? [
              {
                name: cell(row, mapping, 'websiteName') || 'Main Website',
                url: websiteUrl,
              },
            ]
          : [],
        figmaLink: cell(row, mapping, 'figmaLink'),
        domainManagement: cell(row, mapping, 'domainManagement'),
        serverLocation: cell(row, mapping, 'serverLocation'),
      };
    })
    .filter(Boolean);
}

async function parseImportInput(input, file) {
  if (file) {
    if (/\.(xlsx|xls)$/i.test(file.originalname)) return parser.parseWorkbook(file.buffer);
    return parser.parseCsv(file.buffer.toString('utf8'));
  }

  if (input.csvText) return parser.parseCsv(input.csvText);

  if (input.sheetUrl) {
    return googleSheets.loadSheet(input.sheetUrl);
  }

  if (Array.isArray(input.rows) && Array.isArray(input.headers)) {
    return { headers: input.headers, rows: input.rows };
  }

  throw badRequest('Provide a CSV file, Excel file, CSV text, Google Sheet URL, or rows.');
}

async function previewImport(input, file) {
  var sheet = await parseImportInput(input || {}, file);
  return {
    headers: sheet.headers,
    rows: sheet.rows,
    sampleRows: sheet.rows.slice(0, 5),
    mapping: parser.guessMapping(sheet.headers),
    totalRows: sheet.rows.length,
  };
}

async function importProjects(input, file, user, context) {
  var sheet = await parseImportInput(input || {}, file);
  var mapping = typeof input.mapping === 'string' ? JSON.parse(input.mapping) : input.mapping;
  if (!mapping || !mapping.clientName) throw badRequest('Client Name mapping is required.');

  var payloads = rowsToPayloads(sheet.rows, mapping);
  var imported = [];
  var skipped = [];
  var errors = [];

  for (var index = 0; index < payloads.length; index += 1) {
    try {
      // Idempotent re-import: skip a row whose client already exists (matched by
      // name, case-insensitive) so running the same sheet twice never duplicates.
      var dup = await db.query(
        'SELECT id FROM projects WHERE deleted_at IS NULL AND LOWER(client_name) = LOWER(:name) LIMIT 1',
        { name: payloads[index].clientName }
      );
      if (dup[0]) {
        skipped.push({ row: index + 2, clientName: payloads[index].clientName });
        continue;
      }
      imported.push(await createProject(payloads[index], user, context, { lenient: true }));
    } catch (err) {
      errors.push({
        row: index + 2,
        message: err.message,
      });
    }
  }

  await activity.logActivity({
    userId: user.id,
    eventType: 'projects.bulk_import',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { imported: imported.length, skipped: skipped.length, errors: errors.length },
  });

  return { imported: imported, skipped: skipped, errors: errors };
}

function optionsPayload(assignees) {
  return {
    types: options.PROJECT_TYPES,
    statuses: options.PROJECT_STATUSES,
    priorities: options.PROJECT_PRIORITIES,
    domainManagement: options.DOMAIN_MANAGEMENT_OPTIONS,
    serverLocations: options.SERVER_LOCATION_OPTIONS,
    assignees: assignees,
  };
}

async function getOptions() {
  var users = await db.query(
    `SELECT DISTINCT name
     FROM users
     WHERE deleted_at IS NULL
       AND status = 'active'
       AND role IN ('superadmin', 'developer')
       AND name IS NOT NULL
       AND name <> ''
     ORDER BY name ASC`
  );
  return optionsPayload(users.map(function(user) {
    return user.name;
  }));
}

async function logProjectActivity(user, context, eventType, project) {
  await activity.logActivity({
    userId: user.id,
    eventType: eventType,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { projectId: project.id, clientName: project.clientName },
  });
}

module.exports = {
  listProjects: listProjects,
  getProject: getProject,
  createProject: createProject,
  updateProject: updateProject,
  updatePriority: updatePriority,
  updateStatus: updateStatus,
  deleteProject: deleteProject,
  previewImport: previewImport,
  importProjects: importProjects,
  getOptions: getOptions,
};
