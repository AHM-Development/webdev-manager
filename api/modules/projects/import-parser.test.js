'use strict';

// Tests for the bulk client-import parser (CSV/matrix parsing, column mapping,
// Google Sheets URL handling). Pure functions — no deps mocked.

const test = require('node:test');
const assert = require('node:assert');
const parser = require('./import-parser');

// The real header row from a production client tracker (32 columns). This layout
// previously mis-mapped websiteUrl to "Domain Management" (a registrar column),
// making the default import a no-op. Kept as a fixture to lock the fix in.
const REAL_HEADERS = [
  'Client Name', 'Type', 'Assign Team', 'Status', 'Domain Management',
  'Is Migrated to New Server', 'Developer', 'Figma Link', 'Staging Link',
  'Staging Live Date', 'Main Domain', 'Live Website Date',
  'Page Speed Desktop Score Before', 'Page Speed Desktop Score After',
  'Page Speed Mobile Score Before', 'Page Speed Mobile Score After',
  'Has Working Form / GHL Form', 'Form Type', 'Rank Math Pro', 'Solid Security',
  'Server Backup', 'Website Backup', 'Website Backup Assignee',
  'Added AHM in Footer', 'Footer Checked By', 'Privacy Policy',
  'Terms And Conditions', 'Cookie Policy', 'WP Activity Log',
  'Initial Live Video', 'Locations Images Removed', 'Content Check + New Menu',
];

test('guessMapping picks the live site URL, not the registrar column', () => {
  const mapping = parser.guessMapping(REAL_HEADERS);
  assert.equal(mapping.websiteUrl, 'Main Domain', 'must prefer Main Domain over Domain Management');
  assert.notEqual(mapping.websiteUrl, 'Domain Management');
  assert.equal(mapping.domainManagement, 'Domain Management');
  assert.equal(mapping.clientName, 'Client Name');
  assert.equal(mapping.status, 'Status');
  assert.equal(mapping.type, 'Type');
  assert.equal(mapping.figmaLink, 'Figma Link');
  // "Figma Link"/"Staging Link"/"Initial Live Video" must never be the site URL.
  assert.notEqual(mapping.websiteUrl, 'Figma Link');
  assert.notEqual(mapping.websiteUrl, 'Initial Live Video');
});

test('guessMapping does not treat backup/migration columns as a server location', () => {
  const mapping = parser.guessMapping(REAL_HEADERS);
  // No true "server location" column exists here; a false match is worse than none.
  assert.equal(mapping.serverLocation, '');
});

test('guessMapping still resolves the obvious single-URL layouts', () => {
  assert.equal(parser.guessMapping(['Client', 'Website URL']).websiteUrl, 'Website URL');
  assert.equal(parser.guessMapping(['Name', 'URL']).websiteUrl, 'URL');
  assert.equal(parser.guessMapping(['Client Name', 'Domain']).websiteUrl, 'Domain');
  assert.equal(parser.guessMapping(['Client', 'Live Website']).websiteUrl, 'Live Website');
});

test('parseCsv handles quotes, embedded commas, and blank rows', () => {
  const csv = 'Client Name,Main Domain\r\n' +
    '"Acme, Inc.",https://acme.test\n' +
    '\n' + // blank row skipped
    'Beta Co,https://beta.test\n';
  const sheet = parser.parseCsv(csv);
  assert.deepEqual(sheet.headers, ['Client Name', 'Main Domain']);
  assert.equal(sheet.rows.length, 2);
  assert.equal(sheet.rows[0]['Client Name'], 'Acme, Inc.', 'quoted comma preserved');
  assert.equal(sheet.rows[1]['Main Domain'], 'https://beta.test');
});

test('parseCsv unescapes doubled quotes', () => {
  const sheet = parser.parseCsv('Name\n"He said ""hi"""\n');
  assert.equal(sheet.rows[0]['Name'], 'He said "hi"');
});

test('matrixToSheet names blank header columns and trims cells', () => {
  const sheet = parser.matrixToSheet([
    ['Client', ''],
    [' Acme ', 'x'],
  ]);
  assert.deepEqual(sheet.headers, ['Client', 'Column 2']);
  assert.equal(sheet.rows[0]['Client'], 'Acme');
  assert.equal(sheet.rows[0]['Column 2'], 'x');
});

test('parseGoogleSheetsReference extracts the id and gid from a standard URL', () => {
  const ref = parser.parseGoogleSheetsReference(
    'https://docs.google.com/spreadsheets/d/1ABC_def/edit#gid=42'
  );
  assert.equal(ref.spreadsheetId, '1ABC_def');
  assert.equal(ref.gid, '42');
  assert.equal(ref.published, false);
});

test('parseGoogleSheetsReference rejects non-Google hosts', () => {
  assert.throws(
    () => parser.parseGoogleSheetsReference('https://evil.example.com/spreadsheets/d/1ABC/edit'),
    (err) => err.code === 'IMPORT_URL_INVALID'
  );
  assert.throws(
    () => parser.parseGoogleSheetsReference('not a url'),
    (err) => err.code === 'IMPORT_URL_INVALID'
  );
});

test('googleSheetsCsvUrl builds the export URL with the gid', () => {
  const url = parser.googleSheetsCsvUrl(
    'https://docs.google.com/spreadsheets/d/1ABC_def/edit#gid=7'
  );
  assert.equal(url, 'https://docs.google.com/spreadsheets/d/1ABC_def/export?format=csv&gid=7');
});
