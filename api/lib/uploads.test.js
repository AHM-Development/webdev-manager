'use strict';

const test = require('node:test');
const assert = require('node:assert');
const uploads = require('./uploads');

test('formEvidenceUrl builds the statically-served path', () => {
  assert.equal(uploads.formEvidenceUrl('abc123.png'), '/uploads/form-evidence/abc123.png');
});

test('imageFileFilter accepts the allowed raster image types', () => {
  for (const mimetype of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
    let outcome = null;
    uploads.imageFileFilter({}, { mimetype }, (err, ok) => { outcome = { err, ok }; });
    assert.equal(outcome.err, null, `${mimetype} should be accepted`);
    assert.equal(outcome.ok, true);
  }
});

test('imageFileFilter rejects non-images and script-capable types (incl. SVG)', () => {
  for (const mimetype of ['application/pdf', 'text/html', 'image/svg+xml', 'application/octet-stream']) {
    let error = null;
    uploads.imageFileFilter({}, { mimetype }, (err) => { error = err; });
    assert.ok(error, `${mimetype} should be rejected`);
    assert.equal(error.code, 'INVALID_FILE_TYPE');
  }
});
