var crypto = require('crypto');

var env = require('../../config/env');
var parser = require('./import-parser');

var SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
var TOKEN_URL = 'https://oauth2.googleapis.com/token';

function fail(message, code, status) {
  var err = new Error(message);
  err.status = status || 400;
  err.code = code || 'IMPORT_FETCH_FAILED';
  return err;
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function fetchWithTimeout(url, options) {
  var controller = new AbortController();
  var timer = setTimeout(function() {
    controller.abort();
  }, 15000);
  try {
    return await fetch(url, Object.assign({}, options || {}, { signal: controller.signal }));
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw fail('Google Sheets took too long to respond. Try again.', 'IMPORT_FETCH_TIMEOUT');
    }
    throw fail('Could not connect to Google Sheets. Try again.', 'IMPORT_FETCH_FAILED');
  } finally {
    clearTimeout(timer);
  }
}

async function googleError(response, fallback, guidance) {
  var message = fallback;
  try {
    var body = await response.json();
    if (body && body.error && body.error.message) message = body.error.message;
  } catch {}
  if (guidance && message.indexOf(guidance) === -1) message += ' ' + guidance;
  return fail(message, 'IMPORT_FETCH_FAILED');
}

async function serviceAccountToken() {
  var now = Math.floor(Date.now() / 1000);
  var encodedHeader = base64Url({ alg: 'RS256', typ: 'JWT' });
  var encodedClaim = base64Url({
    iss: env.integrations.googleServiceAccountEmail,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });
  var unsigned = encodedHeader + '.' + encodedClaim;
  var signature;
  try {
    signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), {
      key: env.integrations.googleServiceAccountPrivateKey,
    }).toString('base64url');
  } catch {
    throw fail('The Google service-account private key is invalid.', 'GOOGLE_CREDENTIALS_INVALID');
  }

  var response = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + signature,
    }),
  });
  if (!response.ok) throw await googleError(response, 'Google service-account authentication failed.');
  var body = await response.json();
  return body.access_token;
}

function authConfiguration() {
  if (
    env.integrations.googleServiceAccountEmail &&
    env.integrations.googleServiceAccountPrivateKey
  ) {
    return { type: 'service-account' };
  }
  if (env.integrations.googleApiKey) return { type: 'api-key' };
  return null;
}

async function apiRequest(path, auth) {
  var url = 'https://sheets.googleapis.com/v4/' + path;
  var headers = {};
  if (auth.type === 'service-account') {
    headers.Authorization = 'Bearer ' + (await serviceAccountToken());
  } else {
    url += (url.indexOf('?') === -1 ? '?' : '&') + 'key=' + encodeURIComponent(env.integrations.googleApiKey);
  }
  return fetchWithTimeout(url, { headers: headers });
}

async function loadWithApi(reference, auth) {
  var spreadsheetId = encodeURIComponent(reference.spreadsheetId);
  var metadataResponse = await apiRequest(
    'spreadsheets/' + spreadsheetId + '?fields=sheets.properties',
    auth
  );
  if (!metadataResponse.ok) {
    var accessMessage =
      auth.type === 'service-account'
        ? 'Share this spreadsheet with ' + env.integrations.googleServiceAccountEmail + ' as Viewer.'
        : 'Make the spreadsheet accessible to anyone with the link as Viewer.';
    throw await googleError(
      metadataResponse,
      'Could not access the Google spreadsheet.',
      accessMessage
    );
  }

  var metadata = await metadataResponse.json();
  var sheets = Array.isArray(metadata.sheets) ? metadata.sheets : [];
  var selected = sheets.find(function(sheet) {
    return String(sheet.properties && sheet.properties.sheetId) === String(reference.gid);
  }) || sheets[0];
  if (!selected || !selected.properties || !selected.properties.title) {
    throw fail('The spreadsheet does not contain a readable sheet.', 'IMPORT_SHEET_EMPTY');
  }

  var title = selected.properties.title;
  var range = encodeURIComponent("'" + title.replace(/'/g, "''") + "'");
  var valuesResponse = await apiRequest(
    'spreadsheets/' + spreadsheetId + '/values/' + range + '?majorDimension=ROWS',
    auth
  );
  if (!valuesResponse.ok) throw await googleError(valuesResponse, 'Could not read the selected sheet.');
  var values = await valuesResponse.json();
  return parser.matrixToSheet(Array.isArray(values.values) ? values.values : []);
}

async function loadPublicCsv(reference, inputUrl) {
  var response = await fetchWithTimeout(parser.googleSheetsCsvUrl(inputUrl));
  if (!response.ok) {
    throw fail(
      'Google denied access to this sheet. Set General access to "Anyone with the link" as Viewer, or configure a service account and share the sheet with it.',
      'IMPORT_SHEET_ACCESS_DENIED'
    );
  }
  var contentType = String(response.headers.get('content-type') || '').toLowerCase();
  var text = await response.text();
  if (contentType.indexOf('text/html') !== -1 || /^\s*<!doctype html/i.test(text)) {
    throw fail(
      'Google returned a sign-in page. Set General access to "Anyone with the link" as Viewer, or configure a service account.',
      'IMPORT_SHEET_ACCESS_DENIED'
    );
  }
  return parser.parseCsv(text);
}

async function loadSheet(inputUrl) {
  var reference;
  try {
    reference = parser.parseGoogleSheetsReference(inputUrl);
  } catch (err) {
    throw fail(err.message, err.code || 'IMPORT_URL_INVALID');
  }
  var auth = reference.published ? null : authConfiguration();
  return auth ? loadWithApi(reference, auth) : loadPublicCsv(reference, inputUrl);
}

module.exports = {
  loadSheet: loadSheet,
};
