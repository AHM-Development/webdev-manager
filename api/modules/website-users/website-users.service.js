var db = require('../../db/pool');
var activity = require('../auth/activity.service');
var parser = require('../projects/import-parser');
var crypto = require('./crypto');

var ENVIRONMENTS = ['Live', 'Staging'];

function badRequest(message, code) {
  var err = new Error(message);
  err.status = 400;
  err.code = code || 'VALIDATION_ERROR';
  return err;
}

function notFound() {
  var err = new Error('Website credential not found.');
  err.status = 404;
  err.code = 'WEBSITE_CREDENTIAL_NOT_FOUND';
  return err;
}

function normalizeEnvironment(value) {
  var normalized = String(value || '').trim().toLowerCase();
  return normalized === 'staging' ? 'Staging' : 'Live';
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  var parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function dateOnly(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  var parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function rowToCredential(row, includePassword) {
  var projectName = row.project_name || null;
  var websiteName = row.website_name || null;
  var websiteUrl = row.website_url || null;
  var password = includePassword ? crypto.decrypt(row.password_encrypted) : undefined;

  return {
    id: String(row.id),
    name: row.name,
    userId: row.user_id ? String(row.user_id) : undefined,
    userName: row.linked_user_name || undefined,
    projectId: row.project_id ? String(row.project_id) : undefined,
    projectName: projectName,
    websiteId: row.website_id ? String(row.website_id) : undefined,
    websiteName: websiteName,
    websiteUrl: websiteUrl,
    externalSite: row.external_site || undefined,
    environment: row.environment,
    username: row.username,
    password: password,
    createdAt: dateOnly(row.created_at),
    passwordUpdatedAt: dateOnly(row.password_updated_at),
    note: row.note || undefined,
  };
}

async function queryCredentials(where, params, includePassword) {
  var rows = await db.query(
    `SELECT wc.*,
            p.client_name AS project_name,
            pw.name AS website_name,
            pw.url AS website_url,
            u.name AS linked_user_name
     FROM website_credentials wc
     LEFT JOIN projects p ON p.id = wc.project_id
     LEFT JOIN project_websites pw ON pw.id = wc.website_id
     LEFT JOIN users u ON u.id = wc.user_id
     WHERE ` + where + `
     ORDER BY wc.updated_at DESC, wc.id DESC`,
    params || {}
  );
  return rows.map(function(row) {
    return rowToCredential(row, includePassword);
  });
}

async function listCredentials(filters) {
  var where = ['wc.deleted_at IS NULL'];
  var params = {};

  if (filters.q) {
    where.push(
      `(wc.name LIKE :q OR wc.username LIKE :q OR wc.external_site LIKE :q OR
        wc.note LIKE :q OR p.client_name LIKE :q OR pw.name LIKE :q OR pw.url LIKE :q)`
    );
    params.q = '%' + filters.q + '%';
  }
  if (filters.name && filters.name !== 'all') {
    where.push('wc.name = :name');
    params.name = filters.name;
  }
  if (filters.projectId && filters.projectId !== 'all') {
    where.push('wc.project_id = :projectId');
    params.projectId = filters.projectId;
  }
  if (filters.environment && filters.environment !== 'all') {
    where.push('wc.environment = :environment');
    params.environment = normalizeEnvironment(filters.environment);
  }

  return queryCredentials(where.join(' AND '), params, false);
}

async function getCredential(credentialId, includePassword) {
  var rows = await queryCredentials(
    'wc.deleted_at IS NULL AND wc.id = :credentialId',
    { credentialId: credentialId },
    includePassword
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}

async function resolveTarget(input) {
  var projectId = input.projectId || null;
  var websiteId = input.websiteId || null;
  var externalSite = String(input.externalSite || '').trim() || null;

  if (websiteId && !projectId) {
    var websiteRows = await db.query(
      'SELECT id, project_id FROM project_websites WHERE id = :websiteId LIMIT 1',
      { websiteId: websiteId }
    );
    if (!websiteRows[0]) throw badRequest('Website does not exist.');
    projectId = websiteRows[0].project_id;
  }

  if (projectId) {
    var projectRows = await db.query(
      'SELECT id FROM projects WHERE id = :projectId AND deleted_at IS NULL LIMIT 1',
      { projectId: projectId }
    );
    if (!projectRows[0]) throw badRequest('Project does not exist.');
    externalSite = null;
  }

  if (!projectId && !externalSite) throw badRequest('Project or external site is required.');

  return {
    projectId: projectId,
    websiteId: websiteId,
    externalSite: externalSite,
  };
}

async function resolveUser(userId, name) {
  var id = userId == null || userId === '' ? null : String(userId);
  if (!id) return { userId: null, name: name };

  var rows = await db.query(
    'SELECT id, name FROM users WHERE id = :id AND deleted_at IS NULL LIMIT 1',
    { id: id }
  );
  if (!rows[0]) throw badRequest('Selected user does not exist.');
  // Keep the provided name if present (allows a custom label for a real user),
  // otherwise snapshot the user's current name.
  return { userId: String(rows[0].id), name: name || rows[0].name };
}

async function normalizePayload(input, existing) {
  var name = String(input.name || '').trim();
  var username = String(input.username || '').trim();
  var password = input.password == null ? '' : String(input.password);

  var resolvedUser = await resolveUser(input.userId, name);
  name = String(resolvedUser.name || '').trim();

  if (!name) throw badRequest('Name is required.');
  if (!username) throw badRequest('Username is required.');
  if (!existing && !password) throw badRequest('Password is required.');

  var target = await resolveTarget(input);

  return {
    name: name,
    userId: resolvedUser.userId,
    projectId: target.projectId,
    websiteId: target.websiteId,
    externalSite: target.externalSite,
    environment: normalizeEnvironment(input.environment),
    username: username,
    password: password,
    createdAt: normalizeDate(input.createdAt),
    passwordUpdatedAt: normalizeDate(input.passwordUpdatedAt),
    note: String(input.note || '').trim() || null,
  };
}

async function logCredentialActivity(user, context, eventType, credential, metadata) {
  await activity.logActivity({
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    eventType: eventType,
    action: eventType,
    description: credential.name + ' / ' + credential.username,
    targetType: 'website_credential',
    targetId: credential.id,
    targetName: credential.externalSite || credential.projectName || credential.name,
    severity: eventType.indexOf('revealed') !== -1 ? 'warning' : 'info',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: Object.assign(
      {
        credentialId: credential.id,
        projectId: credential.projectId,
        websiteId: credential.websiteId,
        externalSite: credential.externalSite,
      },
      metadata || {}
    ),
  });
}

async function createCredential(input, user, context) {
  var payload = await normalizePayload(input, null);
  var result = await db.query(
    `INSERT INTO website_credentials
      (name, user_id, project_id, website_id, external_site, environment, username,
       password_encrypted, password_updated_at, note, created_by, updated_by, created_at)
     VALUES
      (:name, :linkedUserId, :projectId, :websiteId, :externalSite, :environment, :username,
       :passwordEncrypted, :passwordUpdatedAt, :note, :userId, :userId, :createdAt)`,
    {
      name: payload.name,
      linkedUserId: payload.userId,
      projectId: payload.projectId,
      websiteId: payload.websiteId,
      externalSite: payload.externalSite,
      environment: payload.environment,
      username: payload.username,
      passwordEncrypted: crypto.encrypt(payload.password),
      passwordUpdatedAt: payload.passwordUpdatedAt,
      note: payload.note,
      userId: user.id,
      createdAt: payload.createdAt + ' 00:00:00',
    }
  );
  var credential = await getCredential(result.insertId, false);
  await logCredentialActivity(user, context, 'website_credentials.create', credential);
  return credential;
}

async function updateCredential(credentialId, input, user, context) {
  var existing = await getCredential(credentialId, true);
  var payload = await normalizePayload(input, existing);
  var nextPassword = payload.password || existing.password;
  var passwordUpdatedAt =
    payload.password && payload.password !== existing.password
      ? new Date().toISOString().slice(0, 10)
      : payload.passwordUpdatedAt;

  await db.query(
    `UPDATE website_credentials
     SET name = :name,
         user_id = :linkedUserId,
         project_id = :projectId,
         website_id = :websiteId,
         external_site = :externalSite,
         environment = :environment,
         username = :username,
         password_encrypted = :passwordEncrypted,
         password_updated_at = :passwordUpdatedAt,
         note = :note,
         updated_by = :userId
     WHERE id = :credentialId AND deleted_at IS NULL`,
    {
      credentialId: credentialId,
      name: payload.name,
      linkedUserId: payload.userId,
      projectId: payload.projectId,
      websiteId: payload.websiteId,
      externalSite: payload.externalSite,
      environment: payload.environment,
      username: payload.username,
      passwordEncrypted: crypto.encrypt(nextPassword),
      passwordUpdatedAt: passwordUpdatedAt,
      note: payload.note,
      userId: user.id,
    }
  );

  var credential = await getCredential(credentialId, false);
  await logCredentialActivity(user, context, 'website_credentials.update', credential);
  return credential;
}

async function deleteCredential(credentialId, user, context) {
  var credential = await getCredential(credentialId, false);
  await db.query(
    `UPDATE website_credentials
     SET deleted_at = UTC_TIMESTAMP(), updated_by = :userId
     WHERE id = :credentialId AND deleted_at IS NULL`,
    { credentialId: credentialId, userId: user.id }
  );
  await logCredentialActivity(user, context, 'website_credentials.delete', credential);
}

async function revealCredential(credentialId, user, context) {
  var credential = await getCredential(credentialId, true);
  await logCredentialActivity(user, context, 'website_credentials.password_revealed', credential);
  return { password: credential.password };
}

async function copyPackage(credentialId, user, context) {
  var credential = await getCredential(credentialId, true);
  var siteUrl = credential.externalSite || credential.websiteUrl || '';
  var content = [siteUrl, credential.username, credential.password].join('\n');
  await logCredentialActivity(user, context, 'website_credentials.copied', credential);
  return { content: content };
}

function guessMapping(headers) {
  function find(patterns) {
    return headers.find(function(header) {
      var lower = header.toLowerCase();
      return patterns.some(function(pattern) {
        return pattern.test(lower);
      });
    }) || '';
  }

  return {
    name: find([/name/, /member/, /assignee/, /owner/, /user/]),
    projectOrSite: find([/project/, /client/, /site/, /website/, /domain/, /url/]),
    environment: find([/environment/, /website/, /live/, /staging/]),
    username: find([/username/, /user name/, /login/, /email/]),
    password: find([/password/, /pass/]),
    createdAt: find([/created/, /date added/]),
    passwordUpdatedAt: find([/password.*updated/, /updated/, /last changed/]),
    note: find([/note/, /role/, /access/, /remarks/]),
  };
}

async function parseImportInput(input, file) {
  if (file) {
    if (/\.(xlsx|xls)$/i.test(file.originalname)) return parser.parseWorkbook(file.buffer);
    return parser.parseCsv(file.buffer.toString('utf8'));
  }
  if (input.csvText) return parser.parseCsv(input.csvText);
  if (input.sheetUrl) {
    var url = parser.googleSheetsCsvUrl(input.sheetUrl);
    var response = await fetch(url);
    if (!response.ok) throw badRequest('Could not load the Google Sheet.', 'IMPORT_FETCH_FAILED');
    return parser.parseCsv(await response.text());
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
    mapping: guessMapping(sheet.headers),
    totalRows: sheet.rows.length,
  };
}

function importCell(row, mapping, key) {
  var header = mapping && mapping[key];
  return header ? String(row[header] || '').trim() : '';
}

async function targetFromImport(value) {
  var target = String(value || '').trim();
  if (!target) return {};
  var rows = await db.query(
    `SELECT p.id AS project_id, NULL AS website_id
     FROM projects p
     WHERE p.deleted_at IS NULL AND (p.client_name = :target OR CAST(p.id AS CHAR) = :target)
     UNION
     SELECT pw.project_id AS project_id, pw.id AS website_id
     FROM project_websites pw
     JOIN projects p ON p.id = pw.project_id
     WHERE p.deleted_at IS NULL AND (pw.name = :target OR pw.url = :target OR CAST(pw.id AS CHAR) = :target)
     LIMIT 1`,
    { target: target }
  );
  if (!rows[0]) return { externalSite: target };
  return { projectId: rows[0].project_id, websiteId: rows[0].website_id || null };
}

async function rowToImportPayload(row, mapping) {
  var target = await targetFromImport(importCell(row, mapping, 'projectOrSite'));
  return {
    name: importCell(row, mapping, 'name'),
    projectId: target.projectId,
    websiteId: target.websiteId,
    externalSite: target.externalSite,
    environment: importCell(row, mapping, 'environment'),
    username: importCell(row, mapping, 'username'),
    password: importCell(row, mapping, 'password'),
    createdAt: importCell(row, mapping, 'createdAt'),
    passwordUpdatedAt: importCell(row, mapping, 'passwordUpdatedAt'),
    note: importCell(row, mapping, 'note'),
  };
}

async function importCredentials(input, file, user, context) {
  var sheet = await parseImportInput(input || {}, file);
  var mapping = typeof input.mapping === 'string' ? JSON.parse(input.mapping) : input.mapping;
  if (!mapping || !mapping.name || !mapping.projectOrSite || !mapping.username || !mapping.password) {
    throw badRequest('Name, Project / Site, Username, and Password mappings are required.');
  }

  var imported = [];
  var errors = [];

  for (var index = 0; index < sheet.rows.length; index += 1) {
    try {
      var payload = await rowToImportPayload(sheet.rows[index], mapping);
      imported.push(await createCredential(payload, user, context));
    } catch (err) {
      errors.push({ row: index + 2, message: err.message });
    }
  }

  await activity.logActivity({
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    eventType: 'website_credentials.bulk_import',
    action: 'website_credentials.bulk_import',
    description: imported.length + ' credentials imported',
    severity: errors.length ? 'warning' : 'info',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { imported: imported.length, errors: errors.length },
  });

  return { imported: imported, errors: errors };
}

async function getOptions() {
  var projectRows = await db.query(
    `SELECT p.id, p.client_name, pw.id AS website_id, pw.name AS website_name, pw.url
     FROM projects p
     LEFT JOIN project_websites pw ON pw.project_id = p.id
     WHERE p.deleted_at IS NULL
     ORDER BY p.client_name ASC, pw.sort_order ASC`
  );
  var nameRows = await db.query(
    `SELECT DISTINCT name FROM website_credentials
     WHERE deleted_at IS NULL
     ORDER BY name ASC`
  );
  var userRows = await db.query(
    `SELECT id, name, email FROM users
     WHERE deleted_at IS NULL
     ORDER BY name ASC`
  );

  var projectMap = new Map();
  var websites = [];
  projectRows.forEach(function(row) {
    if (!projectMap.has(String(row.id))) {
      projectMap.set(String(row.id), { id: String(row.id), name: row.client_name });
    }
    if (row.website_id) {
      websites.push({
        id: String(row.website_id),
        projectId: String(row.id),
        name: row.website_name,
        url: row.url,
      });
    }
  });

  return {
    projects: Array.from(projectMap.values()),
    websites: websites,
    names: nameRows.map(function(row) { return row.name; }),
    users: userRows.map(function(row) {
      return { id: String(row.id), name: row.name, email: row.email };
    }),
    environments: ENVIRONMENTS,
  };
}

module.exports = {
  listCredentials: listCredentials,
  getCredential: getCredential,
  createCredential: createCredential,
  updateCredential: updateCredential,
  deleteCredential: deleteCredential,
  revealCredential: revealCredential,
  copyPackage: copyPackage,
  previewImport: previewImport,
  importCredentials: importCredentials,
  getOptions: getOptions,
};
