var XLSX = require('xlsx');

function parseCsv(text) {
  var rows = [];
  var current = '';
  var row = [];
  var quoted = false;
  var input = String(text || '');

  for (var index = 0; index < input.length; index += 1) {
    var char = input[index];
    var next = input[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);

  return matrixToSheet(rows);
}

function parseWorkbook(buffer) {
  var workbook = XLSX.read(buffer, { type: 'buffer' });
  var sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  var matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: false,
    defval: '',
  });
  return matrixToSheet(matrix);
}

function matrixToSheet(matrix) {
  var rows = matrix.filter(function(row) {
    return Array.isArray(row) && row.some(function(cell) {
      return String(cell || '').trim();
    });
  });
  var headers = (rows.shift() || []).map(function(header, index) {
    return String(header || '').trim() || 'Column ' + (index + 1);
  });
  return {
    headers: headers,
    rows: rows.map(function(values) {
      var row = {};
      headers.forEach(function(header, index) {
        row[header] = String(values[index] || '').trim();
      });
      return row;
    }),
  };
}

function guessMapping(headers) {
  // First header (in column order) matching ANY pattern, skipping any header
  // that matches an `exclude` pattern. Column order breaks ties.
  function find(patterns, exclude) {
    return headers.find(function(header) {
      var lower = header.toLowerCase();
      if (exclude && exclude.some(function(p) { return p.test(lower); })) return false;
      return patterns.some(function(pattern) {
        return pattern.test(lower);
      });
    }) || '';
  }

  // Ranked variant: try pattern groups in priority order and return the first
  // header the highest-priority group matches. Lets a specific column ("Main
  // Domain") win over a generic one ("Domain Management") regardless of order.
  function findRanked(groups, exclude) {
    for (var i = 0; i < groups.length; i += 1) {
      var hit = find(groups[i], exclude);
      if (hit) return hit;
    }
    return '';
  }

  // URL-ish columns that are NOT the site's own address (registrar/config,
  // design links, media, backups) — never guess these as the website URL.
  var NOT_A_SITE_URL = [/management/, /registrar/, /\bdns\b/, /figma/, /video/, /backup/];

  return {
    clientName: find([/client/, /project/, /name/]),
    type: find([/type/]),
    assignee: find([/assignee/, /owner/, /developer/, /lead/]),
    status: find([/status/, /stage/]),
    priority: find([/priority/]),
    websiteName: find([/website.*name/, /site.*name/]),
    websiteUrl: findRanked(
      [
        // 1. Unambiguous live/main site address.
        [/main\s*domain/, /live.*(url|site|website|link|domain)/, /website.*url/, /site.*url/],
        // 2. Generic website/domain/url columns (management/registrar excluded).
        [/website/, /domain/, /url/],
        // 3. Last resort: a staging or generic link/live column.
        [/link/, /live/],
      ],
      NOT_A_SITE_URL
    ),
    figmaLink: find([/figma/]),
    domainManagement: find([/domain.*management/, /registrar/, /\bdns\b/]),
    // A server *location*, not a backup/migration flag.
    serverLocation: find([/server/, /hosting/, /host/], [/backup/, /migrat/]),
  };
}

function googleSheetsCsvUrl(input) {
  var reference = parseGoogleSheetsReference(input);
  if (reference.published) {
    return (
      'https://docs.google.com/spreadsheets/d/e/' +
      encodeURIComponent(reference.spreadsheetId) +
      '/pub?output=csv&gid=' +
      encodeURIComponent(reference.gid)
    );
  }
  return (
    'https://docs.google.com/spreadsheets/d/' +
    encodeURIComponent(reference.spreadsheetId) +
    '/export?format=csv&gid=' +
    encodeURIComponent(reference.gid)
  );
}

function parseGoogleSheetsReference(input) {
  var value = String(input || '').trim();
  var url;
  try {
    url = new URL(value);
  } catch {
    var invalid = new Error('Enter a valid Google Sheets URL.');
    invalid.code = 'IMPORT_URL_INVALID';
    throw invalid;
  }

  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') {
    var hostError = new Error('Only https://docs.google.com spreadsheet links are supported.');
    hostError.code = 'IMPORT_URL_INVALID';
    throw hostError;
  }

  var publishedMatch = url.pathname.match(/^\/spreadsheets\/d\/e\/([^/]+)/);
  var standardMatch = url.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
  var match = publishedMatch || standardMatch;
  if (!match) {
    var pathError = new Error('The URL does not contain a Google spreadsheet ID.');
    pathError.code = 'IMPORT_URL_INVALID';
    throw pathError;
  }

  var hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  var gid = url.searchParams.get('gid') || hashParams.get('gid') || '0';
  if (!/^\d+$/.test(gid)) gid = '0';

  return {
    spreadsheetId: match[1],
    gid: gid,
    published: !!publishedMatch,
  };
}

module.exports = {
  parseCsv: parseCsv,
  parseWorkbook: parseWorkbook,
  matrixToSheet: matrixToSheet,
  guessMapping: guessMapping,
  googleSheetsCsvUrl: googleSheetsCsvUrl,
  parseGoogleSheetsReference: parseGoogleSheetsReference,
};
