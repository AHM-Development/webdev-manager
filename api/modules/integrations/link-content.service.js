var jwt = require('jsonwebtoken');
var env = require('../../config/env');

var googleTokenCache = {
  token: '',
  expiresAt: 0,
};

function compactText(value, limit) {
  var text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!limit || text.length <= limit) return text;
  return text.slice(0, limit) + '...';
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch (err) {
    return null;
  }
}

function extractLinks(text) {
  return Array.from(new Set(String(text || '').match(/https?:\/\/[^\s)]+/g) || []));
}

async function getGoogleAccessToken() {
  if (googleTokenCache.token && googleTokenCache.expiresAt > Date.now() + 60000) {
    return googleTokenCache.token;
  }

  if (!env.integrations.googleServiceAccountEmail || !env.integrations.googleServiceAccountPrivateKey) {
    return '';
  }

  var now = Math.floor(Date.now() / 1000);
  var assertion = jwt.sign(
    {
      iss: env.integrations.googleServiceAccountEmail,
      scope: [
        'https://www.googleapis.com/auth/documents.readonly',
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
      ].join(' '),
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    env.integrations.googleServiceAccountPrivateKey,
    { algorithm: 'RS256' }
  );

  var response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assertion,
    }),
  });
  if (!response.ok) return '';
  var body = await response.json();
  googleTokenCache = {
    token: body.access_token || '',
    expiresAt: Date.now() + Number(body.expires_in || 3000) * 1000,
  };
  return googleTokenCache.token;
}

async function googleHeaders() {
  var token = await getGoogleAccessToken();
  return token ? { authorization: 'Bearer ' + token } : {};
}

function googleApiSuffix() {
  return env.integrations.googleApiKey ? '?key=' + encodeURIComponent(env.integrations.googleApiKey) : '';
}

function googleDocId(url) {
  var match = String(url).match(/\/document\/d\/([^/]+)/);
  return match && match[1];
}

function googleSheetId(url) {
  var match = String(url).match(/\/spreadsheets\/d\/([^/]+)/);
  return match && match[1];
}

function textFromDocContent(body) {
  var output = [];
  (body.body && body.body.content ? body.body.content : []).forEach(function(block) {
    (((block.paragraph || {}).elements) || []).forEach(function(element) {
      if (element.textRun && element.textRun.content) output.push(element.textRun.content);
    });
  });
  return output.join('').trim();
}

async function fetchGoogleDoc(url) {
  var id = googleDocId(url);
  if (!id) return null;
  var headers = await googleHeaders();
  var response = await fetch(
    'https://docs.googleapis.com/v1/documents/' + encodeURIComponent(id) + googleApiSuffix(),
    { headers: headers }
  );
  if (!response.ok) return null;
  var body = await response.json();
  return {
    url: url,
    provider: 'google_docs',
    title: body.title || 'Google Doc',
    extractedText: compactText(textFromDocContent(body), env.ai.maxFileChars),
  };
}

async function fetchGoogleSheet(url) {
  var id = googleSheetId(url);
  if (!id) return null;
  var headers = await googleHeaders();
  var response = await fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' +
      encodeURIComponent(id) +
      '?includeGridData=true' +
      (env.integrations.googleApiKey ? '&key=' + encodeURIComponent(env.integrations.googleApiKey) : ''),
    { headers: headers }
  );
  if (!response.ok) return null;
  var body = await response.json();
  var values = [];
  (body.sheets || []).forEach(function(sheet) {
    values.push('Sheet: ' + (((sheet.properties || {}).title) || 'Untitled'));
    (((sheet.data || [])[0] || {}).rowData || []).slice(0, 50).forEach(function(row) {
      values.push(
        (row.values || [])
          .map(function(cell) {
            return cell.formattedValue || '';
          })
          .filter(Boolean)
          .join(' | ')
      );
    });
  });
  return {
    url: url,
    provider: 'google_sheets',
    title: (body.properties && body.properties.title) || 'Google Sheet',
    extractedText: compactText(values.filter(Boolean).join('\n'), env.ai.maxFileChars),
  };
}

function clickUpTaskId(url) {
  var parsed = parseUrl(url);
  if (!parsed || parsed.hostname.indexOf('clickup.com') === -1) return '';
  var match = parsed.pathname.match(/\/t\/(?:[^/]+\/)?([^/]+)/);
  return match && match[1] ? match[1] : '';
}

async function fetchClickUpTask(url) {
  var id = clickUpTaskId(url);
  if (!id || !env.integrations.clickupApiToken) return null;
  var response = await fetch('https://api.clickup.com/api/v2/task/' + encodeURIComponent(id), {
    headers: { authorization: env.integrations.clickupApiToken },
  });
  if (!response.ok) return null;
  var body = await response.json();
  return {
    url: url,
    provider: 'clickup',
    title: body.name || 'ClickUp task',
    extractedText: compactText(
      [
        body.name,
        body.text_content,
        body.description,
        body.status && body.status.status ? 'Status: ' + body.status.status : '',
        body.priority && body.priority.priority ? 'Priority: ' + body.priority.priority : '',
      ]
        .filter(Boolean)
        .join('\n'),
      env.ai.maxFileChars
    ),
  };
}

async function fetchLinkContext(url) {
  var parsed = parseUrl(url);
  if (!parsed) return null;

  try {
    if (parsed.hostname.indexOf('clickup.com') !== -1) return await fetchClickUpTask(url);
    if (parsed.hostname.indexOf('docs.google.com') !== -1 && parsed.pathname.indexOf('/document/') !== -1) {
      return await fetchGoogleDoc(url);
    }
    if (parsed.hostname.indexOf('docs.google.com') !== -1 && parsed.pathname.indexOf('/spreadsheets/') !== -1) {
      return await fetchGoogleSheet(url);
    }
  } catch (err) {
    return null;
  }

  return null;
}

async function fetchLinksContext(links) {
  var results = [];
  for (var i = 0; i < links.length; i += 1) {
    var context = await fetchLinkContext(links[i]);
    results.push(
      context || {
        url: links[i],
        provider: 'link',
        title: links[i],
        extractedText: '',
      }
    );
  }
  return results;
}

module.exports = {
  extractLinks: extractLinks,
  fetchLinksContext: fetchLinksContext,
};
